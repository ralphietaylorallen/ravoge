-- Additive factual reports; existing completion transactions remain authoritative.
-- Numeric scoring deliberately waits for approved component mappings.
create table public.workout_session_reports (
  workout_assignment_id uuid primary key,
  organization_id uuid not null references public.organizations(id) on delete cascade,
  client_user_id uuid not null,
  workout_date date not null,
  completed_at timestamptz,
  report_version integer not null default 1 check(report_version=1),
  score_version text not null default 'session-execution-v0.1-pending',
  source_snapshot jsonb not null check(jsonb_typeof(source_snapshot)='object'),
  score_snapshot jsonb not null check(jsonb_typeof(score_snapshot)='object'),
  created_at timestamptz not null default now(),
  foreign key(workout_assignment_id,organization_id,client_user_id)
    references public.workout_assignments(id,organization_id,client_user_id) on delete cascade
);
create index session_reports_client_date on public.workout_session_reports(organization_id,client_user_id,workout_date desc);
alter table public.workout_session_reports enable row level security;
create policy session_reports_read on public.workout_session_reports for select to authenticated
using ((select private.can_read_client_domain(organization_id,client_user_id)));
revoke all on public.workout_session_reports from public,anon,authenticated;
grant select on public.workout_session_reports to authenticated;

-- Single versioned server-side score module. Coverage is factual, not a score.
create function private.session_execution_score_v01(facts jsonb) returns jsonb
language plpgsql immutable set search_path='' as $$
declare e jsonb; s jsonb; eligible integer:=0; recorded integer:=0; complete integer:=0;
 modified integer:=0; missed integer:=0; unknown integer:=0; effort integer:=0;
 inputs jsonb:='[]';
begin
 for e in select value from jsonb_array_elements(coalesce(facts->'exercises','[]')) loop
  if e->'prescription_details'->>'block' in ('warmup','preparation','cooldown') then continue; end if;
  for s in select value from jsonb_array_elements(coalesce(e->'workout_sets','[]')) loop
   if e->'prescription_details'->>'block' is null then unknown:=unknown+1; continue; end if;
   eligible:=eligible+1;
   if s->>'completed_at' is not null then recorded:=recorded+1; end if;
   if s->>'completed_at' is not null and coalesce(s->>'client_result',s->>'execution_result') in ('complete','exceeded') then complete:=complete+1;
   elsif s->>'completed_at' is not null and coalesce(s->>'client_result',s->>'execution_result') in ('modified','failed') then modified:=modified+1;
   elsif coalesce(s->>'client_result',s->>'execution_result') in ('missed','not_completed') then missed:=missed+1; end if;
   if s->>'completed_at' is not null and coalesce(s->>'client_result',s->>'execution_result') in ('complete','exceeded','modified','failed') and s->>'actual_rpe' is not null and e->'prescription_details'->>'targetRpe' is not null then effort:=effort+1; end if;
   inputs:=inputs||jsonb_build_array(jsonb_build_object('setId',s->'id','result',coalesce(s->>'client_result',s->>'execution_result'),
     'recordedAt',s->'completed_at','actualRpe',s->'actual_rpe','targetRpe',e->'prescription_details'->'targetRpe'));
  end loop;
 end loop;
 return jsonb_build_object('version','session-execution-v0.1-pending','status','pending','value',null,'maximum',99,
  'reason','Score mappings are awaiting approval. Missing effort or comparable history is never guessed.',
  'components',jsonb_build_object(
   'completion',jsonb_build_object('weight',0.5,'value',null,'eligibleSets',eligible,'recordedSets',recorded,'complete',complete,'modified',modified,'missed',missed,'unclassifiedSets',unknown),
   'effort',jsonb_build_object('weight',0.3,'value',null,'coveredSets',effort,'eligibleSets',eligible),
   'performance',jsonb_build_object('weight',0.2,'value',null,'previousReportIds',coalesce(facts->'previous_report_ids','[]'),'coverage','Comparable-result mapping pending')),
  'sourceInputs',inputs);
end $$;
revoke all on function private.session_execution_score_v01(jsonb) from public,anon,authenticated;

