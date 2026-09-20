begin;

insert into auth.users (
  id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at
) values
  ('41000000-0000-0000-0000-000000000001', 'authenticated', 'authenticated', 'coach-client-mvp@example.test', crypt('TestPass123!', gen_salt('bf')), now(), '{"provider":"email","providers":["email"]}', '{"full_name":"Coach Client MVP"}', now(), now()),
  ('41000000-0000-0000-0000-000000000002', 'authenticated', 'authenticated', 'client-client-mvp@example.test', crypt('TestPass123!', gen_salt('bf')), now(), '{"provider":"email","providers":["email"]}', '{"full_name":"Client Client MVP"}', now(), now()),
  ('42000000-0000-0000-0000-000000000001', 'authenticated', 'authenticated', 'coach-other-mvp@example.test', crypt('TestPass123!', gen_salt('bf')), now(), '{"provider":"email","providers":["email"]}', '{"full_name":"Coach Other MVP"}', now(), now()),
  ('42000000-0000-0000-0000-000000000002', 'authenticated', 'authenticated', 'client-other-mvp@example.test', crypt('TestPass123!', gen_salt('bf')), now(), '{"provider":"email","providers":["email"]}', '{"full_name":"Client Other MVP"}', now(), now());

insert into public.organizations (id, name) values
  ('a2000000-0000-0000-0000-000000000001', 'Client Organization A'),
  ('b2000000-0000-0000-0000-000000000001', 'Client Organization B');

insert into public.organization_memberships (organization_id, user_id, role) values
  ('a2000000-0000-0000-0000-000000000001', '41000000-0000-0000-0000-000000000001', 'coach'),
  ('a2000000-0000-0000-0000-000000000001', '41000000-0000-0000-0000-000000000002', 'client'),
  ('b2000000-0000-0000-0000-000000000001', '42000000-0000-0000-0000-000000000001', 'coach'),
  ('b2000000-0000-0000-0000-000000000001', '42000000-0000-0000-0000-000000000002', 'client');

insert into public.coach_client_assignments (
  organization_id, coach_user_id, client_user_id
) values
  ('a2000000-0000-0000-0000-000000000001', '41000000-0000-0000-0000-000000000001', '41000000-0000-0000-0000-000000000002'),
  ('b2000000-0000-0000-0000-000000000001', '42000000-0000-0000-0000-000000000001', '42000000-0000-0000-0000-000000000002');

set local role authenticated;
select set_config('request.jwt.claim.sub', '41000000-0000-0000-0000-000000000001', true);
select set_config('request.jwt.claims', '{"sub":"41000000-0000-0000-0000-000000000001","email":"coach-client-mvp@example.test","role":"authenticated"}', true);
select public.create_workout_assignment(
  '41000000-0000-0000-0000-000000000002',
  'Client Completion Workout',
  'Complete each movement in order.',
  current_date,
  '[
    {"name":"Back Squat","sets":4,"reps":6,"load":"100"},
    {"name":"Walking Lunge","sets":3,"reps":10,"notes":"Each side"}
  ]'::jsonb
);

reset role;
insert into public.workout_assignments (
  id, organization_id, coach_user_id, client_user_id,
  title, scheduled_date
) values (
  'b2200000-0000-0000-0000-000000000001',
  'b2000000-0000-0000-0000-000000000001',
  '42000000-0000-0000-0000-000000000001',
  '42000000-0000-0000-0000-000000000002',
  'Other Organization Workout',
  current_date
);
insert into public.workout_exercises (
  id, workout_assignment_id, exercise_name, sets, reps, sort_order
) values (
  'b2210000-0000-0000-0000-000000000001',
  'b2200000-0000-0000-0000-000000000001',
  'Private Exercise', 3, 8, 0
);

-- Client A sees only their own workout and can complete only its exercises.
set local role authenticated;
select set_config('request.jwt.claim.sub', '41000000-0000-0000-0000-000000000002', true);
select set_config('request.jwt.claims', '{"sub":"41000000-0000-0000-0000-000000000002","email":"client-client-mvp@example.test","role":"authenticated"}', true);
do $$
begin
  if (select count(*) from public.workout_assignments) <> 1 then
    raise exception 'Client A workout isolation failed';
  end if;
  if (select count(*) from public.workout_exercises) <> 2 then
    raise exception 'Client A exercise isolation failed';
  end if;
