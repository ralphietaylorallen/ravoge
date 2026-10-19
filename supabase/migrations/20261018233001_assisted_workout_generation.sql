-- Thin enrichment of the existing deterministic draft; no new workout system.
-- All data and writes remain scoped to the active assigned Coach and gym.
create function public.get_prescription_generation_input(target_prescription_id uuid)
returns jsonb language plpgsql stable security definer set search_path = ''
as $$
declare p public.generated_prescriptions%rowtype; i public.client_intakes%rowtype;
  ctx jsonb; payload jsonb; candidates jsonb; refs jsonb; history jsonb; body jsonb;
begin
  select * into strict p from public.generated_prescriptions where id=target_prescription_id;
  if (select auth.uid()) is null or p.coach_user_id<>(select auth.uid()) or p.status<>'draft'
    or not private.has_active_role(p.organization_id,array['coach']::public.organization_role[])
    or not private.can_manage_client_domain(p.organization_id,p.client_user_id)
  then raise exception 'An active assigned Coach is required'; end if;
  select * into strict i from public.client_intakes where organization_id=p.organization_id and client_user_id=p.client_user_id order by version desc limit 1;
  if i.id<>p.intake_id then raise exception 'Intake changed. Create a fresh workout.'; end if;
  ctx:=private.workout_generation_context(p.organization_id,p.client_user_id);
  if not coalesce((ctx->>'ready')::boolean,false) then raise exception 'Review intake safety and equipment first'; end if;
  -- Select only approved, active, currently compatible library entries.
  select coalesce(jsonb_agg(jsonb_build_object('id',e.id,'pattern',e.movement_pattern,
    'equipment',e.equipment_requirements,'difficulty',e.difficulty,'quality',e.primary_quality,
    'name',e.name) order by e.id),'[]') into candidates
  from (select l.* from public.exercise_library l
    where private.generation_exercise_compatible(l.id,i.id) order by l.id limit 80) e;
  -- Reviewed published revisions only. Raw imports and unresolved complex formats never enter the prompt.
  select coalesce(jsonb_agg(jsonb_build_object('id',r.id,'title',r.title,'revision',r.revision,
    'goal',r.primary_goal,'duration',r.duration_minutes,'exercises',r.exercises) order by r.id),'[]') into refs
  from (select review.* from public.training_library_reviews review
    join public.training_library_items item on item.id=review.training_item_id
    where review.organization_id=p.organization_id and review.status='published' and item.status='published'
      and review.primary_goal in (i.primary_goal,i.secondary_goal)
      and review.duration_minutes<=i.session_duration_minutes
      and review.revision=(select max(v.revision) from public.training_library_reviews v where v.training_item_id=item.id)
      and not exists(select 1 from jsonb_array_elements(review.exercises) x
        where not private.generation_exercise_compatible((x->>'libraryExerciseId')::uuid,i.id))
    order by (review.primary_goal=i.primary_goal) desc,review.reviewed_at desc limit 3) r;
  select coalesce(jsonb_agg(jsonb_build_object('status',w.status,'exercises',(
    select coalesce(jsonb_agg(jsonb_build_object('id',e.library_exercise_id,'sets',e.sets,'reps',e.reps,
      'load',e.load,'restSeconds',e.rest_seconds) order by e.sort_order),'[]')
    from public.workout_exercises e where e.workout_assignment_id=w.id)) order by w.scheduled_date,w.id),'[]') into history
  from (select * from public.workout_assignments where organization_id=p.organization_id and client_user_id=p.client_user_id
    and status in ('assigned','in_progress','completed') order by scheduled_date desc,id desc limit 5) w;
  select jsonb_build_object('weightKg',a.weight_kg,'bodyFatPercentage',a.body_fat_percentage,
    'skeletalMuscleMassKg',a.skeletal_muscle_mass_kg) into body
  from public.client_body_composition_assessments a where a.organization_id=p.organization_id and a.client_user_id=p.client_user_id
  order by a.measured_at desc,a.id desc limit 1;
  payload:=jsonb_build_object('intakeId',i.id,'goal',i.primary_goal,'secondaryGoal',i.secondary_goal,
    'experience',i.experience_level,'frequency',i.training_frequency_goal,'duration',i.session_duration_minutes,
    'targets',coalesce(i.custom_fields->'bodyCompositionGoals','{}'),'bodyComposition',coalesce(body,'{}'),
    'restrictions',jsonb_build_object('tags',i.constraint_tags,'hasInjuries',coalesce(trim(i.current_injuries),'')<>'',
      'hasPain',cardinality(i.pain_areas)>0,'hasLimitations',coalesce(trim(i.movement_limitations),'')<>'',
      'hasAvoidedExercises',cardinality(i.avoided_exercises||i.movements_to_avoid)>0,'coachReviewed',true),
    'equipment',coalesce((select jsonb_agg(distinct q.equipment_type order by q.equipment_type) from public.organization_equipment q where q.organization_id=p.organization_id and q.is_available),'[]'),
    'candidates',candidates,'references',refs,'history',history);
  return payload||jsonb_build_object('snapshot',md5(payload::text));
