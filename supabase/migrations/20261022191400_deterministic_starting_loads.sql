-- Additive, versioned coaching defaults. Not scientific cross-exercise claims.
-- No import publication, history rewrite, or competing set-result store.
insert into public.exercise_library(slug,name,movement_pattern,primary_quality,difficulty,equipment_requirements,default_rep_min,default_rep_max,default_set_min,default_set_max)
values ('deadlift','Deadlift','hinge','strength','intermediate',array['barbell','plates'],5,8,2,3),
 ('overhead-press','Overhead Press','vertical_push','strength','intermediate',array['barbell','plates'],5,10,2,3),
 ('loaded-split-squat','Loaded Split Squat','squat','strength','intermediate',array['dumbbells'],6,12,2,3),
 ('loaded-reverse-lunge','Loaded Reverse Lunge','unilateral','strength','intermediate',array['dumbbells'],6,12,2,3),
 ('loaded-step-up','Loaded Step-up','unilateral','strength','intermediate',array['dumbbells','bench'],6,12,2,3);
update public.exercise_library e set contraindication_tags=base.contraindication_tags,laterality=base.laterality,measurement=base.measurement,
 primary_muscles=base.primary_muscles,secondary_muscles=base.secondary_muscles,purposes=base.purposes,coach_cue=base.coach_cue
from public.exercise_library base where base.organization_id is null and e.organization_id is null and base.slug=case e.slug
 when 'deadlift' then 'romanian-deadlift' when 'overhead-press' then 'dumbbell-shoulder-press'
 when 'loaded-split-squat' then 'split-squat' when 'loaded-reverse-lunge' then 'reverse-lunge' when 'loaded-step-up' then 'step-up' end;

create table public.exercise_load_rules (
 id uuid primary key default gen_random_uuid(),
 exercise_id uuid not null references public.exercise_library(id) on delete restrict,
 organization_id uuid references public.organizations(id) on delete cascade,
 version integer not null check(version>0),
 prescription_type text not null check(prescription_type in ('weighted','bodyweight','band','time','distance','carry','sled')),
 intake_anchor text check(intake_anchor in ('back_squat','bench','deadlift','romanian_deadlift','overhead_press')),
 coefficient numeric check(coefficient>0 and coefficient<=0.8),
 working_percentage boolean not null default false,
 weight_semantics text not null check(weight_semantics in ('total','each_hand','added','sled','none')),
 minimum_lb numeric not null default 0 check(minimum_lb>=0),
 maximum_lb numeric not null default 1000 check(maximum_lb>0 and maximum_lb<=10000 and maximum_lb>=minimum_lb),
 rounding_method text not null default 'confirmed_down' check(rounding_method='confirmed_down'),
 calibration_strategy text not null default 'lightest_confirmed' check(calibration_strategy in ('lightest_confirmed','coach_required')),
 equivalent_exercise_id uuid references public.exercise_library(id) on delete restrict,
 explanation text not null check(char_length(explanation) between 1 and 1000),
 active boolean not null default true,
 created_at timestamptz not null default now(),updated_at timestamptz not null default now(),
 created_by uuid references auth.users(id) on delete restrict,updated_by uuid references auth.users(id) on delete restrict,
 check((coefficient is null)=(intake_anchor is null)),check(equivalent_exercise_id is distinct from exercise_id)
);
create unique index load_rules_global_version on public.exercise_load_rules(exercise_id,version) where organization_id is null;
create unique index load_rules_org_version on public.exercise_load_rules(organization_id,exercise_id,version) where organization_id is not null;
create index load_rules_exercise_idx on public.exercise_load_rules(exercise_id);
create index load_rules_equivalent_idx on public.exercise_load_rules(equivalent_exercise_id);
create index load_rules_created_idx on public.exercise_load_rules(created_by);
create index load_rules_updated_idx on public.exercise_load_rules(updated_by);
alter table public.exercise_load_rules enable row level security;
revoke all on public.exercise_load_rules from public,anon,authenticated;
grant select on public.exercise_load_rules to authenticated;
create policy load_rules_read on public.exercise_load_rules for select to authenticated using (
 exists(select 1 from public.organization_memberships m where m.user_id=(select auth.uid()) and m.status='active'
   and (exercise_load_rules.organization_id is null or m.organization_id=exercise_load_rules.organization_id)
   and private.has_active_role(m.organization_id,array['owner','coach']::public.organization_role[])));