end;
$$;

select public.set_workout_exercise_completion(
  (
    select id from public.workout_exercises
    where exercise_name = 'Back Squat'
  ),
  true
);

do $$
begin
  if not exists (
    select 1 from public.workout_assignments
    where title = 'Client Completion Workout'
      and status = 'in_progress'
  ) then
    raise exception 'First exercise did not start the workout';
  end if;

  begin
    perform public.set_workout_completion(
      (
        select id from public.workout_assignments
        where title = 'Client Completion Workout'
      ),
      true
    );
    raise exception 'Client completed a workout with incomplete exercises';
  exception
    when others then
      if sqlerrm = 'Client completed a workout with incomplete exercises' then
        raise;
      end if;
  end;

  begin
    perform public.set_workout_exercise_completion(
      'b2210000-0000-0000-0000-000000000001',
      true
    );
    raise exception 'Client A completed Organization B exercise';
  exception
    when others then
      if sqlerrm = 'Client A completed Organization B exercise' then
        raise;
      end if;
  end;

  begin
    perform public.set_workout_completion(
      'b2200000-0000-0000-0000-000000000001',
      true
    );
    raise exception 'Client A completed Organization B workout';
  exception
    when others then
      if sqlerrm = 'Client A completed Organization B workout' then
        raise;
      end if;
  end;
end;
$$;

select public.set_workout_exercise_completion(
  (
    select id from public.workout_exercises
    where exercise_name = 'Walking Lunge'
  ),
  true
);
select public.set_workout_completion(
  (
    select id from public.workout_assignments
    where title = 'Client Completion Workout'
  ),
  true
);

do $$
begin
  if not exists (
    select 1 from public.workout_assignments
    where title = 'Client Completion Workout'
      and status = 'completed'
      and completed_at is not null
  ) then
    raise exception 'Client workout completion did not persist';
  end if;
  if (select count(*) from public.workout_exercises where completed_at is not null) <> 2 then
    raise exception 'Exercise completion did not persist';
  end if;
end;
$$;

-- Direct writes to prescribed structure or server-managed completion remain blocked.
update public.workout_exercises set exercise_name = 'Client Rewrite';
update public.workout_assignments set status = 'assigned';

reset role;
do $$
begin
  if exists (
    select 1 from public.workout_exercises where exercise_name = 'Client Rewrite'
  ) then
    raise exception 'Client changed prescribed structure';
  end if;
  if exists (
    select 1 from public.workout_assignments
    where title = 'Client Completion Workout' and status <> 'completed'
  ) then
    raise exception 'Client bypassed the completion RPC';
  end if;
end;
$$;

-- The coach sees the completed status but not another organization.
set local role authenticated;
select set_config('request.jwt.claim.sub', '41000000-0000-0000-0000-000000000001', true);
select set_config('request.jwt.claims', '{"sub":"41000000-0000-0000-0000-000000000001","email":"coach-client-mvp@example.test","role":"authenticated"}', true);
do $$
begin
  if (select count(*) from public.workout_assignments where status = 'completed') <> 1 then
    raise exception 'Coach cannot see client completion status';
  end if;
  if exists (
    select 1 from public.workout_assignments
    where id = 'b2200000-0000-0000-0000-000000000001'
  ) then
    raise exception 'Coach A can read Organization B completion data';
  end if;
end;
$$;

-- Inactive client membership revokes reads and completion RPCs immediately.
reset role;
update public.organization_memberships
set status = 'inactive'
where organization_id = 'a2000000-0000-0000-0000-000000000001'
  and user_id = '41000000-0000-0000-0000-000000000002';

set local role authenticated;
select set_config('request.jwt.claim.sub', '41000000-0000-0000-0000-000000000002', true);
select set_config('request.jwt.claims', '{"sub":"41000000-0000-0000-0000-000000000002","email":"client-client-mvp@example.test","role":"authenticated"}', true);
do $$
begin
  if exists (select 1 from public.workout_assignments) then
    raise exception 'Inactive client retained workout access';
  end if;

  begin
    perform public.set_workout_completion(
      (
        select id from public.workout_assignments
        where title = 'Client Completion Workout'
      ),
      false
    );
    raise exception 'Inactive client changed workout completion';
  exception
    when others then
      if sqlerrm = 'Inactive client changed workout completion' then
        raise;
      end if;
  end;
end;
$$;

rollback;
