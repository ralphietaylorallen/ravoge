alter table public.workout_sets add column performed_library_exercise_id uuid references public.exercise_library(id) on delete restrict,
 add column actual_load_unit text check(actual_load_unit in ('kg','lb')),
 add column pain_reported boolean not null default false;
create index workout_sets_performed_library_idx on public.workout_sets(performed_library_exercise_id);

create function public.record_quality_workout_set(target_workout_id uuid,target_set_id uuid,result text,performance jsonb) returns void
language plpgsql security definer set search_path='' as $$
declare w public.workout_assignments%rowtype; e public.workout_exercises%rowtype; s public.workout_sets%rowtype;
 reps integer; weight numeric; seconds integer; distance numeric; rpe numeric; sub uuid; note text; pain boolean; is_coach boolean;
begin
 if (select auth.uid()) is null then raise exception 'Authentication required'; end if;
 select * into strict w from public.workout_assignments where id=target_workout_id for update;
 is_coach:=private.has_active_role(w.organization_id,array['coach']::public.organization_role[]) and private.can_manage_workout(w.id);
 if not is_coach and not(w.client_user_id=(select auth.uid()) and private.has_active_role(w.organization_id,array['client']::public.organization_role[])) then raise exception 'Workout access denied'; end if;
 if w.status not in ('assigned','in_progress') then raise exception 'Workout is closed'; end if;
 select * into strict s from public.workout_sets where id=target_set_id for update;
 select * into strict e from public.workout_exercises where id=s.workout_exercise_id and workout_assignment_id=w.id;
 if result is null or result not in ('complete','modified','missed') or jsonb_typeof(performance) is distinct from 'object' then raise exception 'Choose a valid result'; end if;
 reps:=(performance->>'reps')::integer; weight:=(performance->>'load')::numeric; seconds:=(performance->>'seconds')::integer;
 distance:=(performance->>'distance')::numeric; rpe:=(performance->>'rpe')::numeric;
 note:=trim(coalesce(performance->>'notes','')); pain:=coalesce((performance->>'pain')::boolean,false); sub:=(performance->>'substitutionId')::uuid;
 if (reps is not null and reps not between 0 and 1000) or (seconds is not null and seconds not between 0 and 7200)
   or (weight is not null and (weight not between 0 and 100000 or weight::text in ('NaN','Infinity','-Infinity')))
   or (distance is not null and (distance not between 0 and 10000 or distance::text in ('NaN','Infinity','-Infinity')))
   or (rpe is not null and (rpe not between 1 and 10 or rpe::text in ('NaN','Infinity','-Infinity')))
   or char_length(note)>1000 or (weight is not null and coalesce(performance->>'loadUnit','') not in ('kg','lb')) then raise exception 'Invalid performance values'; end if;
 if result<>'missed' and (case coalesce(e.prescription_details->>'measurement','reps') when 'time' then seconds is null when 'distance' then distance is null else reps is null end) then raise exception 'Record the actual target measurement'; end if;
 if sub is not null then
   if not coalesce(e.prescription_details->'substitutionIds','[]') @> jsonb_build_array(sub::text)
     or not exists(select 1 from public.client_intakes i where i.organization_id=w.organization_id and i.client_user_id=w.client_user_id
       and i.version=(select max(v.version) from public.client_intakes v where v.organization_id=w.organization_id and v.client_user_id=w.client_user_id)
       and private.generation_exercise_compatible(sub,i.id)) then raise exception 'Only currently compatible Coach-approved substitutions are allowed'; end if;
 end if;
 update public.workout_sets set actual_reps=reps,actual_load=weight,actual_load_unit=performance->>'loadUnit',actual_work_seconds=seconds,
   actual_distance=distance,actual_rpe=rpe,performed_library_exercise_id=sub,pain_reported=pain,client_result=result,
   execution_result=case when result='complete' then 'complete' when result='modified' then 'failed' else 'not_completed' end,
   outcome_status=case when result='complete' then 'completed'::public.set_outcome_status else 'incomplete'::public.set_outcome_status end,
   failure_reason=case when result='complete' then null when pain then 'pain_discomfort'::public.set_failure_reason else 'other'::public.set_failure_reason end,
   failure_notes=nullif(note,''),completed_at=now(),difficulty=null,recorded_by=(select auth.uid()) where id=s.id;
 update public.workout_exercises set completed_at=case when not exists(select 1 from public.workout_sets q where q.workout_exercise_id=e.id and q.completed_at is null) then now() else null end where id=e.id;
 update public.workout_assignments set status='in_progress',execution_started_at=coalesce(execution_started_at,now()) where id=w.id;