insert into public.exercise_load_rules(exercise_id,version,prescription_type,intake_anchor,coefficient,working_percentage,weight_semantics,explanation)
select id,1,
 case when 'bands'=any(equipment_requirements) then 'band'
 when slug like 'sled-%' then 'sled' when slug in ('farmer-carry','suitcase-carry') then 'carry'
 when equipment_requirements && array['barbell','dumbbells','kettlebells','medicine_balls','cable_machine','selectorized_machine'] then 'weighted'
 when measurement='time' then 'time' when measurement='distance' then 'distance' else 'bodyweight' end,
 case when slug in ('back-squat','goblet-squat','loaded-split-squat','loaded-reverse-lunge','loaded-step-up') then 'back_squat'
 when slug in ('bench-press','dumbbell-bench-press','incline-dumbbell-press') then 'bench'
 when slug='deadlift' then 'deadlift' when slug='romanian-deadlift' then 'romanian_deadlift' when slug='overhead-press' then 'overhead_press' end,
 case when slug='goblet-squat' then .25 when slug in ('loaded-split-squat','loaded-reverse-lunge','loaded-step-up') then .15
 when slug='dumbbell-bench-press' then .5 when slug='incline-dumbbell-press' then .4
 when slug in ('back-squat','bench-press','deadlift','romanian-deadlift','overhead-press') then .75 end,
 slug in ('back-squat','bench-press','deadlift','romanian-deadlift','overhead-press'),
 case when slug like 'sled-%' then 'sled'
 when 'dumbbells'=any(equipment_requirements) and slug not in ('goblet-squat','one-arm-dumbbell-row','single-leg-rdl','suitcase-carry') then 'each_hand'
 when equipment_requirements && array['barbell','dumbbells','kettlebells','medicine_balls','cable_machine','selectorized_machine'] then 'total' else 'none' end,
 'Conservative Coach-editable starting default. History first; otherwise a measured matching anchor, or lightest confirmed technique load. Never an inferred strength test.'
from public.exercise_library where is_active;

-- Immutable rule revisions; Owners can write only a new revision for their gym.
create function public.save_exercise_load_rule(target_exercise_id uuid,starting_coefficient numeric,anchor text,semantics text,minimum_lb numeric,maximum_lb numeric,calibration text,equivalent_id uuid,explanation text)
returns uuid language plpgsql security definer set search_path='' as $$
declare org uuid; previous public.exercise_load_rules%rowtype; result uuid;
begin
 select organization_id into strict org from public.organization_memberships where user_id=(select auth.uid()) and role='owner' and status='active';
 if not private.has_active_role(org,array['owner']::public.organization_role[]) then raise exception 'Active Owner required'; end if;
 perform pg_advisory_xact_lock(hashtextextended(org::text||target_exercise_id::text,0));
 select * into strict previous from public.exercise_load_rules where exercise_id=target_exercise_id and active and (organization_id=org or organization_id is null)
 order by organization_id nulls last,version desc limit 1;
 if not exists(select 1 from public.exercise_library where id=target_exercise_id and is_active and (organization_id is null or organization_id=org)) then raise exception 'Exercise unavailable'; end if;
 if equivalent_id is not null and not exists(select 1 from public.exercise_load_rules r join public.exercise_library e on e.id=r.exercise_id
   where r.exercise_id=equivalent_id and r.active and (r.organization_id is null or r.organization_id=org)
   and (e.organization_id is null or e.organization_id=org) and e.is_active and r.weight_semantics=semantics and r.prescription_type=previous.prescription_type
   and e.equipment_requirements=(select equipment_requirements from public.exercise_library where id=target_exercise_id)) then raise exception 'Equivalent must be explicitly reviewed with identical load semantics and equipment'; end if;
 insert into public.exercise_load_rules(exercise_id,organization_id,version,prescription_type,intake_anchor,coefficient,working_percentage,weight_semantics,minimum_lb,maximum_lb,calibration_strategy,equivalent_exercise_id,explanation,created_by,updated_by)
 values(target_exercise_id,org,coalesce((select max(version)+1 from public.exercise_load_rules where exercise_id=target_exercise_id and organization_id=org),1),previous.prescription_type,anchor,starting_coefficient,previous.working_percentage,semantics,minimum_lb,maximum_lb,calibration,equivalent_id,explanation,auth.uid(),auth.uid()) returning id into result;
 return result;
end $$;
revoke all on function public.save_exercise_load_rule(uuid,numeric,text,text,numeric,numeric,text,uuid,text) from public,anon,authenticated;
grant execute on function public.save_exercise_load_rule(uuid,numeric,text,text,numeric,numeric,text,uuid,text) to authenticated;