create function private.capture_session_report(target_id uuid) returns void
language plpgsql security definer set search_path='' as $$
declare w public.workout_assignments%rowtype; facts jsonb; previous_ids jsonb;
begin
 select * into strict w from public.workout_assignments where id=target_id;
 if w.status<>'completed' then return; end if;
 if exists(select 1 from public.workout_session_reports where workout_assignment_id=w.id) then return; end if;
 select coalesce(jsonb_agg(q.workout_assignment_id),'[]') into previous_ids from (
  select r.workout_assignment_id from public.workout_session_reports r
  where r.organization_id=w.organization_id and r.client_user_id=w.client_user_id
   and r.workout_assignment_id<>w.id and coalesce(r.completed_at,r.workout_date::timestamp at time zone 'UTC')<coalesce(w.completed_at,w.scheduled_date::timestamp at time zone 'UTC')
  order by r.completed_at desc nulls last,r.workout_date desc,r.workout_assignment_id limit 12
 ) q;
 select jsonb_build_object('workout',to_jsonb(w),'timezone',o.timezone,'gymName',o.name,
  'clientName',coalesce(nullif(c.preferred_name,''),c.full_name),'coachName',p.full_name,'previous_report_ids',previous_ids,
  'exercises',coalesce((select jsonb_agg(to_jsonb(e)||jsonb_build_object(
    'exercise_library',(select jsonb_build_object('id',l.id,'name',l.name,'equipment_requirements',l.equipment_requirements,'measurement',l.measurement,'laterality',l.laterality)
      from public.exercise_library l where l.id=e.library_exercise_id and (l.organization_id is null or l.organization_id=w.organization_id)),
    'workout_sets',coalesce((select jsonb_agg(to_jsonb(s) order by s.set_number,s.id) from public.workout_sets s where s.workout_exercise_id=e.id),'[]')) order by e.sort_order,e.id)
    from public.workout_exercises e where e.workout_assignment_id=w.id),'[]')) into facts
 from public.organizations o join public.profiles c on c.id=w.client_user_id left join public.profiles p on p.id=w.coach_user_id where o.id=w.organization_id;
 insert into public.workout_session_reports(workout_assignment_id,organization_id,client_user_id,workout_date,completed_at,source_snapshot,score_snapshot)
 values(w.id,w.organization_id,w.client_user_id,w.scheduled_date,w.completed_at,facts,private.session_execution_score_v01(facts))
 on conflict(workout_assignment_id) do nothing;
end $$;
revoke all on function private.capture_session_report(uuid) from public,anon,authenticated;

create function private.capture_completed_session() returns trigger language plpgsql security definer set search_path='' as $$
begin
 if new.status='completed' and old.status is distinct from new.status then
  begin perform private.capture_session_report(new.id);
  exception when others then raise log 'Ravoge factual report capture deferred; saved results remain authoritative'; end;
 end if;
 return new;
end $$;
revoke all on function private.capture_completed_session() from public,anon,authenticated;
create trigger capture_completed_session after update of status on public.workout_assignments for each row execute function private.capture_completed_session();

-- Guarded repair for a deferred report, never a second completion path.
create function public.ensure_completed_session_report(target_workout_id uuid) returns void
language plpgsql security definer set search_path='' as $$
declare w public.workout_assignments%rowtype;
begin
 select * into strict w from public.workout_assignments where id=target_workout_id and status='completed';
 if (select auth.uid()) is null or not private.can_read_client_domain(w.organization_id,w.client_user_id) then raise exception 'Report access denied' using errcode='42501'; end if;
 perform private.capture_session_report(w.id);
end $$;
revoke all on function public.ensure_completed_session_report(uuid) from public,anon,authenticated;
grant execute on function public.ensure_completed_session_report(uuid) to authenticated;

-- New report rows only: no changes to any historical workout, set or result.
do $$ declare w record; begin
 for w in select id from public.workout_assignments where status='completed' order by completed_at asc nulls first,scheduled_date,id loop
  perform private.capture_session_report(w.id);
 end loop;
end $$;

-- Extend the existing recovery records; legacy timestamps remain honestly unknown.
alter table public.client_recovery_entries
 add column occurred_at timestamptz,
 add column notes text check(char_length(notes)<=1000),
 add column felt_after text check(char_length(felt_after)<=500),
 add column deleted_at timestamptz;
alter table public.client_recovery_entries drop constraint client_recovery_entries_workout_assignment_id_recovery_type_key;
create index recovery_active_workout_time on public.client_recovery_entries(workout_assignment_id,occurred_at) where deleted_at is null;