exception when no_data_found then raise exception 'This draft is not available to this Coach';
end;
$$;

create function public.complete_assisted_prescription(
  target_prescription_id uuid, expected_snapshot text, proposed_workout jsonb, generation_details jsonb
)
returns void language plpgsql security definer set search_path = ''
as $$
declare p public.generated_prescriptions%rowtype; current_input jsonb; fallback_ctx jsonb; x jsonb; e public.exercise_library%rowtype;
  normalized jsonb:='[]'; seen uuid[]:='{}'; latest_intake uuid; rpe numeric; total_sets integer:=0;
begin
  select * into strict p from public.generated_prescriptions where id=target_prescription_id for update;
  if (select auth.uid()) is null or p.coach_user_id<>(select auth.uid()) or p.status<>'draft'
    or p.engine_version<>'prescription-v0.2'
    or not private.has_active_role(p.organization_id,array['coach']::public.organization_role[])
    or not private.can_manage_client_domain(p.organization_id,p.client_user_id)
  then raise exception 'This draft is unavailable or already finalized'; end if;
  current_input:=public.get_prescription_generation_input(p.id);
  latest_intake:=(current_input->>'intakeId')::uuid;
  if proposed_workout is not null then
    if expected_snapshot is null or expected_snapshot<>current_input->>'snapshot' then raise exception 'Training inputs changed. Create a fresh workout.'; end if;
    if jsonb_typeof(proposed_workout)<>'object' or jsonb_typeof(proposed_workout->'exercises')<>'array'
      or jsonb_array_length(proposed_workout->'exercises') not between 3 and 8
      or char_length(trim(coalesce(proposed_workout->>'title',''))) not between 2 and 120
      or char_length(trim(coalesce(proposed_workout->>'rationale',''))) not between 2 and 2000
      or (proposed_workout->>'durationMinutes')::integer not between 20 and (current_input->>'duration')::integer
    then raise exception 'Invalid assisted workout'; end if;
    for x in select value from jsonb_array_elements(proposed_workout->'exercises') loop
      select * into strict e from public.exercise_library where id=(x->>'libraryExerciseId')::uuid;
      if e.id=any(seen) or not private.generation_exercise_compatible(e.id,latest_intake)
        or not exists(select 1 from jsonb_array_elements(current_input->'candidates') c where c->>'id'=e.id::text)
      then raise exception 'Exercise is not approved and compatible'; end if;
      rpe:=(x->>'targetRpe')::numeric;
      if (x->>'sets')::integer not between 1 and 4 or (x->>'reps')::integer not between 5 and 20
        or (x->>'restSeconds')::integer not between 30 and 300 or rpe not between 5 and 8
        or ((current_input->>'experience')='beginner' and ((x->>'sets')::integer>3 or rpe>7))
        or x->'load' is distinct from 'null'::jsonb
        or char_length(coalesce(x->>'notes',''))>1000 or char_length(coalesce(x->>'reason',''))>1000
        or x->>'sets' is null or x->>'reps' is null or x->>'restSeconds' is null or x->>'targetRpe' is null
      then raise exception 'Assisted exercise exceeds conservative programming limits'; end if;
      total_sets:=total_sets+(x->>'sets')::integer;
      seen:=array_append(seen,e.id);
      normalized:=normalized||jsonb_build_array(x||jsonb_build_object('name',e.name));
    end loop;
    if total_sets>24 then raise exception 'Assisted workout volume exceeds review limits'; end if;
    update public.generated_prescriptions set
      title=proposed_workout->>'title',rationale=proposed_workout->>'rationale',
      estimated_duration_minutes=(proposed_workout->>'durationMinutes')::smallint,
      original_recommendation=normalized,final_prescription=normalized,engine_version='prescription-v0.3-openai',
      generation_context=generation_context||jsonb_build_object('generationMethod','openai','rulesVersion','ravoge-reviewed-2026.1',
        'fallbackRecommendation',original_recommendation,'trainingSnapshot',current_input,
        'generationDetails',jsonb_build_object('model',left(generation_details->>'model',100)))
    where id=p.id;
  else
    -- Recompute the same deterministic fallback against current equipment and
    -- the same latest intake, rather than labeling an outdated plan safe.
    fallback_ctx:=private.workout_generation_context(p.organization_id,p.client_user_id);
    update public.generated_prescriptions set engine_version='prescription-v0.3-fallback',
      original_recommendation=fallback_ctx->'exercises',final_prescription=fallback_ctx->'exercises',
      source_training_review_id=(fallback_ctx->>'sourceReviewId')::uuid,
      title=coalesce(fallback_ctx->>'sourceTitle','Foundation '||initcap(replace(current_input->>'goal','_',' '))),
      rationale=format('Source: %s. Latest intake, actual equipment and reviewed restrictions checked. Coach approval required.',fallback_ctx->>'sourceType'),
      estimated_duration_minutes=coalesce((select duration_minutes from public.training_library_reviews where id=(fallback_ctx->>'sourceReviewId')::uuid),(current_input->>'duration')::smallint),
      generation_context=generation_context||fallback_ctx||jsonb_build_object('generationMethod','deterministic_fallback',
        'rulesVersion','ravoge-reviewed-2026.1','trainingSnapshot',current_input,
        'fallbackReason',case when generation_details->>'reason' in ('not_configured','invalid_output','timeout','unavailable') then generation_details->>'reason' else 'unavailable' end)
    where id=p.id;
  end if;
