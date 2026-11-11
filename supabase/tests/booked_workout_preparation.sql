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

reset role;
insert into public.bookings(id,organization_id,coach_user_id,client_user_id,starts_at,ends_at,timezone,booked_by)
values('bc400000-0000-4000-8000-000000000001','bb200000-0000-4000-8000-000000000001','bb100000-0000-4000-8000-000000000002','bb100000-0000-4000-8000-000000000003',date_trunc('day',now())+interval '14 days 15 hours',date_trunc('day',now())+interval '14 days 16 hours','America/Denver','bb100000-0000-4000-8000-000000000002');
set local role authenticated;
select set_config('request.jwt.claim.sub','bb100000-0000-4000-8000-000000000002',true);
do $$ declare result jsonb; p uuid; input jsonb; draft jsonb; revision integer; begin
 result:=public.begin_booking_workout_draft('bc400000-0000-4000-8000-000000000001','bb100000-0000-4000-8000-000000000003');
 p:=(result->>'prescriptionId')::uuid;
 insert into quality_ids values('prepared',p);
 if public.begin_booking_workout_draft('bc400000-0000-4000-8000-000000000001','bb100000-0000-4000-8000-000000000003')->>'busy'<>'true' then raise exception 'Concurrent preparation was not deduplicated'; end if;
 input:=public.get_quality_generation_input(p);
 perform public.complete_quality_prescription(p,input->>'snapshot',null,'{"reason":"not_configured"}');
 perform public.finish_booking_workout_draft(p);
 if public.begin_booking_workout_draft('bc400000-0000-4000-8000-000000000001','bb100000-0000-4000-8000-000000000003')->>'prescriptionId'<>p::text then raise exception 'Saved generation was duplicated'; end if;
 select jsonb_build_object('title','Coach edited session','instructions','Saved ahead of session','scheduledDate',current_date,'duration',60,'exercises',original_recommendation) into draft from public.generated_prescriptions where id=p;
 revision:=public.save_workout_preparation(p,0,draft);
 if revision<>1 or not exists(select 1 from public.generated_prescriptions where id=p and generation_context->'coachDraft'->>'title'='Coach edited session' and status='draft' and workout_assignment_id is null) then raise exception 'Draft save assigned or lost edits'; end if;
 if exists(select 1 from public.generated_prescriptions where id=p and original_recommendation<>final_prescription) then raise exception 'Saving changed the source recommendation'; end if;
 begin perform public.save_workout_preparation(p,0,draft); raise exception 'Stale device overwrote draft'; exception when others then if sqlerrm='Stale device overwrote draft' then raise; end if; end;
end $$;
select set_config('request.jwt.claim.sub','bb100000-0000-4000-8000-000000000007',true);
do $$ begin
 begin perform public.begin_booking_workout_draft('bc400000-0000-4000-8000-000000000001','bb100000-0000-4000-8000-000000000003'); raise exception 'Foreign Coach prepared session'; exception when others then if sqlerrm='Foreign Coach prepared session' then raise; end if; end;
 begin perform public.save_workout_preparation((select id from quality_ids where kind='prepared'),1,'{}'); raise exception 'Foreign Coach saved draft'; exception when others then if sqlerrm='Foreign Coach saved draft' then raise; end if; end;
end $$;
select set_config('request.jwt.claim.sub','bb100000-0000-4000-8000-000000000003',true);
select pg_temp.assert_true(not exists(select 1 from public.generated_prescriptions where id=(select id from quality_ids where kind='prepared')),'Client saw private preparation');
do $$ begin
 begin perform public.save_workout_preparation((select id from quality_ids where kind='prepared'),1,'{}'); raise exception 'Client edited draft'; exception when others then if sqlerrm='Client edited draft' then raise; end if; end;
end $$;
reset role;
select set_config('request.jwt.claim.sub','bb100000-0000-4000-8000-000000000002',true);
update public.bookings set starts_at=starts_at+interval '1 day',ends_at=ends_at+interval '1 day' where id='bc400000-0000-4000-8000-000000000001';
set local role authenticated;
select set_config('request.jwt.claim.sub','bb100000-0000-4000-8000-000000000002',true);
do $$ declare p uuid; rows jsonb; w uuid; begin
 p:=(select id from quality_ids where kind='prepared');
 select jsonb_agg(x||jsonb_build_object('loadUnit','lb','load',null,'bandResistance','Coach confirmed band')) into rows from public.generated_prescriptions cross join lateral jsonb_array_elements(original_recommendation) x where id=p;
 begin perform public.approve_prepared_prescription(p,1,'Session workout',null,current_date,60::smallint,rows); raise exception 'Missing calibration was accepted'; exception when others then if sqlerrm='Missing calibration was accepted' then raise; end if; end;
 select jsonb_agg(x||jsonb_build_object('loadUnit','lb','load',case when e.equipment_requirements && array['barbell','dumbbells','kettlebells','sled','medicine_balls','cable_machine','selectorized_machine'] then 5 else null end,'bandResistance','Coach confirmed band')) into rows
 from public.generated_prescriptions g cross join lateral jsonb_array_elements(g.original_recommendation) x join public.exercise_library e on e.id=(x->>'libraryExerciseId')::uuid where g.id=p;
 w:=public.approve_prepared_prescription(p,1,'Session workout','Prepared and reviewed',current_date,60::smallint,rows);
 insert into quality_ids values('prepared-workout',w);
 if not exists(select 1 from public.workout_assignments a join public.bookings b on b.id='bc400000-0000-4000-8000-000000000001' where a.id=w and a.scheduled_date=(b.starts_at at time zone b.timezone)::date and a.scheduled_time=(b.starts_at at time zone b.timezone)::time) then raise exception 'Approval used a stale or tampered session date'; end if;
 if public.approve_prepared_prescription(p,1,'Session workout',null,current_date,60::smallint,rows)<>w then raise exception 'Repeated assignment duplicated workout'; end if;
 if public.begin_booking_workout_draft('bc400000-0000-4000-8000-000000000001','bb100000-0000-4000-8000-000000000003')->>'workoutId'<>w::text then raise exception 'Reopening lost assigned workout'; end if;
end $$;
reset role;
update public.bookings set starts_at=starts_at+interval '1 day',ends_at=ends_at+interval '1 day' where id='bc400000-0000-4000-8000-000000000001';
select pg_temp.assert_true((select a.scheduled_date=(b.starts_at at time zone b.timezone)::date from public.workout_assignments a join public.bookings b on b.id='bc400000-0000-4000-8000-000000000001' where a.id=(select id from quality_ids where kind='prepared-workout')),'Rescheduling lost the prepared workout');
update public.bookings set status='cancelled',cancelled_at=now() where id='bc400000-0000-4000-8000-000000000001';
set local role authenticated;
select set_config('request.jwt.claim.sub','bb100000-0000-4000-8000-000000000002',true);
do $$ begin
 begin perform public.begin_booking_workout_draft('bc400000-0000-4000-8000-000000000001','bb100000-0000-4000-8000-000000000003'); raise exception 'Cancelled session prepared'; exception when others then if sqlerrm='Cancelled session prepared' then raise; end if; end;
end $$;
select pg_temp.assert_true(not has_function_privilege('anon','public.begin_booking_workout_draft(uuid,uuid)','execute'),'Anonymous preparation access');
select pg_temp.assert_true(not (select prosecdef from pg_proc where oid='public.save_workout_preparation(uuid,integer,jsonb)'::regprocedure),'Exposed privileged function');
rollback;
