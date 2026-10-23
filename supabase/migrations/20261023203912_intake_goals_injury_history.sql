-- Additive, preview-only intake extension. No account/import/assignment backfill.
alter table public.client_intakes drop constraint if exists client_intakes_primary_goal_check;
alter table public.client_intakes add constraint client_intakes_primary_goal_check
 check(primary_goal in ('strength','muscle_gain','general_fitness','conditioning','fat_loss','athletic_performance','body_recomposition','mobility'));
alter table public.client_intakes alter column training_years drop not null;

create table public.client_injury_spots (
 id uuid primary key, organization_id uuid not null references public.organizations(id),
 client_user_id uuid not null references auth.users(id), details jsonb not null check(jsonb_typeof(details)='object'),
 revision integer not null default 1 check(revision>0), recorded_by uuid not null references auth.users(id),
 created_at timestamptz not null default now(), updated_at timestamptz not null default now(), removed_at timestamptz,
 unique(id,organization_id,client_user_id),
 foreign key(organization_id,client_user_id) references public.organization_memberships(organization_id,user_id)
);
create index injury_spots_client_idx on public.client_injury_spots(organization_id,client_user_id);
create index injury_spots_actor_idx on public.client_injury_spots(recorded_by);
create table public.client_injury_spot_history (
 spot_id uuid not null, organization_id uuid not null, client_user_id uuid not null, revision integer not null,
 details jsonb not null, removed boolean not null, recorded_by uuid not null references auth.users(id), recorded_at timestamptz not null default now(),
 primary key(spot_id,revision),
 foreign key(spot_id,organization_id,client_user_id) references public.client_injury_spots(id,organization_id,client_user_id)
);
create index injury_history_client_idx on public.client_injury_spot_history(organization_id,client_user_id);
create index injury_history_actor_idx on public.client_injury_spot_history(recorded_by);
alter table public.client_injury_spots enable row level security;
alter table public.client_injury_spot_history enable row level security;
revoke all on public.client_injury_spots,public.client_injury_spot_history from public,anon,authenticated;
grant select on public.client_injury_spots,public.client_injury_spot_history to authenticated;
create policy injury_spots_read on public.client_injury_spots for select to authenticated
 using((select private.can_read_client_domain(organization_id,client_user_id)));
create policy injury_history_read on public.client_injury_spot_history for select to authenticated
 using((select private.can_read_client_domain(organization_id,client_user_id)));

create function private.injury_digest(org uuid,client uuid) returns text language sql stable security definer set search_path='' as $$
 select md5(coalesce(string_agg(id::text||revision::text,',' order by id),'')) from public.client_injury_spots where organization_id=org and client_user_id=client
$$;
revoke all on function private.injury_digest(uuid,uuid) from public,anon,authenticated;
alter table public.intake_generation_safety_reviews add column injury_digest text;

