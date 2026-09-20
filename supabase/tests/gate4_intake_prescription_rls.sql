begin;

create temporary table gate4_test_prescriptions (
  id uuid primary key,
  kind text not null unique
) on commit drop;
grant select, insert on gate4_test_prescriptions to authenticated;

insert into auth.users (
  id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at
) values
  ('61000000-0000-0000-0000-000000000001', 'authenticated', 'authenticated', 'gate4-owner-a@example.test', crypt('TestPass123!', gen_salt('bf')), now(), '{"provider":"email","providers":["email"]}', '{"full_name":"Gate 4 Owner A"}', now(), now()),
  ('61000000-0000-0000-0000-000000000002', 'authenticated', 'authenticated', 'gate4-coach-a@example.test', crypt('TestPass123!', gen_salt('bf')), now(), '{"provider":"email","providers":["email"]}', '{"full_name":"Gate 4 Coach A"}', now(), now()),
  ('61000000-0000-0000-0000-000000000003', 'authenticated', 'authenticated', 'gate4-client-a@example.test', crypt('TestPass123!', gen_salt('bf')), now(), '{"provider":"email","providers":["email"]}', '{"full_name":"Gate 4 Client A"}', now(), now()),
  ('61000000-0000-0000-0000-000000000004', 'authenticated', 'authenticated', 'gate4-unassigned-a@example.test', crypt('TestPass123!', gen_salt('bf')), now(), '{"provider":"email","providers":["email"]}', '{"full_name":"Gate 4 Unassigned Coach"}', now(), now()),
  ('62000000-0000-0000-0000-000000000001', 'authenticated', 'authenticated', 'gate4-owner-b@example.test', crypt('TestPass123!', gen_salt('bf')), now(), '{"provider":"email","providers":["email"]}', '{"full_name":"Gate 4 Owner B"}', now(), now()),
  ('62000000-0000-0000-0000-000000000002', 'authenticated', 'authenticated', 'gate4-coach-b@example.test', crypt('TestPass123!', gen_salt('bf')), now(), '{"provider":"email","providers":["email"]}', '{"full_name":"Gate 4 Coach B"}', now(), now()),
  ('62000000-0000-0000-0000-000000000003', 'authenticated', 'authenticated', 'gate4-client-b@example.test', crypt('TestPass123!', gen_salt('bf')), now(), '{"provider":"email","providers":["email"]}', '{"full_name":"Gate 4 Client B"}', now(), now());

insert into public.organizations (id, name) values
  ('c1000000-0000-0000-0000-000000000001', 'Gate 4 Organization A'),
  ('c2000000-0000-0000-0000-000000000001', 'Gate 4 Organization B');

insert into public.organization_memberships (organization_id, user_id, role) values
  ('c1000000-0000-0000-0000-000000000001', '61000000-0000-0000-0000-000000000001', 'owner'),
  ('c1000000-0000-0000-0000-000000000001', '61000000-0000-0000-0000-000000000002', 'coach'),
  ('c1000000-0000-0000-0000-000000000001', '61000000-0000-0000-0000-000000000003', 'client'),
  ('c1000000-0000-0000-0000-000000000001', '61000000-0000-0000-0000-000000000004', 'coach'),
  ('c2000000-0000-0000-0000-000000000001', '62000000-0000-0000-0000-000000000001', 'owner'),
  ('c2000000-0000-0000-0000-000000000001', '62000000-0000-0000-0000-000000000002', 'coach'),
  ('c2000000-0000-0000-0000-000000000001', '62000000-0000-0000-0000-000000000003', 'client');

insert into public.coach_client_assignments (organization_id, coach_user_id, client_user_id) values
  ('c1000000-0000-0000-0000-000000000001', '61000000-0000-0000-0000-000000000002', '61000000-0000-0000-0000-000000000003'),
  ('c2000000-0000-0000-0000-000000000001', '62000000-0000-0000-0000-000000000002', '62000000-0000-0000-0000-000000000003');