-- Keep legacy column-level updates consistent with a known occurrence time too.
create function private.validate_recovery_occurrence() returns trigger language plpgsql security definer set search_path='' as $$
declare zone text;
begin
 select timezone into strict zone from public.organizations where id=new.organization_id;
 if new.occurred_at is not null and (new.log_date is distinct from (new.occurred_at at time zone zone)::date or new.occurred_at>now()+interval '1 minute') then
  raise exception 'Recovery date must match the actual occurrence in the gym timezone' using errcode='23514';
 end if;
 if tg_op='UPDATE' and old.occurred_at is not null and new.occurred_at is null then
  raise exception 'A recorded recovery time cannot be cleared' using errcode='23514';
 end if;
 return new;
end $$;
revoke all on function private.validate_recovery_occurrence() from public,anon,authenticated;
create trigger validate_recovery_occurrence before insert or update of log_date,occurred_at on public.client_recovery_entries for each row execute function private.validate_recovery_occurrence();

-- Compatibility for the previous one-entry-per-type form/RPC. New UI uses explicit IDs.
create or replace function public.save_client_recovery(target_organization_id uuid,target_workout_id uuid,target_date date,recovery text,minutes numeric,temperature numeric,unit text)
returns void language plpgsql security invoker set search_path='' as $$
declare existing_id uuid;
begin
 perform pg_advisory_xact_lock(hashtextextended(target_workout_id::text||recovery,0));
 select id into existing_id from public.client_recovery_entries where workout_assignment_id=target_workout_id and recovery_type=recovery and organization_id=target_organization_id and client_user_id=(select auth.uid()) and deleted_at is null order by updated_at,id limit 1;
 if existing_id is null then
  insert into public.client_recovery_entries(organization_id,client_user_id,workout_assignment_id,log_date,recovery_type,duration_minutes,water_temperature,temperature_unit)
  values(target_organization_id,(select auth.uid()),target_workout_id,target_date,recovery,minutes,temperature,unit);
 else
  update public.client_recovery_entries set log_date=target_date,duration_minutes=minutes,water_temperature=temperature,temperature_unit=unit where id=existing_id;
 end if;
end $$;

create function public.save_client_recovery_entry(target_id uuid,target_workout_id uuid,target_date date,occurred timestamptz,recovery text,minutes numeric,temperature numeric,unit text,entry_notes text,feeling text)
returns uuid language plpgsql security definer set search_path='' as $$
declare w public.workout_assignments%rowtype; zone text; result uuid;
begin
 select * into strict w from public.workout_assignments where id=target_workout_id and status='completed';
 if (select auth.uid()) is null or w.client_user_id<>(select auth.uid()) or not private.has_active_role(w.organization_id,array['client']::public.organization_role[]) then raise exception 'Recovery access denied' using errcode='42501'; end if;
 select timezone into strict zone from public.organizations where id=w.organization_id;
 if target_id is null or (occurred is null and not exists(select 1 from public.client_recovery_entries r where r.id=target_id and r.workout_assignment_id=w.id and r.client_user_id=w.client_user_id and r.organization_id=w.organization_id and r.occurred_at is null and r.deleted_at is null))
  or occurred>now()+interval '1 minute' or (occurred is not null and (occurred at time zone zone)::date is distinct from target_date) or target_date>(now() at time zone zone)::date
  or char_length(coalesce(entry_notes,''))>1000 or char_length(coalesce(feeling,''))>500 then raise exception 'Check the actual recovery date, time and notes'; end if;
 insert into public.client_recovery_entries(id,organization_id,client_user_id,workout_assignment_id,log_date,occurred_at,recovery_type,duration_minutes,water_temperature,temperature_unit,notes,felt_after)
 values(target_id,w.organization_id,w.client_user_id,w.id,target_date,occurred,recovery,minutes,temperature,unit,nullif(trim(entry_notes),''),nullif(trim(feeling),''))
 on conflict(id) do update set log_date=excluded.log_date,occurred_at=excluded.occurred_at,duration_minutes=excluded.duration_minutes,water_temperature=excluded.water_temperature,temperature_unit=excluded.temperature_unit,notes=excluded.notes,felt_after=excluded.felt_after
 where client_recovery_entries.organization_id=w.organization_id and client_recovery_entries.client_user_id=w.client_user_id
  and client_recovery_entries.workout_assignment_id=w.id and client_recovery_entries.recovery_type=excluded.recovery_type and client_recovery_entries.deleted_at is null returning id into result;
 if result is null then raise exception 'Recovery access denied' using errcode='42501'; end if;
 return result;
