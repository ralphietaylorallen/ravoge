alter table public.workout_assignments
  add column if not exists scheduled_time time without time zone;

create or replace function public.create_planned_workout_assignment_lb(
  client_user_id uuid,
  workout_title text,
  workout_instructions text,
  workout_scheduled_date date,
  workout_scheduled_time time without time zone,
  exercises jsonb
) returns uuid
language plpgsql
security definer
set search_path=''
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
  exercise_rest_seconds integer;
  exercise_mode text;
  exercise_duration_seconds integer;
  protocol jsonb;
begin
  if authenticated_coach_id is null then
    raise exception 'Authentication is required';
  end if;

  select membership.organization_id into strict active_organization_id
  from private.request_memberships membership
  join public.organizations organization
    on organization.id=membership.organization_id
   and organization.status='active'
  join public.profiles profile
    on profile.id=membership.user_id
   and profile.account_status='active'
  where membership.user_id=authenticated_coach_id
    and membership.role='coach'
    and membership.status='active';

  if not private.has_active_coach_client_assignment(
    active_organization_id,
    authenticated_coach_id,
    client_user_id
  ) then
    raise exception 'Client is not assigned to this coach';
  end if;

  workout_title:=trim(coalesce(workout_title,''));
  workout_instructions:=nullif(trim(coalesce(workout_instructions,'')),'');
  if char_length(workout_title) not between 2 and 120
    or workout_scheduled_date is null
    or workout_scheduled_time is null
    or char_length(coalesce(workout_instructions,''))>4000 then
    raise exception 'Invalid workout details';
  end if;

  if exists(
    select 1
    from public.workout_assignments w
    where w.organization_id=active_organization_id
      and w.coach_user_id=authenticated_coach_id
      and w.client_user_id=client_user_id
      and w.scheduled_date=workout_scheduled_date
      and w.scheduled_time=workout_scheduled_time
      and w.status in ('assigned','in_progress')
  ) then
    raise exception 'A workout is already planned for this client at that date and time';
  end if;

  if jsonb_typeof(exercises)<>'array'
    or jsonb_array_length(exercises) not between 1 and 30 then
    raise exception 'A workout requires between 1 and 30 exercises';
  end if;

  insert into public.workout_assignments(
    organization_id,coach_user_id,client_user_id,title,instructions,scheduled_date,scheduled_time
  ) values(
    active_organization_id,authenticated_coach_id,client_user_id,workout_title,workout_instructions,workout_scheduled_date,workout_scheduled_time
  ) returning id into new_workout_id;

  for exercise,exercise_index in
    select value,ordinality::integer-1
    from jsonb_array_elements(exercises) with ordinality
  loop
    if jsonb_typeof(exercise)<>'object' then raise exception 'Invalid exercise'; end if;
    exercise_name:=trim(coalesce(exercise->>'name',''));
    exercise_notes:=nullif(trim(coalesce(exercise->>'notes','')),'');
    exercise_mode:=coalesce(nullif(trim(exercise->>'mode'),''),'reps');

    begin
      exercise_sets:=(exercise->>'sets')::integer;
      exercise_reps:=case when exercise_mode='time' then 1 else (exercise->>'reps')::integer end;
      exercise_load:=case when nullif(trim(coalesce(exercise->>'load','')),'') is null then null else (exercise->>'load')::numeric end;
      exercise_rest_seconds:=case when nullif(trim(coalesce(exercise->>'restSeconds','')),'') is null then null else (exercise->>'restSeconds')::integer end;
      exercise_duration_seconds:=case when exercise_mode='time' then (exercise->>'durationSeconds')::integer else null end;
    exception when invalid_text_representation or numeric_value_out_of_range then
      raise exception 'Invalid exercise values';
    end;

    if exercise_mode not in ('reps','time')
      or char_length(exercise_name) not between 1 and 120
      or exercise_sets not between 1 and 100
      or exercise_reps not between 1 and 1000
      or (exercise_load is not null and exercise_load not between 0 and 100000)
      or (exercise_rest_seconds is not null and exercise_rest_seconds not between 0 and 1200)
      or (exercise_mode='time' and exercise_duration_seconds not between 5 and 1200)
      or char_length(coalesce(exercise_notes,''))>1000 then
      raise exception 'Invalid exercise values';
    end if;

    protocol:=case when exercise_mode='time' then jsonb_build_object(
      'block','strength',
      'format','straight',
      'group','',
      'measurement','time',
      'workSeconds',exercise_duration_seconds,
      'distance',null,
      'distanceUnit','meters',
      'intervalSeconds',null,
      'blockDurationSeconds',null,
      'percentageLoad',null,
      'perSide',false,
      'targetRpe',null,
      'substitutionIds','[]'::jsonb
    ) else null end;

    insert into public.workout_exercises(
      workout_assignment_id,exercise_name,sets,reps,load,load_unit,rest_seconds,notes,selection_reason,sort_order,prescription_details
    ) values(
      new_workout_id,exercise_name,exercise_sets,exercise_reps,exercise_load,'lb',exercise_rest_seconds,
      exercise_notes,'Coach planned manually.',exercise_index,protocol
    );
  end loop;

  perform private.mark_workout_pounds(new_workout_id);
  return new_workout_id;
exception
  when no_data_found then raise exception 'An active coach membership is required';
  when too_many_rows then raise exception 'Coach membership is ambiguous';
end;
$$;

revoke all on function public.create_planned_workout_assignment_lb(uuid,text,text,date,time,jsonb) from public,anon,authenticated;
grant execute on function public.create_planned_workout_assignment_lb(uuid,text,text,date,time,jsonb) to authenticated;
