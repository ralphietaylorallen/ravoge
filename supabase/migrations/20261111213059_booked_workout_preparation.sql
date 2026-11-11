-- Appointment preparation reuses generated_prescriptions and workout_assignments.
-- Privileged workers remain in the unexposed private schema; public RPCs are invokers.
create unique index generated_prescriptions_prepared_booking_unique
  on public.generated_prescriptions ((generation_context->>'preparedBookingId'))
  where status in ('draft','assigned') and generation_context ? 'preparedBookingId';

create function private.begin_booking_workout_draft(target_booking_id uuid, target_client_user_id uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare b public.bookings%rowtype; p public.generated_prescriptions%rowtype; new_id uuid; existing_workout uuid; existing_count integer;
begin
 perform pg_advisory_xact_lock(hashtextextended(target_booking_id::text,0));
 select * into b from public.bookings where id=target_booking_id for update;
 if (select auth.uid()) is null or b.id is null or b.coach_user_id<>(select auth.uid()) or b.client_user_id<>target_client_user_id
   or b.status<>'scheduled' or b.session_type='Intake'
   or not private.has_active_role(b.organization_id,array['coach']::public.organization_role[])
   or not private.can_manage_client_domain(b.organization_id,b.client_user_id) then raise exception 'Scheduled session and assigned Coach required'; end if;
 select * into p from public.generated_prescriptions where generation_context->>'preparedBookingId'=b.id::text and status in ('draft','assigned') for update;
 if p.id is not null then
   if p.coach_user_id<>b.coach_user_id or p.client_user_id<>b.client_user_id or p.organization_id<>b.organization_id then raise exception 'Session preparation ownership changed'; end if;
   if p.status='assigned' then return jsonb_build_object('prescriptionId',p.id,'workoutId',p.workout_assignment_id,'reused',true); end if;
   if coalesce((p.generation_context->>'preparationReady')::boolean,false) or p.engine_version<>'prescription-v0.2' then return jsonb_build_object('prescriptionId',p.id,'reused',true); end if;
   if p.generated_at>now()-interval '5 minutes' then return jsonb_build_object('busy',true); end if;
   update public.generated_prescriptions set status='discarded' where id=p.id;
 end if;
 select count(*),(array_agg(id order by created_at))[1] into existing_count,existing_workout from public.workout_assignments
 where organization_id=b.organization_id and coach_user_id=b.coach_user_id and client_user_id=b.client_user_id
   and scheduled_date=(b.starts_at at time zone b.timezone)::date and scheduled_time=(b.starts_at at time zone b.timezone)::time
   and status in ('assigned','in_progress');
 if existing_count>1 then raise exception 'Multiple workouts match this appointment. Review the Client workout plan'; end if;
 if existing_workout is not null then return jsonb_build_object('workoutId',existing_workout,'reused',true); end if;
 new_id:=public.generate_initial_prescription_v0(b.client_user_id);
 update public.generated_prescriptions set generation_context=generation_context||jsonb_build_object('preparedBookingId',b.id,'preparationReady',false,'preparationRevision',0)
 where id=new_id;
 return jsonb_build_object('prescriptionId',new_id,'reused',false);
end $$;

create function private.finish_booking_workout_draft(target_prescription_id uuid)
returns void language plpgsql security definer set search_path='' as $$
declare p public.generated_prescriptions%rowtype;
begin
 select * into p from public.generated_prescriptions where id=target_prescription_id for update;
 if (select auth.uid()) is null or p.id is null or p.coach_user_id<>(select auth.uid()) or p.status<>'draft'
   or p.engine_version='prescription-v0.2' or not p.generation_context ? 'preparedBookingId'
   or not private.has_active_role(p.organization_id,array['coach']::public.organization_role[])
   or not private.can_manage_client_domain(p.organization_id,p.client_user_id) then raise exception 'Completed assigned Coach draft required'; end if;
 update public.generated_prescriptions set generation_context=generation_context||jsonb_build_object('preparationReady',true) where id=p.id;
end $$;

create function private.save_workout_preparation(target_prescription_id uuid, expected_revision integer, coach_draft jsonb)
returns integer language plpgsql security definer set search_path='' as $$
declare p public.generated_prescriptions%rowtype; b public.bookings%rowtype; revision integer; e jsonb;
begin
 select * into p from public.generated_prescriptions where id=target_prescription_id;
 if p.generation_context ? 'preparedBookingId' then perform pg_advisory_xact_lock(hashtextextended(p.generation_context->>'preparedBookingId',0)); end if;
 select * into p from public.generated_prescriptions where id=target_prescription_id for update;
 if (select auth.uid()) is null or p.id is null or p.coach_user_id<>(select auth.uid()) or p.status<>'draft'
   or not private.has_active_role(p.organization_id,array['coach']::public.organization_role[])
   or not private.can_manage_client_domain(p.organization_id,p.client_user_id) then raise exception 'Editable assigned Coach draft required'; end if;
 revision:=coalesce((p.generation_context->>'preparationRevision')::integer,0);
 if expected_revision is distinct from revision then raise exception 'Draft changed on another device. Reopen it before saving'; end if;
 if jsonb_typeof(coach_draft) is distinct from 'object' or octet_length(coach_draft::text)>100000
   or coalesce(length(trim(coach_draft->>'title')),0) not between 2 and 120
   or coalesce(length(coach_draft->>'instructions'),0)>4000
   or coalesce((coach_draft->>'duration')::integer,0) not between 15 and 180
   or coalesce(coach_draft->>'scheduledDate','') !~ '^\d{4}-\d{2}-\d{2}$'
   or jsonb_typeof(coach_draft->'exercises') is distinct from 'array'
   or jsonb_array_length(coach_draft->'exercises') not between 1 and 30 then raise exception 'Review the draft details'; end if;
 perform (coach_draft->>'scheduledDate')::date;
 for e in select value from jsonb_array_elements(coach_draft->'exercises') loop
   if coalesce(e->>'libraryExerciseId','') !~* '^[0-9a-f-]{36}$'
     or coalesce((e->>'sets')::integer,0) not between 1 and 100 or coalesce((e->>'reps')::integer,0) not between 1 and 1000
     or coalesce(length(e->>'name'),0) not between 1 and 200
     or coalesce(length(e->>'notes'),0)>1000 or coalesce(length(e->>'reason'),0)>1000 then raise exception 'Review the draft exercise rows'; end if;
 end loop;
 if p.generation_context ? 'preparedBookingId' then
   select * into b from public.bookings where id=(p.generation_context->>'preparedBookingId')::uuid for share;
   if b.id is null or b.status<>'scheduled' or b.coach_user_id<>p.coach_user_id or b.client_user_id<>p.client_user_id or b.organization_id<>p.organization_id then raise exception 'Scheduled session changed. Reopen the session'; end if;
   coach_draft:=coach_draft||jsonb_build_object('scheduledDate',(b.starts_at at time zone b.timezone)::date);
 end if;
 update public.generated_prescriptions set generation_context=generation_context||jsonb_build_object('coachDraft',coach_draft,'preparationRevision',revision+1,'draftSavedAt',now()) where id=p.id;
 return revision+1;
end $$;

create function private.approve_prepared_prescription(target_prescription_id uuid, expected_revision integer, workout_title text, workout_instructions text, workout_scheduled_date date, workout_duration_minutes smallint, exercises jsonb)
returns uuid language plpgsql security definer set search_path='' as $$
declare p public.generated_prescriptions%rowtype; b public.bookings%rowtype; workout_id uuid;
begin
 select * into p from public.generated_prescriptions where id=target_prescription_id;
 if p.generation_context ? 'preparedBookingId' then perform pg_advisory_xact_lock(hashtextextended(p.generation_context->>'preparedBookingId',0)); end if;
 select * into p from public.generated_prescriptions where id=target_prescription_id for update;
 if (select auth.uid()) is null or p.id is null or p.coach_user_id<>(select auth.uid())
   or not private.has_active_role(p.organization_id,array['coach']::public.organization_role[])
   or not private.can_manage_client_domain(p.organization_id,p.client_user_id) then raise exception 'Assigned Coach draft required'; end if;
 if p.status='assigned' and p.workout_assignment_id is not null then return p.workout_assignment_id; end if;
 if p.status<>'draft' or expected_revision is distinct from coalesce((p.generation_context->>'preparationRevision')::integer,0) then raise exception 'Draft changed. Reopen it before assigning'; end if;
 if p.generation_context ? 'preparedBookingId' then
   select * into b from public.bookings where id=(p.generation_context->>'preparedBookingId')::uuid for update;
   if b.id is null or b.status<>'scheduled' or b.coach_user_id<>p.coach_user_id or b.client_user_id<>p.client_user_id or b.organization_id<>p.organization_id then raise exception 'Scheduled session changed. Reopen the session'; end if;
   workout_scheduled_date:=(b.starts_at at time zone b.timezone)::date;
 end if;
 -- Existing intake, equipment, load, protocol and provenance checks remain authoritative.
 workout_id:=public.approve_pound_prescription(target_prescription_id,workout_title,workout_instructions,workout_scheduled_date,workout_duration_minutes,exercises);
 if b.id is not null then update public.workout_assignments set scheduled_time=(b.starts_at at time zone b.timezone)::time where id=workout_id and organization_id=p.organization_id and coach_user_id=p.coach_user_id; end if;
 return workout_id;
end $$;

revoke all on function private.begin_booking_workout_draft(uuid,uuid), private.finish_booking_workout_draft(uuid), private.save_workout_preparation(uuid,integer,jsonb), private.approve_prepared_prescription(uuid,integer,text,text,date,smallint,jsonb) from public,anon,authenticated;
grant execute on function private.begin_booking_workout_draft(uuid,uuid), private.finish_booking_workout_draft(uuid), private.save_workout_preparation(uuid,integer,jsonb), private.approve_prepared_prescription(uuid,integer,text,text,date,smallint,jsonb) to authenticated;
create function public.begin_booking_workout_draft(target_booking_id uuid,target_client_user_id uuid) returns jsonb language sql security invoker set search_path='' as $$ select private.begin_booking_workout_draft(target_booking_id,target_client_user_id) $$;
create function public.finish_booking_workout_draft(target_prescription_id uuid) returns void language sql security invoker set search_path='' as $$ select private.finish_booking_workout_draft(target_prescription_id) $$;
create function public.save_workout_preparation(target_prescription_id uuid,expected_revision integer,coach_draft jsonb) returns integer language sql security invoker set search_path='' as $$ select private.save_workout_preparation(target_prescription_id,expected_revision,coach_draft) $$;
create function public.approve_prepared_prescription(target_prescription_id uuid,expected_revision integer,workout_title text,workout_instructions text,workout_scheduled_date date,workout_duration_minutes smallint,exercises jsonb) returns uuid language sql security invoker set search_path='' as $$ select private.approve_prepared_prescription(target_prescription_id,expected_revision,workout_title,workout_instructions,workout_scheduled_date,workout_duration_minutes,exercises) $$;
revoke all on function public.begin_booking_workout_draft(uuid,uuid), public.finish_booking_workout_draft(uuid), public.save_workout_preparation(uuid,integer,jsonb), public.approve_prepared_prescription(uuid,integer,text,text,date,smallint,jsonb) from public,anon,authenticated;
grant execute on function public.begin_booking_workout_draft(uuid,uuid), public.finish_booking_workout_draft(uuid), public.save_workout_preparation(uuid,integer,jsonb), public.approve_prepared_prescription(uuid,integer,text,text,date,smallint,jsonb) to authenticated;

-- Guard appointment dates even if an older approval RPC is called directly.
create function private.enforce_prepared_workout_appointment() returns trigger
language plpgsql security definer set search_path='' as $$
declare p public.generated_prescriptions%rowtype; b public.bookings%rowtype;
begin
 if new.source_prescription_id is null then return new; end if;
 select * into p from public.generated_prescriptions where id=new.source_prescription_id;
 if not p.generation_context ? 'preparedBookingId' then return new; end if;
 select * into b from public.bookings where id=(p.generation_context->>'preparedBookingId')::uuid for share;
 if b.id is null or b.status<>'scheduled' or b.coach_user_id<>new.coach_user_id or b.client_user_id<>new.client_user_id or b.organization_id<>new.organization_id then raise exception 'Scheduled session changed. Reopen the session'; end if;
 if exists(select 1 from public.workout_assignments w where w.id<>new.id and w.organization_id=new.organization_id and w.coach_user_id=new.coach_user_id and w.client_user_id=new.client_user_id and w.status in ('assigned','in_progress') and w.scheduled_date=(b.starts_at at time zone b.timezone)::date and w.scheduled_time=(b.starts_at at time zone b.timezone)::time) then raise exception 'This session already has a planned workout'; end if;
 new.scheduled_date:=(b.starts_at at time zone b.timezone)::date;
 new.scheduled_time:=(b.starts_at at time zone b.timezone)::time;
 return new;
end $$;
revoke all on function private.enforce_prepared_workout_appointment() from public,anon,authenticated;
create trigger enforce_prepared_workout_appointment before insert or update of source_prescription_id,scheduled_date,scheduled_time on public.workout_assignments for each row execute function private.enforce_prepared_workout_appointment();

create function private.sync_prepared_workout_appointment() returns trigger
language plpgsql security definer set search_path='' as $$
begin
 if new.status='scheduled' then
   update public.workout_assignments w set scheduled_date=(new.starts_at at time zone new.timezone)::date,scheduled_time=(new.starts_at at time zone new.timezone)::time
   from public.generated_prescriptions p where p.workout_assignment_id=w.id and p.generation_context->>'preparedBookingId'=new.id::text
     and w.organization_id=new.organization_id and w.coach_user_id=new.coach_user_id and w.client_user_id=new.client_user_id and w.status='assigned';
 end if;
 return new;
end $$;
revoke all on function private.sync_prepared_workout_appointment() from public,anon,authenticated;
create trigger sync_prepared_workout_appointment after update of starts_at,timezone on public.bookings for each row when(old.starts_at is distinct from new.starts_at or old.timezone is distinct from new.timezone) execute function private.sync_prepared_workout_appointment();