create function public.save_client_injury_spot(target_client_user_id uuid,spot_payload jsonb,remove_spot boolean default false) returns uuid
language plpgsql security definer set search_path='' as $$
declare org uuid; sid uuid; existing public.client_injury_spots%rowtype; k text; n integer;
begin
 if (select auth.uid()) is null or jsonb_typeof(spot_payload) is distinct from 'object' or remove_spot is null then raise exception 'Authenticated structured spot required'; end if;
 select m.organization_id into strict org from public.organization_memberships m
 where m.user_id=target_client_user_id and m.role='client' and m.status='active'
 and private.can_manage_client_domain(m.organization_id,target_client_user_id);
 perform pg_advisory_xact_lock(hashtextextended(org::text||target_client_user_id::text,0));
 sid:=(spot_payload->>'id')::uuid;
 if sid is null then raise exception 'Spot identity required'; end if;
 select * into existing from public.client_injury_spots where id=sid for update;
 if found and (existing.organization_id<>org or existing.client_user_id<>target_client_user_id) then raise exception 'Spot outside assigned Client'; end if;
 if not remove_spot then
  if coalesce(spot_payload->>'region','') not in ('head','neck','shoulder','upper_arm','elbow','forearm','wrist','hand','chest','upper_back','lower_back','abdomen','hip','thigh','knee','calf','ankle','foot')
   or coalesce(spot_payload->>'side','') not in ('left','right','midline') or coalesce(spot_payload->>'view','') not in ('front','back')
   or coalesce(spot_payload->>'clinicianInstructions','') not in ('yes','no','unsure')
   or jsonb_typeof(spot_payload->'categories') is distinct from 'array' or jsonb_typeof(spot_payload->'occurrence') is distinct from 'array'
   or jsonb_array_length(spot_payload->'categories') not between 1 and 4 or jsonb_array_length(spot_payload->'occurrence')>3
   or jsonb_array_length(spot_payload->'categories')<>(select count(distinct v) from jsonb_array_elements_text(spot_payload->'categories') v)
   or exists(select 1 from jsonb_array_elements_text(spot_payload->'categories') c where c not in ('recent_injury','long_term','surgery','unexplained_pain'))
   or exists(select 1 from jsonb_array_elements_text(spot_payload->'occurrence') c where c not in ('rest','movement','after_activity'))
   or (spot_payload->'pain'<>'null'::jsonb and (jsonb_typeof(spot_payload->'pain')<>'number' or (spot_payload->>'pain')::numeric not between 0 and 10 or (spot_payload->>'pain')::numeric<>trunc((spot_payload->>'pain')::numeric)))
   or not(spot_payload?'pain') then raise exception 'Invalid spot values'; end if;
  foreach k in array array['onset','sensation','triggers','limitations','clinicianDetails','notes','surgeryRepair','surgeryWhen','postoperativeRestrictions'] loop
   if jsonb_typeof(spot_payload->k) is distinct from 'string' or char_length(spot_payload->>k)>2000 then raise exception 'Invalid spot details'; end if;
  end loop;
  if (select count(*) from jsonb_object_keys(spot_payload))<>17 then raise exception 'Unexpected spot fields'; end if;
  if existing.id is null and (select count(*) from public.client_injury_spots where organization_id=org and client_user_id=target_client_user_id and removed_at is null)>=50 then raise exception 'Review existing spots before adding more'; end if;
  insert into public.client_injury_spots(id,organization_id,client_user_id,details,recorded_by)
   values(sid,org,target_client_user_id,spot_payload,(select auth.uid()))
   on conflict(id) do update set details=excluded.details,revision=public.client_injury_spots.revision+1,recorded_by=excluded.recorded_by,updated_at=now(),removed_at=null;
 else
  if existing.id is null or existing.removed_at is not null then raise exception 'Active spot required'; end if;
  update public.client_injury_spots set removed_at=now(),updated_at=now(),revision=revision+1,recorded_by=(select auth.uid()) where id=sid;
 end if;
 insert into public.client_injury_spot_history(spot_id,organization_id,client_user_id,revision,details,removed,recorded_by)
 select id,organization_id,client_user_id,revision,details,removed_at is not null,recorded_by from public.client_injury_spots where id=sid;
 update public.generated_prescriptions set generation_context=generation_context||jsonb_build_object('intakeReviewRequired',true)
 where organization_id=org and client_user_id=target_client_user_id and status='draft';
 return sid;
end $$;
revoke all on function public.save_client_injury_spot(uuid,jsonb,boolean) from public,anon,authenticated;
grant execute on function public.save_client_injury_spot(uuid,jsonb,boolean) to authenticated;

alter function public.confirm_intake_generation_safety(uuid) rename to confirm_intake_safety_before_spots;
revoke all on function public.confirm_intake_safety_before_spots(uuid) from public,anon,authenticated;
create function public.confirm_intake_generation_safety(target_intake_id uuid) returns void language plpgsql security definer set search_path='' as $$
declare i public.client_intakes%rowtype;
begin
 select * into strict i from public.client_intakes where id=target_intake_id;
 perform pg_advisory_xact_lock(hashtextextended(i.organization_id::text||i.client_user_id::text,0));
 perform public.confirm_intake_safety_before_spots(target_intake_id);
 update public.intake_generation_safety_reviews set injury_digest=private.injury_digest(i.organization_id,i.client_user_id) where intake_id=i.id;