-- Measured optional anchors live in the EXISTING immutable intake version.
create function private.valid_strength_anchors(fields jsonb) returns boolean language plpgsql immutable set search_path='' as $$
declare x record; a jsonb;
begin
 a:=fields->'strengthAnchors'; if a is null then return true; end if;
 if jsonb_typeof(a)<>'object' then return false; end if;
 for x in select * from jsonb_each(a) loop
   if x.key not in ('deadlift','overhead_press') or jsonb_typeof(x.value)<>'object' then return false; end if;
   if coalesce(x.value->>'method','') not in ('not_tested','tested','estimated') then return false; end if;
   if x.value->>'method'='not_tested' then
     if x.value-'method'<>'{}'::jsonb then return false; end if;
   else
     if coalesce(x.value->>'variation','') not in (case x.key when 'deadlift' then 'deadlift' else 'overhead_press' end,'romanian_deadlift')
       or x.key='overhead_press' and x.value->>'variation'<>'overhead_press'
       or jsonb_typeof(x.value->'oneRmKg') is distinct from 'number' or not((x.value->>'oneRmKg')::numeric>0 and (x.value->>'oneRmKg')::numeric<=1000)
       or jsonb_typeof(x.value->'loadKg') is distinct from 'number' or not((x.value->>'loadKg')::numeric>0 and (x.value->>'loadKg')::numeric<=1000)
       or jsonb_typeof(x.value->'reps') is distinct from 'number' or not((x.value->>'reps')::numeric between 1 and 30) then return false; end if;
   end if;
 end loop;
 return true;
exception when others then return false;
end $$;
revoke all on function private.valid_strength_anchors(jsonb) from public,anon,authenticated;
grant execute on function private.valid_strength_anchors(jsonb) to authenticated;
alter table public.client_intakes add constraint intake_optional_strength_anchors check(private.valid_strength_anchors(custom_fields));
-- No fabricated zero measurements for tests that cannot safely be performed.
alter table public.client_intake_baselines
 alter column squat_load_kg drop not null,alter column squat_reps drop not null,alter column squat_one_rm_kg drop not null,
 alter column bench_load_kg drop not null,alter column bench_reps drop not null,alter column bench_one_rm_kg drop not null,
 drop constraint client_intake_baselines_squat_one_rm_method_check,drop constraint client_intake_baselines_bench_one_rm_method_check,
 add constraint squat_measured_or_not_tested check((squat_one_rm_method='not_tested' and squat_load_kg is null and squat_reps is null and squat_one_rm_kg is null)
   or (squat_one_rm_method in ('tested','estimated') and squat_load_kg is not null and squat_reps is not null and squat_one_rm_kg is not null)),
 add constraint bench_measured_or_not_tested check((bench_one_rm_method='not_tested' and bench_load_kg is null and bench_reps is null and bench_one_rm_kg is null)
   or (bench_one_rm_method in ('tested','estimated') and bench_load_kg is not null and bench_reps is not null and bench_one_rm_kg is not null));

-- Exact confirmed sizes only; a range is NOT proof of intermediate weights.
create function private.confirmed_loads(org uuid,requirements text[],semantics text) returns numeric[]
language plpgsql stable security definer set search_path='' as $$
declare bars numeric[]; plates numeric[]; result numeric[];
begin
 if 'barbell'=any(requirements) then
   select array_agg(distinct n) into bars from public.organization_equipment e cross join lateral unnest(e.weight_sizes_lb) n where e.organization_id=org and e.is_available and e.equipment_type='barbell';
   select array_agg(distinct n order by n) into plates from public.organization_equipment e cross join lateral unnest(e.weight_sizes_lb) n where e.organization_id=org and e.is_available and e.equipment_type='plates' and e.paired_sizes_confirmed;
   if bars is null or cardinality(plates)>16 then return '{}'; end if;
   with recursive sums(pos,total) as (select 0,0::numeric union all select pos+1,total+added from sums
     cross join lateral(values(0::numeric),(2*plates[pos+1])) q(added) where pos<coalesce(cardinality(plates),0))
   select array_agg(distinct total+bar order by total+bar) into result from sums cross join unnest(bars) bar where pos=coalesce(cardinality(plates),0);
 else
   select array_agg(distinct n order by n) into result from public.organization_equipment e cross join lateral unnest(e.weight_sizes_lb) n
   where e.organization_id=org and e.is_available and e.equipment_type=any(requirements)
     and (e.min_weight_lb is null or n>=e.min_weight_lb) and (e.max_weight_lb is null or n<=e.max_weight_lb)
     -- Paired dumbbell work requires two implements of each selected size. A
     -- mixed-size inventory count does not prove matching pairs.
     and (semantics<>'each_hand' or e.weight_sizes_lb=array[n] and e.quantity>=2);
 end if;
 return coalesce(result,'{}');
