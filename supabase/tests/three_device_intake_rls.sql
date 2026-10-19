begin;

insert into auth.users (id,aud,role,email,encrypted_password,email_confirmed_at,raw_app_meta_data,raw_user_meta_data,created_at,updated_at) values
('d9100000-0000-4000-8000-000000000001','authenticated','authenticated','intake-repair-owner-a@example.test',crypt('TestPass123!',gen_salt('bf')),now(),'{}','{"full_name":"V1 Owner A"}',now(),now()),
('d9100000-0000-4000-8000-000000000002','authenticated','authenticated','intake-repair-coach-a1@example.test',crypt('TestPass123!',gen_salt('bf')),now(),'{}','{"full_name":"V1 Coach A1"}',now(),now()),
('d9100000-0000-4000-8000-000000000003','authenticated','authenticated','intake-repair-coach-a2@example.test',crypt('TestPass123!',gen_salt('bf')),now(),'{}','{"full_name":"V1 Coach A2"}',now(),now()),
('d9100000-0000-4000-8000-000000000004','authenticated','authenticated','intake-repair-client-a1@example.test',crypt('TestPass123!',gen_salt('bf')),now(),'{}','{"full_name":"V1 Client A1"}',now(),now()),
('d9100000-0000-4000-8000-000000000005','authenticated','authenticated','intake-repair-client-a2@example.test',crypt('TestPass123!',gen_salt('bf')),now(),'{}','{"full_name":"V1 Client A2"}',now(),now()),
('d9200000-0000-4000-8000-000000000001','authenticated','authenticated','intake-repair-owner-b@example.test',crypt('TestPass123!',gen_salt('bf')),now(),'{}','{"full_name":"V1 Owner B"}',now(),now()),
('d9200000-0000-4000-8000-000000000002','authenticated','authenticated','intake-repair-client-b@example.test',crypt('TestPass123!',gen_salt('bf')),now(),'{}','{"full_name":"V1 Client B"}',now(),now());

insert into public.organizations (id,name,timezone) values
('da900000-0000-4000-8000-000000000001','V1 Organization A','UTC'),
('db900000-0000-4000-8000-000000000001','V1 Organization B','UTC');
insert into public.organization_memberships (organization_id,user_id,role) values
('da900000-0000-4000-8000-000000000001','d9100000-0000-4000-8000-000000000001','owner'),
('da900000-0000-4000-8000-000000000001','d9100000-0000-4000-8000-000000000002','coach'),
('da900000-0000-4000-8000-000000000001','d9100000-0000-4000-8000-000000000003','coach'),
('da900000-0000-4000-8000-000000000001','d9100000-0000-4000-8000-000000000004','client'),
('da900000-0000-4000-8000-000000000001','d9100000-0000-4000-8000-000000000005','client'),
('db900000-0000-4000-8000-000000000001','d9200000-0000-4000-8000-000000000001','owner'),
('db900000-0000-4000-8000-000000000001','d9200000-0000-4000-8000-000000000002','client');
insert into public.coach_client_assignments (organization_id,coach_user_id,client_user_id)
values ('da900000-0000-4000-8000-000000000001','d9100000-0000-4000-8000-000000000003','d9100000-0000-4000-8000-000000000004');
insert into public.organization_hours (organization_id,day_of_week,is_closed,opens_at,closes_at,updated_by)
select 'da900000-0000-4000-8000-000000000001',day,false,'08:00','18:00','d9100000-0000-4000-8000-000000000001' from generate_series(0,6) day;
insert into public.organization_session_settings (organization_id,default_duration_minutes,permitted_durations,slot_increment_minutes,minimum_notice_minutes,maximum_advance_days,cancellation_cutoff_minutes,updated_by)
values ('da900000-0000-4000-8000-000000000001',60,array[30,60]::smallint[],30,0,30,0,'d9100000-0000-4000-8000-000000000001');
insert into public.coach_availability (organization_id,coach_user_id,day_of_week,starts_at,ends_at)
select 'da900000-0000-4000-8000-000000000001',coach,day,'09:00','17:00'
from (values ('d9100000-0000-4000-8000-000000000002'::uuid),('d9100000-0000-4000-8000-000000000003'::uuid)) coaches(coach)
cross join generate_series(0,6) day;