exception when no_data_found then raise exception 'This draft or exercise is unavailable';
end;
$$;

-- Keep duration edits and assignment atomic. Existing approval and safety triggers still run.
create function public.approve_reviewed_prescription(
  target_prescription_id uuid, workout_title text, workout_instructions text,
  workout_scheduled_date date, workout_duration_minutes smallint, exercises jsonb
)
returns uuid language plpgsql security definer set search_path = ''
as $$
declare p public.generated_prescriptions%rowtype;
begin
  select * into strict p from public.generated_prescriptions where id=target_prescription_id for update;
  if (select auth.uid()) is null or p.coach_user_id<>(select auth.uid()) or p.status<>'draft'
    or not private.has_active_role(p.organization_id,array['coach']::public.organization_role[])
    or not private.can_manage_client_domain(p.organization_id,p.client_user_id)
    or workout_duration_minutes is null or workout_duration_minutes not between 20 and 180
  then raise exception 'Review the draft and duration before assignment'; end if;
  if p.intake_id is distinct from (select id from public.client_intakes where organization_id=p.organization_id and client_user_id=p.client_user_id order by version desc limit 1)
    then raise exception 'Intake changed. Generate a fresh draft before approval'; end if;
  update public.generated_prescriptions set estimated_duration_minutes=workout_duration_minutes where id=p.id;
  return public.approve_generated_prescription_v0(p.id,workout_title,workout_instructions,workout_scheduled_date,exercises);
exception when no_data_found then raise exception 'This draft is unavailable';
end;
$$;

revoke all on function public.get_prescription_generation_input(uuid) from public,anon,authenticated;
revoke all on function public.complete_assisted_prescription(uuid,text,jsonb,jsonb) from public,anon,authenticated;
revoke all on function public.approve_reviewed_prescription(uuid,text,text,date,smallint,jsonb) from public,anon,authenticated;
grant execute on function public.get_prescription_generation_input(uuid) to authenticated;
grant execute on function public.complete_assisted_prescription(uuid,text,jsonb,jsonb) to authenticated;
grant execute on function public.approve_reviewed_prescription(uuid,text,text,date,smallint,jsonb) to authenticated;
