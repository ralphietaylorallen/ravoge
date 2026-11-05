-- Synthetic fixtures only; CI executes this in its isolated local database.
begin;
insert into auth.users(id,aud,role,email,raw_app_meta_data,raw_user_meta_data,created_at,updated_at)
select ('bd000000-0000-4000-8000-'||lpad(i::text,12,'0'))::uuid,'authenticated','authenticated','report-qa-'||i||'@example.test','{"provider":"email","providers":["email"]}'::jsonb,jsonb_build_object('full_name','Log QA '||i),now(),now() from generate_series(1,6) i;
insert into public.organizations(id,name) values('bd100000-0000-4000-8000-000000000001','Report A'),('bd100000-0000-4000-8000-000000000002','Report B');
insert into public.organization_memberships(organization_id,user_id,role) values
('bd100000-0000-4000-8000-000000000001','bd000000-0000-4000-8000-000000000001','owner'),
('bd100000-0000-4000-8000-000000000001','bd000000-0000-4000-8000-000000000002','coach'),
('bd100000-0000-4000-8000-000000000001','bd000000-0000-4000-8000-000000000003','client'),
('bd100000-0000-4000-8000-000000000001','bd000000-0000-4000-8000-000000000004','client'),
('bd100000-0000-4000-8000-000000000002','bd000000-0000-4000-8000-000000000005','owner'),
('bd100000-0000-4000-8000-000000000001','bd000000-0000-4000-8000-000000000006','coach');
insert into public.coach_client_assignments(organization_id,coach_user_id,client_user_id) values
('bd100000-0000-4000-8000-000000000001','bd000000-0000-4000-8000-000000000002','bd000000-0000-4000-8000-000000000003'),
('bd100000-0000-4000-8000-000000000001','bd000000-0000-4000-8000-000000000002','bd000000-0000-4000-8000-000000000004');
insert into public.workout_assignments(id,organization_id,coach_user_id,client_user_id,title,scheduled_date,status,completed_at,client_feedback) values
('bd200000-0000-4000-8000-000000000001','bd100000-0000-4000-8000-000000000001','bd000000-0000-4000-8000-000000000002','bd000000-0000-4000-8000-000000000003','Completed before recovery',current_date-1,'completed',now()-interval '1 day','Keep this result'),
('bd200000-0000-4000-8000-000000000002','bd100000-0000-4000-8000-000000000001','bd000000-0000-4000-8000-000000000002','bd000000-0000-4000-8000-000000000003','Not yet complete',current_date,'assigned',null,null),
('bd200000-0000-4000-8000-000000000003','bd100000-0000-4000-8000-000000000001','bd000000-0000-4000-8000-000000000002','bd000000-0000-4000-8000-000000000004','Other Client workout',current_date-1,'completed',now()-interval '1 day',null);
insert into public.workout_exercises(id,workout_assignment_id,exercise_name,sets,reps,load,load_unit,sort_order,completed_at) values('bd300000-0000-4000-8000-000000000001','bd200000-0000-4000-8000-000000000001','Recorded exercise',1,5,40,'lb',0,now()-interval '1 day');
create temp table log_before as select to_jsonb(w) workout,(select jsonb_agg(to_jsonb(e)) from public.workout_exercises e where e.workout_assignment_id=w.id) exercises,(select jsonb_agg(to_jsonb(s)) from public.workout_sets s join public.workout_exercises e on e.id=s.workout_exercise_id where e.workout_assignment_id=w.id) results from public.workout_assignments w where w.id='bd200000-0000-4000-8000-000000000001';


