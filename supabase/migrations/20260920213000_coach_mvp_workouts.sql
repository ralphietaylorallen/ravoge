create type public.workout_status as enum (
  'assigned',
  'in_progress',
  'completed',
  'cancelled'
);

create table public.workout_assignments (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  coach_user_id uuid not null references auth.users (id) on delete restrict,
  client_user_id uuid not null references auth.users (id) on delete cascade,
  title text not null check (
    title = trim(title)
    and char_length(title) between 2 and 120
  ),
  instructions text check (instructions is null or char_length(instructions) <= 4000),
  scheduled_date date not null,
  status public.workout_status not null default 'assigned',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (coach_user_id <> client_user_id),
  foreign key (organization_id, coach_user_id)
    references public.organization_memberships (organization_id, user_id)
    on delete restrict,
  foreign key (organization_id, client_user_id)
    references public.organization_memberships (organization_id, user_id)
    on delete cascade
);

create table public.workout_exercises (
  id uuid primary key default gen_random_uuid(),
  workout_assignment_id uuid not null
    references public.workout_assignments (id) on delete cascade,
  exercise_name text not null check (
    exercise_name = trim(exercise_name)
    and char_length(exercise_name) between 1 and 120
  ),
  sets smallint not null check (sets between 1 and 100),
  reps smallint not null check (reps between 1 and 1000),
  load numeric(10, 2) check (load is null or load between 0 and 100000),
  notes text check (notes is null or char_length(notes) <= 1000),
  sort_order smallint not null check (sort_order between 0 and 99),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (workout_assignment_id, sort_order)
);

create index workout_assignments_coach_schedule_idx
  on public.workout_assignments (coach_user_id, scheduled_date desc, created_at desc);
create index workout_assignments_client_schedule_idx
  on public.workout_assignments (client_user_id, scheduled_date desc, created_at desc);
create index workout_assignments_organization_status_idx
  on public.workout_assignments (organization_id, status, scheduled_date desc);
create index workout_exercises_assignment_order_idx
  on public.workout_exercises (workout_assignment_id, sort_order);

create function private.has_active_coach_client_assignment(
  target_organization_id uuid,
  target_coach_user_id uuid,
  target_client_user_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.coach_client_assignments assignment
    join public.organization_memberships coach
      on coach.organization_id = assignment.organization_id
     and coach.user_id = assignment.coach_user_id
     and coach.role = 'coach'
     and coach.status = 'active'
    join public.profiles coach_profile
      on coach_profile.id = coach.user_id
     and coach_profile.account_status = 'active'
    join public.organization_memberships client
      on client.organization_id = assignment.organization_id
     and client.user_id = assignment.client_user_id
     and client.role = 'client'
     and client.status = 'active'
    join public.profiles client_profile
      on client_profile.id = client.user_id
     and client_profile.account_status = 'active'
    join public.organizations organization
      on organization.id = assignment.organization_id
     and organization.status = 'active'
    where assignment.organization_id = target_organization_id
      and assignment.coach_user_id = target_coach_user_id
      and assignment.client_user_id = target_client_user_id
      and assignment.status = 'active'
  );
$$;

create function private.can_read_workout(target_workout_assignment_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.workout_assignments workout
    where workout.id = target_workout_assignment_id
      and (
        private.has_active_role(
          workout.organization_id,
          array['owner']::public.organization_role[]
        )
        or (
          workout.coach_user_id = (select auth.uid())
          and private.has_active_coach_client_assignment(
            workout.organization_id,
            workout.coach_user_id,
            workout.client_user_id
          )
        )
        or (
          workout.client_user_id = (select auth.uid())
          and private.has_active_role(
            workout.organization_id,
            array['client']::public.organization_role[]
          )
        )
      )
  );
$$;

create function private.can_manage_workout(target_workout_assignment_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.workout_assignments workout
    where workout.id = target_workout_assignment_id
      and workout.coach_user_id = (select auth.uid())
      and private.has_active_coach_client_assignment(
        workout.organization_id,
        workout.coach_user_id,
        workout.client_user_id
      )
  );
$$;

create function private.enforce_workout_identity()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if tg_op = 'UPDATE' and (
    new.organization_id <> old.organization_id
    or new.coach_user_id <> old.coach_user_id
    or new.client_user_id <> old.client_user_id
  ) then
    raise exception 'Workout assignment identities are immutable';
  end if;

  if not private.has_active_coach_client_assignment(
    new.organization_id,
    new.coach_user_id,
    new.client_user_id
  ) then
    raise exception 'An active coach-client assignment is required';
  end if;

  return new;
end;
$$;

create function private.enforce_exercise_identity()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if new.workout_assignment_id <> old.workout_assignment_id then
    raise exception 'Exercise workout identity is immutable';
  end if;
  return new;
end;
$$;

create trigger enforce_workout_identity
  before insert or update on public.workout_assignments
  for each row execute function private.enforce_workout_identity();
create trigger workout_assignments_set_updated_at
  before update on public.workout_assignments
  for each row execute function private.set_updated_at();
create trigger enforce_exercise_identity
  before update on public.workout_exercises
  for each row execute function private.enforce_exercise_identity();
create trigger workout_exercises_set_updated_at
  before update on public.workout_exercises
  for each row execute function private.set_updated_at();

