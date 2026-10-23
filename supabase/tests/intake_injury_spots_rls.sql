-- Synthetic users only; transaction rollback. Run on the isolated preview DB.
begin;
create function pg_temp.assert_spot(value boolean,message text) returns void language plpgsql as $$ begin if value is distinct from true then raise exception '%',message; end if; end $$;
insert into auth.users(id,aud,role,email,email_confirmed_at,raw_app_meta_data,raw_user_meta_data,created_at,updated_at)
select ('cf100000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid,'authenticated','authenticated','injury-qa-'||n||'@example.test',now(),'{}','{}',now(),now() from generate_series(1,6) n;
insert into public.organizations(id,name) values('cf200000-0000-4000-8000-000000000001','Isolated intake A'),('cf200000-0000-4000-8000-000000000002','Isolated intake B');
insert into public.organization_memberships(organization_id,user_id,role)
select ('cf200000-0000-4000-8000-'||case when n<=3 then '000000000001' else '000000000002' end)::uuid,('cf100000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid,
 case n%3 when 1 then 'owner'::public.organization_role when 2 then 'coach'::public.organization_role else 'client'::public.organization_role end from generate_series(1,6) n;
insert into public.coach_client_assignments(organization_id,coach_user_id,client_user_id) values('cf200000-0000-4000-8000-000000000001','cf100000-0000-4000-8000-000000000002','cf100000-0000-4000-8000-000000000003');
create function pg_temp.spot(sid uuid,region text,pain integer) returns jsonb language sql as $$
 select jsonb_build_object('id',sid,'region',region,'side','left','view','front','categories',jsonb_build_array('surgery','long_term'),
  'onset','Several years ago','sensation','','pain',pain,'occurrence','[]'::jsonb,'triggers','','limitations','Avoid loaded flexion',
  'clinicianInstructions','unsure','clinicianDetails','','notes','','surgeryRepair','Ligament repair','surgeryWhen','Several years ago','postoperativeRestrictions','Unknown')
$$;
set local role authenticated;
select set_config('request.jwt.claim.sub','cf100000-0000-4000-8000-000000000002',true);
select public.save_client_injury_spot('cf100000-0000-4000-8000-000000000003',pg_temp.spot('cf300000-0000-4000-8000-000000000001','knee',0),false);
select public.save_client_injury_spot('cf100000-0000-4000-8000-000000000003',pg_temp.spot('cf300000-0000-4000-8000-000000000002','shoulder',null),false);
select pg_temp.assert_spot((select count(*)=2 from public.client_injury_spots),'Independent spots saved');
select pg_temp.assert_spot((select details->>'pain'='0' and details->'categories'?'surgery' from public.client_injury_spots where id='cf300000-0000-4000-8000-000000000001'),'Zero pain must preserve surgery');
select public.save_client_injury_spot('cf100000-0000-4000-8000-000000000003',pg_temp.spot('cf300000-0000-4000-8000-000000000001','knee',1),false);
select pg_temp.assert_spot((select details->'pain'='null'::jsonb and revision=1 from public.client_injury_spots where id='cf300000-0000-4000-8000-000000000002'),'Editing knee cannot overwrite unknown shoulder');
select pg_temp.assert_spot((select count(*)=3 from public.client_injury_spot_history),'Every successful save retains history');
do $$ begin
 begin perform public.save_client_injury_spot('cf100000-0000-4000-8000-000000000003',pg_temp.spot('cf300000-0000-4000-8000-000000000001','knee',11),false); raise exception 'Invalid pain accepted'; exception when others then if sqlerrm='Invalid pain accepted' then raise; end if; end;
 begin update public.client_injury_spots set details='{}'; raise exception 'Direct write accepted'; exception when insufficient_privilege then null; end;
end $$;
select set_config('request.jwt.claim.sub','cf100000-0000-4000-8000-000000000003',true);
select pg_temp.assert_spot((select count(*)=2 from public.client_injury_spots),'Client sees own history');
do $$ begin
 begin perform public.save_client_injury_spot('cf100000-0000-4000-8000-000000000003',pg_temp.spot('cf300000-0000-4000-8000-000000000003','knee',0),false); raise exception 'Client changed protected history'; exception when no_data_found then null; end;
end $$;
select set_config('request.jwt.claim.sub','cf100000-0000-4000-8000-000000000001',true);
select pg_temp.assert_spot((select count(*)=2 from public.client_injury_spots),'Own gym Owner oversight');
select set_config('request.jwt.claim.sub','cf100000-0000-4000-8000-000000000004',true);
select pg_temp.assert_spot((select count(*)=0 from public.client_injury_spots),'Other gym Owner cannot read');
select pg_temp.assert_spot((select count(*)=0 from public.client_injury_spot_history),'Other gym Owner cannot read historical medical details');
select set_config('request.jwt.claim.sub','cf100000-0000-4000-8000-000000000005',true);
do $$ begin
 begin perform public.save_client_injury_spot('cf100000-0000-4000-8000-000000000003',pg_temp.spot('cf300000-0000-4000-8000-000000000001','knee',0),false); raise exception 'Unassigned Coach edited'; exception when no_data_found then null; end;
end $$;
select set_config('request.jwt.claim.sub','cf100000-0000-4000-8000-000000000002',true);
select public.save_client_injury_spot('cf100000-0000-4000-8000-000000000003',jsonb_build_object('id','cf300000-0000-4000-8000-000000000001'),true);
select pg_temp.assert_spot((select count(*)=4 from public.client_injury_spot_history),'Removal preserves original surgical records');
select public.save_client_injury_spot('cf100000-0000-4000-8000-000000000003',jsonb_build_object('id','cf300000-0000-4000-8000-000000000002'),true);
select set_config('request.jwt.claim.sub','cf100000-0000-4000-8000-000000000001',true);
select public.add_equipment_checklist(array['dumbbells','bands']);
select public.import_training_library_rows('synthetic-intake.csv','csv',jsonb_build_array(jsonb_build_object('rowNumber',1,'title','Synthetic gym example','cells',jsonb_build_array(jsonb_build_object('header','Description','display','Goblet Squat; Band Row; Dead Bug','raw','Original values must remain untouched')))));
select set_config('request.jwt.claim.sub','cf100000-0000-4000-8000-000000000002',true);
do $$ declare i uuid; p uuid; input jsonb; rows jsonb; audit jsonb; details jsonb; proposed jsonb; ref text;
begin
 i:=public.save_client_intake_v1('cf100000-0000-4000-8000-000000000003',
  '{"birthYear":1990,"trainingFrequencyGoal":3,"primaryGoal":"fat_loss","secondaryGoal":"","trainingYears":null,"experienceLevel":"intermediate","recentConsistency":"building","sessionDurationMinutes":45,"sleepQuality":3,"stressLevel":3,"recoveryPerception":3,"sorenessFatigue":3,"customFields":{"bodyCompositionGoals":{},"intakeContext":{"version":2,"age":35,"recentWorkoutDays":2,"currentWeightLb":null,"sleepHours":7,"success":"Move comfortably","noInjuryReport":true}}}',
  '{"squatVariation":"back_squat","squatOneRmMethod":"not_tested","benchVariation":"Barbell Bench Press","benchOneRmMethod":"not_tested","pullupStrictReps":0,"pullupMode":"bodyweight","rowerDistanceM":500,"rowerTimeSeconds":120}', '{"status":"pending"}');
 perform public.confirm_intake_generation_safety(i);
 p:=public.generate_initial_prescription_v0('cf100000-0000-4000-8000-000000000003'); input:=public.get_pound_generation_input(p);
 perform pg_temp.assert_spot(input->'intakeContext'->>'success'='Move comfortably' and input->'intakeContext'->'currentWeightLb'='null'::jsonb,'Full saved context and unknown weight reach generation');
 perform pg_temp.assert_spot(jsonb_array_length(input->'injurySpots')=0 and input->'intakeAssessment'->'strengthAssessments' is not null,'Saved assessments are included after individually removed spots');
 select input->'knowledgeCatalog'->0->>'id' into ref;
 perform pg_temp.assert_spot(jsonb_array_length(input->'knowledgeCatalog'->0->'segments')=1,'Actual source-cell provenance supplied');
 select jsonb_agg(jsonb_build_object('libraryExerciseId',id,'sets',3,'reps',8,'restSeconds',120,'load',null,'loadUnit','lb','notes','Controlled technique','reason','Adapted gym movement',
  'protocol',jsonb_build_object('block','strength','format','straight','group','','measurement','reps','workSeconds',null,'distance',null,'distanceUnit','meters','intervalSeconds',null,'blockDurationSeconds',null,'percentageLoad',null,'perSide',false,'targetRpe',6,'substitutionIds','[]'::jsonb)) order by slug)
 into rows from public.exercise_library where organization_id is null and slug in ('goblet-squat','band-row','dead-bug');
 select jsonb_build_object('version',1,'rows',jsonb_agg(jsonb_build_object('exerciseId',x->>'libraryExerciseId','referenceId',ref,'segmentKey','cell_1','adaptation','Reduced complexity for the saved intake','substitutionReason','','evidenceIds','[]'::jsonb))) into audit from jsonb_array_elements(rows) x;
 -- SQL fixtures verify validation, not actual provider retrieval or medical guidance.
 details:=jsonb_build_object('model','mock-sql-contract-only','provenanceAudit',audit,'evidence',jsonb_build_object('version','retrieved-v1','cacheHit',false,'sources',jsonb_build_array(jsonb_build_object('id','evidence_1','url','https://acsm.org/education/','title','Synthetic SQL validation fixture only','retrievedAt',now(),'recommendations',jsonb_build_array('Fixture recommendation'),'limitations',jsonb_build_array('Not a live evidence test'),'applicability','Synthetic adult test population only')))));
 proposed:=jsonb_build_object('title','Isolated new-intake contract','rationale','Synthetic SQL-only source and intake validation fixture.','durationMinutes',30,'exercises',rows);
 begin perform public.complete_pound_prescription(p,input->>'snapshot',proposed,jsonb_set(details,'{provenanceAudit,rows,0,segmentKey}','"invented_segment"')); raise exception 'Fake segment accepted'; exception when raise_exception then if sqlerrm='Fake segment accepted' then raise; end if; end;
 begin perform public.complete_pound_prescription(p,input->>'snapshot',proposed,jsonb_set(details,'{provenanceAudit,rows,0,evidenceIds}','["fake_citation"]')); raise exception 'Fake citation accepted'; exception when raise_exception then if sqlerrm='Fake citation accepted' then raise; end if; end;
 perform public.complete_pound_prescription(p,input->>'snapshot',proposed,details);
 perform pg_temp.assert_spot((select generation_context->'provenanceAudit'->>'gymPercentage'='100.0' and status='draft' from public.generated_prescriptions where id=p),'Valid source audit persists and never auto-assigns');
 perform public.save_client_injury_spot('cf100000-0000-4000-8000-000000000003',pg_temp.spot('cf300000-0000-4000-8000-000000000003','knee',0),false);
 perform pg_temp.assert_spot((public.get_workout_generation_readiness('cf100000-0000-4000-8000-000000000003')->>'needsSafetyReview')::boolean,'New zero-pain surgery invalidates safety approval');
 begin perform public.approve_pound_prescription(p,'Do not assign','',current_date,30::smallint,rows); raise exception 'Stale injury draft assigned'; exception when raise_exception then if sqlerrm='Stale injury draft assigned' then raise; end if; end;
 perform pg_temp.assert_spot((select generation_context->>'intakeReviewRequired'='true' and status='draft' from public.generated_prescriptions where id=p),'Affected draft is flagged without changing an assignment');
end $$;
reset role;
update public.organization_memberships set status='inactive' where organization_id='cf200000-0000-4000-8000-000000000001' and user_id='cf100000-0000-4000-8000-000000000002';
set local role authenticated;
select pg_temp.assert_spot((select count(*)=0 from public.client_injury_spots),'Inactive Coach loses access with existing identity');
select 'Injury spot history and ordinary-role RLS checks passed' as result;
rollback;
