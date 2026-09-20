begin;

insert into auth.users (
  id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at
) values
  ('31000000-0000-0000-0000-000000000001', 'authenticated', 'authenticated', 'coach-a-mvp@example.test', crypt('TestPass123!', gen_salt('bf')), now(), '{"provider":"email","providers":["email"]}', '{"full_name":"Coach A MVP"}', now(), now()),
  ('31000000-0000-0000-0000-000000000002', 'authenticated', 'authenticated', 'client-a-mvp@example.test', crypt('TestPass123!', gen_salt('bf')), now(), '{"provider":"email","providers":["email"]}', '{"full_name":"Client A MVP"}', now(), now()),
  ('31000000-0000-0000-0000-000000000003', 'authenticated', 'authenticated', 'unassigned-a-mvp@example.test', crypt('TestPass123!', gen_salt('bf')), now(), '{"provider":"email","providers":["email"]}', '{"full_name":"Unassigned A MVP"}', now(), now()),
  ('31000000-0000-0000-0000-000000000004', 'authenticated', 'authenticated', 'owner-a-mvp@example.test', crypt('TestPass123!', gen_salt('bf')), now(), '{"provider":"email","providers":["email"]}', '{"full_name":"Owner A MVP"}', now(), now()),
  ('32000000-0000-0000-0000-000000000001', 'authenticated', 'authenticated', 'coach-b-mvp@example.test', crypt('TestPass123!', gen_salt('bf')), now(), '{"provider":"email","providers":["email"]}', '{"full_name":"Coach B MVP"}', now(), now()),
  ('32000000-0000-0000-0000-000000000002', 'authenticated', 'authenticated', 'client-b-mvp@example.test', crypt('TestPass123!', gen_salt('bf')), now(), '{"provider":"email","providers":["email"]}', '{"full_name":"Client B MVP"}', now(), now());

insert into public.organizations (id, name) values
  ('a1000000-0000-0000-0000-000000000001', 'Workout Organization A'),
  ('b1000000-0000-0000-0000-000000000001', 'Workout Organization B');

insert into public.organization_memberships (organization_id, user_id, role) values
  ('a1000000-0000-0000-0000-000000000001', '31000000-0000-0000-0000-000000000001', 'coach'),
  ('a1000000-0000-0000-0000-000000000001', '31000000-0000-0000-0000-000000000002', 'client'),
  ('a1000000-0000-0000-0000-000000000001', '31000000-0000-0000-0000-000000000003', 'client'),
  ('a1000000-0000-0000-0000-000000000001', '31000000-0000-0000-0000-000000000004', 'owner'),
  ('b1000000-0000-0000-0000-000000000001', '32000000-0000-0000-0000-000000000001', 'coach'),
  ('b1000000-0000-0000-0000-000000000001', '32000000-0000-0000-0000-000000000002', 'client');

insert into public.coach_client_assignments (
  organization_id, coach_user_id, client_user_id
) values
  ('a1000000-0000-0000-0000-000000000001', '31000000-0000-0000-0000-000000000001', '31000000-0000-0000-0000-000000000002'),
  ('b1000000-0000-0000-0000-000000000001', '32000000-0000-0000-0000-000000000001', '32000000-0000-0000-0000-000000000002');

-- Coach A creates a workout atomically for the assigned client.
set local role authenticated;
select set_config('request.jwt.claim.sub', '31000000-0000-0000-0000-000000000001', true);
select set_config('request.jwt.claims', '{"sub":"31000000-0000-0000-0000-000000000001","email":"coach-a-mvp@example.test","role":"authenticated"}', true);
select public.create_workout_assignment(
  '31000000-0000-0000-0000-000000000002',
  'Lower Body Strength',
  'Move with control.',
  current_date,
  '[
    {"name":"Back Squat","sets":4,"reps":6,"load":"100","notes":"RPE 7"},
    {"name":"Romanian Deadlift","sets":3,"reps":8,"load":"80","notes":""}
  ]'::jsonb
);

do $$
begin
  if (select count(*) from public.workout_assignments) <> 1 then
    raise exception 'Assigned coach cannot read the created workout';
  end if;
  if (select count(*) from public.workout_exercises) <> 2 then
    raise exception 'Workout exercise creation failed';
  end if;
  if exists (
    select 1 from public.workout_assignments
    where organization_id = 'b1000000-0000-0000-0000-000000000001'
  ) then
    raise exception 'Coach A can read Organization B workouts';
  end if;
end;
$$;

update public.workout_assignments
set title = 'Lower Body Power'
where client_user_id = '31000000-0000-0000-0000-000000000002';

