begin;

insert into auth.users (
  id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at
) values
  ('71000000-0000-0000-0000-000000000001', 'authenticated', 'authenticated', 'paired-coach@example.test', crypt('TestPass123!', gen_salt('bf')), now(), '{"provider":"email","providers":["email"]}', '{"full_name":"Paired Coach"}', now(), now()),
  ('71000000-0000-0000-0000-000000000002', 'authenticated', 'authenticated', 'paired-client-a@example.test', crypt('TestPass123!', gen_salt('bf')), now(), '{"provider":"email","providers":["email"]}', '{"full_name":"Paired Client A"}', now(), now()),
  ('71000000-0000-0000-0000-000000000003', 'authenticated', 'authenticated', 'paired-client-b@example.test', crypt('TestPass123!', gen_salt('bf')), now(), '{"provider":"email","providers":["email"]}', '{"full_name":"Paired Client B"}', now(), now()),
  ('71000000-0000-0000-0000-000000000004', 'authenticated', 'authenticated', 'unassigned-paired-client@example.test', crypt('TestPass123!', gen_salt('bf')), now(), '{"provider":"email","providers":["email"]}', '{"full_name":"Unassigned Paired Client"}', now(), now());

insert into public.organizations (id, name) values
  ('71000000-0000-0000-0000-000000000010', 'Paired Workout Test Gym');

insert into public.organization_memberships (organization_id, user_id, role) values
  ('71000000-0000-0000-0000-000000000010', '71000000-0000-0000-0000-000000000001', 'coach'),
  ('71000000-0000-0000-0000-000000000010', '71000000-0000-0000-0000-000000000002', 'client'),
  ('71000000-0000-0000-0000-000000000010', '71000000-0000-0000-0000-000000000003', 'client'),
  ('71000000-0000-0000-0000-000000000010', '71000000-0000-0000-0000-000000000004', 'client');

insert into public.coach_client_assignments (organization_id, coach_user_id, client_user_id) values
  ('71000000-0000-0000-0000-000000000010', '71000000-0000-0000-0000-000000000001', '71000000-0000-0000-0000-000000000002'),
  ('71000000-0000-0000-0000-000000000010', '71000000-0000-0000-0000-000000000001', '71000000-0000-0000-0000-000000000003');

set local role authenticated;
select set_config('request.jwt.claim.sub', '71000000-0000-0000-0000-000000000001', true);
select set_config('request.jwt.claims', '{"sub":"71000000-0000-0000-0000-000000000001","email":"paired-coach@example.test","role":"authenticated"}', true);

select public.create_paired_planned_workout_assignments_lb(
  '71000000-0000-0000-0000-000000000002',
  '71000000-0000-0000-0000-000000000003',
  'Partner Lower Body',
  'Train through the same stations.',
  current_date + 1,
  time '10:00',
  '[
    {"name":"Back Squat","sets":4,"reps":7,"load":"225","notes":"Client A load","mode":"reps","durationSeconds":null,"restSeconds":90},
    {"name":"Bike","sets":4,"reps":1,"load":null,"notes":"","mode":"time","durationSeconds":45,"restSeconds":45}
  ]'::jsonb,
  '[
    {"name":"Back Squat","sets":4,"reps":7,"load":"120","notes":"Client B load","mode":"reps","durationSeconds":null,"restSeconds":90},
    {"name":"Bike","sets":4,"reps":1,"load":null,"notes":"","mode":"time","durationSeconds":45,"restSeconds":45}
  ]'::jsonb
);

do $$
declare
  group_count integer;
  group_id uuid;
  client_a_load numeric;
  client_b_load numeric;
begin
  select count(*), min(paired_workout_group_id)
  into group_count, group_id
  from public.workout_assignments
  where organization_id = '71000000-0000-0000-0000-000000000010';

  if group_count <> 2 or group_id is null then
    raise exception 'Paired session did not create exactly two linked workout assignments';
  end if;

  if exists (
    select 1
    from public.workout_assignments
    where organization_id = '71000000-0000-0000-0000-000000000010'
      and paired_workout_group_id is distinct from group_id
  ) then
    raise exception 'Paired workout assignments do not share one group id';
  end if;

  select e.load into client_a_load
  from public.workout_exercises e
  join public.workout_assignments w on w.id = e.workout_assignment_id
  where w.client_user_id = '71000000-0000-0000-0000-000000000002'
    and e.exercise_name = 'Back Squat';

  select e.load into client_b_load
  from public.workout_exercises e
  join public.workout_assignments w on w.id = e.workout_assignment_id
  where w.client_user_id = '71000000-0000-0000-0000-000000000003'
    and e.exercise_name = 'Back Squat';

  if client_a_load <> 225 or client_b_load <> 120 then
    raise exception 'Paired clients did not retain independent squat loads';
  end if;
end;
$$;

do $$
declare
  before_count integer;
begin
  select count(*) into before_count
  from public.workout_assignments
  where organization_id = '71000000-0000-0000-0000-000000000010';

  begin
    perform public.create_paired_planned_workout_assignments_lb(
      '71000000-0000-0000-0000-000000000002',
      '71000000-0000-0000-0000-000000000004',
      'Unauthorized Partner Session',
      null,
      current_date + 2,
      time '11:00',
      '[{"name":"Back Squat","sets":3,"reps":5,"load":"225","notes":"","mode":"reps","durationSeconds":null,"restSeconds":90}]'::jsonb,
      '[{"name":"Back Squat","sets":3,"reps":5,"load":"120","notes":"","mode":"reps","durationSeconds":null,"restSeconds":90}]'::jsonb
    );
    raise exception 'Paired workout accepted an unassigned second client';
  exception
    when others then
      if sqlerrm = 'Paired workout accepted an unassigned second client' then
        raise;
      end if;
  end;

  if (
    select count(*)
    from public.workout_assignments
    where organization_id = '71000000-0000-0000-0000-000000000010'
  ) <> before_count then
    raise exception 'Failed paired workout did not roll back atomically';
  end if;
end;
$$;

rollback;