end $$;

-- Pure deterministic kernel, used by the guarded resolver and SQL unit tests.
create function private.calculate_starting_load(rule jsonb,anchor_lb numeric,available numeric[],history jsonb,reps integer,target_rpe numeric)
returns jsonb language plpgsql immutable set search_path='' as $$
declare target numeric; chosen numeric; coefficient numeric; basis text; explain text; h jsonb; minimum numeric; maximum numeric;
 successful numeric; failed boolean; pain boolean; complete boolean; below boolean; reduced boolean; next_load numeric;
begin
 minimum:=coalesce((rule->>'minimum_lb')::numeric,0); maximum:=coalesce((rule->>'maximum_lb')::numeric,1000);
 select array_agg(distinct n order by n) into available from unnest(available) n where n>=minimum and n<=maximum;
 if rule->>'prescription_type' in ('bodyweight','band','time','distance') then return jsonb_build_object('load',null,'loadUnit','lb','basis','equipment calibration','semantics','none',
   'explanation',case rule->>'prescription_type' when 'bodyweight' then 'Bodyweight' when 'band' then 'Select and record the band resistance before approval.' else 'Use the reviewed time, distance or repetition target; no invented weight.' end,'calibrationRequired',false,'coachReviewRequired',false); end if;
 if jsonb_array_length(coalesce(history,'[]'))>0 then
   select min((v->>'load')::numeric) filter(where (v->>'reps')::integer>0 and coalesce(v->>'result','') in ('complete','modified') and not coalesce((v->>'pain')::boolean,false)),
     bool_or(coalesce((v->>'pain')::boolean,false)),bool_or(coalesce(v->>'result','') in ('missed','failed') or coalesce((v->>'reps')::integer,0)<coalesce((v->>'prescribedReps')::integer,reps)),
     bool_and(v->>'recorded'='true' and v->>'result'='complete' and (v->>'reps')::integer>=coalesce((v->>'prescribedReps')::integer,reps) and v->>'load' is not null),
     count(v->>'rpe')=count(*) and avg((v->>'rpe')::numeric)<target_rpe and (history->-1->>'rpe')::numeric<target_rpe,
     bool_or((v->>'load')::numeric<(v->>'prescribedLoad')::numeric or v->>'result'='modified')
   into successful,pain,failed,complete,below,reduced from jsonb_array_elements(history) v;
   if successful is not null then
     target:=successful; basis:=case when rule->>'historyEquivalent'='true' then 'approved variation history' else 'same exercise history' end;
     explain:=case when pain then 'Pain recorded: no automatic progression; Coach review required.' when reduced then 'Use the lowest successful working load after a recorded reduction.' when failed or not complete then 'Incomplete/failed work: repeat the lowest successful load; no inferred progression.' else 'Repeat the successful working load at target effort.' end;
     if complete and below and not pain and not reduced and not failed then
       select min(n) into next_load from unnest(available) n where n>successful;
       target:=coalesce(next_load,successful); explain:='Every prescribed set completed below target RPE without pain: one smallest confirmed increment only.';
     end if;
   elsif pain then return jsonb_build_object('load',null,'loadUnit','lb','basis','same exercise history','semantics',rule->>'weight_semantics','explanation','Pain recorded: Coach review and technique calibration required.','calibrationRequired',true,'coachReviewRequired',true);
   elsif failed then
     select min((v->>'prescribedLoad')::numeric) into target from jsonb_array_elements(history) v where v->>'recorded'='true';
     select max(n) into target from unnest(available) n where n<target;
     basis:='same exercise history'; explain:='Failed work without a successful set: reduce one confirmed increment; Coach review required.';
     if target is null then return jsonb_build_object('load',null,'loadUnit','lb','basis',basis,'semantics',rule->>'weight_semantics','explanation','Calibration required — choose the first technique load before approval.','calibrationRequired',true,'coachReviewRequired',true); end if;
   end if;
 end if;
 if target is null and anchor_lb>0 and rule->>'coefficient' is not null then
   coefficient:=(rule->>'coefficient')::numeric;
   if rule->>'working_percentage'='true' then coefficient:=least(coefficient,1/(1+(greatest(1,reps)+greatest(0,10-target_rpe))/30.0)); end if;
   target:=anchor_lb*coefficient/case when rule->>'weight_semantics'='each_hand' then 2 else 1 end;
   basis:='intake percentage'; explain:=round(coefficient*100,2)::text||'% of saved '||round(anchor_lb,2)::text||' lb '||replace(rule->>'intake_anchor','_',' ')||' estimate';
 end if;
 if target is null and rule->>'calibration_strategy'='lightest_confirmed' then
   target:=available[1]; basis:='equipment calibration'; explain:='No defensible matching anchor: lightest confirmed technique load, not an inferred strength result.';
 end if;
 select max(n) into chosen from unnest(available) n where n<=target;
 return jsonb_build_object('load',chosen,'loadUnit','lb','basis',coalesce(basis,'equipment calibration'),'semantics',rule->>'weight_semantics','anchorLb',anchor_lb,
   'unroundedLb',target,'coefficient',coefficient,'explanation',case when chosen is null then 'Calibration required — choose the first technique load before approval.' else explain||'. Rounded down to confirmed equipment: '||chosen||' lb'||case when rule->>'weight_semantics'='each_hand' then ' per hand; '||(chosen*2)||' lb total.' else ' total.' end end,
   'calibrationRequired',chosen is null,'coachReviewRequired',coalesce(pain,false));
