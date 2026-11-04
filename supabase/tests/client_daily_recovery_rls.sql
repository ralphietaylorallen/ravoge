-- Synthetic fixtures only; CI executes this in its isolated local database.
begin;
insert into auth.users(id,aud,role,email,raw_app_meta_data,raw_user_meta_data,created_at,updated_at)
select ('bc000000-0000-4000-8000-'||lpad(i::text,12,'0'))::uuid,'authenticated','authenticated','log-qa-'||i||'@example.test','{"provider":"email","providers":["email"]}'::jsonb,jsonb_build_object('full_name','Log QA '||i),now(),now() from generate_series(1,6) i;
insert into public.organizations(id,name) values('bc100000-0000-4000-8000-000000000001','Logs A'),('bc100000-0000-4000-8000-000000000002','Logs B');
insert into public.organization_memberships(organization_id,user_id,role) values
('bc100000-0000-4000-8000-000000000001','bc000000-0000-4000-8000-000000000001','owner'),
('bc100000-0000-4000-8000-000000000001','bc000000-0000-4000-8000-000000000002','coach'),
('bc100000-0000-4000-8000-000000000001','bc000000-0000-4000-8000-000000000003','client'),
('bc100000-0000-4000-8000-000000000001','bc000000-0000-4000-8000-000000000004','client'),
('bc100000-0000-4000-8000-000000000002','bc000000-0000-4000-8000-000000000005','owner'),
('bc100000-0000-4000-8000-000000000001','bc000000-0000-4000-8000-000000000006','coach');
insert into public.coach_client_assignments(organization_id,coach_user_id,client_user_id) values
('bc100000-0000-4000-8000-000000000001','bc000000-0000-4000-8000-000000000002','bc000000-0000-4000-8000-000000000003'),
('bc100000-0000-4000-8000-000000000001','bc000000-0000-4000-8000-000000000002','bc000000-0000-4000-8000-000000000004');
insert into public.workout_assignments(id,organization_id,coach_user_id,client_user_id,title,scheduled_date,status,completed_at,client_feedback) values
('bc200000-0000-4000-8000-000000000001','bc100000-0000-4000-8000-000000000001','bc000000-0000-4000-8000-000000000002','bc000000-0000-4000-8000-000000000003','Completed before recovery',current_date-1,'completed',now()-interval '1 day','Keep this result'),
('bc200000-0000-4000-8000-000000000002','bc100000-0000-4000-8000-000000000001','bc000000-0000-4000-8000-000000000002','bc000000-0000-4000-8000-000000000003','Not yet complete',current_date,'assigned',null,null),
('bc200000-0000-4000-8000-000000000003','bc100000-0000-4000-8000-000000000001','bc000000-0000-4000-8000-000000000002','bc000000-0000-4000-8000-000000000004','Other Client workout',current_date-1,'completed',now()-interval '1 day',null);
insert into public.workout_exercises(id,workout_assignment_id,exercise_name,sets,reps,load,load_unit,sort_order,completed_at) values('bc300000-0000-4000-8000-000000000001','bc200000-0000-4000-8000-000000000001','Recorded exercise',1,5,40,'lb',0,now()-interval '1 day');
create temp table log_before as select to_jsonb(w) workout,(select jsonb_agg(to_jsonb(e)) from public.workout_exercises e where e.workout_assignment_id=w.id) exercises,(select jsonb_agg(to_jsonb(s)) from public.workout_sets s join public.workout_exercises e on e.id=s.workout_exercise_id where e.workout_assignment_id=w.id) results from public.workout_assignments w where w.id='bc200000-0000-4000-8000-000000000001';

