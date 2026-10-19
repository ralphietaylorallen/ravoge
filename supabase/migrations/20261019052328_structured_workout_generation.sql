-- Additive structured target/performance data; legacy set logging remains intact.
alter table public.workout_sets add column actual_work_seconds integer check(actual_work_seconds between 0 and 7200),
 add column actual_distance numeric check(actual_distance between 0 and 10000),
 add column actual_rpe numeric check(actual_rpe between 1 and 10),
 add column client_result text check(client_result in ('complete','modified','missed'));
alter table public.workout_assignments add column client_feedback text check(char_length(client_feedback)<=2000),
 add column client_difficulty smallint check(client_difficulty between 1 and 5);

create function public.get_quality_generation_input(target_prescription_id uuid) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare base jsonb; p public.generated_prescriptions%rowtype; i public.client_intakes%rowtype;
 candidates jsonb; refs jsonb; facilities jsonb; profile public.gym_programming_profiles%rowtype; history jsonb; published_count integer; readiness jsonb;
begin
 -- Existing auth, assignment, draft, latest-intake and safety guards all run.
 base:=public.get_prescription_generation_input(target_prescription_id);
 select * into strict p from public.generated_prescriptions where id=target_prescription_id;
 select * into strict i from public.client_intakes where id=(base->>'intakeId')::uuid;
 select coalesce(jsonb_agg(jsonb_build_object('id',e.id,'name',e.name,'canonicalName',case when e.organization_id is null then e.name else null end,
   'pattern',e.movement_pattern,'equipment',e.equipment_requirements,'difficulty',e.difficulty,'quality',e.primary_quality,
   'primaryMuscles',e.primary_muscles,'secondaryMuscles',e.secondary_muscles,'purposes',e.purposes,'measurement',e.measurement,
   'laterality',e.laterality,'contraindications',e.contraindication_tags,'cue',e.coach_cue,'regression',e.regression_slug,'progression',e.progression_slug,
   'substitutions',e.substitution_slugs) order by e.id),'[]') into candidates
 from public.exercise_library e where private.generation_exercise_compatible(e.id,i.id);
 select coalesce(jsonb_agg(jsonb_build_object('type',feature_type,'length',usable_length,'unit',length_unit) order by id),'[]') into facilities
 from public.organization_facilities where organization_id=p.organization_id and is_available and usable_length>0;
 select count(*) into published_count from public.training_library_items where organization_id=p.organization_id and status='published' and not generation_excluded;
 select * into profile from public.gym_programming_profiles where organization_id=p.organization_id order by version desc limit 1;
 select coalesce(jsonb_agg(jsonb_build_object('id',r.id,'title',r.title,'revision',r.revision,'goal',r.primary_goal,'duration',r.duration_minutes,
   'structureVersion',r.structure_version,'exercises',r.exercises) order by r.rank),'[]') into refs from (
   select review.*, row_number() over(order by (review.primary_goal=i.primary_goal) desc,abs(review.duration_minutes-i.session_duration_minutes),review.reviewed_at desc) as rank
   from public.training_library_reviews review join public.training_library_items item on item.id=review.training_item_id
   where review.organization_id=p.organization_id and review.status='published' and item.status='published' and not item.generation_excluded
   and (review.primary_goal in (i.primary_goal,i.secondary_goal,'general_fitness') or (i.primary_goal='body_recomposition' and review.primary_goal in ('fat_loss','muscle_gain')))
   and review.duration_minutes<=i.session_duration_minutes
   and review.revision=(select max(v.revision) from public.training_library_reviews v where v.training_item_id=item.id)
   and not exists(select 1 from jsonb_array_elements(review.exercises) x where not private.generation_exercise_compatible((x->>'libraryExerciseId')::uuid,i.id))
   order by (review.primary_goal=i.primary_goal) desc,abs(review.duration_minutes-i.session_duration_minutes),review.reviewed_at desc limit 3
 ) r;
 select coalesce(jsonb_agg(jsonb_build_object('status',w.status,'exercises',(
   select coalesce(jsonb_agg(jsonb_build_object('id',e.library_exercise_id,'sets',e.sets,'reps',e.reps,'restSeconds',e.rest_seconds,
     'protocol',e.prescription_details,'performance',(select jsonb_build_object('recorded',count(*) filter(where completed_at is not null),
       'problematic',count(*) filter(where client_result in ('missed','modified') or execution_result in ('failed','not_completed')),
       'averageReps',avg(actual_reps),'averageLoad',avg(case actual_load_unit when 'kg' then actual_load when 'lb' then actual_load*0.45359237 else null end),'averageRpe',avg(actual_rpe),
       'averageWorkSeconds',avg(actual_work_seconds),'averageDistance',avg(actual_distance)) from public.workout_sets s where s.workout_exercise_id=e.id)) order by e.sort_order),'[]')
   from public.workout_exercises e where e.workout_assignment_id=w.id)) order by w.scheduled_date desc,w.id),'[]') into history
 from (select * from public.workout_assignments where organization_id=p.organization_id and client_user_id=p.client_user_id and status in ('assigned','in_progress','completed') order by scheduled_date desc,id desc limit 5) w;
 select jsonb_build_object('answers',r.answers,'hasPain',nullif(trim(r.pain_note),'') is not null,'coachDecision',r.coach_decision) into readiness
 from public.training_readiness_checkins r where r.organization_id=p.organization_id and r.client_user_id=p.client_user_id and r.created_at>now()-interval '24 hours' order by r.created_at desc limit 1;
 if coalesce((readiness->>'hasPain')::boolean,false) and readiness->>'coachDecision'='pending' then raise exception 'Review the new pain check-in before creating a workout'; end if;
 base:=base||jsonb_build_object('schemaVersion',2,'equipment',private.available_training_resources(p.organization_id),'facilities',facilities,'todayReadiness',readiness,
   'candidates',candidates,'references',refs,'history',history,'publishedCount',published_count,
   'gymProfile',case when profile.id is null then null else jsonb_build_object('id',profile.id,'version',profile.version,'statistics',profile.statistics,'preferences',profile.preferences,'summary',profile.summary,'sources',profile.sources) end);
 base:=base-'snapshot';
 return base||jsonb_build_object('snapshot',md5(base::text));