end $$;

create function private.resolve_starting_load(prescription uuid,row_data jsonb) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare p public.generated_prescriptions%rowtype; e public.exercise_library%rowtype; r public.exercise_load_rules%rowtype;
 b public.client_intake_baselines%rowtype; a jsonb; rule jsonb; history jsonb; anchor numeric; resolved jsonb; source_exercise uuid; work uuid; equivalent boolean:=false; sources jsonb;
begin
 select * into strict p from public.generated_prescriptions where id=prescription;
 select * into strict e from public.exercise_library where id=(row_data->>'libraryExerciseId')::uuid;
 select * into r from public.exercise_load_rules where exercise_id=e.id and active and (organization_id=p.organization_id or organization_id is null) order by organization_id nulls last,version desc limit 1;
 if r.id is null then return jsonb_build_object('load',null,'loadUnit','lb','loadPrescription',jsonb_build_object('basis','equipment calibration','calibrationRequired',true,'explanation','Calibration required — choose the first technique load before approval.')); end if;
 select * into b from public.client_intake_baselines where intake_id=p.intake_id;
 select custom_fields->'strengthAnchors' into a from public.client_intakes where id=p.intake_id;
 anchor:=case r.intake_anchor when 'back_squat' then case when b.squat_variation='back_squat' and b.squat_one_rm_method<>'not_tested' then b.squat_one_rm_kg*2.20462262185 end
 when 'bench' then case when lower(b.bench_variation) in ('barbell bench press','bench press') and b.bench_one_rm_method<>'not_tested' then b.bench_one_rm_kg*2.20462262185 end
 when 'deadlift' then case when a->'deadlift'->>'variation'='deadlift' then (a->'deadlift'->>'oneRmKg')::numeric*2.20462262185 end
 when 'romanian_deadlift' then case when a->'deadlift'->>'variation'='romanian_deadlift' then (a->'deadlift'->>'oneRmKg')::numeric*2.20462262185 end
 when 'overhead_press' then (a->'overhead_press'->>'oneRmKg')::numeric*2.20462262185 end;
 for n in 1..2 loop
   source_exercise:=case when n=1 then e.id else r.equivalent_exercise_id end;
   exit when source_exercise is null;
   select w.id into work from public.workout_assignments w join public.workout_exercises ex on ex.workout_assignment_id=w.id
   where w.organization_id=p.organization_id and w.client_user_id=p.client_user_id and w.status in ('completed','in_progress')
     and w.created_at>now()-interval '90 days' and ex.library_exercise_id=source_exercise
     and abs(ex.reps-(row_data->>'reps')::integer)<=2
     and (r.weight_semantics<>'each_hand' or ex.load_prescription->>'semantics'='each_hand')
     and coalesce(ex.prescription_details->>'format','straight')=coalesce(row_data->'protocol'->>'format','straight')
     and exists(select 1 from public.workout_sets s where s.workout_exercise_id=ex.id and s.completed_at is not null)
   order by w.created_at desc,w.id desc limit 1;
   if work is not null then
     equivalent:=n=2;
     select jsonb_agg(jsonb_build_object('recorded',s.completed_at is not null,'load',case s.actual_load_unit when 'lb' then s.actual_load when 'kg' then s.actual_load*2.20462262185 end,
       'prescribedLoad',case s.prescribed_load_unit when 'lb' then s.prescribed_load when 'kg' then s.prescribed_load*2.20462262185 end,
       'reps',s.actual_reps,'prescribedReps',s.prescribed_reps,'rpe',s.actual_rpe,'pain',s.pain_reported or s.failure_reason='pain_discomfort',
       'result',coalesce(s.client_result,case when s.execution_result in ('complete','exceeded') then 'complete' when s.execution_result='failed' then 'failed' else 'missed' end)) order by s.set_number)
     into history from public.workout_sets s join public.workout_exercises ex on ex.id=s.workout_exercise_id
     where ex.workout_assignment_id=work and ex.library_exercise_id=source_exercise
       and (s.performed_library_exercise_id is null or s.performed_library_exercise_id=source_exercise);
     exit;
   end if;
 end loop;
 rule:=to_jsonb(r)||jsonb_build_object('historyEquivalent',equivalent);
 resolved:=private.calculate_starting_load(rule,anchor,private.confirmed_loads(p.organization_id,e.equipment_requirements,r.weight_semantics),history,(row_data->>'reps')::integer,coalesce((row_data->'protocol'->>'targetRpe')::numeric,(row_data->>'targetRpe')::numeric,6));
 resolved:=resolved||jsonb_build_object('ruleId',r.id,'ruleVersion',r.version,'exerciseId',e.id,'intakeId',p.intake_id,'historyWorkoutId',work,'rounding','confirmed_down','coachingRule',r.explanation);
 select coalesce(jsonb_agg(jsonb_build_object('reviewId',v->>'id','title',v->>'title','revision',v->'revision')),'[]') into sources
 from jsonb_array_elements(coalesce(p.generation_context->'referenceVersions','[]')) v where exists(
   select 1 from jsonb_array_elements(v->'exercises') item where item->>'libraryExerciseId'=e.id::text);
 return jsonb_build_object('load',resolved->'load','loadUnit','lb','loadPrescription',resolved,'programmingSources',sources);