update public.organizations set timezone='UTC' where id in ('bd100000-0000-4000-8000-000000000001','bd100000-0000-4000-8000-000000000002');
-- Fixtures are transaction-local. Completion is exercised through the real ordinary Coach RPC.
create temp table report_before as select to_jsonb(w) row from public.workout_assignments w where id='bd200000-0000-4000-8000-000000000001';
set local role authenticated;
select set_config('request.jwt.claim.sub','bd000000-0000-4000-8000-000000000003',true);
select public.ensure_completed_session_report('bd200000-0000-4000-8000-000000000001');
select public.ensure_completed_session_report('bd200000-0000-4000-8000-000000000001');
select public.save_client_recovery_entry('bd400000-0000-4000-8000-000000000001','bd200000-0000-4000-8000-000000000001',current_date-1,(current_date-1)::timestamp at time zone 'UTC','sauna',10,null,'F','First','Relaxed');
select public.save_client_recovery_entry('bd400000-0000-4000-8000-000000000001','bd200000-0000-4000-8000-000000000001',current_date-1,(current_date-1)::timestamp at time zone 'UTC','sauna',12,null,'F','Edited','Good');
select public.save_client_recovery_entry('bd400000-0000-4000-8000-000000000002','bd200000-0000-4000-8000-000000000001',current_date-1,((current_date-1)::timestamp at time zone 'UTC')+interval '1 hour','sauna',8,null,'F',null,null);
do $$ declare facts jsonb; begin
 if (select count(*) from public.workout_session_reports)<>1 then raise exception 'Report retry duplicated/missing'; end if;
 if (select score_snapshot->>'status' from public.workout_session_reports)<>'pending' or (select score_snapshot->>'value' from public.workout_session_reports) is not null then raise exception 'Invented score'; end if;
 if (select count(*) from public.client_recovery_entries where deleted_at is null)<>2 then raise exception 'Separate sauna sessions or save idempotence failed'; end if;
 if not exists(select 1 from public.client_recovery_entries where duration_minutes=12 and notes='Edited' and occurred_at is not null) then raise exception 'Recovery edit lost'; end if;
 begin update public.client_recovery_entries set log_date=current_date-2 where id='bd400000-0000-4000-8000-000000000001'; raise exception 'Date changed without its known occurrence'; exception when check_violation then null; end;
 facts:=public.get_six_week_report_context('bd100000-0000-4000-8000-000000000001','bd000000-0000-4000-8000-000000000003',current_date);
 if jsonb_array_length(facts->'reports')<>1 or jsonb_array_length(facts->'recovery')<>2 then raise exception 'Period coverage failed'; end if;
 begin perform public.share_six_week_report('bd100000-0000-4000-8000-000000000001','bd000000-0000-4000-8000-000000000003',current_date,'Self','No'); raise exception 'Client published Coach report'; exception when insufficient_privilege then null; end;
 begin update public.workout_session_reports set source_snapshot='{}'; raise exception 'Snapshot altered'; exception when insufficient_privilege then null; end;
 begin perform public.save_client_recovery_entry('bd400000-0000-4000-8000-000000000003','bd200000-0000-4000-8000-000000000003',current_date-1,(current_date-1)::timestamp at time zone 'UTC','sauna',10,null,'F',null,null); raise exception 'Other Client recovery written'; exception when insufficient_privilege then null; end;
end $$;
select public.remove_client_recovery_entry('bd400000-0000-4000-8000-000000000002');
-- Other Client, unrelated Coach and other-gym Owner have no reads or mutation access.
select set_config('request.jwt.claim.sub','bd000000-0000-4000-8000-000000000004',true);
do $$ begin
 if exists(select 1 from public.workout_session_reports) then raise exception 'Cross Client report leak'; end if;
 begin perform public.get_six_week_report_context('bd100000-0000-4000-8000-000000000001','bd000000-0000-4000-8000-000000000003',current_date); raise exception 'Cross Client progress leak'; exception when insufficient_privilege then null; end;
 begin perform public.remove_client_recovery_entry('bd400000-0000-4000-8000-000000000001'); raise exception 'Other Client deleted recovery'; exception when insufficient_privilege then null; end;
end $$;
select set_config('request.jwt.claim.sub','bd000000-0000-4000-8000-000000000006',true);
do $$ begin if exists(select 1 from public.workout_session_reports) then raise exception 'Unassigned Coach report leak'; end if; end $$;
select set_config('request.jwt.claim.sub','bd000000-0000-4000-8000-000000000005',true);
do $$ begin
 if exists(select 1 from public.workout_session_reports) then raise exception 'Cross gym report leak'; end if;
 begin perform public.share_six_week_report('bd100000-0000-4000-8000-000000000001','bd000000-0000-4000-8000-000000000003',current_date,'Wrong gym','No'); raise exception 'Cross gym share'; exception when insufficient_privilege then null; end;