end $$;

create function private.quality_duration_seconds(rows jsonb) returns numeric language sql immutable set search_path='' as $$
 select coalesce(sum(case when x->'protocol'->>'format'='amrap' then case when n=first_group then (x->'protocol'->>'blockDurationSeconds')::numeric+60 else 0 end
 else (x->>'sets')::numeric*(case when x->'protocol'->>'format'='emom' then (x->'protocol'->>'intervalSeconds')::numeric
 else case x->'protocol'->>'measurement' when 'time' then (x->'protocol'->>'workSeconds')::numeric
 when 'distance' then (x->'protocol'->>'distance')::numeric*case when (x->'protocol'->>'perSide')::boolean then 4 else 2 end
 else (x->>'reps')::numeric*case when (x->'protocol'->>'perSide')::boolean then 8 else 4 end end+coalesce((x->>'restSeconds')::numeric,60) end)+30 end),0)
 from (select value x,ordinality n,min(ordinality) over(partition by value->'protocol'->>'block',value->'protocol'->>'group') first_group from jsonb_array_elements(rows) with ordinality) q
$$;
revoke all on function private.quality_duration_seconds(jsonb) from public,anon,authenticated;

create function public.complete_quality_prescription(target_prescription_id uuid,expected_snapshot text,proposed_workout jsonb,generation_details jsonb)
returns void language plpgsql security definer set search_path='' as $$
declare p public.generated_prescriptions%rowtype; input jsonb; rows jsonb; x jsonb; e public.exercise_library%rowtype;
 normalized jsonb:='[]'; proto jsonb; seconds numeric; is_assisted boolean; fallback jsonb;
