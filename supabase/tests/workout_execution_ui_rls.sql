begin;
insert into auth.users(id,aud,role,email,encrypted_password,email_confirmed_at,raw_app_meta_data,raw_user_meta_data,created_at,updated_at) values
('d1000000-0000-4000-8000-000000000001','authenticated','authenticated','ui-owner@example.test',crypt('TestPass123!',gen_salt('bf')),now(),'{}','{"full_name":"UI Owner"}',now(),now()),
('d1000000-0000-4000-8000-000000000002','authenticated','authenticated','ui-coach@example.test',crypt('TestPass123!',gen_salt('bf')),now(),'{}','{"full_name":"UI Coach"}',now(),now()),
('d1000000-0000-4000-8000-000000000003','authenticated','authenticated','ui-client@example.test',crypt('TestPass123!',gen_salt('bf')),now(),'{}','{"full_name":"UI Client"}',now(),now()),
('d1000000-0000-4000-8000-000000000004','authenticated','authenticated','ui-other-coach@example.test',crypt('TestPass123!',gen_salt('bf')),now(),'{}','{"full_name":"Other Coach"}',now(),now());
insert into public.organizations(id,name) values('da000000-0000-4000-8000-000000000001','UI Test Gym');
insert into public.organization_memberships(organization_id,user_id,role) values
('da000000-0000-4000-8000-000000000001','d1000000-0000-4000-8000-000000000001','owner'),
('da000000-0000-4000-8000-000000000001','d1000000-0000-4000-8000-000000000002','coach'),
('da000000-0000-4000-8000-000000000001','d1000000-0000-4000-8000-000000000003','client'),
('da000000-0000-4000-8000-000000000001','d1000000-0000-4000-8000-000000000004','coach');
insert into public.coach_client_assignments(organization_id,coach_user_id,client_user_id) values('da000000-0000-4000-8000-000000000001','d1000000-0000-4000-8000-000000000002','d1000000-0000-4000-8000-000000000003');
set local role authenticated;
select set_config('request.jwt.claim.sub','d1000000-0000-4000-8000-000000000002',true);
do $$ declare w uuid; s uuid; outcome text; checkin uuid; begin
  w:=public.create_workout_assignment('d1000000-0000-4000-8000-000000000003','UI Bench Session',null,current_date,'[{"name":"Bench Press","sets":3,"reps":8,"load":60}]');
  select ws.id into strict s from public.workout_sets ws join public.workout_exercises e on e.id=ws.workout_exercise_id where e.workout_assignment_id=w and ws.set_number=1;
  begin perform public.save_coach_workout_session(w,null,45,true); raise exception 'Unrecorded sets allowed completion'; exception when others then if sqlerrm='Unrecorded sets allowed completion' then raise; end if; end;
  begin perform public.record_coach_workout_set(s,'failed',4,60,null,null); raise exception 'Failed set missing reason accepted'; exception when others then if sqlerrm='Failed set missing reason accepted' then raise; end if; end;
  outcome:=public.record_coach_workout_set(s,'complete',10,60,null,'Extra two reps');
  if outcome<>'exceeded' or not exists(select 1 from public.workout_sets where id=s and prescribed_reps=8 and actual_reps=10 and prescribed_load=60 and actual_load=60) then raise exception 'Prescribed and actual values were not separated'; end if;
  select ws.id into strict s from public.workout_sets ws join public.workout_exercises e on e.id=ws.workout_exercise_id where e.workout_assignment_id=w and ws.set_number=2;
  perform public.record_coach_workout_set(s,'failed',4,60,'failed_reps','Failed on rep 5');
  if not exists(select 1 from public.workout_sets where id=s and execution_result='failed' and failure_reason='failed_reps') then raise exception 'Failed outcome not preserved'; end if;
  select ws.id into strict s from public.workout_sets ws join public.workout_exercises e on e.id=ws.workout_exercise_id where e.workout_assignment_id=w and ws.set_number=3;
  perform public.record_coach_workout_set(s,'not_completed',null,null,null,'Session ended');
  checkin:=public.record_coach_preworkout_checkin('d1000000-0000-4000-8000-000000000003',null,w,'[{"position":1,"answer":5},{"position":2,"answer":5},{"position":3,"answer":5},{"position":4,"answer":5},{"position":5,"answer":5},{"position":6,"answer":5},{"position":7,"answer":5},{"position":8,"answer":5}]');
  if (select count(*) from public.preworkout_checkin_answers where checkin_id=checkin and question_id is not null and question_version=1)<>8 then raise exception 'Question identity/version snapshots missing'; end if;
  perform public.save_coach_workout_session(w,'Finished with one failed set',45,true);
  if not exists(select 1 from public.workout_assignments where id=w and status='completed' and execution_duration_minutes=45) then raise exception 'Completion summary missing'; end if;
  begin perform public.record_coach_workout_set(s,'complete',8,60,null,null); raise exception 'Completed workout was silently edited'; exception when others then if sqlerrm='Completed workout was silently edited' then raise; end if; end;
end $$;
reset role;
set local role authenticated;
select set_config('request.jwt.claim.sub','d1000000-0000-4000-8000-000000000004',true);
do $$ begin
  if exists(select 1 from public.get_my_assigned_coach()) then raise exception 'Coach received a Client-only coach card'; end if;
  if exists(select 1 from public.workout_sets) then raise exception 'Unassigned Coach read outcomes'; end if;
  begin perform public.record_coach_preworkout_checkin('d1000000-0000-4000-8000-000000000003',null,null,'[]'); raise exception 'Unassigned Coach recorded check-in'; exception when others then if sqlerrm='Unassigned Coach recorded check-in' then raise; end if; end;
end $$;
reset role;
set local role authenticated;
select set_config('request.jwt.claim.sub','d1000000-0000-4000-8000-000000000003',true);
do $$ declare s uuid; begin
  if exists(select 1 from public.list_other_assigned_clients_for_coach()) then raise exception 'Client read the Coach directory'; end if;
  if (select count(*) from public.get_my_assigned_coach())<>1 or not exists(select 1 from public.get_my_assigned_coach() where coach_user_id='d1000000-0000-4000-8000-000000000002') then raise exception 'Client assigned Coach card is missing or incorrect'; end if;
  select id into s from public.workout_sets limit 1;
  if s is null then raise exception 'Client cannot read own outcomes'; end if;
  begin perform public.record_coach_workout_set(s,'complete',12,80,null,null); raise exception 'Client changed Coach outcomes'; exception when others then if sqlerrm='Client changed Coach outcomes' then raise; end if; end;
  begin update public.workout_sets set prescribed_reps=99 where id=s; raise exception 'Client altered target'; exception when insufficient_privilege then null; end;
end $$;
reset role;
update public.organization_memberships set status='inactive' where user_id='d1000000-0000-4000-8000-000000000002';
set local role authenticated;
do $$ begin if exists(select 1 from public.get_my_assigned_coach()) then raise exception 'Inactive Coach remained bookable'; end if; end $$;
rollback;
