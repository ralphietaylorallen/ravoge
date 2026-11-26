-- Repeat the selected local hours atomically, reusing the daily save worker.
create function public.save_coach_calendar_period(
  target_organization_id uuid, target_date date, requested_increment integer,
  requested_ranges jsonb, requested_period text, requested_weekdays integer[]
) returns jsonb language plpgsql security invoker set search_path='' as $$
declare
  zone text; first_day date; last_day date; day date; weekday integer;
  gym public.organization_hours%rowtype;
  special public.organization_special_hours%rowtype;
  opens integer; closes integer; clipped jsonb; saved_dates jsonb := '[]';
begin
  if auth.uid() is null or not exists (
    select 1 from public.get_my_authorized_memberships() m
    where m.organization_id=target_organization_id and m.role='coach' and m.status='active'
  ) then raise exception 'Active Coach access required' using errcode='42501'; end if;
  select timezone into strict zone from public.organizations where id=target_organization_id and status='active';
  if target_date is null or requested_period is null or requested_period not in ('week','month')
    or requested_increment is null or requested_increment not in (45,60)
    or requested_weekdays is null or cardinality(requested_weekdays) not between 1 and 7
    or exists(select 1 from unnest(requested_weekdays) d where d is null or d not between 0 and 6)
    or requested_ranges is null or jsonb_typeof(requested_ranges)<>'array' or jsonb_array_length(requested_ranges)>96
  then raise exception 'Invalid availability selection'; end if;
  -- Validate the entire template before clipping it to each day's opening hours.
  if exists(select 1 from jsonb_array_elements(requested_ranges) r where
    jsonb_typeof(r->'start') is distinct from 'number' or jsonb_typeof(r->'end') is distinct from 'number'
  ) then raise exception 'Invalid time range'; end if;
  if exists(select 1 from jsonb_array_elements(requested_ranges) r where
    (r->>'start')::numeric<>trunc((r->>'start')::numeric) or (r->>'end')::numeric<>trunc((r->>'end')::numeric)
    or (r->>'start')::numeric<0 or (r->>'end')::numeric>1440 or (r->>'start')::numeric>=(r->>'end')::numeric
  ) then raise exception 'Invalid time range'; end if;
  first_day := case when requested_period='week' then target_date-extract(dow from target_date)::integer else date_trunc('month',target_date)::date end;
  last_day := case when requested_period='week' then first_day+6 else (first_day+interval '1 month'-interval '1 day')::date end;
  day := greatest(first_day,(now() at time zone zone)::date);
  while day<=last_day loop
    weekday := extract(dow from day)::integer;
    if weekday=any(requested_weekdays) then
      select * into special from public.organization_special_hours where organization_id=target_organization_id and local_date=day;
      select * into gym from public.organization_hours where organization_id=target_organization_id and day_of_week=weekday;
      if special.organization_id is not null then
        opens := case when not special.is_closed then extract(hour from special.opens_at)::integer*60+extract(minute from special.opens_at)::integer end;
        closes := case when not special.is_closed then extract(hour from special.closes_at)::integer*60+extract(minute from special.closes_at)::integer end;
      elsif gym.organization_id is not null then
        opens := case when not gym.is_closed then extract(hour from gym.opens_at)::integer*60+extract(minute from gym.opens_at)::integer end;
        closes := case when not gym.is_closed then extract(hour from gym.closes_at)::integer*60+extract(minute from gym.closes_at)::integer end;
      elsif not exists(select 1 from public.organization_hours where organization_id=target_organization_id) and weekday<>0 then
        opens := 300; closes := 1200;
      else opens := null; closes := null;
      end if;
      if opens is not null and closes>opens then
        select coalesce(jsonb_agg(jsonb_build_object('start',s,'end',e) order by s),'[]'::jsonb) into clipped from (
          select greatest((r->>'start')::integer,opens) s,least((r->>'end')::integer,closes) e
          from jsonb_array_elements(requested_ranges) r
        ) ranges where s<e;
        perform public.save_coach_calendar_day(target_organization_id,day,requested_increment,clipped);
        saved_dates := saved_dates||jsonb_build_array(day);
      end if;
    end if;
    day := day+1;
  end loop;
  return jsonb_build_object('savedDates',saved_dates);
