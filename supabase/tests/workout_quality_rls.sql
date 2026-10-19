begin;
create function pg_temp.assert_true(v boolean,message text) returns void language plpgsql as $$ begin if v is distinct from true then raise exception '%',message; end if; end $$;
create temporary table quality_ids(kind text primary key,id uuid not null);
grant select,insert on quality_ids to authenticated;
create function pg_temp.protocol(measurement text,format text,group_name text,block text) returns jsonb language sql immutable as $$
 select jsonb_build_object('block',block,'format',format,'group',group_name,'measurement',measurement,
   'workSeconds',case when measurement='time' then 30 else null end,'distance',case when measurement='distance' then 10 else null end,
   'distanceUnit','meters','intervalSeconds',case when format='emom' then 60 else null end,'blockDurationSeconds',case when format='amrap' then 480 else null end,
   'percentageLoad',null,'perSide',false,'targetRpe',6,'substitutionIds','[]'::jsonb)
$$;
insert into auth.users(id,aud,role,email,email_confirmed_at,raw_app_meta_data,raw_user_meta_data,created_at,updated_at)
select ('bb100000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid,'authenticated','authenticated','quality-rls-'||n||'@example.test',now(),'{}','{}',now(),now() from generate_series(1,8) n;
insert into public.organizations(id,name) values('bb200000-0000-4000-8000-000000000001','Quality Isolated A'),('bb200000-0000-4000-8000-000000000002','Quality Isolated B');
insert into public.organization_memberships(organization_id,user_id,role)
select 'bb200000-0000-4000-8000-000000000001',('bb100000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid,
 case n when 1 then 'owner'::public.organization_role when 2 then 'coach'::public.organization_role else 'client'::public.organization_role end from generate_series(1,5) n;
insert into public.organization_memberships(organization_id,user_id,role) values
 ('bb200000-0000-4000-8000-000000000002','bb100000-0000-4000-8000-000000000006','owner'),
 ('bb200000-0000-4000-8000-000000000002','bb100000-0000-4000-8000-000000000007','coach'),
 ('bb200000-0000-4000-8000-000000000002','bb100000-0000-4000-8000-000000000008','client');
insert into public.coach_client_assignments(organization_id,coach_user_id,client_user_id)
select 'bb200000-0000-4000-8000-000000000001','bb100000-0000-4000-8000-000000000002',('bb100000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid from generate_series(3,5) n;
insert into public.training_library_items(id,organization_id,title,created_by,source_type,normalized_content)
select ('bb300000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid,'bb200000-0000-4000-8000-000000000001','Quality source '||n,'bb100000-0000-4000-8000-000000000001','csv',
 jsonb_build_object('cells',jsonb_build_array(jsonb_build_object('header','Description','raw',case n when 1 then 'Circuit A: 3 rounds; Goblet Squat 8, Band Row 8, Dead Bug 8. Rest 30s between movements.' when 2 then 'Strength: Back Squat 3x5, Bench Press 3x5, Romanian Deadlift 3x5. Rest 120s.' when 3 then 'EMOM: Rower 30s, Sled 10m, Medicine Ball Chest Pass 5 reps. 3 visits each, 60s slots.' else 'Unresolved EMOM percentage load and per-side instructions; missing station targets.' end))) from generate_series(1,4) n;

set local role authenticated;
select set_config('request.jwt.claim.sub','bb100000-0000-4000-8000-000000000001',true);
select public.add_equipment_checklist(array['barbell','plates','squat_rack','bench','dumbbells','bands','sled','medicine_balls']);
insert into quality_ids values('rower',public.save_gym_resource(null,'equipment','rower','QA Rower',null,null,'yards',true,null));
select public.save_gym_resource((select id from quality_ids where kind='rower'),'equipment','rower','QA Rower',null,null,'yards',true,'Quantity unknown');
select public.save_gym_resource(null,'equipment','ski_erg','QA SkiErg',null,null,'yards',true,null);
insert into quality_ids values('turf',public.save_gym_resource(null,'facility','turf','QA Turf',null,25,'yards',true,null));
select pg_temp.assert_true((select count(*)=1 and bool_and(quantity is null) from public.organization_equipment where equipment_type='rower'),'Inventory update duplicated a historical ID or invented quantity');
select pg_temp.assert_true((select usable_length=25 and length_unit='yards' from public.organization_facilities where id=(select id from quality_ids where kind='turf')),'Turf length was lost');

insert into quality_ids values('circuit',public.review_structured_training_item('bb300000-0000-4000-8000-000000000001','Reviewed circuit','published','fat_loss',40,
 (select jsonb_agg(jsonb_build_object('libraryExerciseId',id,'sets',3,'reps',8,'restSeconds',30,'load',null,'sourceText','Source circuit A, 3 rounds, 8 repetitions','notes','Controlled movement','reason','Owner-reviewed source','protocol',pg_temp.protocol('reps','circuit','A','strength')) order by name) from public.exercise_library where organization_id is null and slug in ('goblet-squat','band-row','dead-bug')),'All circuit quantities and exercise names checked',true));
insert into quality_ids values('strength',public.review_structured_training_item('bb300000-0000-4000-8000-000000000002','Reviewed strength','published','strength',45,
 (select jsonb_agg(jsonb_build_object('libraryExerciseId',id,'sets',3,'reps',5,'restSeconds',120,'load',null,'sourceText','Source strength 3x5 with 120s rest','notes','Controlled movement','reason','Owner-reviewed source','protocol',pg_temp.protocol('reps','straight','','strength')) order by name) from public.exercise_library where organization_id is null and slug in ('back-squat','bench-press','romanian-deadlift')),'Strength source checked',true));
insert into quality_ids values('emom',public.review_structured_training_item('bb300000-0000-4000-8000-000000000003','Reviewed stations','published','athletic_performance',40,
 (select jsonb_agg(jsonb_build_object('libraryExerciseId',id,'sets',3,'reps',case when measurement='reps' then 5 else 1 end,'restSeconds',0,'load',null,'sourceText','Source EMOM: 3 visits each in 60s slots, explicit targets','notes','Rest for remainder of slot','reason','Owner-reviewed source','protocol',pg_temp.protocol(measurement,'emom','A','conditioning')) order by name) from public.exercise_library where organization_id is null and slug in ('rower-interval','sled-push','medicine-ball-chest-pass')),'All station time/distance targets checked',true));
select pg_temp.assert_true((select statistics->>'publishedCount'='3' from public.gym_programming_profiles order by version desc limit 1),'Programming profile omitted published revisions');
do $$ begin
 begin perform public.set_training_generation_status(array['bb300000-0000-4000-8000-000000000004']::uuid[],true,false); raise exception 'Unreviewed raw source published'; exception when others then if sqlerrm='Unreviewed raw source published' then raise; end if; end;
 begin update public.training_library_items set normalized_content='{}' where id='bb300000-0000-4000-8000-000000000001'; raise exception 'Raw source overwritten'; exception when others then if sqlerrm='Raw source overwritten' then raise; end if; end;
end $$;
select public.set_training_generation_status(array['bb300000-0000-4000-8000-000000000003']::uuid[],false,true);
select pg_temp.assert_true((select generation_excluded and status='review' from public.training_library_items where id='bb300000-0000-4000-8000-000000000003'),'Exclusion did not unpublish');
select public.set_training_generation_status(array['bb300000-0000-4000-8000-000000000003']::uuid[],true,false);

select set_config('request.jwt.claim.sub','bb100000-0000-4000-8000-000000000002',true);
do $$ declare client uuid; intake uuid; p uuid; data jsonb; goal text; n integer; begin
 for n in 3..5 loop
   client:=('bb100000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid;
   goal:=case n when 3 then 'fat_loss' when 4 then 'strength' else 'athletic_performance' end;
   intake:=public.upsert_client_intake(client,jsonb_build_object('trainingFrequencyGoal',3,'primaryGoal',goal,'trainingYears',case when n=3 then 0 else 2 end,
     'experienceLevel',case when n=3 then 'beginner' else 'intermediate' end,'recentConsistency','building','sessionDurationMinutes',45,
     'sleepQuality',3,'stressLevel',3,'recoveryPerception',3,'sorenessFatigue',3,'constraintTags','[]'::jsonb,'customFields','{}'::jsonb));
   perform public.confirm_intake_generation_safety(intake);
   p:=public.generate_initial_prescription_v0(client);
   data:=public.get_quality_generation_input(p);
   if data->>'goal'<>goal or jsonb_array_length(data->'references')=0 then raise exception 'Client-specific published retrieval failed'; end if;
   if exists(select 1 from jsonb_array_elements(data->'candidates') c where c->'equipment' ? 'selectorized_machine') then raise exception 'Unavailable equipment selected'; end if;
   perform public.complete_quality_prescription(p,data->>'snapshot',null,'{"reason":"not_configured"}');
   insert into quality_ids values('draft-'||n,p);
   if not exists(select 1 from public.generated_prescriptions where id=p and status='draft' and engine_version='prescription-v0.4-fallback') then raise exception 'Fallback was not a labeled private draft'; end if;
 end loop;
end $$;
select pg_temp.assert_true((select count(distinct original_recommendation)=3 from public.generated_prescriptions),'Three materially different intakes produced identical drafts');
select pg_temp.assert_true((select bool_and(x->'protocol'->>'measurement' in ('time','distance','reps')) from public.generated_prescriptions p cross join lateral jsonb_array_elements(p.original_recommendation) x),'Structured targets lost');
select set_config('request.jwt.claim.sub','bb100000-0000-4000-8000-000000000001',true);
select public.review_training_library_item('bb300000-0000-4000-8000-000000000001','Source pending re-review','review',null,null,'[]','Legacy unpublish operation');
select set_config('request.jwt.claim.sub','bb100000-0000-4000-8000-000000000002',true);
select pg_temp.assert_true(public.get_quality_generation_input((select id from quality_ids where kind='draft-3'))->'gymProfile'='null'::jsonb,'Stale profile carried unpublished source statistics into generation');

-- Clients cannot inspect draft/private generator inputs or publish/promote data.
select set_config('request.jwt.claim.sub','bb100000-0000-4000-8000-000000000003',true);
select pg_temp.assert_true(not exists(select 1 from public.generated_prescriptions),'Client saw draft');
do $$ begin
 begin perform public.get_quality_generation_input((select id from quality_ids where kind='draft-3')); raise exception 'Client read generation snapshot'; exception when others then if sqlerrm='Client read generation snapshot' then raise; end if; end;
 begin perform public.save_gym_resource(null,'facility','turf','Client turf',null,25,'yards',true,null); raise exception 'Client edited gym'; exception when others then if sqlerrm='Client edited gym' then raise; end if; end;
end $$;

select set_config('request.jwt.claim.sub','bb100000-0000-4000-8000-000000000002',true);
do $$ declare proposal jsonb; position integer; begin
 select original_recommendation into proposal from public.generated_prescriptions where id=(select id from quality_ids where kind='draft-5');
 select ordinality::integer-1 into strict position from jsonb_array_elements(proposal) with ordinality where value->'protocol'->>'measurement'='time';
 proposal:=jsonb_set(proposal,array[position::text,'protocol','substitutionIds'],jsonb_build_array((select id::text from public.exercise_library where slug='goblet-squat' and organization_id is null)));
 begin
   perform public.approve_quality_prescription((select id from quality_ids where kind='draft-5'),'Invalid target substitution',null,current_date,40::smallint,proposal);
   raise exception 'Incompatible measurement substitution was accepted';
 exception when raise_exception then if sqlerrm not like 'Substitutions must preserve measurement%' then raise; end if; end;
end $$;
select pg_temp.assert_true(not exists(select 1 from public.workout_assignments),'Invalid substitution left a partial assignment');
insert into quality_ids values('assigned',public.approve_quality_prescription((select id from quality_ids where kind='draft-5'),'Assigned timed stations',null,current_date,40::smallint,
 (select jsonb_agg(case when x->'protocol'->>'measurement'='time' then jsonb_set(x,'{protocol,substitutionIds}',jsonb_build_array((select id::text from public.exercise_library where slug='ski-erg-interval' and organization_id is null))) else x end order by n)
 from public.generated_prescriptions p cross join lateral jsonb_array_elements(p.original_recommendation) with ordinality q(x,n) where p.id=(select id from quality_ids where kind='draft-5'))));
select pg_temp.assert_true((select count(*)=3 from public.workout_exercises where workout_assignment_id=(select id from quality_ids where kind='assigned') and prescription_details->>'format'='emom'),'Approval flattened station protocols');

-- Foreign staff and unrelated Client cannot read/write resources or performance.
select set_config('request.jwt.claim.sub','bb100000-0000-4000-8000-000000000007',true);
select pg_temp.assert_true(not exists(select 1 from public.organization_facilities),'Cross-gym facility read');
select pg_temp.assert_true(not exists(select 1 from public.gym_programming_profiles),'Cross-gym profile read');
do $$ begin
 begin perform public.manage_quality_workout((select id from quality_ids where kind='assigned'),'start',null,null); raise exception 'Cross-gym workout mutation'; exception when others then if sqlerrm='Cross-gym workout mutation' then raise; end if; end;
 begin perform public.review_training_readiness(gen_random_uuid(),'accepted','No'); raise exception 'Cross-gym readiness mutation'; exception when others then if sqlerrm='Cross-gym readiness mutation' then raise; end if; end;
end $$;

select set_config('request.jwt.claim.sub','bb100000-0000-4000-8000-000000000005',true);
select pg_temp.assert_true((select count(*)=1 from public.workout_assignments),'Assigned Client could not see workout');
select public.manage_quality_workout((select id from quality_ids where kind='assigned'),'start',null,null);
do $$ declare s record; n integer:=0; begin
 for s in select q.id,e.prescription_details from public.workout_sets q join public.workout_exercises e on e.id=q.workout_exercise_id where e.workout_assignment_id=(select id from quality_ids where kind='assigned') order by q.id loop
   perform public.record_quality_workout_set((select id from quality_ids where kind='assigned'),s.id,
     case n when 0 then 'modified' when 1 then 'missed' else 'complete' end,
     jsonb_build_object('reps',5,'seconds',30,'distance',10,'load',null,'loadUnit','kg','rpe',6,'pain',n=0,'notes',case when n=0 then 'Stop and discuss discomfort' else '' end,'substitutionId',s.prescription_details->'substitutionIds'->>0));
   n:=n+1;
 end loop;
end $$;
select public.manage_quality_workout((select id from quality_ids where kind='assigned'),'finish',3,'Completed with accurately recorded modified and missed work');
select pg_temp.assert_true((select status='completed' and client_difficulty=3 from public.workout_assignments),'Client completion not recorded');
insert into quality_ids values('readiness',public.submit_training_readiness('bb100000-0000-4000-8000-000000000005',null,array[2,3,3,2,3]::smallint[],'Knee discomfort'));
select pg_temp.assert_true((select coach_decision='pending' and recommendation like '%No approved workout was changed automatically.%' from public.training_readiness_checkins),'Readiness silently changed plan');
select set_config('request.jwt.claim.sub','bb100000-0000-4000-8000-000000000002',true);
select public.review_training_readiness((select id from quality_ids where kind='readiness'),'edited','Discuss symptoms and do not progress demanding work until reviewed.');
select pg_temp.assert_true((select coach_decision='edited' from public.training_readiness_checkins),'Coach decision missing');

reset role;
update public.organization_memberships set status='inactive' where organization_id='bb200000-0000-4000-8000-000000000001' and user_id='bb100000-0000-4000-8000-000000000005';
set local role authenticated;
select set_config('request.jwt.claim.sub','bb100000-0000-4000-8000-000000000005',true);
select pg_temp.assert_true(not exists(select 1 from public.training_readiness_checkins),'Inactive membership retained readiness access');
do $$ begin
 begin perform public.submit_training_readiness('bb100000-0000-4000-8000-000000000005',null,array[5,5,5,5,5]::smallint[],null); raise exception 'Inactive Client wrote readiness'; exception when others then if sqlerrm='Inactive Client wrote readiness' then raise; end if; end;
end $$;
reset role;
select pg_temp.assert_true((select count(*)=4 from public.training_library_items where organization_id='bb200000-0000-4000-8000-000000000001'),'Original import row count changed');
select pg_temp.assert_true(not has_function_privilege('anon','public.get_quality_generation_input(uuid)','execute'),'Anonymous generation API permission');
select pg_temp.assert_true(not has_function_privilege('authenticated','private.validate_quality_exercises(jsonb,uuid,uuid,boolean)','execute'),'Private validator exposed');
select 'Workout quality, scoped resources, structured publication, three-client generation, review/assignment, performance and readiness RLS passed' as result;
rollback;