end $$;
create function public.remove_client_recovery_entry(target_id uuid) returns void language plpgsql security definer set search_path='' as $$
begin
 update public.client_recovery_entries set deleted_at=now() where id=target_id and client_user_id=(select auth.uid())
  and private.has_active_role(organization_id,array['client']::public.organization_role[]) and deleted_at is null;
 if not found then raise exception 'Recovery access denied' using errcode='42501'; end if;
end $$;
revoke all on function public.save_client_recovery_entry(uuid,uuid,date,timestamptz,text,numeric,numeric,text,text,text), public.remove_client_recovery_entry(uuid) from public,anon,authenticated;
grant execute on function public.save_client_recovery_entry(uuid,uuid,date,timestamptz,text,numeric,numeric,text,text,text), public.remove_client_recovery_entry(uuid) to authenticated;

create index session_reports_client_completed on public.workout_session_reports(organization_id,client_user_id,completed_at desc);
create table public.client_progress_report_shares (
 id uuid primary key default gen_random_uuid(),organization_id uuid not null references public.organizations(id) on delete cascade,
 client_user_id uuid not null,period_start date not null,period_end date not null,
 revision integer not null check(revision>0),snapshot_version integer not null default 1 check(snapshot_version=1),
 source_snapshot jsonb not null check(jsonb_typeof(source_snapshot)='object'),
 content_hash text not null,coach_summary text not null check(char_length(coach_summary)<=4000),
 next_priorities text not null check(char_length(next_priorities)<=2000),
 shared_by uuid not null references auth.users(id) on delete restrict,shared_at timestamptz not null default now(),
 foreign key(organization_id,client_user_id) references public.organization_memberships(organization_id,user_id) on delete cascade,
 check(period_end-period_start=41),unique(organization_id,client_user_id,period_end,revision)
);
create index progress_shares_client_date on public.client_progress_report_shares(organization_id,client_user_id,period_end desc);
create index progress_shares_shared_by on public.client_progress_report_shares(shared_by);
alter table public.client_progress_report_shares enable row level security;
create policy progress_shares_read on public.client_progress_report_shares for select to authenticated
using ((select private.can_read_client_domain(organization_id,client_user_id)));
revoke all on public.client_progress_report_shares from public,anon,authenticated;
grant select on public.client_progress_report_shares to authenticated;

create function private.six_week_report_facts(org uuid,client uuid,end_date date) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare zone text; start_date date:=end_date-41; start_time timestamptz; end_time timestamptz; facts jsonb;
begin
 select timezone into strict zone from public.organizations where id=org;
 start_time:=start_date::timestamp at time zone zone;
 end_time:=(end_date+1)::timestamp at time zone zone;
 select jsonb_build_object('version',1,'organizationId',org,'clientId',client,'periodStart',start_date,'periodEnd',end_date,'timezone',zone,
  'gymName',o.name,'clientName',coalesce(nullif(p.preferred_name,''),p.full_name),
  'reports',coalesce((select jsonb_agg(jsonb_build_object('id',r.workout_assignment_id,'source',r.source_snapshot,'score',r.score_snapshot) order by r.completed_at,r.workout_date,r.workout_assignment_id)
   from public.workout_session_reports r where r.organization_id=org and r.client_user_id=client
    and ((r.completed_at>=start_time and r.completed_at<end_time) or (r.completed_at is null and r.workout_date between start_date and end_date))),'[]'),
  'bookings',coalesce((select jsonb_agg(jsonb_build_object('id',b.id,'starts_at',b.starts_at,'ends_at',b.ends_at,'status',b.status,'session_type',b.session_type) order by b.starts_at,b.id)
    from public.bookings b where b.organization_id=org and b.client_user_id=client and b.starts_at>=start_time and b.starts_at<end_time),'[]'),
  'recovery',coalesce((select jsonb_agg(to_jsonb(r) order by r.log_date,r.occurred_at,r.id) from public.client_recovery_entries r
    where r.organization_id=org and r.client_user_id=client and r.deleted_at is null and r.log_date between start_date and end_date),'[]'),
  'measurements',coalesce((select jsonb_agg(jsonb_build_object('measured_at',m.measured_at,'weight_kg',m.weight_kg,'skeletal_muscle_mass_kg',m.skeletal_muscle_mass_kg,'body_fat_percentage',m.body_fat_percentage) order by m.measured_at,m.id)
    from public.client_body_composition_assessments m where m.organization_id=org and m.client_user_id=client and m.measured_at>=start_time and m.measured_at<end_time),'[]'),
  'goals',(select jsonb_build_object('primary_goal',i.primary_goal,'secondary_goal',i.secondary_goal,'recorded_at',i.completed_at)
    from public.client_intakes i where i.organization_id=org and i.client_user_id=client and i.completed_at<end_time order by i.version desc limit 1)) into facts
 from public.organizations o join public.profiles p on p.id=client where o.id=org;
 return facts;