begin
 select * into strict p from public.generated_prescriptions where id=target_prescription_id for update;
 input:=public.get_quality_generation_input(p.id);
 if p.coach_user_id<>(select auth.uid()) or p.status<>'draft' or p.engine_version<>'prescription-v0.2' then raise exception 'Active assigned Coach and fresh draft required'; end if;
 is_assisted:=proposed_workout is not null;
 if is_assisted then
   if expected_snapshot is null or expected_snapshot<>input->>'snapshot' then raise exception 'Training inputs changed'; end if;
   rows:=private.validate_quality_exercises(proposed_workout->'exercises',p.organization_id,p.intake_id,true);
   if char_length(trim(coalesce(proposed_workout->>'title',''))) not between 2 and 120 or char_length(trim(coalesce(proposed_workout->>'rationale',''))) not between 2 and 2000
     or (proposed_workout->>'durationMinutes') is null or (proposed_workout->>'durationMinutes')::integer not between 20 and (input->>'duration')::integer then raise exception 'Invalid draft summary'; end if;
 else
   -- Retain the safe deterministic selection and source protocols. Supply
   -- explicit timed/distance targets only for curated generic-library defaults,
   -- never reinterpret an unresolved source import.
   -- Retrieval already excluded unpublished/excluded/incompatible sources.
   if jsonb_array_length(input->'references')>0 then fallback:=input->'references'->0->'exercises';
   else
     select coalesce(jsonb_agg(jsonb_build_object('libraryExerciseId',q.id,'sets',case when input->>'experience'='beginner' then 2 else 3 end,
       'reps',case input->>'goal' when 'strength' then 6 when 'muscle_gain' then 10 else 8 end,'load',null,'restSeconds',case when input->>'goal'='strength' then 120 else 60 end,
       'notes','Begin conservatively and preserve clean technique. Coach must review.', 'reason','Compatible general-library movement for the saved goal.') order by q.position),'[]') into fallback
     from (select distinct on (pattern.position) l.*,pattern.position from unnest(private.generation_goal_patterns(input->>'goal')) with ordinality pattern(name,position)
       join public.exercise_library l on l.movement_pattern=pattern.name where private.generation_exercise_compatible(l.id,p.intake_id)
       order by pattern.position,(l.primary_quality=input->>'goal') desc,l.name) q;
   end if;
   for x in select value from jsonb_array_elements(fallback) loop
     select * into strict e from public.exercise_library where id=(x->>'libraryExerciseId')::uuid;
     if jsonb_typeof(x->'protocol')='object' then normalized:=normalized||jsonb_build_array(x);
     else
       proto:=jsonb_build_object('block',case when e.movement_pattern='conditioning' then 'conditioning' else 'strength' end,'format','straight','group','',
         'measurement',e.measurement,'workSeconds',case when e.measurement='time' then 30 else null end,
         'distance',case when e.measurement='distance' then 10 else null end,'distanceUnit','meters','intervalSeconds',null,'blockDurationSeconds',null,
         'percentageLoad',null,'perSide',e.laterality='unilateral','targetRpe',6,'substitutionIds','[]'::jsonb);
       normalized:=normalized||jsonb_build_array(x||jsonb_build_object('sets',least((x->>'sets')::integer,case when input->>'experience'='beginner' then 3 else 4 end),
         'reps',case when e.measurement<>'reps' then 1 else least((x->>'reps')::integer,12) end,'load',null,'protocol',proto));
     end if;
   end loop;
   rows:=private.validate_quality_exercises(normalized,p.organization_id,p.intake_id,false);
 end if;
 seconds:=private.quality_duration_seconds(rows);
 if seconds>(input->>'duration')::numeric*60+180 then raise exception 'Workout exceeds available duration; reduce workload or use a shorter source'; end if;
 if is_assisted and seconds<least(15,(input->>'duration')::numeric*0.4)*60 then raise exception 'Draft duration is not plausible for these targets'; end if;
 update public.generated_prescriptions set original_recommendation=rows,final_prescription=rows,
   title=case when is_assisted then proposed_workout->>'title' else 'Coach-reviewed '||initcap(replace(input->>'goal','_',' ')) end,
   rationale=case when is_assisted then proposed_workout->>'rationale' else 'Safe deterministic selection from compatible approved movements and reviewed gym examples. Coach must check effort, timing and source interpretation.' end,
   estimated_duration_minutes=greatest(20,least((input->>'duration')::integer,ceil(seconds/60)::integer)),
   engine_version=case when is_assisted then 'prescription-v0.4-openai' else 'prescription-v0.4-fallback' end,
   generation_context=generation_context||jsonb_build_object('generationMethod',case when is_assisted then 'openai' else 'deterministic_fallback' end,
     'rulesVersion','ravoge-quality-2026.2','trainingSnapshot',input,'estimatedWorkSeconds',seconds,
     'referenceVersions',input->'references','gymProfileVersion',input->'gymProfile'->'version',
     'sourceType',case when jsonb_array_length(input->'references')>0 then 'reviewed_organization_references' else 'global_library' end,
     'fallbackReason',case when is_assisted then null when generation_details->>'reason' in ('not_configured','invalid_output','timeout','unavailable') then generation_details->>'reason' else 'unavailable' end,
     'generationDetails',jsonb_build_object('model',left(generation_details->>'model',100))) where id=p.id;
end $$;

create function public.approve_quality_prescription(target_prescription_id uuid,workout_title text,workout_instructions text,
 workout_scheduled_date date,workout_duration_minutes smallint,exercises jsonb) returns uuid
