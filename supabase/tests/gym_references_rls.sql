begin;
create function pg_temp.assert_reference(value boolean,message text) returns void language plpgsql as $$ begin if value is distinct from true then raise exception '%',message; end if; end $$;
insert into auth.users(id,aud,role,email,email_confirmed_at,raw_app_meta_data,raw_user_meta_data,created_at,updated_at)
select ('be100000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid,'authenticated','authenticated','reference-rls-'||n||'@example.test',now(),'{}','{}',now(),now() from generate_series(1,6) n;
insert into public.organizations(id,name) values('be200000-0000-4000-8000-000000000001','Raw reference A'),('be200000-0000-4000-8000-000000000002','Raw reference B');
insert into public.organization_memberships(organization_id,user_id,role)
select ('be200000-0000-4000-8000-'||case when n<=3 then '000000000001' else '000000000002' end)::uuid,('be100000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid,
 case n%3 when 1 then 'owner'::public.organization_role when 2 then 'coach'::public.organization_role else 'client'::public.organization_role end from generate_series(1,6) n;
insert into public.coach_client_assignments(organization_id,coach_user_id,client_user_id) values('be200000-0000-4000-8000-000000000001','be100000-0000-4000-8000-000000000002','be100000-0000-4000-8000-000000000003');
create temporary table reference_test(kind text primary key,value text); grant all on reference_test to authenticated;
set local role authenticated;
select set_config('request.jwt.claim.sub','be100000-0000-4000-8000-000000000001',true);
select public.add_equipment_checklist(array['dumbbells','bands']);
select public.import_training_library_rows('synthetic-raw.csv','csv',(select jsonb_agg(jsonb_build_object('rowNumber',n,'title','Raw reference '||n,'cells',jsonb_build_array(
 jsonb_build_object('header','Description','display','Goblet Squat; Band Row; Dead Bug. EMOM stations per side 70%. UNKNOWN COMBINATION. PRIVATE PERSON private@example.test.','raw','ORIGINAL EXACT VALUE'),
 jsonb_build_object('header','Duration','display','unknown')))) from generate_series(1,124) n));
select pg_temp.assert_reference((select count(*)=124 and bool_and(reference_enabled) and bool_and(status='draft') from public.training_library_items where organization_id='be200000-0000-4000-8000-000000000001'),'Owner import must immediately enable 124 raw references without fabricating verified publication');
insert into reference_test select 'checksum',md5(string_agg(normalized_content::text,'' order by id)) from public.training_library_items where organization_id='be200000-0000-4000-8000-000000000001';
insert into reference_test select 'item',id::text from public.training_library_items where organization_id='be200000-0000-4000-8000-000000000001' limit 1;
select pg_temp.assert_reference((select bool_and(reference_signature->'formats' ? 'emom' and reference_signature->'formats' ? 'stations' and reference_signature->'terms' ? 'per side'
 and reference_signature::text not like '%PRIVATE%' and reference_signature::text not like '%private@example%' and reference_signature->'rawProtocolsUnverified'='true') from public.training_library_items where organization_id='be200000-0000-4000-8000-000000000001'),'Cached excerpts must retain complex style but not arbitrary prose/identity or claim protocol verification');
select pg_temp.assert_reference(public.set_gym_references('{}',true,'','exclude',false)=124,'All-pages exclusion must affect all 124, not 30 or 100');
select pg_temp.assert_reference(public.set_gym_references('{}',true,'','enable',true)=124,'One Owner confirmation must enable all 124');
select pg_temp.assert_reference((public.get_training_catalog_counts()->>'referenceEnabled')::integer=124 and (public.get_training_catalog_counts()->>'approved')::integer=0,'Raw enabled count must be separate from zero structured templates');
select pg_temp.assert_reference(public.set_gym_references('{}',true,'Raw reference 124','delete',true)=1,'Delete must target the exact matching search');
select pg_temp.assert_reference((select count(*)=124 from public.training_library_items where organization_id='be200000-0000-4000-8000-000000000001'),'Recoverable deletion must preserve raw rows');
select pg_temp.assert_reference(public.set_gym_references('{}',true,'','restore',false)=1,'Owner can restore deleted source');
select pg_temp.assert_reference(public.set_gym_references('{}',true,'','enable',true)=124,'Restored source can be enabled');
select set_config('request.jwt.claim.sub','be100000-0000-4000-8000-000000000004',true);
do $$ begin
 begin perform public.set_gym_references(array[(select value::uuid from reference_test where kind='item')],false,'','enable',true); raise exception 'Cross-gym reference edit'; exception when others then if sqlerrm='Cross-gym reference edit' then raise; end if; end;
end $$;
select pg_temp.assert_reference((select count(*)=0 from public.training_library_items where organization_id='be200000-0000-4000-8000-000000000001'),'Other Owner cannot read raw sources');
select set_config('request.jwt.claim.sub','be100000-0000-4000-8000-000000000002',true);
do $$ declare intake uuid; p uuid; input jsonb; rows jsonb; begin
 begin perform public.set_gym_references('{}',true,'','enable',true); raise exception 'Coach enabled sources'; exception when no_data_found then null; end;
 intake:=public.upsert_client_intake('be100000-0000-4000-8000-000000000003',jsonb_build_object('trainingFrequencyGoal',3,'primaryGoal','strength','trainingYears',2,'experienceLevel','intermediate','recentConsistency','building','sessionDurationMinutes',45,'sleepQuality',3,'stressLevel',3,'recoveryPerception',3,'sorenessFatigue',3,'constraintTags','[]'::jsonb,'customFields','{}'::jsonb));
 perform public.confirm_intake_generation_safety(intake);
 p:=public.generate_initial_prescription_v0('be100000-0000-4000-8000-000000000003'); input:=public.get_pound_generation_input(p);
 perform pg_temp.assert_reference(jsonb_array_length(input->'knowledgeCatalog')=124 and input->'knowledgeCounts'->>'approved'='0','Assigned Coach input must search all 124 raw examples without requiring template reviews');
 select jsonb_agg(jsonb_build_object('libraryExerciseId',id,'sets',3,'reps',8,'restSeconds',120,'load',null,'loadUnit','lb','notes','Controlled adapted technique','reason','Recognized gym style, not copied ambiguous protocol',
 'protocol',jsonb_build_object('block','strength','format','straight','group','','measurement','reps','workSeconds',null,'distance',null,'distanceUnit','meters','intervalSeconds',null,'blockDurationSeconds',null,'percentageLoad',null,'perSide',false,'targetRpe',6,'substitutionIds','[]'::jsonb)) order by slug)
 into rows from public.exercise_library where organization_id is null and slug in ('goblet-squat','band-row','dead-bug');
 perform public.complete_pound_prescription(p,input->>'snapshot',jsonb_build_object('title','Raw source adaptation','rationale','Conservative adapted targets; raw EMOM is not a fixed-set verified template.','durationMinutes',30,'exercises',rows),
 jsonb_build_object('method','deterministic_reference_fallback','model','mock-sql-only','sourceReviewIds',jsonb_build_array(input->'knowledgeCatalog'->0->>'id'),
 'intelligence',jsonb_build_object('method','rules_fallback','cacheHit',false,'analysis',jsonb_build_object('objectives',jsonb_build_array('strength'),'priorityPatterns',jsonb_build_array('squat'),'methods',jsonb_build_array('strength'),'preferredFormats',jsonb_build_array('straight'),'progression','technique_then_reps','intensityCeiling',6))));
 perform pg_temp.assert_reference((select status='draft' and engine_version='prescription-v0.4-fallback' and generation_context->>'sourceType'='gym_reference_examples'
 and jsonb_array_length(generation_context->'referenceVersions')=1 and generation_context->'trainingSnapshot'->'knowledgeCatalog' is null
 and generation_context->>'loadEngine'='deterministic-v1' from public.generated_prescriptions where id=p),'Raw source credits, truthful fallback and private deterministic pounds must persist without copying 124 records');
 insert into reference_test values('draft',p::text);
end $$;
select set_config('request.jwt.claim.sub','be100000-0000-4000-8000-000000000005',true);
do $$ begin
 begin perform public.get_pound_generation_input((select value::uuid from reference_test where kind='draft')); raise exception 'Other Coach used foreign references'; exception when others then if sqlerrm='Other Coach used foreign references' then raise; end if; end;
end $$;
select set_config('request.jwt.claim.sub','be100000-0000-4000-8000-000000000003',true);
select pg_temp.assert_reference((select count(*)=0 from public.training_library_items),'Client cannot read raw gym library');
select pg_temp.assert_reference((select count(*)=0 from public.generated_prescriptions),'Client cannot see unapproved generated draft');
do $$ begin
 begin perform public.set_gym_references('{}',true,'','enable',true); raise exception 'Client enabled references'; exception when no_data_found then null; end;
end $$;
select set_config('request.jwt.claim.sub','be100000-0000-4000-8000-000000000001',true);
select pg_temp.assert_reference((select md5(string_agg(normalized_content::text,'' order by id))=(select value from reference_test where kind='checksum') from public.training_library_items where organization_id='be200000-0000-4000-8000-000000000001'),'Every original raw row must survive enabling, excluding, deleting, restoring and generation unchanged');
select 'Raw gym-reference all-pages lifecycle and ordinary-role isolation passed' as result;
rollback;