end $$;
revoke all on function public.confirm_intake_generation_safety(uuid) from public,anon,authenticated;
grant execute on function public.confirm_intake_generation_safety(uuid) to authenticated;

alter function public.save_client_intake_v1(uuid,jsonb,jsonb,jsonb) rename to save_client_intake_before_spots;
revoke all on function public.save_client_intake_before_spots(uuid,jsonb,jsonb,jsonb) from public,anon,authenticated;
create function public.save_client_intake_v1(target_client_user_id uuid,intake_payload jsonb,baseline_payload jsonb,inbody_payload jsonb) returns uuid
language plpgsql security definer set search_path='' as $$
declare result uuid; org uuid; ctx jsonb; open_days integer; n numeric; k text;
begin
 ctx:=intake_payload->'customFields'->'intakeContext';
 if ctx is not null then
  if ctx->>'version'<>'2' or intake_payload->>'primaryGoal' not in ('fat_loss','muscle_gain','mobility') or coalesce(intake_payload->>'secondaryGoal','')<>''
   or jsonb_typeof(ctx->'age') is distinct from 'number' or (ctx->>'age')::numeric not between 18 and 110
   or jsonb_typeof(ctx->'recentWorkoutDays') is distinct from 'number' or (ctx->>'recentWorkoutDays')::numeric not between 0 and 7 then raise exception 'One goal and complete structured context required'; end if;
  foreach k in array array['currentWeightLb','sleepHours'] loop
   if ctx->k is not null and ctx->k<>'null'::jsonb and (jsonb_typeof(ctx->k)<>'number' or (ctx->>k)::numeric<0) then raise exception 'Invalid optional measurements'; end if;
  end loop;
  -- Strip incompatible active targets, never rewrite historical versions.
  intake_payload:=jsonb_set(intake_payload,'{customFields,bodyCompositionGoals}',coalesce(intake_payload->'customFields'->'bodyCompositionGoals','{}')-
    case intake_payload->>'primaryGoal' when 'fat_loss' then array['skeletalMuscleMassKg'] when 'muscle_gain' then array['weightKg','bodyFatPercentage'] else array['weightKg','bodyFatPercentage','skeletalMuscleMassKg'] end);
 end if;
 result:=public.save_client_intake_before_spots(target_client_user_id,intake_payload,baseline_payload,inbody_payload);
 select organization_id into strict org from public.client_intakes where id=result;
 if ctx is not null then
  if ctx->>'noInjuryReport'='true' and exists(select 1 from public.client_injury_spots where organization_id=org and client_user_id=target_client_user_id and removed_at is null) then raise exception 'Saved injury history must be reviewed, not erased by no pain'; end if;
  select count(*) filter(where not is_closed) into open_days from public.organization_hours where organization_id=org;
  if exists(select 1 from public.organization_hours where organization_id=org) and (intake_payload->>'trainingFrequencyGoal')::integer>open_days then raise exception 'Training days exceed current gym availability'; end if;
 end if;
 update public.generated_prescriptions set generation_context=generation_context||jsonb_build_object('intakeReviewRequired',true)
 where organization_id=org and client_user_id=target_client_user_id and status='draft';
 return result;
end $$;
revoke all on function public.save_client_intake_v1(uuid,jsonb,jsonb,jsonb) from public,anon,authenticated;
grant execute on function public.save_client_intake_v1(uuid,jsonb,jsonb,jsonb) to authenticated;