-- Owner equipment is isolated by organization and becomes the engine's hard filter.
set local role authenticated;
select set_config('request.jwt.claim.sub', '61000000-0000-0000-0000-000000000001', true);
select set_config('request.jwt.claims', '{"sub":"61000000-0000-0000-0000-000000000001","role":"authenticated"}', true);
insert into public.organization_equipment (organization_id, equipment_type, name, quantity, created_by) values
  ('c1000000-0000-0000-0000-000000000001', 'barbell', 'Training barbells', 4, '61000000-0000-0000-0000-000000000001'),
  ('c1000000-0000-0000-0000-000000000001', 'plates', 'Iron plates', 20, '61000000-0000-0000-0000-000000000001'),
  ('c1000000-0000-0000-0000-000000000001', 'squat_rack', 'Squat racks', 3, '61000000-0000-0000-0000-000000000001'),
  ('c1000000-0000-0000-0000-000000000001', 'bench', 'Flat benches', 4, '61000000-0000-0000-0000-000000000001'),
  ('c1000000-0000-0000-0000-000000000001', 'dumbbells', 'Dumbbell set', 1, '61000000-0000-0000-0000-000000000001'),
  ('c1000000-0000-0000-0000-000000000001', 'bands', 'Resistance bands', 12, '61000000-0000-0000-0000-000000000001'),
  ('c1000000-0000-0000-0000-000000000001', 'cardio_equipment', 'Air bikes', 4, '61000000-0000-0000-0000-000000000001');
do $$ begin
  if (select count(*) from public.organization_equipment) <> 7 then
    raise exception 'Owner cannot read intended equipment';
  end if;
end $$;

-- Assigned coach can create versioned intake and deterministic state.
select set_config('request.jwt.claim.sub', '61000000-0000-0000-0000-000000000002', true);
select set_config('request.jwt.claims', '{"sub":"61000000-0000-0000-0000-000000000002","role":"authenticated"}', true);
select public.upsert_client_intake(
  '61000000-0000-0000-0000-000000000003',
  '{
    "birthYear":"1990","trainingFrequencyGoal":3,"primaryGoal":"strength","secondaryGoal":"",
    "trainingYears":2,"experienceLevel":"intermediate","recentConsistency":"building",
    "preferredTrainingDays":["Monday","Wednesday","Friday"],"currentInjuries":"",
    "movementLimitations":"Knee flexion currently limited","painAreas":["left knee"],
    "movementsToAvoid":["deep knee flexion"],"medicalCoachNotes":"Monitor symptoms",
    "strengthBaseline":"","conditioningBaseline":"","mobilityBaseline":"",
    "assessmentScores":{},"sleepQuality":3,"stressLevel":4,"recoveryPerception":3,
    "sorenessFatigue":3,"preferredExercises":["Romanian deadlift"],"avoidedExercises":[],
    "sessionDurationMinutes":60,"coachNotes":"Start conservatively",
    "constraintTags":["knee_flexion"],"customFields":{}
  }'::jsonb
);
select public.upsert_client_intake(
  '61000000-0000-0000-0000-000000000003',
  '{
    "birthYear":"1990","trainingFrequencyGoal":3,"primaryGoal":"strength","secondaryGoal":"",
    "trainingYears":2,"experienceLevel":"intermediate","recentConsistency":"building",
    "preferredTrainingDays":["Monday","Wednesday","Friday"],"currentInjuries":"",
    "movementLimitations":"Knee flexion currently limited","painAreas":["left knee"],
    "movementsToAvoid":["deep knee flexion"],"medicalCoachNotes":"Monitor symptoms",
    "strengthBaseline":"","conditioningBaseline":"","mobilityBaseline":"",
    "assessmentScores":{},"sleepQuality":3,"stressLevel":4,"recoveryPerception":3,
    "sorenessFatigue":3,"preferredExercises":["Romanian deadlift"],"avoidedExercises":[],
    "sessionDurationMinutes":60,"coachNotes":"Start conservatively",
    "constraintTags":["knee_flexion"],"customFields":{}
  }'::jsonb
);
do $$
declare first_state public.client_states%rowtype; second_state public.client_states%rowtype;
begin
  select state.* into first_state from public.client_states state join public.client_intakes intake on intake.id = state.intake_id where intake.version = 1 and intake.client_user_id = '61000000-0000-0000-0000-000000000003';
  select state.* into second_state from public.client_states state join public.client_intakes intake on intake.id = state.intake_id where intake.version = 2 and intake.client_user_id = '61000000-0000-0000-0000-000000000003';
  if first_state.training_experience <> second_state.training_experience
    or first_state.recovery_capacity <> second_state.recovery_capacity
    or first_state.volume_tolerance <> second_state.volume_tolerance then
    raise exception 'Identical intake did not produce deterministic state';
  end if;
  if second_state.confidence ->> 'overall' <> 'low' then
    raise exception 'Missing baselines did not preserve low confidence';
  end if;
  if second_state.movement_tolerance >= 0.55 then
    raise exception 'Movement constraints did not reduce tolerance';
  end if;