end $$;

-- Preserve ALL original generator/auth/snapshot/protocol checks. AI is still
-- required to leave loads null; only this DB step adds numeric prescriptions.
alter function public.complete_pound_prescription(uuid,text,jsonb,jsonb) rename to complete_pound_prescription_before_load_engine;
revoke all on function public.complete_pound_prescription_before_load_engine(uuid,text,jsonb,jsonb) from public,anon,authenticated;
create function public.complete_pound_prescription(target_prescription_id uuid,expected_snapshot text,proposed_workout jsonb,generation_details jsonb)
returns void language plpgsql security definer set search_path='' as $$
declare rows jsonb; p public.generated_prescriptions%rowtype;
begin
 -- These locks hold current history steady while the existing optimistic
 -- snapshot and load resolver run. Set writers already lock their workout.
 perform public.get_pound_generation_input(target_prescription_id);
 select * into strict p from public.generated_prescriptions where id=target_prescription_id for update;
 perform 1 from public.workout_assignments where organization_id=p.organization_id and client_user_id=p.client_user_id for share;
 perform 1 from public.workout_sets s join public.workout_exercises e on e.id=s.workout_exercise_id
   join public.workout_assignments w on w.id=e.workout_assignment_id where w.organization_id=p.organization_id and w.client_user_id=p.client_user_id for share of s;
 perform public.complete_pound_prescription_before_load_engine(target_prescription_id,expected_snapshot,proposed_workout,generation_details);
 select jsonb_agg(x||private.resolve_starting_load(g.id,x) order by n) into rows
 from public.generated_prescriptions g cross join lateral jsonb_array_elements(g.original_recommendation) with ordinality q(x,n) where g.id=target_prescription_id;
 update public.generated_prescriptions set original_recommendation=rows,final_prescription=rows,
   generation_context=generation_context||jsonb_build_object('loadEngine','deterministic-v1') where id=target_prescription_id;
end $$;
revoke all on function public.complete_pound_prescription(uuid,text,jsonb,jsonb) from public,anon,authenticated;
grant execute on function public.complete_pound_prescription(uuid,text,jsonb,jsonb) to authenticated;