set local role authenticated;
select set_config('request.jwt.claim.sub','bc000000-0000-4000-8000-000000000003',true);
select public.save_client_daily_totals('bc100000-0000-4000-8000-000000000001',current_date-1,2100,130);
select public.save_client_daily_totals('bc100000-0000-4000-8000-000000000001',current_date-1,2200,null);
select public.save_client_daily_totals('bc100000-0000-4000-8000-000000000001',current_date,null,null);
select public.save_client_activity('bc400000-0000-4000-8000-000000000001','bc100000-0000-4000-8000-000000000001',current_date-1,'walk',20,1,'mi',null::smallint);
select public.save_client_activity('bc400000-0000-4000-8000-000000000001','bc100000-0000-4000-8000-000000000001',current_date-2,'walk',25,1.5,'mi',4::smallint);
select public.save_client_activity('bc400000-0000-4000-8000-000000000002','bc100000-0000-4000-8000-000000000001',current_date-1,'jog',15,null,'mi',null::smallint);
select public.save_client_recovery('bc100000-0000-4000-8000-000000000001','bc200000-0000-4000-8000-000000000001',current_date-1,'sauna',10,null,'F');
select public.save_client_recovery('bc100000-0000-4000-8000-000000000001','bc200000-0000-4000-8000-000000000001',current_date-2,'sauna',12,null,'F');
select public.save_client_recovery('bc100000-0000-4000-8000-000000000001','bc200000-0000-4000-8000-000000000001',current_date-1,'cold_plunge',2,8,'C');
do $$ begin
 if (select count(*) from public.client_daily_totals where log_date=current_date-1)<>1 or (select calories from public.client_daily_totals where log_date=current_date-1)<>2200 then raise exception 'Daily total duplicated or edit lost'; end if;
 if exists(select 1 from public.client_daily_totals where log_date=current_date and (calories is not null or protein_grams is not null)) then raise exception 'Missing values became zero'; end if;
 if (select count(*) from public.client_activity_entries)<>2 or not exists(select 1 from public.client_activity_entries where duration_minutes=25 and log_date=current_date-2) then raise exception 'Multiple activities/edit/date failed'; end if;
 if (select count(*) from public.client_recovery_entries)<>2 or not exists(select 1 from public.client_recovery_entries where recovery_type='sauna' and duration_minutes=12 and log_date=current_date-2) then raise exception 'Recovery duplicated or date edit lost'; end if;
 begin perform public.save_client_recovery('bc100000-0000-4000-8000-000000000001','bc200000-0000-4000-8000-000000000002',current_date,'sauna',10,null,'F'); raise exception 'Unfinished workout accepted'; exception when insufficient_privilege then null; end;
 begin perform public.save_client_recovery('bc100000-0000-4000-8000-000000000001','bc200000-0000-4000-8000-000000000003',current_date,'sauna',10,null,'F'); raise exception 'Other Client workout accepted'; exception when insufficient_privilege then null; end;
 begin perform public.save_client_daily_totals('bc100000-0000-4000-8000-000000000002',current_date,1500,null); raise exception 'Cross gym write accepted'; exception when insufficient_privilege then null; end;
 begin update public.client_activity_entries set organization_id='bc100000-0000-4000-8000-000000000002'; raise exception 'Scope moved'; exception when insufficient_privilege then null; end;
 begin perform public.save_client_activity('bc400000-0000-4000-8000-000000000003','bc100000-0000-4000-8000-000000000001',current_date,'run',0,null,'mi',null::smallint); raise exception 'Zero minutes accepted'; exception when check_violation then null; end;
end $$;
delete from public.client_activity_entries where id='bc400000-0000-4000-8000-000000000002';

-- Different Client cannot read/change/delete the first Client's entries.
select set_config('request.jwt.claim.sub','bc000000-0000-4000-8000-000000000004',true);
do $$ begin
 if exists(select 1 from public.client_daily_totals) or exists(select 1 from public.client_activity_entries) or exists(select 1 from public.client_recovery_entries) then raise exception 'Other Client read entries'; end if;
 begin perform public.save_client_activity('bc400000-0000-4000-8000-000000000001','bc100000-0000-4000-8000-000000000001',current_date,'run',30,null,'mi',null::smallint); raise exception 'Other Client edited activity'; exception when insufficient_privilege then null; end;
 delete from public.client_activity_entries;
