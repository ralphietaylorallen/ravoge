begin;
create function pg_temp.assert_true(v boolean,message text) returns void language plpgsql as $$ begin if v is distinct from true then raise exception '%',message; end if; end $$;
create temporary table pound_ids(kind text primary key,id uuid not null);
grant select,insert on pound_ids to authenticated;
insert into auth.users(id,aud,role,email,email_confirmed_at,raw_app_meta_data,raw_user_meta_data,created_at,updated_at)
select ('bc100000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid,'authenticated','authenticated','pound-rls-'||n||'@example.test',now(),'{}','{}',now(),now() from generate_series(1,6) n;
insert into public.organizations(id,name) values('bc200000-0000-4000-8000-000000000001','Pound Isolated A'),('bc200000-0000-4000-8000-000000000002','Pound Isolated B');
insert into public.organization_memberships(organization_id,user_id,role)
select ('bc200000-0000-4000-8000-'||case when n<=3 then '000000000001' else '000000000002' end)::uuid,
 ('bc100000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid,
 case n%3 when 1 then 'owner'::public.organization_role when 2 then 'coach'::public.organization_role else 'client'::public.organization_role end from generate_series(1,6) n;
insert into public.coach_client_assignments(organization_id,coach_user_id,client_user_id)
values('bc200000-0000-4000-8000-000000000001','bc100000-0000-4000-8000-000000000002','bc100000-0000-4000-8000-000000000003');
set local role authenticated;
select set_config('request.jwt.claim.sub','bc100000-0000-4000-8000-000000000001',true);
select public.add_equipment_checklist(array['squat_rack','bench','bands']);
insert into pound_ids values('bar',public.save_gym_resource_lb(null,'equipment','barbell','Unloaded bars',null,null,'yards',true,null,35,45,array[45,35,45]::numeric[],false));
insert into pound_ids values('plates',public.save_gym_resource_lb(null,'equipment','plates','Individual plates',null,null,'yards',true,null,2.5,45,array[45,2.5,25]::numeric[],true));
select pg_temp.assert_true((select weight_sizes_lb=array[35,45]::numeric[] and min_weight_lb=35 and max_weight_lb=45 and quantity is null from public.organization_equipment where id=(select id from pound_ids where kind='bar')),'Bar normalization, range or unknown quantities lost');
select public.save_gym_resource_lb((select id from pound_ids where kind='bar'),'equipment','barbell','Unloaded bars',null,null,'yards',true,'Same ID preserved',35,45,array[35,45]::numeric[],false);
do $$ begin
 begin perform public.save_gym_resource_lb((select id from pound_ids where kind='bar'),'equipment','barbell','Unloaded bars',null,null,'yards',true,null,50,35,null,false); raise exception 'Bad range accepted'; exception when others then if sqlerrm='Bad range accepted' then raise; end if; end;
 begin perform public.save_gym_resource_lb(null,'equipment','plates','Invalid sizes',null,null,'yards',true,null,null,null,array[-1]::numeric[],true); raise exception 'Negative size accepted'; exception when others then if sqlerrm='Negative size accepted' then raise; end if; end;
end $$;
select pg_temp.assert_true((select count(*)=1 from public.organization_equipment where equipment_type='barbell'),'Editing replaced an existing ID');
select set_config('request.jwt.claim.sub','bc100000-0000-4000-8000-000000000004',true);
select pg_temp.assert_true((select count(*)=0 from public.organization_equipment),'Other gym can read inventory');
do $$ begin
 begin perform public.save_gym_resource_lb((select id from pound_ids where kind='bar'),'equipment','barbell','Wrong gym update',null,null,'yards',true,null,1,500,null,false); raise exception 'Cross gym update accepted'; exception when others then if sqlerrm='Cross gym update accepted' then raise; end if; end;
end $$;
select set_config('request.jwt.claim.sub','bc100000-0000-4000-8000-000000000002',true);
do $$ declare intake uuid; p uuid; input jsonb; rows jsonb; workout uuid; set_id uuid; begin
 begin perform public.save_gym_resource_lb(null,'equipment','barbell','Coach write',null,null,'yards',true,null,35,45,null,false); raise exception 'Coach can write equipment'; exception when others then if sqlerrm='Coach can write equipment' then raise; end if; end;
 intake:=public.upsert_client_intake('bc100000-0000-4000-8000-000000000003',jsonb_build_object('trainingFrequencyGoal',3,'primaryGoal','strength','trainingYears',2,'experienceLevel','intermediate','recentConsistency','building','sessionDurationMinutes',45,'sleepQuality',3,'stressLevel',3,'recoveryPerception',3,'sorenessFatigue',3,'constraintTags','[]'::jsonb,'customFields','{}'::jsonb));
 perform public.confirm_intake_generation_safety(intake);
 p:=public.generate_initial_prescription_v0('bc100000-0000-4000-8000-000000000003');
 input:=public.get_pound_generation_input(p);
 perform pg_temp.assert_true(jsonb_array_length(input->'weightCapabilities')>=2,'Generation omitted weight capabilities');
 begin perform public.complete_pound_prescription(p,'changed',null,'{"reason":"not_configured"}'); raise exception 'Stale snapshot accepted'; exception when others then if sqlerrm='Stale snapshot accepted' then raise; end if; end;
 perform public.complete_pound_prescription(p,input->>'snapshot',null,'{"reason":"not_configured"}');
 perform set_config('request.jwt.claim.sub','bc100000-0000-4000-8000-000000000003',true);
 perform pg_temp.assert_true((select count(*)=0 from public.generated_prescriptions),'Client can read unassigned draft');
 perform set_config('request.jwt.claim.sub','bc100000-0000-4000-8000-000000000002',true);
 perform pg_temp.assert_true((select bool_and(x->>'loadUnit'='lb' and x->>'load' is null) from public.generated_prescriptions g cross join lateral jsonb_array_elements(g.original_recommendation) x where g.id=p),'Draft guessed or mislabelled a historical load');
 select jsonb_agg(jsonb_build_object('libraryExerciseId',id,'sets',3,'reps',5,'restSeconds',120,'load',95,'loadUnit','lb','notes','Coach confirmed','reason','Goal compatible',
   'protocol',jsonb_build_object('block','strength','format','straight','group','','measurement','reps','workSeconds',null,'distance',null,'distanceUnit','meters','intervalSeconds',null,'blockDurationSeconds',null,'percentageLoad',null,'perSide',false,'targetRpe',6,'substitutionIds','[]'::jsonb)) order by name) into rows
 from public.exercise_library where organization_id is null and slug in ('back-squat','bench-press','romanian-deadlift');
 perform set_config('request.jwt.claim.sub','bc100000-0000-4000-8000-000000000001',true);
 perform public.save_gym_resource_lb((select id from pound_ids where kind='bar'),'equipment','barbell','Unloaded bars',null,null,'yards',true,null,null,null,array[45]::numeric[],false);
 perform public.save_gym_resource_lb((select id from pound_ids where kind='plates'),'equipment','plates','Individual plates',null,null,'yards',true,null,2.5,45,array[45,2.5,25]::numeric[],false);
 perform set_config('request.jwt.claim.sub','bc100000-0000-4000-8000-000000000002',true);
 begin perform public.approve_pound_prescription(p,'Below exact bare bar',null,current_date,45::smallint,jsonb_set(rows,'{0,load}','30')); raise exception 'Below exact bar accepted'; exception when others then if sqlerrm='Below exact bar accepted' then raise; end if; end;
 perform set_config('request.jwt.claim.sub','bc100000-0000-4000-8000-000000000001',true);
 perform public.save_gym_resource_lb((select id from pound_ids where kind='bar'),'equipment','barbell','Unloaded bars',null,null,'yards',true,null,35,45,array[35,45]::numeric[],false);
 perform public.save_gym_resource_lb((select id from pound_ids where kind='plates'),'equipment','plates','Individual plates',null,null,'yards',true,null,2.5,45,array[45,2.5,25]::numeric[],true);
 perform set_config('request.jwt.claim.sub','bc100000-0000-4000-8000-000000000002',true);
 begin perform public.approve_pound_prescription(p,'Impossible load',null,current_date,45::smallint,jsonb_set(rows,'{0,load}','96')); raise exception 'Impossible increment accepted'; exception when others then if sqlerrm='Impossible increment accepted' then raise; end if; end;
 begin perform public.approve_pound_prescription(p,'Wrong unit',null,current_date,45::smallint,jsonb_set(rows,'{0,loadUnit}','"kg"')); raise exception 'Unit tampering accepted'; exception when others then if sqlerrm='Unit tampering accepted' then raise; end if; end;
 begin perform public.approve_pound_prescription(p,'Missing reference',null,current_date,45::smallint,jsonb_set(rows,'{0,protocol,percentageLoad}','70')); raise exception 'Missing reference accepted'; exception when others then if sqlerrm='Missing reference accepted' then raise; end if; end;
 rows:=jsonb_set(jsonb_set(rows,'{0,protocol,percentageLoad}','70'),'{0,referenceLoadLb}','137');
 begin perform public.approve_pound_prescription(p,'Wrong rounded percentage',null,current_date,45::smallint,jsonb_set(rows,'{0,load}','90')); raise exception 'Wrong rounded percentage accepted'; exception when others then if sqlerrm='Wrong rounded percentage accepted' then raise; end if; end;
 perform pg_temp.assert_true((select count(*)=0 from public.workout_assignments),'Invalid approval created a partial assignment');
 workout:=public.approve_pound_prescription(p,'Verified pound session',null,current_date,45::smallint,rows);
 insert into pound_ids values('workout',workout);
 perform pg_temp.assert_true((select bool_and(load_unit='lb' and load=95) from public.workout_exercises where workout_assignment_id=workout),'Approved load units were lost');
 select s.id into set_id from public.workout_sets s join public.workout_exercises e on e.id=s.workout_exercise_id where e.workout_assignment_id=workout limit 1;
 perform pg_temp.assert_true(public.record_coach_workout_set_lb(set_id,'complete',5,100,null,null)='exceeded','Pound comparison failed');
 perform pg_temp.assert_true((select actual_load=100 and actual_load_unit='lb' and prescribed_load=95 and prescribed_load_unit='lb' from public.workout_sets where id=set_id),'Recording changed prescribed target or lost units');
end $$;
select set_config('request.jwt.claim.sub','bc100000-0000-4000-8000-000000000003',true);
select pg_temp.assert_true((select count(*)=1 from public.workout_assignments),'Client cannot see own approved session');
select pg_temp.assert_true((select count(*)=0 from public.generated_prescriptions where status='draft'),'Client can read draft');
select set_config('request.jwt.claim.sub','bc100000-0000-4000-8000-000000000006',true);
select pg_temp.assert_true((select count(*)=0 from public.workout_exercises),'Cross gym Client can read exercises');
select pg_temp.assert_true(not has_function_privilege('anon','public.get_pound_generation_input(uuid)','execute'),'Anon can call generation');
select pg_temp.assert_true(not has_function_privilege('authenticated','private.assert_pound_load(uuid,text[],numeric)','execute'),'Private weight helper exposed');
rollback;
