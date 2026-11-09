alter table public.workout_assignments
  add column if not exists paired_workout_group_id uuid;

create index if not exists workout_assignments_paired_group_idx
  on public.workout_assignments(paired_workout_group_id)
  where paired_workout_group_id is not null;

create or replace function public.create_paired_planned_workout_assignments_lb(
  primary_client_user_id uuid,
  secondary_client_user_id uuid,
  workout_title text,
  workout_instructions text,
  workout_scheduled_date date,
  workout_scheduled_time time without time zone,
  primary_exercises jsonb,
  secondary_exercises jsonb
) returns jsonb
language plpgsql
security definer
set search_path=''
as $$
declare
  group_id uuid := gen_random_uuid();
  primary_workout_id uuid;
  secondary_workout_id uuid;
  exercise_index integer;
  primary_name text;
  secondary_name text;
  primary_mode text;
  secondary_mode text;
begin
  if (select auth.uid()) is null then
    raise exception 'Authentication is required';
  end if;

  if primary_client_user_id is null
    or secondary_client_user_id is null
    or primary_client_user_id = secondary_client_user_id then
    raise exception 'Choose two different assigned clients';
  end if;

  if jsonb_typeof(primary_exercises) <> 'array'
    or jsonb_typeof(secondary_exercises) <> 'array'
    or jsonb_array_length(primary_exercises) <> jsonb_array_length(secondary_exercises)
    or jsonb_array_length(primary_exercises) not between 1 and 30 then
    raise exception 'Paired workouts require matching exercise structures';
  end if;

  for exercise_index in 0..jsonb_array_length(primary_exercises)-1 loop
    primary_name := trim(coalesce(primary_exercises->exercise_index->>'name',''));
    secondary_name := trim(coalesce(secondary_exercises->exercise_index->>'name',''));
    primary_mode := coalesce(nullif(trim(primary_exercises->exercise_index->>'mode'),''),'reps');
    secondary_mode := coalesce(nullif(trim(secondary_exercises->exercise_index->>'mode'),''),'reps');

    if primary_name = ''
      or primary_name <> secondary_name
      or primary_mode <> secondary_mode then
      raise exception 'Paired workouts must use the same exercise order and exercise type';
    end if;
  end loop;

  primary_workout_id := public.create_planned_workout_assignment_lb(
    primary_client_user_id,
    workout_title,
    workout_instructions,
    workout_scheduled_date,
    workout_scheduled_time,
    primary_exercises
  );

  secondary_workout_id := public.create_planned_workout_assignment_lb(
    secondary_client_user_id,
    workout_title,
    workout_instructions,
    workout_scheduled_date,
    workout_scheduled_time,
    secondary_exercises
  );

  update public.workout_assignments
  set paired_workout_group_id = group_id
  where id in (primary_workout_id, secondary_workout_id);

  return jsonb_build_object(
    'groupId', group_id,
    'primaryWorkoutId', primary_workout_id,
    'secondaryWorkoutId', secondary_workout_id
  );
end;
$$;

revoke all on function public.create_paired_planned_workout_assignments_lb(uuid,uuid,text,text,date,time,jsonb,jsonb)
  from public,anon,authenticated;
grant execute on function public.create_paired_planned_workout_assignments_lb(uuid,uuid,text,text,date,time,jsonb,jsonb)
  to authenticated;