end $$;

-- Same state and equipment produce the same safe recommendation.
insert into gate4_test_prescriptions (id, kind) values
  (public.generate_initial_prescription_v0('61000000-0000-0000-0000-000000000003'), 'strength-1'),
  (public.generate_initial_prescription_v0('61000000-0000-0000-0000-000000000003'), 'strength-2');
do $$
declare first_recommendation jsonb; second_recommendation jsonb;
begin
  select prescription.original_recommendation into first_recommendation
  from public.generated_prescriptions prescription
  join gate4_test_prescriptions test on test.id = prescription.id
  where test.kind = 'strength-1';
  select prescription.original_recommendation into second_recommendation
  from public.generated_prescriptions prescription
  join gate4_test_prescriptions test on test.id = prescription.id
  where test.kind = 'strength-2';
  if first_recommendation <> second_recommendation then raise exception 'Prescription output is not deterministic'; end if;
  if first_recommendation @? '$[*] ? (@.name == "Back Squat" || @.name == "Goblet Squat" || @.name == "Leg Press")' then
    raise exception 'Knee-flexion constraint did not exclude contraindicated exercises';
  end if;
  if first_recommendation @? '$[*] ? (@.name == "Seated Row")' then
    raise exception 'Unavailable cable equipment did not alter exercise selection';
  end if;
  if not first_recommendation @? '$[*] ? (@.name == "Band Row")' then
    raise exception 'Available equipment substitution was not selected';
  end if;
end $$;

-- The primary goal changes the V0 allocation without changing tenant context.
select public.upsert_client_intake(
  '61000000-0000-0000-0000-000000000003',
  '{
    "birthYear":"1990","trainingFrequencyGoal":3,"primaryGoal":"conditioning","secondaryGoal":"general_fitness",
    "trainingYears":2,"experienceLevel":"intermediate","recentConsistency":"building",
    "preferredTrainingDays":["Monday","Wednesday","Friday"],"currentInjuries":"",
    "movementLimitations":"","painAreas":[],"movementsToAvoid":[],"medicalCoachNotes":"",
    "strengthBaseline":3,"conditioningBaseline":3,"mobilityBaseline":3,
    "assessmentScores":{},"sleepQuality":4,"stressLevel":2,"recoveryPerception":4,
    "sorenessFatigue":2,"preferredExercises":["Bike Conditioning"],"avoidedExercises":[],
    "sessionDurationMinutes":45,"coachNotes":"Conditioning emphasis",
    "constraintTags":[],"customFields":{}
  }'::jsonb
);
insert into gate4_test_prescriptions (id, kind) values
  (public.generate_initial_prescription_v0('61000000-0000-0000-0000-000000000003'), 'conditioning');
do $$
declare strength_recommendation jsonb; conditioning_recommendation jsonb;
begin
  select prescription.original_recommendation into strength_recommendation
  from public.generated_prescriptions prescription
  join gate4_test_prescriptions test on test.id = prescription.id
  where test.kind = 'strength-1';
  select prescription.original_recommendation into conditioning_recommendation
  from public.generated_prescriptions prescription
  join gate4_test_prescriptions test on test.id = prescription.id
  where test.kind = 'conditioning';
  if conditioning_recommendation = strength_recommendation then
    raise exception 'Primary goal did not affect prescription output';
  end if;
  if not conditioning_recommendation @? '$[*] ? (@.name == "Bike Conditioning")' then
    raise exception 'Conditioning goal did not allocate available conditioning work';
  end if;