-- Add canonical source segment references without sending raw source prose.
alter function private.workout_knowledge_catalog(uuid,uuid) rename to workout_catalog_before_segments;
revoke all on function private.workout_catalog_before_segments(uuid,uuid) from public,anon,authenticated;
create function private.workout_knowledge_catalog(org uuid,intake uuid) returns jsonb language sql stable security definer set search_path='' as $$
 select coalesce(jsonb_agg(r||jsonb_build_object('segments',case when r->>'sourceKind'='raw_reference' then
  (select coalesce(jsonb_agg(jsonb_build_object('key','cell_'||c.n,'exerciseIds',
   (select coalesce(jsonb_agg(e.id),'[]') from public.exercise_library e where (r->'rawStyle'->'exerciseIds')?e.id::text
    and position(private.reference_words(e.name) in private.reference_words(coalesce(c.cell->>'display',c.cell->>'raw','')))>0))),'[]')
   from public.training_library_items t cross join lateral jsonb_array_elements(t.normalized_content->'cells') with ordinality c(cell,n) where t.id=(r->>'itemId')::uuid and t.organization_id=org)
  else (select coalesce(jsonb_agg(jsonb_build_object('key','row_'||e.n,'exerciseIds',jsonb_build_array(e.x->>'libraryExerciseId'))),'[]') from jsonb_array_elements(r->'exercises') with ordinality e(x,n)) end)),'[]')
 from jsonb_array_elements(private.workout_catalog_before_segments(org,intake)) r
$$;
revoke all on function private.workout_knowledge_catalog(uuid,uuid) from public,anon,authenticated;

alter function public.get_pound_generation_input(uuid) rename to get_pound_input_before_spots;
revoke all on function public.get_pound_input_before_spots(uuid) from public,anon,authenticated;
create function public.get_pound_generation_input(target_prescription_id uuid) returns jsonb language plpgsql stable security definer set search_path='' as $$
declare input jsonb; p public.generated_prescriptions%rowtype; i public.client_intakes%rowtype; spots jsonb; digest text; baseline jsonb;
begin
 input:=public.get_pound_input_before_spots(target_prescription_id);
 select * into strict p from public.generated_prescriptions where id=target_prescription_id;
 select * into strict i from public.client_intakes where id=p.intake_id;
 digest:=private.injury_digest(p.organization_id,p.client_user_id);
 if (i.custom_fields->'intakeContext' is not null or exists(select 1 from public.client_injury_spots where organization_id=p.organization_id and client_user_id=p.client_user_id))
  and not exists(select 1 from public.intake_generation_safety_reviews where intake_id=i.id and injury_digest=digest) then raise exception 'Review updated injury history before generation'; end if;
 select coalesce(jsonb_agg(details order by id),'[]') into spots from public.client_injury_spots where organization_id=p.organization_id and client_user_id=p.client_user_id and removed_at is null;
 select to_jsonb(b)-array['intake_id','organization_id','client_user_id','recorded_by','created_at','updated_at'] into baseline from public.client_intake_baselines b where intake_id=i.id;
 input:=(input-'snapshot')||jsonb_build_object('injurySpots',spots,'injuryDigest',digest,
  'intakeAssessment',jsonb_build_object('movementObservations',jsonb_build_object('limitations',i.movement_limitations,'injuries',i.current_injuries,'clinicianNotes',i.medical_coach_notes,'coachNotes',i.coach_notes,'painAreas',i.pain_areas,'movementsToAvoid',i.movements_to_avoid),
   'strengthAssessments',baseline,'recovery',jsonb_build_object('sleepQuality',i.sleep_quality,'stress',i.stress_level,'recovery',i.recovery_perception,'sorenessFatigue',i.soreness_fatigue),
   'preferences',i.preferred_exercises,'dislikes',i.avoided_exercises))
  ||case when i.custom_fields->'intakeContext' is not null then jsonb_build_object('intakeContext',i.custom_fields->'intakeContext','secondaryGoal',null) else '{}'::jsonb end;
 input:=jsonb_set(input,'{candidates}',coalesce((select jsonb_agg(c||jsonb_build_object('loadRuleSupported',exists(select 1 from public.exercise_load_rules r where r.exercise_id=(c->>'id')::uuid and r.active and (r.organization_id is null or r.organization_id=p.organization_id)))) from jsonb_array_elements(input->'candidates') c),'[]'));
 return input||jsonb_build_object('snapshot',md5(input::text));