-- Require a technique load for weighted rows; keep Coach edits authoritative.
alter function public.approve_pound_prescription(uuid,text,text,date,smallint,jsonb) rename to approve_pound_prescription_before_load_engine;
revoke all on function public.approve_pound_prescription_before_load_engine(uuid,text,text,date,smallint,jsonb) from public,anon,authenticated;
create function public.approve_pound_prescription(target_prescription_id uuid,workout_title text,workout_instructions text,workout_scheduled_date date,workout_duration_minutes smallint,exercises jsonb)
returns uuid language plpgsql security definer set search_path='' as $$
declare result uuid; x jsonb; org uuid; r public.exercise_load_rules%rowtype; initial jsonb; audited jsonb:='[]';
begin
 -- Underlying atomic approval authenticates/authorizes before any result can persist.
 result:=public.approve_pound_prescription_before_load_engine(target_prescription_id,workout_title,workout_instructions,workout_scheduled_date,workout_duration_minutes,exercises);
 select organization_id into strict org from public.generated_prescriptions where id=target_prescription_id;
 for x in select value from jsonb_array_elements(exercises) loop
   select * into r from public.exercise_load_rules where exercise_id=(x->>'libraryExerciseId')::uuid and active and (organization_id=org or organization_id is null) order by organization_id nulls last,version desc limit 1;
   if r.prescription_type in ('weighted','carry','sled') and (x->>'load') is null then raise exception 'Calibration required — choose the first technique load before approval.'; end if;
   if r.prescription_type='band' and coalesce(trim(x->>'bandResistance'),'')='' then raise exception 'Record the band resistance before approval'; end if;
   if (x->>'load')::numeric<r.minimum_lb or (x->>'load')::numeric>r.maximum_lb then raise exception 'Coach load outside reviewed rule safeguards'; end if;
   select v->'loadPrescription' into initial from public.generated_prescriptions p cross join lateral jsonb_array_elements(p.original_recommendation) v where p.id=target_prescription_id and v->>'libraryExerciseId'=x->>'libraryExerciseId' limit 1;
   initial:=coalesce(initial,jsonb_build_object('ruleId',r.id,'ruleVersion',r.version,'semantics',r.weight_semantics));
   if initial->>'load' is distinct from x->>'load' then initial:=initial||jsonb_build_object('basis','Coach override','load',x->'load','explanation','Coach-confirmed load for this assigned workout.'); end if;
   audited:=audited||jsonb_build_array(x||jsonb_build_object('loadPrescription',initial));
   update public.workout_exercises set load_prescription=initial||case when r.prescription_type='band' then jsonb_build_object('bandResistance',x->>'bandResistance') else '{}' end
   where workout_assignment_id=result and library_exercise_id=(x->>'libraryExerciseId')::uuid;
 end loop;
 update public.generated_prescriptions set final_prescription=audited where id=target_prescription_id;
 return result;
end $$;
alter table public.workout_exercises add column load_prescription jsonb;
revoke all on function public.approve_pound_prescription(uuid,text,text,date,smallint,jsonb) from public,anon,authenticated;
grant execute on function public.approve_pound_prescription(uuid,text,text,date,smallint,jsonb) to authenticated;
revoke all on function private.confirmed_loads(uuid,text[],text),private.calculate_starting_load(jsonb,numeric,numeric[],jsonb,integer,numeric),private.resolve_starting_load(uuid,jsonb) from public,anon,authenticated;

-- Include only a digest of rule revisions and individual set state in the
-- optimistic snapshot. No whole history/raw catalog copy per prescription.
alter function public.get_pound_generation_input(uuid) rename to get_pound_generation_input_before_load_engine;
revoke all on function public.get_pound_generation_input_before_load_engine(uuid) from public,anon,authenticated;
create function public.get_pound_generation_input(target_prescription_id uuid) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare input jsonb; p public.generated_prescriptions%rowtype; digest text;
begin
 input:=public.get_pound_generation_input_before_load_engine(target_prescription_id);
 select * into strict p from public.generated_prescriptions where id=target_prescription_id;
 select md5(concat_ws('|',
   (select string_agg(id::text||version::text||active::text,',' order by id) from public.exercise_load_rules where organization_id is null or organization_id=p.organization_id),
   (select to_jsonb(b)::text from public.client_intake_baselines b where intake_id=p.intake_id),
   (select string_agg(s.id::text||s.updated_at::text,',' order by s.id) from public.workout_sets s join public.workout_exercises e on e.id=s.workout_exercise_id
     join public.workout_assignments w on w.id=e.workout_assignment_id where w.organization_id=p.organization_id and w.client_user_id=p.client_user_id and w.created_at>now()-interval '90 days')))
 into digest;
 input:=(input-'snapshot')||jsonb_build_object('loadContextDigest',digest);
 return input||jsonb_build_object('snapshot',md5(input::text));
end $$;
revoke all on function public.get_pound_generation_input(uuid) from public,anon,authenticated;
grant execute on function public.get_pound_generation_input(uuid) to authenticated;