end $$;

-- Assigned Coach and Owner can read, never author Client logs.
select set_config('request.jwt.claim.sub','bc000000-0000-4000-8000-000000000002',true);
do $$ begin
 if (select count(*) from public.client_activity_entries)<>1 or (select count(*) from public.client_recovery_entries)<>2 or (select count(*) from public.client_daily_totals)<>2 then raise exception 'Assigned Coach cannot read logs'; end if;
 update public.client_activity_entries set duration_minutes=999;
 if exists(select 1 from public.client_activity_entries where duration_minutes=999) then raise exception 'Coach changed Client log'; end if;
 begin perform public.save_client_daily_totals('bc100000-0000-4000-8000-000000000001',current_date,100,null); raise exception 'Coach authored log'; exception when insufficient_privilege then null; end;
end $$;
select set_config('request.jwt.claim.sub','bc000000-0000-4000-8000-000000000001',true);
do $$ begin if (select count(*) from public.client_recovery_entries)<>2 then raise exception 'Owner cannot read'; end if; delete from public.client_activity_entries; end $$;
select set_config('request.jwt.claim.sub','bc000000-0000-4000-8000-000000000005',true);
do $$ begin if exists(select 1 from public.client_activity_entries) or exists(select 1 from public.client_recovery_entries) or exists(select 1 from public.client_daily_totals) then raise exception 'Other gym Owner read logs'; end if; end $$;
select set_config('request.jwt.claim.sub','bc000000-0000-4000-8000-000000000006',true);
do $$ begin if exists(select 1 from public.client_activity_entries) or exists(select 1 from public.client_recovery_entries) or exists(select 1 from public.client_daily_totals) then raise exception 'Unassigned Coach read logs'; end if; end $$;
reset role;
update public.organization_memberships set status='inactive' where user_id='bc000000-0000-4000-8000-000000000003';
set local role authenticated;
select set_config('request.jwt.claim.sub','bc000000-0000-4000-8000-000000000003',true);
do $$ begin
 if exists(select 1 from public.client_activity_entries) or exists(select 1 from public.client_recovery_entries) or exists(select 1 from public.client_daily_totals) then raise exception 'Inactive session retained logs'; end if;
 begin perform public.save_client_daily_totals('bc100000-0000-4000-8000-000000000001',current_date,100,null); raise exception 'Inactive session wrote logs'; exception when insufficient_privilege then null; end;
end $$;
reset role;
do $$ begin
 if (select to_jsonb(w) from public.workout_assignments w where id='bc200000-0000-4000-8000-000000000001') is distinct from (select workout from log_before) then raise exception 'Workout completion/results changed'; end if;
 if (select jsonb_agg(to_jsonb(e)) from public.workout_exercises e where workout_assignment_id='bc200000-0000-4000-8000-000000000001') is distinct from (select exercises from log_before) then raise exception 'Exercise results changed'; end if;
 if (select jsonb_agg(to_jsonb(s)) from public.workout_sets s join public.workout_exercises e on e.id=s.workout_exercise_id where e.workout_assignment_id='bc200000-0000-4000-8000-000000000001') is distinct from (select results from log_before) then raise exception 'Set history changed'; end if;
 if (select count(*) from public.client_activity_entries where organization_id='bc100000-0000-4000-8000-000000000001')<>1 then raise exception 'Unauthorized delete succeeded'; end if;
 if has_function_privilege('anon','public.save_client_recovery(uuid,uuid,date,text,numeric,numeric,text)','execute') then raise exception 'Anonymous RPC allowed'; end if;
 if exists(select 1 from pg_class where oid in ('public.client_daily_totals'::regclass,'public.client_activity_entries'::regclass,'public.client_recovery_entries'::regclass) and not relrowsecurity) then raise exception 'RLS missing'; end if;
end $$;
select 'Client daily/recovery dates, idempotence, ordinary-role boundaries and unchanged workout history passed';
rollback;