end $$;
revoke all on function public.save_coach_calendar_period(uuid,date,integer,jsonb,text,integer[]) from public,anon;
grant execute on function public.save_coach_calendar_period(uuid,date,integer,jsonb,text,integer[]) to authenticated;

-- A plan can be generated for a local date/time without creating a booking.
create function private.begin_planned_workout_draft(target_organization_id uuid,target_client_user_id uuid,target_date date,target_time time)
returns jsonb language plpgsql security definer set search_path='' as $$
declare
  org uuid; zone text; p public.generated_prescriptions%rowtype;
  appointment uuid; existing_workout uuid; existing_count integer; new_id uuid;
begin
  select o.id,o.timezone into org,zone from public.organizations o
    where o.id=target_organization_id and o.status='active' and private.has_active_role(o.id,array['coach']::public.organization_role[])
      and private.can_manage_client_domain(o.id,target_client_user_id);
  if auth.uid() is null or org is null then raise exception 'Assigned Coach access required' using errcode='42501'; end if;
  if target_date is null or target_date<(now() at time zone zone)::date or target_time is null
    or extract(second from target_time)<>0 or target_time>=time '24:00'
  then raise exception 'Choose a current or future date and time'; end if;
  select b.id into appointment from public.bookings b where b.organization_id=org and b.coach_user_id=auth.uid()
    and b.client_user_id=target_client_user_id and b.status='scheduled' and b.session_type<>'Intake'
    and (b.starts_at at time zone zone)::date=target_date and (b.starts_at at time zone zone)::time=target_time;
  if appointment is not null then return private.begin_booking_workout_draft(appointment,target_client_user_id); end if;
  perform pg_advisory_xact_lock(hashtextextended(org::text||auth.uid()::text||target_client_user_id::text||target_date::text||target_time::text,0));
  select count(*),(array_agg(w.id order by w.created_at))[1] into existing_count,existing_workout from public.workout_assignments w
    where w.organization_id=org and w.coach_user_id=auth.uid() and w.client_user_id=target_client_user_id
      and w.scheduled_date=target_date and w.scheduled_time=target_time and w.status in ('assigned','in_progress','completed');
  if existing_count>1 then raise exception 'Multiple workouts match this time. Open the client plan'; end if;
  if existing_workout is not null then return jsonb_build_object('workoutId',existing_workout,'reused',true); end if;
  select * into p from public.generated_prescriptions where organization_id=org and coach_user_id=auth.uid()
    and client_user_id=target_client_user_id and status='draft' and generation_context->>'plannedDate'=target_date::text
    and generation_context->>'plannedTime'=target_time::text order by generated_at desc limit 1 for update;
  if p.id is not null then
    if p.engine_version<>'prescription-v0.2' then return jsonb_build_object('prescriptionId',p.id,'reused',true); end if;
    if p.generated_at>now()-interval '5 minutes' then return jsonb_build_object('busy',true); end if;
    update public.generated_prescriptions set status='discarded' where id=p.id;
  end if;
  new_id := public.generate_initial_prescription_v0(target_client_user_id);
  if not exists(select 1 from public.generated_prescriptions where id=new_id and organization_id=org
    and coach_user_id=auth.uid() and client_user_id=target_client_user_id)
  then raise exception 'The active gym changed. Reopen Plan'; end if;
  update public.generated_prescriptions set generation_context=generation_context||jsonb_build_object(
    'plannedDate',target_date,'plannedTime',target_time,'preparationRevision',0) where id=new_id;
  return jsonb_build_object('prescriptionId',new_id,'reused',false);
end $$;