-- Unperformed squat/bench tests are explicit nulls, not fabricated zero tests.
alter function public.save_client_intake_v1(uuid,jsonb,jsonb,jsonb) rename to save_client_intake_before_load_engine;
revoke all on function public.save_client_intake_before_load_engine(uuid,jsonb,jsonb,jsonb) from public,anon,authenticated;
create function public.save_client_intake_v1(target_client_user_id uuid,intake_payload jsonb,baseline_payload jsonb,inbody_payload jsonb)
returns uuid language plpgsql security definer set search_path='' as $$
declare key text;
begin
 foreach key in array array['squat','bench'] loop
   if baseline_payload->>(key||'OneRmMethod')='not_tested' then
     baseline_payload:=baseline_payload||jsonb_build_object(key||'LoadKg',null,key||'Reps',null,key||'OneRmKg',null);
   end if;
 end loop;
 return public.save_client_intake_before_load_engine(target_client_user_id,intake_payload,baseline_payload,inbody_payload);
end $$;
revoke all on function public.save_client_intake_v1(uuid,jsonb,jsonb,jsonb) from public,anon,authenticated;
grant execute on function public.save_client_intake_v1(uuid,jsonb,jsonb,jsonb) to authenticated;

-- Legacy approval RPCs cannot bypass calibration on NEW load-engine drafts.
-- Existing assignments and manual workouts retain their previous behavior.
create function private.guard_generated_calibration() returns trigger language plpgsql security definer set search_path='' as $$
declare org uuid; engine text; rule public.exercise_load_rules%rowtype; requirements text[];
begin
 select w.organization_id,g.generation_context->>'loadEngine' into org,engine from public.workout_assignments w
 join public.generated_prescriptions g on g.id=w.source_prescription_id where w.id=new.workout_assignment_id;
 if engine='deterministic-v1' then
   select * into rule from public.exercise_load_rules where exercise_id=new.library_exercise_id and active
     and (organization_id=org or organization_id is null) order by organization_id nulls last,version desc limit 1;
   select equipment_requirements into requirements from public.exercise_library where id=new.library_exercise_id;
   if (rule.prescription_type in ('weighted','carry','sled') or rule.id is null and requirements && array['barbell','dumbbells','kettlebells','sled','medicine_balls','cable_machine','selectorized_machine']) and new.load is null then raise exception 'Calibration required — choose the first technique load before approval.'; end if;
   if new.load<rule.minimum_lb or new.load>rule.maximum_lb then raise exception 'Coach load outside reviewed rule safeguards'; end if;
   perform private.assert_pound_load(org,requirements,new.load);
 end if;
 return new;
end $$;
revoke all on function private.guard_generated_calibration() from public,anon,authenticated;
create trigger guard_generated_calibration before insert or update of load,library_exercise_id on public.workout_exercises for each row execute function private.guard_generated_calibration();

create function public.get_training_catalog_counts() returns jsonb language plpgsql stable security definer set search_path='' as $$
declare org uuid; result jsonb;
begin
 select organization_id into strict org from public.organization_memberships where user_id=(select auth.uid()) and role='owner' and status='active';
 if not private.has_active_role(org,array['owner']::public.organization_role[]) then raise exception 'Active Owner required'; end if;
 with latest as (
   select t.id,r.exercises from public.training_library_items t join public.training_library_reviews r on r.training_item_id=t.id and r.organization_id=t.organization_id
   where t.organization_id=org and t.status='published' and not t.generation_excluded and r.status='published' and r.structure_version=2 and r.source_confirmed
     and r.revision=(select max(v.revision) from public.training_library_reviews v where v.training_item_id=t.id)
 ), blocks as (
   select l.id,case when coalesce(x.value->'protocol'->>'group','')<>'' then concat_ws(':',x.value->'protocol'->>'block',x.value->'protocol'->>'format',x.value->'protocol'->>'group') else x.ordinality::text end block,
     bool_and(e.is_active and (e.organization_id is null or e.organization_id=org) and e.equipment_requirements <@ private.available_training_resources(org)) compatible
   from latest l cross join lateral jsonb_array_elements(l.exercises) with ordinality x left join public.exercise_library e on e.id=(x.value->>'libraryExerciseId')::uuid group by l.id,block
 )
 select jsonb_build_object('imported',(select count(*) from public.training_library_items where organization_id=org),
   'approved',(select count(*) from latest),'eligible',(select count(distinct id) from blocks where compatible)) into result;
 return result;
end $$;
revoke all on function public.get_training_catalog_counts() from public,anon,authenticated;
grant execute on function public.get_training_catalog_counts() to authenticated;