end $$;
revoke all on function public.get_pound_generation_input(uuid) from public,anon,authenticated;
grant execute on function public.get_pound_generation_input(uuid) to authenticated;

-- Preserve older assigned/in-progress workouts; only new approvals are blocked.
alter function public.approve_pound_prescription(uuid,text,text,date,smallint,jsonb) rename to approve_pound_before_spots;
revoke all on function public.approve_pound_before_spots(uuid,text,text,date,smallint,jsonb) from public,anon,authenticated;
create function public.approve_pound_prescription(target_prescription_id uuid,workout_title text,workout_instructions text,workout_scheduled_date date,workout_duration_minutes smallint,exercises jsonb) returns uuid
language plpgsql security definer set search_path='' as $$
declare p public.generated_prescriptions%rowtype; x jsonb; c jsonb; input jsonb; gym integer:=0; total integer:=0; result uuid;
begin
 select * into strict p from public.generated_prescriptions where id=target_prescription_id;
 perform pg_advisory_xact_lock(hashtextextended(p.organization_id::text||p.client_user_id::text,0));
 if p.generation_context->>'intakeReviewRequired'='true' then raise exception 'Intake changed; create a fresh reviewed draft before assignment'; end if;
 if p.generation_context->'provenanceAudit' is not null then
  input:=public.get_pound_generation_input(target_prescription_id);
  for x in select value from jsonb_array_elements(exercises) loop
   select r into c from jsonb_array_elements(p.generation_context->'provenanceAudit'->'rows') r where r->>'exerciseId'=x->>'libraryExerciseId' limit 1;
   if c is null then raise exception 'New exercise requires a freshly generated source/evidence review; use the manual builder for independent programming'; end if;
   if x->'protocol'->>'block' not in ('warmup','cooldown') then
    total:=total+(x->>'sets')::integer;
    if c->>'referenceId' is not null and exists(select 1 from jsonb_array_elements(input->'knowledgeCatalog') r cross join lateral jsonb_array_elements(r->'segments') s
      where r->>'id'=c->>'referenceId' and s->>'key'=c->>'segmentKey' and (s->'exerciseIds')?(x->>'libraryExerciseId')) then gym:=gym+(x->>'sets')::integer; end if;
   end if;
  end loop;
  if total=0 or gym*10<total*9 then raise exception 'Edited workout exceeds the 10 percent substitution limit'; end if;
 end if;
 result:=public.approve_pound_before_spots(target_prescription_id,workout_title,workout_instructions,workout_scheduled_date,workout_duration_minutes,exercises);
 if total>0 then update public.generated_prescriptions set generation_context=generation_context||jsonb_build_object('assignedProvenanceRatio',jsonb_build_object('gymBouts',gym,'totalBouts',total,'gymPercentage',round(gym::numeric/total*100,1))) where id=p.id; end if;
 return result;
end $$;
revoke all on function public.approve_pound_prescription(uuid,text,text,date,smallint,jsonb) from public,anon,authenticated;
grant execute on function public.approve_pound_prescription(uuid,text,text,date,smallint,jsonb) to authenticated;

-- The same existing readiness UI exposes stale spot review; no hidden bypass.
alter function private.workout_generation_context(uuid,uuid) rename to workout_context_before_spots;
revoke all on function private.workout_context_before_spots(uuid,uuid) from public,anon,authenticated;
create function private.workout_generation_context(org uuid,client_id uuid) returns jsonb language plpgsql stable security definer set search_path='' as $$
declare ctx jsonb; i public.client_intakes%rowtype;
begin
 ctx:=private.workout_context_before_spots(org,client_id);
 select * into i from public.client_intakes where organization_id=org and client_user_id=client_id order by version desc limit 1;
 if found and (i.custom_fields->'intakeContext' is not null or exists(select 1 from public.client_injury_spots where organization_id=org and client_user_id=client_id))
  and not exists(select 1 from public.intake_generation_safety_reviews where intake_id=i.id and injury_digest=private.injury_digest(org,client_id)) then
   ctx:=ctx||jsonb_build_object('ready',false,'needsSafetyReview',true,'reasons',coalesce(ctx->'reasons','[]')||jsonb_build_array('Review every updated body-map spot and reflect restrictions in movement exclusions before creating a workout.'));
 end if;
 return ctx;