create function private.approve_scheduled_prescription(
  target_prescription_id uuid,expected_revision integer,workout_title text,workout_instructions text,
  workout_scheduled_date date,workout_scheduled_time time,workout_duration_minutes smallint,exercises jsonb
) returns uuid language plpgsql security definer set search_path='' as $$
declare p public.generated_prescriptions%rowtype; workout_id uuid; zone text;
begin
  select * into p from public.generated_prescriptions where id=target_prescription_id;
  if auth.uid() is null or p.id is null or p.coach_user_id<>auth.uid()
    or not private.has_active_role(p.organization_id,array['coach']::public.organization_role[])
    or not private.can_manage_client_domain(p.organization_id,p.client_user_id)
  then raise exception 'Assigned Coach draft required' using errcode='42501'; end if;
  if p.generation_context->>'plannedDate' is null or p.generation_context->>'plannedTime' is null
    or workout_scheduled_date is distinct from (p.generation_context->>'plannedDate')::date
    or workout_scheduled_time is distinct from (p.generation_context->>'plannedTime')::time
  then raise exception 'Reopen the plan to choose its date and time'; end if;
  perform pg_advisory_xact_lock(hashtextextended(p.organization_id::text||p.coach_user_id::text||p.client_user_id::text||workout_scheduled_date::text||workout_scheduled_time::text,0));
  select * into p from public.generated_prescriptions where id=target_prescription_id for update;
  if p.status='assigned' and p.workout_assignment_id is not null then return p.workout_assignment_id; end if;
  select timezone into strict zone from public.organizations where id=p.organization_id;
  if workout_scheduled_date<(now() at time zone zone)::date then raise exception 'Choose a current or future workout date'; end if;
  if exists(select 1 from public.workout_assignments w where w.organization_id=p.organization_id
    and w.coach_user_id=p.coach_user_id and w.client_user_id=p.client_user_id and w.scheduled_date=workout_scheduled_date
    and w.scheduled_time=workout_scheduled_time and w.status in ('assigned','in_progress','completed')
  ) then raise exception 'A workout already exists at this time. Open the client plan'; end if;
  workout_id := private.approve_prepared_prescription(target_prescription_id,expected_revision,workout_title,
    workout_instructions,workout_scheduled_date,workout_duration_minutes,exercises);
  update public.workout_assignments set scheduled_time=workout_scheduled_time where id=workout_id;
  return workout_id;
end $$;

revoke all on function private.begin_planned_workout_draft(uuid,uuid,date,time),private.approve_scheduled_prescription(uuid,integer,text,text,date,time,smallint,jsonb) from public,anon,authenticated;
grant execute on function private.begin_planned_workout_draft(uuid,uuid,date,time),private.approve_scheduled_prescription(uuid,integer,text,text,date,time,smallint,jsonb) to authenticated;
create function public.begin_planned_workout_draft(target_organization_id uuid,target_client_user_id uuid,target_date date,target_time time)
returns jsonb language sql security invoker set search_path='' as $$
  select private.begin_planned_workout_draft(target_organization_id,target_client_user_id,target_date,target_time);
$$;
create function public.approve_scheduled_prescription(target_prescription_id uuid,expected_revision integer,workout_title text,
  workout_instructions text,workout_scheduled_date date,workout_scheduled_time time,workout_duration_minutes smallint,exercises jsonb)
returns uuid language sql security invoker set search_path='' as $$
  select private.approve_scheduled_prescription(target_prescription_id,expected_revision,workout_title,
    workout_instructions,workout_scheduled_date,workout_scheduled_time,workout_duration_minutes,exercises);
$$;
revoke all on function public.begin_planned_workout_draft(uuid,uuid,date,time),public.approve_scheduled_prescription(uuid,integer,text,text,date,time,smallint,jsonb) from public,anon;
grant execute on function public.begin_planned_workout_draft(uuid,uuid,date,time),public.approve_scheduled_prescription(uuid,integer,text,text,date,time,smallint,jsonb) to authenticated;