end $$;
revoke all on function private.six_week_report_facts(uuid,uuid,date) from public,anon,authenticated;

create function public.get_six_week_report_context(target_organization_id uuid,target_client_id uuid,end_date date) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare zone text;
begin
 if (select auth.uid()) is null or not private.can_read_client_domain(target_organization_id,target_client_id) then raise exception 'Progress access denied' using errcode='42501'; end if;
 select timezone into strict zone from public.organizations where id=target_organization_id;
 if end_date is null or end_date<date '1900-02-11' or end_date>(now() at time zone zone)::date then raise exception 'Choose a six-week period ending today or earlier'; end if;
 return private.six_week_report_facts(target_organization_id,target_client_id,end_date);
end $$;
create function public.share_six_week_report(target_organization_id uuid,target_client_id uuid,end_date date,summary text,priorities text,previous_share_id uuid default null) returns uuid
language plpgsql security definer set search_path='' as $$
declare facts jsonb; fingerprint text; previous public.client_progress_report_shares%rowtype; saved uuid;
begin
 if (select auth.uid()) is null or not private.has_active_role(target_organization_id,array['owner','coach']::public.organization_role[])
  or not private.can_read_client_domain(target_organization_id,target_client_id)
  or not exists(select 1 from public.organization_memberships m where m.organization_id=target_organization_id and m.user_id=target_client_id and m.role='client' and m.status='active') then raise exception 'Sharing access denied' using errcode='42501'; end if;
 if summary is null or priorities is null or char_length(summary)>4000 or char_length(priorities)>2000 then raise exception 'Review the Coach summary and priorities'; end if;
 -- Serialize publication for this exact gym, Client and period. No shared row is updated.
 perform pg_advisory_xact_lock(hashtextextended(target_organization_id::text||target_client_id::text||end_date::text,0));
 facts:=public.get_six_week_report_context(target_organization_id,target_client_id,end_date);
 fingerprint:=encode(extensions.digest((facts||jsonb_build_object('coachSummary',trim(summary),'nextPriorities',trim(priorities)))::text,'sha256'),'hex');
 select * into previous from public.client_progress_report_shares where organization_id=target_organization_id and client_user_id=target_client_id and period_end=end_date order by revision desc limit 1 for update;
 if previous.id is not null and previous.content_hash=fingerprint then return previous.id; end if;
 if previous.id is distinct from previous_share_id then raise exception 'A shared report already exists or changed. Refresh and explicitly publish a new revision.'; end if;
 insert into public.client_progress_report_shares(organization_id,client_user_id,period_start,period_end,revision,source_snapshot,content_hash,coach_summary,next_priorities,shared_by)
 values(target_organization_id,target_client_id,end_date-41,end_date,coalesce(previous.revision,0)+1,facts,fingerprint,trim(summary),trim(priorities),(select auth.uid())) returning id into saved;
 return saved;
end $$;
revoke all on function public.get_six_week_report_context(uuid,uuid,date),public.share_six_week_report(uuid,uuid,date,text,text,uuid) from public,anon,authenticated;
grant execute on function public.get_six_week_report_context(uuid,uuid,date),public.share_six_week_report(uuid,uuid,date,text,text,uuid) to authenticated;

