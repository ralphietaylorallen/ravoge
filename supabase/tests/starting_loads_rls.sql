begin;
create function pg_temp.assert_load(v boolean,message text) returns void language plpgsql as $$ begin if v is distinct from true then raise exception '%',message; end if; end $$;
-- Pure kernel unit assertions: no auth bypass is used for the RPC/RLS tests below.
do $$ declare rule jsonb; x jsonb; history jsonb; size numeric; begin
 rule:='{"prescription_type":"weighted","weight_semantics":"total","minimum_lb":0,"maximum_lb":1000,"coefficient":0.25,"intake_anchor":"back_squat","calibration_strategy":"lightest_confirmed"}';
 x:=private.calculate_starting_load(rule,200,array[20,35,50,60]::numeric[],'[]',8,6);
 perform pg_temp.assert_load(x->>'load'='50' and (x->>'unroundedLb')::numeric=50 and x->>'basis'='intake percentage','200 squat must give 50 total goblet');
 x:=private.calculate_starting_load(rule,200,array[20,35,45,60]::numeric[],'[]',8,6);
 perform pg_temp.assert_load(x->>'load'='45','Round down, never up');
 x:=private.calculate_starting_load(rule||'{"coefficient":0.5,"weight_semantics":"each_hand","intake_anchor":"bench"}',200,array[25,45,50]::numeric[],'[]',8,6);
 perform pg_temp.assert_load(x->>'load'='50' and x->>'semantics'='each_hand','100 total dumbbells must be 50 each hand');
 x:=private.calculate_starting_load(rule,null,array[20,30]::numeric[],'[]',8,6);
 perform pg_temp.assert_load(x->>'load'='20' and x->>'basis'='equipment calibration','Missing anchor must use lightest confirmed');
 x:=private.calculate_starting_load(rule,200,'{}','[]',8,6);
 perform pg_temp.assert_load(x->>'load' is null and x->>'calibrationRequired'='true','Missing equipment must require calibration');
 history:='[{"recorded":true,"load":40,"prescribedLoad":40,"reps":8,"prescribedReps":8,"rpe":6,"result":"complete","pain":false},{"recorded":true,"load":40,"prescribedLoad":40,"reps":8,"prescribedReps":8,"rpe":6,"result":"complete","pain":false},{"recorded":true,"load":30,"prescribedLoad":40,"reps":8,"prescribedReps":8,"rpe":6,"result":"modified","pain":false}]';
 x:=private.calculate_starting_load(rule,400,array[20,30,40,50]::numeric[],history,8,6);
 perform pg_temp.assert_load(x->>'load'='30' and x->>'basis'='same exercise history','Reduced final set must outrank intake percentage');
 x:=private.calculate_starting_load(rule||'{"historyEquivalent":true}',400,array[20,30,40,50]::numeric[],history,8,6);
 perform pg_temp.assert_load(x->>'basis'='approved variation history','Explicit equivalent source must be audited');
 history:='[{"recorded":true,"load":40,"prescribedLoad":40,"reps":8,"prescribedReps":8,"rpe":5,"result":"complete","pain":false},{"recorded":true,"load":40,"prescribedLoad":40,"reps":8,"prescribedReps":8,"rpe":5,"result":"complete","pain":false},{"recorded":true,"load":40,"prescribedLoad":40,"reps":8,"prescribedReps":8,"rpe":5,"result":"complete","pain":false}]';
 x:=private.calculate_starting_load(rule,400,array[20,30,40,45,50]::numeric[],history,8,6);
 perform pg_temp.assert_load(x->>'load'='45','All low-RPE sets advance exactly one increment');
 x:=private.calculate_starting_load(rule,400,array[20,30,40,45,50]::numeric[],jsonb_set(history,'{2,pain}','true'),8,6);
 perform pg_temp.assert_load(x->>'load'='40' and x->>'coachReviewRequired'='true','Pain must prevent progression');
 x:=private.calculate_starting_load(rule,400,array[20,30,40,45,50]::numeric[],history||'[{"recorded":false,"result":"missed"}]',8,6);
 perform pg_temp.assert_load(x->>'load'='40','Unrecorded work cannot imply progression');
 x:=private.calculate_starting_load(rule,400,array[20,30,40,45,50]::numeric[],jsonb_set(history,'{2,result}','"failed"'),8,6);
 perform pg_temp.assert_load(x->>'load'='40','Failed set must repeat last successful load');
 x:=private.calculate_starting_load(rule,400,array[20,30,40,45,50]::numeric[],'[{"recorded":true,"prescribedLoad":40,"reps":0,"prescribedReps":8,"result":"failed"}]',8,6);
 perform pg_temp.assert_load(x->>'load'='30','All failed sets must reduce a confirmed increment');
 foreach size in array array[5,8,12,20]::numeric[] loop
   x:=private.calculate_starting_load(rule||'{"coefficient":0.75,"working_percentage":true}',200,array[20,50,100,125,150,200]::numeric[],'[]',size::integer,6);
   perform pg_temp.assert_load((x->>'load')::numeric<200,'Working percentage cannot prescribe 100% e1RM');
 end loop;
 for x in select value from jsonb_array_elements('["bodyweight","band","time","distance"]') loop
   perform pg_temp.assert_load(private.calculate_starting_load(rule||jsonb_build_object('prescription_type',x#>>'{}'),200,array[50]::numeric[],'[]',8,6)->>'load' is null,'Non-pound modes cannot receive invented weights');
 end loop;
 x:=private.calculate_starting_load(rule||'{"prescription_type":"carry","coefficient":null,"intake_anchor":null,"weight_semantics":"each_hand"}',null,array[10,20]::numeric[],'[]',1,6);
 perform pg_temp.assert_load(x->>'load'='10' and x->>'semantics'='each_hand','Carry uses confirmed per-hand load');
 x:=private.calculate_starting_load(rule||'{"prescription_type":"sled","coefficient":null,"intake_anchor":null,"weight_semantics":"sled"}',null,array[45,90]::numeric[],'[]',1,6);
 perform pg_temp.assert_load(x->>'load'='45' and x->>'semantics'='sled','Sled uses confirmed total sled load');
end $$;

insert into auth.users(id,aud,role,email,email_confirmed_at,raw_app_meta_data,raw_user_meta_data,created_at,updated_at)
select ('bd100000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid,'authenticated','authenticated','load-rls-'||n||'@example.test',now(),'{}','{}',now(),now() from generate_series(1,6) n;
insert into public.organizations(id,name) values('bd200000-0000-4000-8000-000000000001','Load Isolated A'),('bd200000-0000-4000-8000-000000000002','Load Isolated B');
insert into public.organization_memberships(organization_id,user_id,role)
select ('bd200000-0000-4000-8000-'||case when n<=3 then '000000000001' else '000000000002' end)::uuid,('bd100000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid,
 case n%3 when 1 then 'owner'::public.organization_role when 2 then 'coach'::public.organization_role else 'client'::public.organization_role end from generate_series(1,6) n;
insert into public.coach_client_assignments(organization_id,coach_user_id,client_user_id) values('bd200000-0000-4000-8000-000000000001','bd100000-0000-4000-8000-000000000002','bd100000-0000-4000-8000-000000000003');
create temporary table load_ids(kind text primary key,id uuid); grant select,insert on load_ids to authenticated;
set local role authenticated;
select set_config('request.jwt.claim.sub','bd100000-0000-4000-8000-000000000001',true);
select pg_temp.assert_load((select count(*)>=55 from exercise_load_rules),'Active Owner must read global rules');
select pg_temp.assert_load(public.get_training_catalog_counts()='{"imported":0,"approved":0,"eligible":0}'::jsonb,'Owner catalog counts must exclude unreviewed sources');
select public.add_equipment_checklist(array['bench','squat_rack','bands']);
select public.save_gym_resource_lb(null,'equipment','barbell','QA bar',null,null,'yards',true,null,45,45,array[45]::numeric[],false);
select public.save_gym_resource_lb(null,'equipment','plates','QA plates',null,null,'yards',true,null,2.5,25,array[2.5,5,10,25]::numeric[],true);
select public.save_gym_resource_lb(null,'equipment','dumbbells','QA 50 pair',2,null,'yards',true,null,50,50,array[50]::numeric[],false);
select public.save_gym_resource_lb(null,'equipment','dumbbells','QA 40 pair',2,null,'yards',true,null,40,40,array[40]::numeric[],false);
insert into load_ids values('rule',public.save_exercise_load_rule((select id from exercise_library where slug='goblet-squat' and organization_id is null),.25,'back_squat','total',0,300,'lightest_confirmed',null,'Isolated conservative Owner review'));
select pg_temp.assert_load((select organization_id='bd200000-0000-4000-8000-000000000001' and created_by='bd100000-0000-4000-8000-000000000001' from exercise_load_rules where id=(select id from load_ids where kind='rule')),'Owner rule scope must be server-derived');
select set_config('request.jwt.claim.sub','bd100000-0000-4000-8000-000000000004',true);
select pg_temp.assert_load((select count(*)=0 from exercise_load_rules where id=(select id from load_ids where kind='rule')),'Other gym must not read override');
select set_config('request.jwt.claim.sub','bd100000-0000-4000-8000-000000000002',true);
do $$ declare intake uuid; p uuid; input jsonb; row_data jsonb; workout uuid; x jsonb; idx integer:=0; begin
 begin perform public.save_exercise_load_rule((select id from exercise_library where slug='goblet-squat' and organization_id is null),.8,'back_squat','total',0,300,'lightest_confirmed',null,'Coach escalation'); raise exception 'Coach wrote rule'; exception when no_data_found then null; end;
 intake:=public.upsert_client_intake('bd100000-0000-4000-8000-000000000003',jsonb_build_object('trainingFrequencyGoal',3,'primaryGoal','strength','trainingYears',2,'experienceLevel','intermediate','recentConsistency','building','sessionDurationMinutes',45,'sleepQuality',3,'stressLevel',3,'recoveryPerception',3,'sorenessFatigue',3,'constraintTags','[]'::jsonb,'customFields','{}'::jsonb));
 perform public.confirm_intake_generation_safety(intake);
 p:=public.generate_initial_prescription_v0('bd100000-0000-4000-8000-000000000003');
 input:=public.get_pound_generation_input(p);
 perform public.complete_pound_prescription(p,input->>'snapshot',null,'{"reason":"not_configured"}');
 insert into load_ids values('draft',p);
 perform pg_temp.assert_load((select generation_context->>'loadEngine'='deterministic-v1' from generated_prescriptions where id=p),'Completion must invoke deterministic engine');
 select original_recommendation into row_data from generated_prescriptions where id=p;
 perform pg_temp.assert_load(not exists(select 1 from jsonb_array_elements(row_data) row_value where row_value->>'loadUnit'<>'lb' or row_value->'loadPrescription' is null),'Every row requires pound metadata or explicit non-weight/calibration target');
 -- Use the same actual DB engine, not a parallel TypeScript implementation.
 select jsonb_build_array(jsonb_build_object('libraryExerciseId',id,'sets',3,'reps',8,'restSeconds',120,'load',50,'loadUnit','lb','notes','Coach-confirmed technique','reason','Coach review',
 'protocol',jsonb_build_object('block','strength','format','straight','group','','measurement','reps','workSeconds',null,'distance',null,'distanceUnit','meters','intervalSeconds',null,'blockDurationSeconds',null,'percentageLoad',null,'perSide',false,'targetRpe',6,'substitutionIds','[]'::jsonb))) into row_data from exercise_library where slug='goblet-squat' and organization_id is null;
 workout:=public.approve_pound_prescription(p,'Load learning QA',null,current_date,45::smallint,row_data);
 insert into load_ids values('workout',workout);
 perform pg_temp.assert_load((select load=50 and load_unit='lb' from workout_exercises where workout_assignment_id=workout),'Coach override must persist exact pounds');
 for x in select to_jsonb(s) from workout_sets s join workout_exercises e on e.id=s.workout_exercise_id where e.workout_assignment_id=workout order by s.set_number loop
   idx:=idx+1;
   perform public.record_quality_workout_set(workout,(x->>'id')::uuid,case when idx=3 then 'modified' else 'complete' end,jsonb_build_object('reps',8,'load',case when idx=3 then 40 else 50 end,'loadUnit','lb','rpe',6,'pain',false));
 end loop;
 p:=public.generate_initial_prescription_v0('bd100000-0000-4000-8000-000000000003');
 input:=public.get_pound_generation_input(p);
 select jsonb_agg(jsonb_build_object('libraryExerciseId',id,'sets',3,'reps',8,'restSeconds',120,'load',null,'loadUnit','lb','notes','Controlled technique','reason','Compatible approved movement',
 'protocol',jsonb_build_object('block','strength','format','straight','group','','measurement','reps','workSeconds',null,'distance',null,'distanceUnit','meters','intervalSeconds',null,'blockDurationSeconds',null,'percentageLoad',null,'perSide',false,'targetRpe',6,'substitutionIds','[]'::jsonb)) order by slug)
 into row_data from exercise_library where organization_id is null and slug in ('goblet-squat','bench-press','romanian-deadlift');
 perform public.complete_pound_prescription(p,input->>'snapshot',jsonb_build_object('title','Learned load verification','rationale','Compatible strength work for Coach review.','durationMinutes',30,'exercises',row_data),'{"model":"mock-sql-only"}');
 perform pg_temp.assert_load((select exists(select 1 from jsonb_array_elements(original_recommendation) v join exercise_library e on e.id=(v->>'libraryExerciseId')::uuid
   where e.slug='goblet-squat' and v->>'load'='40' and v->'loadPrescription'->>'basis'='same exercise history') from generated_prescriptions where id=p),'Next DB-generated goblet must use the final-set reduction, not an intake default');
 insert into load_ids values('later',p);
end $$;
select set_config('request.jwt.claim.sub','bd100000-0000-4000-8000-000000000003',true);
select pg_temp.assert_load((select count(*)=0 from exercise_load_rules),'Client cannot read/change programming rules');
select pg_temp.assert_load((select count(*)=0 from generated_prescriptions where status='draft'),'Client cannot read generated draft');
select pg_temp.assert_load((select count(*)=1 from workout_assignments),'Client sees only approved assignment');
do $$ begin
 begin perform public.get_pound_generation_input((select id from load_ids where kind='later')); raise exception 'Client accessed generation context'; exception when others then if sqlerrm='Client accessed generation context' then raise; end if; end;
end $$;
select set_config('request.jwt.claim.sub','bd100000-0000-4000-8000-000000000005',true);
do $$ begin
 begin perform public.get_pound_generation_input((select id from load_ids where kind='later')); raise exception 'Other Coach accessed generation context'; exception when others then if sqlerrm='Other Coach accessed generation context' then raise; end if; end;
end $$;
select pg_temp.assert_load((select count(*)=0 from workout_exercises),'Cross-gym Coach cannot read Client sets');
select pg_temp.assert_load(not has_function_privilege('authenticated','private.calculate_starting_load(jsonb,numeric,numeric[],jsonb,integer,numeric)','execute'),'Private load engine exposed');
select 'Starting-load kernel and ordinary Owner/Coach/Client RLS assertions passed' as result;
rollback;