end $$;
revoke all on function private.workout_generation_context(uuid,uuid) from public,anon,authenticated;

alter function public.complete_pound_prescription(uuid,text,jsonb,jsonb) rename to complete_pound_before_spots;
revoke all on function public.complete_pound_before_spots(uuid,text,jsonb,jsonb) from public,anon,authenticated;
create function public.complete_pound_prescription(target_prescription_id uuid,expected_snapshot text,proposed_workout jsonb,generation_details jsonb) returns void
language plpgsql security definer set search_path='' as $$
declare input jsonb; p public.generated_prescriptions%rowtype; row jsonb; claim jsonb; ref jsonb; source jsonb; audit jsonb; evidence jsonb;
 total_bouts integer:=0; gym_bouts integer:=0; n integer:=0; sources jsonb; snapshot jsonb;
begin
 input:=public.get_pound_generation_input(target_prescription_id);
 select * into strict p from public.generated_prescriptions where id=target_prescription_id for update;
 perform pg_advisory_xact_lock(hashtextextended(p.organization_id::text||p.client_user_id::text,0));
 if input->'intakeContext'->>'version'='2' then
  if proposed_workout is null or generation_details->>'model' is null or generation_details->>'method'='deterministic_reference_fallback' then raise exception 'Verified OpenAI draft required'; end if;
  audit:=generation_details->'provenanceAudit'; evidence:=generation_details->'evidence'; sources:=evidence->'sources';
  if audit->>'version' is distinct from '1' or jsonb_typeof(audit->'rows') is distinct from 'array'
    or jsonb_array_length(audit->'rows')<>jsonb_array_length(proposed_workout->'exercises')
    or evidence->>'version' is distinct from 'retrieved-v1' or jsonb_typeof(sources) is distinct from 'array' or jsonb_array_length(sources) not between 1 and 8 then raise exception 'Verified provenance and evidence required'; end if;
  for source in select value from jsonb_array_elements(sources) loop
   if coalesce(source->>'url','')!~'^https://([a-z0-9-]+\.)*(acsm\.org|nsca\.com|orthoinfo\.aaos\.org|pubmed\.ncbi\.nlm\.nih\.gov|pmc\.ncbi\.nlm\.nih\.gov|nice\.org\.uk|health\.gov)/'
     or char_length(coalesce(source->>'title','')) not between 1 and 1000 or (source->>'retrievedAt')::timestamptz>now()+interval '5 minutes'
     or jsonb_typeof(source->'recommendations') is distinct from 'array' or jsonb_typeof(source->'limitations') is distinct from 'array'
     or char_length(coalesce(source->>'applicability',''))<10 then raise exception 'Invalid evidence source'; end if;
  end loop;
  for row in select value from jsonb_array_elements(proposed_workout->'exercises') loop
   claim:=audit->'rows'->n; n:=n+1; ref:=null;
   if claim->>'exerciseId' is distinct from row->>'libraryExerciseId' or char_length(coalesce(claim->>'adaptation','')) not between 5 and 500
    or jsonb_typeof(claim->'evidenceIds') is distinct from 'array' or exists(select 1 from jsonb_array_elements_text(claim->'evidenceIds') id where not exists(select 1 from jsonb_array_elements(sources) s where s->>'id'=id)) then raise exception 'Invalid source audit'; end if;
   if claim->>'referenceId' is not null then
    select r into ref from jsonb_array_elements(input->'knowledgeCatalog') r where r->>'id'=claim->>'referenceId';
    if ref is null or not exists(select 1 from jsonb_array_elements(ref->'segments') s where s->>'key'=claim->>'segmentKey' and (s->'exerciseIds')?(row->>'libraryExerciseId')) then raise exception 'Exercise outside credited source segment'; end if;
   elsif claim->>'segmentKey' is not null or char_length(trim(coalesce(claim->>'substitutionReason','')))<10 or jsonb_array_length(claim->'evidenceIds')=0
    or not exists(select 1 from public.exercise_load_rules r where r.exercise_id=(row->>'libraryExerciseId')::uuid and r.active and (r.organization_id is null or r.organization_id=p.organization_id)) then raise exception 'Substitution requires evidence, load rules and specific reason'; end if;
   if row->'protocol'->>'block' not in ('warmup','cooldown') then
    total_bouts:=total_bouts+(row->>'sets')::integer;
    if ref is not null then gym_bouts:=gym_bouts+(row->>'sets')::integer; end if;
   end if;
  end loop;
  if total_bouts=0 or gym_bouts*10<total_bouts*9 then raise exception 'Gym library gap: at least 90 percent of main work must derive from compatible gym references'; end if;
  audit:=audit||jsonb_build_object('gymBouts',gym_bouts,'totalBouts',total_bouts,'gymPercentage',round(gym_bouts::numeric/total_bouts*100,1));
 end if;
 perform public.complete_pound_before_spots(target_prescription_id,expected_snapshot,proposed_workout-'provenanceAudit',generation_details);
 if input->'intakeContext'->>'version'='2' then
  select generation_context->'trainingSnapshot' into snapshot from public.generated_prescriptions where id=target_prescription_id;
  snapshot:=snapshot||jsonb_build_object('intakeContext',input->'intakeContext','injurySpots',input->'injurySpots','intakeAssessment',input->'intakeAssessment','injuryDigest',input->'injuryDigest');
  update public.generated_prescriptions set generation_context=generation_context||jsonb_build_object('trainingSnapshot',snapshot,'provenanceAudit',audit,'evidence',evidence,'coachReview',generation_details->'coachReview','intakeReviewRequired',false,'liveWebResearch',not(evidence->>'cacheHit')::boolean) where id=target_prescription_id;
 end if;