create function public.create_workout_assignment(
  client_user_id uuid,
  workout_title text,
  workout_instructions text,
  workout_scheduled_date date,
  exercises jsonb
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  authenticated_coach_id uuid := (select auth.uid());
  active_organization_id uuid;
  new_workout_id uuid;
  exercise jsonb;
  exercise_index integer;
  exercise_name text;
  exercise_notes text;
  exercise_sets integer;
  exercise_reps integer;
  exercise_load numeric;
begin
  if authenticated_coach_id is null then
    raise exception 'Authentication is required';
  end if;

  select membership.organization_id into strict active_organization_id
  from public.organization_memberships membership
  join public.organizations organization
    on organization.id = membership.organization_id
   and organization.status = 'active'
  join public.profiles profile
    on profile.id = membership.user_id
   and profile.account_status = 'active'
  where membership.user_id = authenticated_coach_id
    and membership.role = 'coach'
    and membership.status = 'active';

  if not private.has_active_coach_client_assignment(
    active_organization_id,
    authenticated_coach_id,
    client_user_id
  ) then
    raise exception 'Client is not assigned to this coach';
  end if;

  workout_title := trim(coalesce(workout_title, ''));
  workout_instructions := nullif(trim(coalesce(workout_instructions, '')), '');
  if char_length(workout_title) not between 2 and 120
    or workout_scheduled_date is null
    or char_length(coalesce(workout_instructions, '')) > 4000 then
    raise exception 'Invalid workout details';
  end if;

  if jsonb_typeof(exercises) <> 'array'
    or jsonb_array_length(exercises) not between 1 and 30 then
    raise exception 'A workout requires between 1 and 30 exercises';
  end if;

  insert into public.workout_assignments (
    organization_id,
    coach_user_id,
    client_user_id,
    title,
    instructions,
    scheduled_date
  ) values (
    active_organization_id,
    authenticated_coach_id,
    client_user_id,
    workout_title,
    workout_instructions,
    workout_scheduled_date
  ) returning id into new_workout_id;

  for exercise, exercise_index in
    select value, ordinality::integer - 1
    from jsonb_array_elements(exercises) with ordinality
  loop
    if jsonb_typeof(exercise) <> 'object' then
      raise exception 'Invalid exercise';
    end if;

    exercise_name := trim(coalesce(exercise ->> 'name', ''));
    exercise_notes := nullif(trim(coalesce(exercise ->> 'notes', '')), '');

    begin
      exercise_sets := (exercise ->> 'sets')::integer;
      exercise_reps := (exercise ->> 'reps')::integer;
      exercise_load := case
        when nullif(trim(coalesce(exercise ->> 'load', '')), '') is null then null
        else (exercise ->> 'load')::numeric
      end;
    exception when invalid_text_representation or numeric_value_out_of_range then
      raise exception 'Invalid exercise values';
    end;

    if char_length(exercise_name) not between 1 and 120
      or exercise_sets not between 1 and 100
      or exercise_reps not between 1 and 1000
      or (exercise_load is not null and exercise_load not between 0 and 100000)
      or char_length(coalesce(exercise_notes, '')) > 1000 then
      raise exception 'Invalid exercise values';
    end if;

    insert into public.workout_exercises (
      workout_assignment_id,
      exercise_name,
      sets,
      reps,
      load,
      notes,
      sort_order
    ) values (
      new_workout_id,
      exercise_name,
      exercise_sets,
      exercise_reps,
      exercise_load,
      exercise_notes,
      exercise_index
    );
  end loop;

  return new_workout_id;
exception
  when no_data_found then
    raise exception 'An active coach membership is required';
  when too_many_rows then
    raise exception 'Coach membership is ambiguous';
end;
$$;

revoke all on function private.has_active_coach_client_assignment(uuid, uuid, uuid)
  from public, anon, authenticated;
revoke all on function private.can_read_workout(uuid)
  from public, anon, authenticated;
revoke all on function private.can_manage_workout(uuid)
  from public, anon, authenticated;
revoke all on function private.enforce_workout_identity()
  from public, anon, authenticated;
revoke all on function private.enforce_exercise_identity()
  from public, anon, authenticated;
revoke all on function public.create_workout_assignment(uuid, text, text, date, jsonb)
  from public, anon, authenticated;
grant execute on function public.create_workout_assignment(uuid, text, text, date, jsonb)
  to authenticated;

alter table public.workout_assignments enable row level security;
alter table public.workout_exercises enable row level security;

create policy workout_assignments_select_authorized
  on public.workout_assignments for select to authenticated
  using ((select private.can_read_workout(id)));
create policy workout_assignments_update_coach
  on public.workout_assignments for update to authenticated
  using ((select private.can_manage_workout(id)))
  with check ((select private.can_manage_workout(id)));
create policy workout_assignments_delete_coach
  on public.workout_assignments for delete to authenticated
  using ((select private.can_manage_workout(id)));

create policy workout_exercises_select_authorized
  on public.workout_exercises for select to authenticated
  using ((select private.can_read_workout(workout_assignment_id)));
create policy workout_exercises_insert_coach
  on public.workout_exercises for insert to authenticated
  with check ((select private.can_manage_workout(workout_assignment_id)));
create policy workout_exercises_update_coach
  on public.workout_exercises for update to authenticated
  using ((select private.can_manage_workout(workout_assignment_id)))
  with check ((select private.can_manage_workout(workout_assignment_id)));
create policy workout_exercises_delete_coach
  on public.workout_exercises for delete to authenticated
  using ((select private.can_manage_workout(workout_assignment_id)));

revoke all on public.workout_assignments from anon, authenticated;
revoke all on public.workout_exercises from anon, authenticated;

grant select, delete on public.workout_assignments to authenticated;
grant update (title, instructions, scheduled_date, status)
  on public.workout_assignments to authenticated;
grant select, insert, delete on public.workout_exercises to authenticated;
grant update (exercise_name, sets, reps, load, notes, sort_order)
  on public.workout_exercises to authenticated;