create function public.get_session_report_week(target_workout_id uuid) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare r public.workout_session_reports%rowtype; zone text; day date; week_start date; week_end date;
begin
 select * into strict r from public.workout_session_reports where workout_assignment_id=target_workout_id;
 if (select auth.uid()) is null or not private.can_read_client_domain(r.organization_id,r.client_user_id) then raise exception 'Report access denied' using errcode='42501'; end if;
 zone:=r.source_snapshot->>'timezone';day:=coalesce((r.completed_at at time zone zone)::date,r.workout_date);
 week_start:=day-((extract(isodow from day)::integer)-1);week_end:=week_start+6;
 return jsonb_build_object('start',week_start,'end',week_end,
  'bookings',coalesce((select jsonb_agg(jsonb_build_object('id',b.id,'starts_at',b.starts_at,'ends_at',b.ends_at,'status',b.status,'session_type',b.session_type) order by b.starts_at,b.id)
   from public.bookings b where b.organization_id=r.organization_id and b.client_user_id=r.client_user_id
    and b.starts_at>=(week_start::timestamp at time zone zone) and b.starts_at<((week_end+1)::timestamp at time zone zone)),'[]'),
  'completed',coalesce((select jsonb_agg(jsonb_build_object('id',s.workout_assignment_id,'date',coalesce((s.completed_at at time zone zone)::date,s.workout_date)) order by s.workout_date,s.workout_assignment_id)
   from public.workout_session_reports s where s.organization_id=r.organization_id and s.client_user_id=r.client_user_id
    and coalesce((s.completed_at at time zone zone)::date,s.workout_date) between week_start and week_end),'[]'));
end $$;
revoke all on function public.get_session_report_week(uuid) from public,anon,authenticated;
grant execute on function public.get_session_report_week(uuid) to authenticated;

-- New draft context only. This never changes saved or assigned programming.
create function public.get_recent_session_report_context(target_prescription_id uuid) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare g public.generated_prescriptions%rowtype;
begin
 select * into strict g from public.generated_prescriptions where id=target_prescription_id;
 if (select auth.uid()) is null or g.coach_user_id<>(select auth.uid()) or not private.has_active_role(g.organization_id,array['coach']::public.organization_role[])
  or not private.can_read_client_domain(g.organization_id,g.client_user_id) then raise exception 'Generation context access denied' using errcode='42501'; end if;
 return jsonb_build_object('version',1,
 'sessions',coalesce((select jsonb_agg(q.context order by q.completed_at desc) from (select w.completed_at,jsonb_build_object(
   'hoursAgo',round(extract(epoch from(now()-w.completed_at))/3600,1),'reportedFeedback',w.client_feedback,
   'painFlags',(select count(*) from public.workout_sets s join public.workout_exercises e on e.id=s.workout_exercise_id where e.workout_assignment_id=w.id and s.pain_reported),
   'adjustedSets',(select count(*) from public.workout_sets s join public.workout_exercises e on e.id=s.workout_exercise_id where e.workout_assignment_id=w.id and coalesce(s.client_result,s.execution_result) in ('modified','failed')),
   'missedSets',(select count(*) from public.workout_sets s join public.workout_exercises e on e.id=s.workout_exercise_id where e.workout_assignment_id=w.id and coalesce(s.client_result,s.execution_result) in ('missed','not_completed')),
   'averageRpe',(select round(avg(s.actual_rpe),1) from public.workout_sets s join public.workout_exercises e on e.id=s.workout_exercise_id where e.workout_assignment_id=w.id)) context
   from public.workout_assignments w where w.organization_id=g.organization_id and w.client_user_id=g.client_user_id and w.status='completed' and w.completed_at>=now()-interval '28 days' and w.completed_at<=now() order by w.completed_at desc,w.id limit 8) q),'[]'),
 'recovery',coalesce((select jsonb_agg(q.context order by q.log_date desc,q.occurred_at desc nulls last) from (select r.log_date,r.occurred_at,jsonb_build_object(
   'type',r.recovery_type,'minutes',r.duration_minutes,'hoursAgo',case when r.occurred_at is not null then round(extract(epoch from(now()-r.occurred_at))/3600,1) else null end,
   'occurrenceTimeKnown',r.occurred_at is not null,'reportedFeeling',r.felt_after,'reportedNotes',r.notes) context
   from public.client_recovery_entries r where r.organization_id=g.organization_id and r.client_user_id=g.client_user_id and r.deleted_at is null
    and r.log_date>=(now() at time zone (select timezone from public.organizations where id=g.organization_id))::date-28
    and (r.occurred_at is null or r.occurred_at<=now()) order by r.log_date desc,r.occurred_at desc nulls last,r.id limit 20) q),'[]'));
end $$;
revoke all on function public.get_recent_session_report_context(uuid) from public,anon,authenticated;
grant execute on function public.get_recent_session_report_context(uuid) to authenticated;