end $$;

create function public.manage_quality_workout(target_workout_id uuid,intent text,difficulty integer,feedback text) returns void
language plpgsql security definer set search_path='' as $$
declare w public.workout_assignments%rowtype;
begin
 if (select auth.uid()) is null then raise exception 'Authentication required'; end if;
 select * into strict w from public.workout_assignments where id=target_workout_id for update;
 if not(w.client_user_id=(select auth.uid()) and private.has_active_role(w.organization_id,array['client']::public.organization_role[]))
   and not(private.has_active_role(w.organization_id,array['coach']::public.organization_role[]) and private.can_manage_workout(w.id)) then raise exception 'Workout access denied'; end if;
 if w.status not in ('assigned','in_progress') or intent is null or intent not in ('start','finish') then raise exception 'Workout is closed or action invalid'; end if;
 if intent='finish' then
   if difficulty is null or difficulty not between 1 and 5 or char_length(coalesce(feedback,''))>2000 then raise exception 'Record short difficulty and feedback'; end if;
   if not exists(select 1 from public.workout_exercises where workout_assignment_id=w.id) or exists(select 1 from public.workout_sets s join public.workout_exercises e on e.id=s.workout_exercise_id where e.workout_assignment_id=w.id and s.completed_at is null) then raise exception 'Record every set as complete, modified or missed first'; end if;
 end if;
 update public.workout_assignments set status=case when intent='finish' then 'completed'::public.workout_status else 'in_progress'::public.workout_status end,
   execution_started_at=coalesce(execution_started_at,now()),completed_at=case when intent='finish' then now() else null end,
   client_difficulty=case when intent='finish' then difficulty else client_difficulty end,client_feedback=case when intent='finish' then nullif(trim(feedback),'') else client_feedback end where id=w.id;
end $$;

create table public.training_readiness_checkins (
 id uuid primary key default gen_random_uuid(),organization_id uuid not null references public.organizations(id) on delete cascade,
 client_user_id uuid not null references auth.users(id) on delete cascade,
 workout_assignment_id uuid references public.workout_assignments(id) on delete cascade,
 question_version integer not null default 1 check(question_version=1),
 answers smallint[] not null check(cardinality(answers)=5 and answers <@ array[1,2,3,4,5]::smallint[] and array_position(answers,null) is null),
 pain_note text check(char_length(pain_note)<=1000),
 recommendation text not null check(char_length(recommendation)<=2000),
 coach_decision text not null default 'pending' check(coach_decision in ('pending','accepted','declined','edited')),
 coach_response text check(char_length(coach_response)<=2000), reviewed_by uuid references auth.users(id) on delete restrict,
 reviewed_at timestamptz,created_by uuid not null references auth.users(id) on delete restrict,created_at timestamptz not null default now(),
 foreign key(organization_id,client_user_id) references public.organization_memberships(organization_id,user_id) on delete cascade
);
create index training_readiness_client_idx on public.training_readiness_checkins(organization_id,client_user_id,created_at desc);
create index training_readiness_workout_idx on public.training_readiness_checkins(workout_assignment_id);
create index training_readiness_created_idx on public.training_readiness_checkins(created_by);
create index training_readiness_reviewed_idx on public.training_readiness_checkins(reviewed_by);
alter table public.training_readiness_checkins enable row level security;
revoke all on public.training_readiness_checkins from public,anon,authenticated;
grant select on public.training_readiness_checkins to authenticated;
create policy readiness_authorized_read on public.training_readiness_checkins for select to authenticated using (
 (select private.can_read_client_domain(organization_id,client_user_id)));