set local role authenticated;
select set_config('request.jwt.claim.sub','d9100000-0000-4000-8000-000000000003',true);
do $$ declare saved_intake_id uuid; payload jsonb := '{"trainingFrequencyGoal":3,"primaryGoal":"body_recomposition","secondaryGoal":"fat_loss","trainingYears":2,"experienceLevel":"intermediate","recentConsistency":"building","preferredTrainingDays":[],"painAreas":[],"movementsToAvoid":[],"strengthBaseline":3,"conditioningBaseline":3,"mobilityBaseline":3,"assessmentScores":{},"sleepQuality":3,"stressLevel":3,"recoveryPerception":3,"sorenessFatigue":3,"preferredExercises":[],"avoidedExercises":[],"sessionDurationMinutes":60,"constraintTags":[],"customFields":{"bodyCompositionGoals":{"weightKg":80,"bodyFatPercentage":18,"skeletalMuscleMassKg":36}}}'; baseline jsonb := '{"squatVariation":"back_squat","squatLoadKg":80,"squatReps":3,"squatOneRmKg":88,"squatOneRmMethod":"estimated","benchVariation":"Barbell Bench Press","benchLoadKg":60,"benchReps":3,"benchOneRmKg":66,"benchOneRmMethod":"estimated","pullupStrictReps":4,"pullupMode":"bodyweight","rowerDistanceM":2000,"rowerTimeSeconds":495}'; inbody jsonb := jsonb_build_object('status','completed','testDate',current_date::text,'weightKg',85,'bodyFatPercentage',24,'skeletalMuscleMassKg',33); begin
  saved_intake_id := public.save_client_intake_v1('d9100000-0000-4000-8000-000000000004',payload,baseline,inbody);
  if not exists(select 1 from public.client_intakes where id=saved_intake_id and primary_goal='body_recomposition' and custom_fields->'bodyCompositionGoals'->>'skeletalMuscleMassKg'='36') then raise exception 'Goal targets not saved with versioned intake'; end if;
  if not exists(select 1 from public.client_body_composition_assessments assessment where assessment.intake_id=saved_intake_id and weight_kg=85 and body_fat_percentage=24 and skeletal_muscle_mass_kg=33 and bmi is null and inbody_score is null) then raise exception 'Three primary measurements did not save without optional measurements'; end if;
  payload := jsonb_set(payload,'{customFields}','{}');
  perform public.save_client_intake_v1('d9100000-0000-4000-8000-000000000004',payload,baseline,inbody);
  if (select count(*) from public.client_intakes where client_user_id='d9100000-0000-4000-8000-000000000004')<>2 or (select count(*) from public.client_body_composition_assessments where client_user_id='d9100000-0000-4000-8000-000000000004')<>2 then raise exception 'Assessment history was overwritten'; end if;
  payload := jsonb_set(payload,'{customFields}','{"bodyCompositionGoals":{"weightKg":-2}}');
  begin perform public.save_client_intake_v1('d9100000-0000-4000-8000-000000000004',payload,baseline,inbody); raise exception 'Negative target accepted'; exception when check_violation then null; end;
  payload := jsonb_set(payload,'{customFields}','{"bodyCompositionGoals":{"weightKg":60,"skeletalMuscleMassKg":80}}');
  begin perform public.save_client_intake_v1('d9100000-0000-4000-8000-000000000004',payload,baseline,inbody); raise exception 'Impossible target accepted'; exception when check_violation then null; end;
  payload := jsonb_set(payload,'{customFields}','{"bodyCompositionGoals":{"bodyFatPercentage":"bad"}}');
  begin perform public.save_client_intake_v1('d9100000-0000-4000-8000-000000000004',payload,baseline,inbody); raise exception 'Text target accepted'; exception when check_violation then null; end;
  payload := jsonb_set(payload,'{customFields}','{}');
  begin perform public.save_client_intake_v1('d9100000-0000-4000-8000-000000000004',payload,baseline,inbody-'skeletalMuscleMassKg'); raise exception 'Incomplete current measurements accepted'; exception when raise_exception then if sqlerrm='Incomplete current measurements accepted' then raise; end if; end;
  if (select count(*) from public.client_intakes where client_user_id='d9100000-0000-4000-8000-000000000004')<>2 then raise exception 'Invalid submission left partial intake version'; end if;
end $$;
reset role; set local role authenticated;
select set_config('request.jwt.claim.sub','d9100000-0000-4000-8000-000000000004',true);
do $$ begin
  if (select count(*) from public.client_body_composition_assessments)<>2 then raise exception 'Client cannot read own history'; end if;
  begin perform public.save_client_intake_v1('d9100000-0000-4000-8000-000000000004','{}','{}','{"status":"pending"}'); raise exception 'Client used Coach intake write'; exception when others then if sqlerrm='Client used Coach intake write' then raise; end if; end;
end $$;
reset role; set local role authenticated;
select set_config('request.jwt.claim.sub','d9100000-0000-4000-8000-000000000005',true);
do $$ begin if exists(select 1 from public.client_body_composition_assessments) then raise exception 'Other Client read assessment history'; end if; end $$;
reset role; set local role authenticated;
select set_config('request.jwt.claim.sub','d9200000-0000-4000-8000-000000000001',true);
do $$ begin if exists(select 1 from public.client_intakes) or exists(select 1 from public.client_body_composition_assessments) then raise exception 'Other organization read intake data'; end if; end $$;
rollback;