language plpgsql security definer set search_path='' as $$
declare p public.generated_prescriptions%rowtype; latest uuid; rows jsonb; x jsonb; result uuid; n integer:=0;
begin
 select * into strict p from public.generated_prescriptions where id=target_prescription_id for update;
 if (select auth.uid()) is null or p.coach_user_id<>(select auth.uid()) or p.status<>'draft' or p.engine_version not like 'prescription-v0.4-%'
   or not private.has_active_role(p.organization_id,array['coach']::public.organization_role[])
   or not private.can_manage_client_domain(p.organization_id,p.client_user_id) then raise exception 'Active assigned Coach and draft required'; end if;
 select id into strict latest from public.client_intakes where organization_id=p.organization_id and client_user_id=p.client_user_id order by version desc limit 1;
 if latest<>p.intake_id or not exists(select 1 from public.intake_generation_safety_reviews where intake_id=latest)
   or workout_duration_minutes is null or workout_duration_minutes not between 20 and 180
   or char_length(trim(coalesce(workout_title,''))) not between 2 and 120 or workout_scheduled_date is null or char_length(coalesce(workout_instructions,''))>4000 then raise exception 'Review latest intake, title, date and duration'; end if;
 rows:=private.validate_quality_exercises(exercises,p.organization_id,latest,false);
 if private.quality_duration_seconds(rows)>workout_duration_minutes*60+180 then raise exception 'Review workload versus assigned duration'; end if;
 insert into public.workout_assignments(organization_id,coach_user_id,client_user_id,title,instructions,scheduled_date,source_prescription_id,objective,estimated_duration_minutes,volume_intent,coach_rationale)
 values(p.organization_id,(select auth.uid()),p.client_user_id,trim(workout_title),workout_instructions,workout_scheduled_date,p.id,p.objective,workout_duration_minutes,p.volume_intent,p.rationale) returning id into result;
 for x in select value from jsonb_array_elements(rows) loop
   insert into public.workout_exercises(workout_assignment_id,library_exercise_id,exercise_name,sets,reps,load,rest_seconds,notes,selection_reason,sort_order,prescription_details)
   values(result,(x->>'libraryExerciseId')::uuid,x->>'name',(x->>'sets')::smallint,(x->>'reps')::smallint,(x->>'load')::numeric,
     nullif((x->>'restSeconds')::smallint,0),x->>'notes',x->>'reason',n,x->'protocol');
   n:=n+1;
 end loop;
 update public.generated_prescriptions set status='assigned',final_prescription=rows,coach_modified=rows<>original_recommendation or workout_title<>title,
   estimated_duration_minutes=workout_duration_minutes,approved_at=now(),workout_assignment_id=result where id=p.id;
 return result;
end $$;

revoke all on function public.get_quality_generation_input(uuid),public.complete_quality_prescription(uuid,text,jsonb,jsonb),public.approve_quality_prescription(uuid,text,text,date,smallint,jsonb) from public,anon,authenticated;
grant execute on function public.get_quality_generation_input(uuid),public.complete_quality_prescription(uuid,text,jsonb,jsonb),public.approve_quality_prescription(uuid,text,text,date,smallint,jsonb) to authenticated;

create function private.enforce_quality_target() returns trigger language plpgsql security definer set search_path='' as $$
declare w public.workout_assignments%rowtype; latest uuid;
begin
 select * into strict w from public.workout_assignments where id=new.workout_assignment_id;
 if exists(select 1 from public.generated_prescriptions where id=w.source_prescription_id and engine_version like 'prescription-v0.4-%') then
   if new.prescription_details is null then raise exception 'Structured prescriptions cannot be flattened into fixed-set rows'; end if;
   if tg_op='UPDATE' and (new.prescription_details,new.library_exercise_id,new.sets,new.reps,new.load,new.rest_seconds) is not distinct from
     (old.prescription_details,old.library_exercise_id,old.sets,old.reps,old.load,old.rest_seconds) then return new; end if;
   select id into strict latest from public.client_intakes where organization_id=w.organization_id and client_user_id=w.client_user_id order by version desc limit 1;
   perform private.validate_quality_exercises(jsonb_build_array(jsonb_build_object('libraryExerciseId',new.library_exercise_id,'sets',new.sets,'reps',new.reps,
     'load',new.load,'restSeconds',new.rest_seconds,'protocol',new.prescription_details,'notes',new.notes,'reason',new.selection_reason)),w.organization_id,latest,false);
 end if;
 return new;
end $$;
create trigger enforce_quality_target before insert or update on public.workout_exercises for each row execute function private.enforce_quality_target();
revoke all on function private.enforce_quality_target() from public,anon,authenticated;

create function public.discard_incomplete_quality_draft(target_prescription_id uuid) returns void
language plpgsql security definer set search_path='' as $$
declare p public.generated_prescriptions%rowtype;
begin
 select * into strict p from public.generated_prescriptions where id=target_prescription_id for update;
 if (select auth.uid()) is null or p.coach_user_id<>(select auth.uid()) or not private.has_active_role(p.organization_id,array['coach']::public.organization_role[])
   or not private.can_manage_client_domain(p.organization_id,p.client_user_id) then raise exception 'Assigned Coach required'; end if;
 -- A lost response must never discard a successfully finalized or assigned draft.
 update public.generated_prescriptions set status='discarded' where id=p.id and status='draft' and engine_version='prescription-v0.2';
end $$;
revoke all on function public.discard_incomplete_quality_draft(uuid) from public,anon,authenticated;
grant execute on function public.discard_incomplete_quality_draft(uuid) to authenticated;