create function public.submit_training_readiness(target_client_user_id uuid,target_workout_id uuid,responses smallint[],pain_note text) returns uuid
language plpgsql security definer set search_path='' as $$
declare org uuid; result uuid; problems integer; recommendation text;
begin
 select organization_id into strict org from public.organization_memberships where user_id=target_client_user_id and role='client' and status='active';
 if (select auth.uid()) is null or not(target_client_user_id=(select auth.uid()) and private.has_active_role(org,array['client']::public.organization_role[]))
   and not(private.has_active_role(org,array['coach']::public.organization_role[]) and private.can_manage_client_domain(org,target_client_user_id)) then raise exception 'Client access denied'; end if;
 if responses is null or cardinality(responses)<>5 or not(responses <@ array[1,2,3,4,5]::smallint[]) or array_position(responses,null) is not null or char_length(coalesce(pain_note,''))>1000 then raise exception 'Answer five 1–5 questions'; end if;
 if target_workout_id is not null and not exists(select 1 from public.workout_assignments where id=target_workout_id and organization_id=org and client_user_id=target_client_user_id and status in ('assigned','in_progress')) then raise exception 'Open assigned workout required'; end if;
 select count(*) into problems from public.workout_sets s join public.workout_exercises e on e.id=s.workout_exercise_id
 join (select id from public.workout_assignments where organization_id=org and client_user_id=target_client_user_id order by scheduled_date desc,id desc limit 3) w on w.id=e.workout_assignment_id
 where s.pain_reported or s.client_result in ('modified','missed') or s.execution_result in ('failed','not_completed');
 recommendation:=case when nullif(trim(pain_note),'') is not null then 'Pain reported: discuss with the Client and assess whether training should stop or change. Do not diagnose; refer when appropriate.'
   when 1=any(responses) or 2=any(responses) then 'Low readiness: consider less volume/effort, more recovery or postponing demanding work after Coach discussion.'
   when 3=any(responses) then 'Mixed readiness: check warm-up response and consider a modest effort or volume adjustment.'
   else 'Readiness reported as good. Coach still checks symptoms, technique and the approved plan.' end;
 if problems>=3 then recommendation:=recommendation||' Repeated problematic sets in recent sessions: Coach review is required before progressing.'; end if;
 recommendation:=recommendation||' No approved workout was changed automatically.';
 insert into public.training_readiness_checkins(organization_id,client_user_id,workout_assignment_id,answers,pain_note,recommendation,created_by)
 values(org,target_client_user_id,target_workout_id,responses,nullif(trim(pain_note),''),recommendation,(select auth.uid())) returning id into result;
 return result;
end $$;

create function public.review_training_readiness(target_checkin_id uuid,decision text,response text) returns void
language plpgsql security definer set search_path='' as $$
declare r public.training_readiness_checkins%rowtype;
begin
 select * into strict r from public.training_readiness_checkins where id=target_checkin_id for update;
 if (select auth.uid()) is null or not private.has_active_role(r.organization_id,array['coach']::public.organization_role[])
   or not private.can_manage_client_domain(r.organization_id,r.client_user_id) then raise exception 'Assigned Coach required'; end if;
 if decision is null or decision not in ('accepted','declined','edited') or char_length(trim(coalesce(response,''))) not between 2 and 2000 then raise exception 'Record your decision and intended action'; end if;
 update public.training_readiness_checkins set coach_decision=decision,coach_response=trim(response),reviewed_by=(select auth.uid()),reviewed_at=now() where id=r.id;
 -- Deliberately no UPDATE of a prescription, assignment, target or role here.
end $$;

revoke all on function public.record_quality_workout_set(uuid,uuid,text,jsonb),public.manage_quality_workout(uuid,text,integer,text),public.submit_training_readiness(uuid,uuid,smallint[],text),public.review_training_readiness(uuid,text,text) from public,anon,authenticated;
grant execute on function public.record_quality_workout_set(uuid,uuid,text,jsonb),public.manage_quality_workout(uuid,text,integer,text),public.submit_training_readiness(uuid,uuid,smallint[],text),public.review_training_readiness(uuid,text,text) to authenticated;
