alter table public.workout_assignments
  add column completed_at timestamptz;

alter table public.workout_exercises
  add column completed_at timestamptz;

create function public.set_workout_exercise_completion(
  target_exercise_id uuid,
  is_completed boolean
)
returns public.workout_status
language plpgsql
security definer
set search_path = ''
as $$
declare
  authenticated_client_id uuid := (select auth.uid());
  target_workout public.workout_assignments%rowtype;
  resulting_status public.workout_status;
begin
  if authenticated_client_id is null or is_completed is null then
    raise exception 'Authentication and a completion state are required';
  end if;

  select workout.* into strict target_workout
  from public.workout_exercises exercise
  join public.workout_assignments workout
    on workout.id = exercise.workout_assignment_id
  where exercise.id = target_exercise_id
  for update of exercise, workout;

  if target_workout.client_user_id <> authenticated_client_id
    or target_workout.status = 'cancelled'
    or not private.has_active_role(
      target_workout.organization_id,
      array['client']::public.organization_role[]
    )
    or not private.has_active_coach_client_assignment(
      target_workout.organization_id,
      target_workout.coach_user_id,
      target_workout.client_user_id
    ) then
    raise exception 'Workout is not available to this client';
  end if;

  update public.workout_exercises
  set completed_at = case when is_completed then now() else null end
  where id = target_exercise_id;

  if is_completed and target_workout.status = 'assigned' then
    update public.workout_assignments
    set status = 'in_progress', completed_at = null
    where id = target_workout.id
    returning status into resulting_status;
  elsif not is_completed and target_workout.status = 'completed' then
    update public.workout_assignments
    set status = 'in_progress', completed_at = null
    where id = target_workout.id
    returning status into resulting_status;
  else
    resulting_status := target_workout.status;
  end if;

  return resulting_status;
exception
  when no_data_found then
    raise exception 'Workout exercise was not found';
end;
$$;

create function public.set_workout_completion(
  target_workout_id uuid,
  is_completed boolean
)
returns public.workout_status
language plpgsql
security definer
set search_path = ''
as $$
declare
  authenticated_client_id uuid := (select auth.uid());
  target_workout public.workout_assignments%rowtype;
  resulting_status public.workout_status;
begin
  if authenticated_client_id is null or is_completed is null then
    raise exception 'Authentication and a completion state are required';
  end if;

  select * into strict target_workout
  from public.workout_assignments
  where id = target_workout_id
  for update;

  if target_workout.client_user_id <> authenticated_client_id
    or target_workout.status = 'cancelled'
    or not private.has_active_role(
      target_workout.organization_id,
      array['client']::public.organization_role[]
    )
    or not private.has_active_coach_client_assignment(
      target_workout.organization_id,
      target_workout.coach_user_id,
      target_workout.client_user_id
    ) then
    raise exception 'Workout is not available to this client';
  end if;

  if is_completed then
    if not exists (
      select 1 from public.workout_exercises
      where workout_assignment_id = target_workout.id
    ) or exists (
      select 1 from public.workout_exercises
      where workout_assignment_id = target_workout.id
        and completed_at is null
    ) then
      raise exception 'Complete every exercise before completing the workout';
    end if;

    update public.workout_assignments
    set status = 'completed', completed_at = now()
    where id = target_workout.id
    returning status into resulting_status;
  else
    update public.workout_assignments
    set
      status = case
        when exists (
          select 1 from public.workout_exercises
          where workout_assignment_id = target_workout.id
            and completed_at is not null
        ) then 'in_progress'::public.workout_status
        else 'assigned'::public.workout_status
      end,
      completed_at = null
    where id = target_workout.id
    returning status into resulting_status;
  end if;

  return resulting_status;
exception
  when no_data_found then
    raise exception 'Workout was not found';
end;
$$;

revoke all on function public.set_workout_exercise_completion(uuid, boolean)
  from public, anon, authenticated;
revoke all on function public.set_workout_completion(uuid, boolean)
  from public, anon, authenticated;
grant execute on function public.set_workout_exercise_completion(uuid, boolean)
  to authenticated;
grant execute on function public.set_workout_completion(uuid, boolean)
  to authenticated;