end $$;
select set_config('request.jwt.claim.sub','bd000000-0000-4000-8000-000000000002',true);
do $$ declare w uuid;s uuid;shared uuid;again uuid;revision uuid; begin
 if (select count(*) from public.workout_session_reports)<>1 then raise exception 'Assigned Coach missing same report'; end if;
 shared:=public.share_six_week_report('bd100000-0000-4000-8000-000000000001','bd000000-0000-4000-8000-000000000003',current_date,'Factual Coach summary','Review next block');
 again:=public.share_six_week_report('bd100000-0000-4000-8000-000000000001','bd000000-0000-4000-8000-000000000003',current_date,'Factual Coach summary','Review next block');
 if shared<>again then raise exception 'Share retry duplicated'; end if;
 begin perform public.share_six_week_report('bd100000-0000-4000-8000-000000000001','bd000000-0000-4000-8000-000000000003',current_date,'Different','Changed'); raise exception 'Silent revision'; exception when others then if sqlerrm='Silent revision' then raise; end if; end;
 revision:=public.share_six_week_report('bd100000-0000-4000-8000-000000000001','bd000000-0000-4000-8000-000000000003',current_date,'Different','Changed',shared);
 if revision=shared or (select coach_summary from public.client_progress_report_shares where id=shared)<>'Factual Coach summary' then raise exception 'Old snapshot overwritten'; end if;
 w:=public.create_workout_assignment('bd000000-0000-4000-8000-000000000003','Report completion test',null,current_date,'[{"name":"QA squat","sets":1,"reps":10,"load":25}]');
 select ws.id into strict s from public.workout_sets ws join public.workout_exercises e on e.id=ws.workout_exercise_id where e.workout_assignment_id=w;
 perform public.record_coach_workout_set_lb(s,'complete',10,25,null,null);
 perform public.save_coach_workout_session(w,'Actual saved recap',35,true);
 if not exists(select 1 from public.workout_session_reports where workout_assignment_id=w and source_snapshot->'workout'->>'execution_duration_minutes'='35' and source_snapshot->'workout'->>'execution_coach_notes'='Actual saved recap') then raise exception 'Completion trigger did not archive real result'; end if;
 perform public.ensure_completed_session_report(w);
 if not exists(select 1 from jsonb_array_elements(public.get_session_report_week(w)->'completed') c where c->>'id'=w::text) then raise exception 'Gym-week completed sessions missing'; end if;
 if (select count(*) from public.workout_session_reports where workout_assignment_id=w)<>1 then raise exception 'Completion report duplicated'; end if;
end $$;
select set_config('request.jwt.claim.sub','bd000000-0000-4000-8000-000000000003',true);
do $$ begin
 if (select count(*) from public.client_progress_report_shares)<>2 then raise exception 'Client missing shared snapshots'; end if;
 if (select count(*) from public.workout_session_reports)<>2 then raise exception 'Client missing completed report'; end if;
end $$;
reset role;
do $$ begin
 if not exists(select 1 from public.workout_assignments w,report_before b where w.id='bd200000-0000-4000-8000-000000000001' and to_jsonb(w)=b.row) then raise exception 'Recovery modified training'; end if;
 if not exists(select 1 from public.client_recovery_entries where id='bd400000-0000-4000-8000-000000000002' and deleted_at is not null) then raise exception 'Deleted recovery audit lost'; end if;
 if exists(select 1 from pg_class where oid in ('public.workout_session_reports'::regclass,'public.client_progress_report_shares'::regclass) and not relrowsecurity) then raise exception 'RLS missing'; end if;
end $$;
update public.organization_memberships set status='inactive' where user_id='bd000000-0000-4000-8000-000000000003';
set local role authenticated;
select set_config('request.jwt.claim.sub','bd000000-0000-4000-8000-000000000003',true);
do $$ begin if exists(select 1 from public.workout_session_reports) or exists(select 1 from public.client_progress_report_shares) then raise exception 'Inactive Client retained access'; end if; end $$;
select 'Session report completion/idempotence/recovery/immutable sharing and ordinary-role isolation passed';
rollback;