end $$;
revoke all on function public.complete_pound_prescription(uuid,text,jsonb,jsonb) from public,anon,authenticated;
grant execute on function public.complete_pound_prescription(uuid,text,jsonb,jsonb) to authenticated;

-- Conservative exclusions, not a diagnosis or a rehabilitation prescription.
-- Even a zero-pain surgically repaired spot retains its relevant exclusion.
-- The Coach can correct the saved report; elapsed time never clears it.
alter function private.generation_exercise_compatible(uuid,uuid) rename to exercise_compatible_before_spots;
revoke all on function private.exercise_compatible_before_spots(uuid,uuid) from public,anon,authenticated;
create function private.generation_exercise_compatible(exercise_id uuid,target_intake_id uuid) returns boolean language sql stable security definer set search_path='' as $$
 select private.exercise_compatible_before_spots(exercise_id,target_intake_id) and not exists(
  select 1 from public.client_injury_spots s join public.client_intakes i on i.organization_id=s.organization_id and i.client_user_id=s.client_user_id
  cross join public.exercise_library e
  where i.id=target_intake_id and e.id=exercise_id and s.removed_at is null
   and e.movement_pattern=any(case
    when s.details->>'region' in ('head','neck','chest','abdomen') then array['squat','hinge','horizontal_push','vertical_push','horizontal_pull','vertical_pull','carry','conditioning','unilateral','power','rotation']
    when s.details->>'region' in ('shoulder','upper_arm','elbow','forearm','wrist','hand') then array['horizontal_push','vertical_push','horizontal_pull','vertical_pull','carry','power']
    when s.details->>'region' in ('upper_back','lower_back') then array['squat','hinge','carry','rotation','power','vertical_push']
    else array['squat','hinge','unilateral','knee_flexion','carry','conditioning','power'] end))
$$;
revoke all on function private.generation_exercise_compatible(uuid,uuid) from public,anon,authenticated;