do $$
begin
  begin
    perform public.create_workout_assignment(
      '31000000-0000-0000-0000-000000000003',
      'Unauthorized Workout',
      null,
      current_date,
      '[{"name":"Squat","sets":3,"reps":5}]'::jsonb
    );
    raise exception 'Coach created a workout for an unassigned client';
  exception
    when others then
      if sqlerrm = 'Coach created a workout for an unassigned client' then
        raise;
      end if;
  end;

  begin
    insert into public.workout_assignments (
      organization_id, coach_user_id, client_user_id, title, scheduled_date
    ) values (
      'b1000000-0000-0000-0000-000000000001',
      '32000000-0000-0000-0000-000000000001',
      '32000000-0000-0000-0000-000000000002',
      'Spoofed Workout',
      current_date
    );
    raise exception 'Coach bypassed the server-derived workout identity';
  exception
    when insufficient_privilege then null;
  end;
end;
$$;

-- Client A can read only their own prescribed structure and cannot alter it.
select set_config('request.jwt.claim.sub', '31000000-0000-0000-0000-000000000002', true);
select set_config('request.jwt.claims', '{"sub":"31000000-0000-0000-0000-000000000002","email":"client-a-mvp@example.test","role":"authenticated"}', true);
do $$
begin
  if (select count(*) from public.workout_assignments) <> 1 then
    raise exception 'Client A cannot read their workout';
  end if;
  if (select count(*) from public.workout_exercises) <> 2 then
    raise exception 'Client A cannot read their workout exercises';
  end if;
end;
$$;
update public.workout_assignments set status = 'completed';
update public.workout_exercises set exercise_name = 'Client Rewrite';

reset role;
do $$
begin
  if exists (
    select 1 from public.workout_assignments where status = 'completed'
  ) then
    raise exception 'Client changed workout status during the coach-only gate';
  end if;
  if exists (
    select 1 from public.workout_exercises where exercise_name = 'Client Rewrite'
  ) then
    raise exception 'Client changed the prescribed exercise structure';
  end if;
end;
$$;

-- Organization B cannot see or mutate Organization A data.
set local role authenticated;
select set_config('request.jwt.claim.sub', '32000000-0000-0000-0000-000000000001', true);
select set_config('request.jwt.claims', '{"sub":"32000000-0000-0000-0000-000000000001","email":"coach-b-mvp@example.test","role":"authenticated"}', true);
do $$
begin
  if exists (select 1 from public.workout_assignments) then
    raise exception 'Organization B can read Organization A workouts';
  end if;
end;
$$;
update public.workout_assignments set title = 'Cross Organization Change';

reset role;
do $$
begin
  if exists (
    select 1 from public.workout_assignments where title = 'Cross Organization Change'
  ) then
    raise exception 'Organization B changed Organization A workout';
  end if;
end;
$$;

-- An authorized owner can inspect the organization workout without changing authorship.
set local role authenticated;
select set_config('request.jwt.claim.sub', '31000000-0000-0000-0000-000000000004', true);
select set_config('request.jwt.claims', '{"sub":"31000000-0000-0000-0000-000000000004","email":"owner-a-mvp@example.test","role":"authenticated"}', true);
do $$
begin
  if (select count(*) from public.workout_assignments) <> 1 then
    raise exception 'Owner A cannot read the organization workout';
  end if;
end;
$$;

-- Losing the coach-client assignment immediately revokes coach access.
reset role;
update public.coach_client_assignments
set status = 'inactive'
where organization_id = 'a1000000-0000-0000-0000-000000000001'
  and coach_user_id = '31000000-0000-0000-0000-000000000001'
  and client_user_id = '31000000-0000-0000-0000-000000000002';

set local role authenticated;
select set_config('request.jwt.claim.sub', '31000000-0000-0000-0000-000000000001', true);
select set_config('request.jwt.claims', '{"sub":"31000000-0000-0000-0000-000000000001","email":"coach-a-mvp@example.test","role":"authenticated"}', true);
do $$
begin
  if exists (select 1 from public.workout_assignments) then
    raise exception 'Inactive coach-client assignment retained workout access';
  end if;
end;
$$;

-- The client keeps read access to their own historical assignment while active in the gym.
select set_config('request.jwt.claim.sub', '31000000-0000-0000-0000-000000000002', true);
select set_config('request.jwt.claims', '{"sub":"31000000-0000-0000-0000-000000000002","email":"client-a-mvp@example.test","role":"authenticated"}', true);
do $$
begin
  if (select count(*) from public.workout_assignments) <> 1 then
    raise exception 'Active client lost their own historical workout';
  end if;
end;
$$;

-- Inactive membership immediately revokes the client's own workout access.
reset role;
update public.organization_memberships
set status = 'inactive'
where organization_id = 'a1000000-0000-0000-0000-000000000001'
  and user_id = '31000000-0000-0000-0000-000000000002';

set local role authenticated;
select set_config('request.jwt.claim.sub', '31000000-0000-0000-0000-000000000002', true);
select set_config('request.jwt.claims', '{"sub":"31000000-0000-0000-0000-000000000002","email":"client-a-mvp@example.test","role":"authenticated"}', true);
do $$
begin
  if exists (select 1 from public.workout_assignments) then
    raise exception 'Inactive client membership retained workout access';
  end if;
end;
$$;

rollback;