end $$;

-- Client reads only their own intake/state and cannot see draft recommendations.
select set_config('request.jwt.claim.sub', '61000000-0000-0000-0000-000000000003', true);
select set_config('request.jwt.claims', '{"sub":"61000000-0000-0000-0000-000000000003","role":"authenticated"}', true);
do $$ begin
  if (select count(*) from public.client_intakes) <> 3 then raise exception 'Client cannot read own intake versions'; end if;
  if (select count(*) from public.client_states) <> 3 then raise exception 'Client cannot read own state'; end if;
  if exists (select 1 from public.generated_prescriptions) then raise exception 'Client can read unapproved recommendation'; end if;
  begin
    perform public.generate_initial_prescription_v0('61000000-0000-0000-0000-000000000003');
    raise exception 'Client generated a prescription';
  exception when others then
    if sqlerrm = 'Client generated a prescription' then raise; end if;
  end;
end $$;

-- Unassigned and cross-organization coaches cannot access or generate.
select set_config('request.jwt.claim.sub', '61000000-0000-0000-0000-000000000004', true);
select set_config('request.jwt.claims', '{"sub":"61000000-0000-0000-0000-000000000004","role":"authenticated"}', true);
do $$ begin
  if exists (select 1 from public.client_intakes) then raise exception 'Unassigned coach can read intake'; end if;
  begin
    perform public.upsert_client_intake('61000000-0000-0000-0000-000000000003', '{}'::jsonb);
    raise exception 'Unassigned coach created intake';
  exception when others then if sqlerrm = 'Unassigned coach created intake' then raise; end if; end;
end $$;
select set_config('request.jwt.claim.sub', '62000000-0000-0000-0000-000000000002', true);
select set_config('request.jwt.claims', '{"sub":"62000000-0000-0000-0000-000000000002","role":"authenticated"}', true);
do $$ begin
  if exists (select 1 from public.client_intakes) then raise exception 'Organization B can read Organization A intake'; end if;
  begin
    perform public.generate_initial_prescription_v0('61000000-0000-0000-0000-000000000003');
    raise exception 'Cross-organization prescription generation succeeded';
  exception when others then if sqlerrm = 'Cross-organization prescription generation succeeded' then raise; end if; end;
end $$;

-- Assigned coach edits and approves while original recommendation stays intact.
select set_config('request.jwt.claim.sub', '61000000-0000-0000-0000-000000000002', true);
select set_config('request.jwt.claims', '{"sub":"61000000-0000-0000-0000-000000000002","role":"authenticated"}', true);
do $$
declare target_id uuid; original jsonb; edited jsonb; workout_id uuid; original_after jsonb;
begin
  select prescription.id, prescription.original_recommendation into target_id, original
  from public.generated_prescriptions prescription
  join gate4_test_prescriptions test on test.id = prescription.id
  where test.kind = 'strength-1';
  edited := jsonb_set(original, '{0,sets}', '2'::jsonb);
  workout_id := public.approve_generated_prescription_v0(
    target_id, 'Coach Reviewed Foundation', 'Coach approved after review.', current_date, edited
  );
  select original_recommendation into original_after from public.generated_prescriptions where id = target_id;
  if original_after <> original then raise exception 'Original recommendation metadata was overwritten'; end if;
  if not exists (select 1 from public.generated_prescriptions where id = target_id and status = 'assigned' and coach_modified and workout_assignment_id = workout_id) then
    raise exception 'Coach-edited prescription was not persisted and linked';
  end if;
  if (select count(*) from public.workout_sets sets join public.workout_exercises exercise on exercise.id = sets.workout_exercise_id where exercise.workout_assignment_id = workout_id)
    <> (select sum((item ->> 'sets')::integer) from jsonb_array_elements(edited) item) then
    raise exception 'Prescribed set foundation was not created';
  end if;
end $$;

rollback;
