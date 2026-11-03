begin;
insert into auth.users(id,aud,role,email,email_confirmed_at,raw_user_meta_data,created_at,updated_at)
select ('9a000000-0000-4000-8000-'||lpad(i::text,12,'0'))::uuid,'authenticated','authenticated','member-remove-'||i||'@example.test',now(),jsonb_build_object('full_name','Removal QA '||i),now(),now() from generate_series(1,6)i;
insert into public.organizations(id,name) values('9ab00000-0000-4000-8000-000000000001','Removal Gym A'),('9ab00000-0000-4000-8000-000000000002','Removal Gym B');
insert into public.organization_memberships(organization_id,user_id,role,status) values
('9ab00000-0000-4000-8000-000000000001','9a000000-0000-4000-8000-000000000001','owner','active'),
('9ab00000-0000-4000-8000-000000000001','9a000000-0000-4000-8000-000000000002','coach','active'),
('9ab00000-0000-4000-8000-000000000001','9a000000-0000-4000-8000-000000000003','client','active'),
('9ab00000-0000-4000-8000-000000000002','9a000000-0000-4000-8000-000000000004','owner','active'),
('9ab00000-0000-4000-8000-000000000002','9a000000-0000-4000-8000-000000000002','coach','inactive'),
('9ab00000-0000-4000-8000-000000000002','9a000000-0000-4000-8000-000000000005','client','active'),
('9ab00000-0000-4000-8000-000000000001','9a000000-0000-4000-8000-000000000006','owner','active');
insert into public.coach_client_assignments(id,organization_id,coach_user_id,client_user_id) values('9ac00000-0000-4000-8000-000000000001','9ab00000-0000-4000-8000-000000000001','9a000000-0000-4000-8000-000000000002','9a000000-0000-4000-8000-000000000003');
insert into public.workout_assignments(id,organization_id,coach_user_id,client_user_id,title,scheduled_date) values('9ad00000-0000-4000-8000-000000000001','9ab00000-0000-4000-8000-000000000001','9a000000-0000-4000-8000-000000000002','9a000000-0000-4000-8000-000000000003','Preserved workout',current_date);
insert into public.bookings(id,organization_id,coach_user_id,client_user_id,starts_at,ends_at,timezone,blocked_span,booked_by)
values('9ae00000-0000-4000-8000-000000000001','9ab00000-0000-4000-8000-000000000001','9a000000-0000-4000-8000-000000000002','9a000000-0000-4000-8000-000000000003',now()+interval '3 days',now()+interval '3 days 1 hour','America/Denver',tstzrange(now(),now()+interval '1 hour'),'9a000000-0000-4000-8000-000000000001');
create temporary table removal_before as select
 (select jsonb_agg(to_jsonb(u) order by id) from auth.users u where id::text like '9a000000-%') users,
 (select to_jsonb(w) from public.workout_assignments w where id='9ad00000-0000-4000-8000-000000000001') workout,
 (select to_jsonb(m) from public.organization_memberships m where organization_id='9ab00000-0000-4000-8000-000000000002' and user_id='9a000000-0000-4000-8000-000000000002') other_membership;
insert into public.client_intakes(organization_id,client_user_id,completed_by,version,client_name,training_frequency_goal,primary_goal,training_years,experience_level,recent_consistency,sleep_quality,stress_level,recovery_perception,soreness_fatigue,session_duration_minutes)
values('9ab00000-0000-4000-8000-000000000001','9a000000-0000-4000-8000-000000000003','9a000000-0000-4000-8000-000000000002',1,'Preserved intake',3,'strength',1,'beginner','building',3,3,3,3,60);
insert into public.workout_exercises(id,workout_assignment_id,exercise_name,sets,reps,sort_order) values('9af00000-0000-4000-8000-000000000001','9ad00000-0000-4000-8000-000000000001','Preserved result exercise',1,8,0);
update public.workout_sets set outcome_status='completed',actual_reps=8,actual_load=45,completed_at=now() where workout_exercise_id='9af00000-0000-4000-8000-000000000001';
create temporary table removal_training_before as select
 (select jsonb_agg(to_jsonb(i) order by id) from public.client_intakes i where organization_id='9ab00000-0000-4000-8000-000000000001') intake,
 (select jsonb_agg(to_jsonb(s) order by id) from public.workout_sets s where workout_exercise_id='9af00000-0000-4000-8000-000000000001') results;
set local role authenticated;
select set_config('request.jwt.claim.sub','9a000000-0000-4000-8000-000000000002',true);
do $$ begin begin perform public.remove_organization_member('9a000000-0000-4000-8000-000000000003','{}'); raise exception 'Coach removed member'; exception when insufficient_privilege then null; end; end $$;
select set_config('request.jwt.claim.sub','9a000000-0000-4000-8000-000000000003',true);
do $$ begin begin perform public.member_removal_context('9a000000-0000-4000-8000-000000000002'); raise exception 'Client read removal context'; exception when insufficient_privilege then null; end; end $$;
select set_config('request.jwt.claim.sub','9a000000-0000-4000-8000-000000000001',true);
do $$ declare context jsonb; begin
 context:=public.member_removal_context('9a000000-0000-4000-8000-000000000002');
 if jsonb_array_length(context->'bookings')<>1 or jsonb_array_length(context->'assignments')<>1 then raise exception 'Affected records not shown'; end if;
 begin perform public.remove_organization_member('9a000000-0000-4000-8000-000000000005','{}'); raise exception 'Foreign member removed'; exception when insufficient_privilege then null; end;
 begin perform public.remove_organization_member(auth.uid(),'{}'); raise exception 'Acting Owner removed'; exception when insufficient_privilege then null; end;
 begin perform public.remove_organization_member('9a000000-0000-4000-8000-000000000006','{}'); raise exception 'Additional Owner removed'; exception when insufficient_privilege then null; end;
 begin perform public.remove_organization_member('9a000000-0000-4000-8000-000000000002',array['9ac00000-0000-4000-8000-000000000001'::uuid]); raise exception 'Appointment silently resolved'; exception when invalid_parameter_value then null; end;
 begin update public.organization_memberships set status='inactive' where user_id='9a000000-0000-4000-8000-000000000002'; raise exception 'Direct removal bypass'; exception when insufficient_privilege then null; end;
 perform public.cancel_staff_booking('9ae00000-0000-4000-8000-000000000001','Explicit fixture resolution');
 begin perform public.remove_organization_member('9a000000-0000-4000-8000-000000000002','{}'); raise exception 'Assignments ended without explicit confirmation'; exception when invalid_parameter_value then null; end;
 if not public.remove_organization_member('9a000000-0000-4000-8000-000000000002',array['9ac00000-0000-4000-8000-000000000001'::uuid]) then raise exception 'Owner removal failed'; end if;
 if public.remove_organization_member('9a000000-0000-4000-8000-000000000002','{}') then raise exception 'Retry repeated removal'; end if;
 if (select count(*) from public.member_access_removals)<>1 then raise exception 'Audit missing or duplicated'; end if;
 if exists(select 1 from public.coach_client_assignments where id='9ac00000-0000-4000-8000-000000000001' and status='active') then raise exception 'Assignment still active'; end if;
 perform public.remove_organization_member('9a000000-0000-4000-8000-000000000003','{}');
 if not exists(select 1 from public.workout_assignments where id='9ad00000-0000-4000-8000-000000000001') then raise exception 'Owner lost historical workout'; end if;
end $$;
select set_config('request.jwt.claim.sub','9a000000-0000-4000-8000-000000000002',true);
do $$ begin
 if private.has_active_role('9ab00000-0000-4000-8000-000000000001',array['coach']::public.organization_role[]) or exists(select 1 from public.workout_assignments) or exists(select 1 from public.bookings) then raise exception 'Existing Coach session retained gym access'; end if;
 begin perform public.remove_organization_member('9a000000-0000-4000-8000-000000000003','{}'); raise exception 'Removed Coach removed member'; exception when insufficient_privilege then null; end;
end $$;
select set_config('request.jwt.claim.sub','9a000000-0000-4000-8000-000000000003',true);
do $$ begin if exists(select 1 from public.workout_assignments) then raise exception 'Existing Client session retained access'; end if; end $$;
select set_config('request.jwt.claim.sub','9a000000-0000-4000-8000-000000000004',true);
do $$ begin if exists(select 1 from public.member_access_removals) then raise exception 'Foreign audit exposed'; end if; end $$;
reset role;
do $$ begin
 if (select jsonb_agg(to_jsonb(u) order by id) from auth.users u where id::text like '9a000000-%') is distinct from (select users from removal_before) then raise exception 'Auth identities changed'; end if;
 if (select to_jsonb(w) from public.workout_assignments w where id='9ad00000-0000-4000-8000-000000000001') is distinct from (select workout from removal_before) then raise exception 'Workout history changed'; end if;
 if (select to_jsonb(m) from public.organization_memberships m where organization_id='9ab00000-0000-4000-8000-000000000002' and user_id='9a000000-0000-4000-8000-000000000002') is distinct from (select other_membership from removal_before) then raise exception 'Other gym membership changed'; end if;
 if (select jsonb_agg(to_jsonb(i) order by id) from public.client_intakes i where organization_id='9ab00000-0000-4000-8000-000000000001') is distinct from (select intake from removal_training_before) then raise exception 'Intake history changed'; end if;
 if (select jsonb_agg(to_jsonb(s) order by id) from public.workout_sets s where workout_exercise_id='9af00000-0000-4000-8000-000000000001') is distinct from (select results from removal_training_before) then raise exception 'Recorded results changed'; end if;
 if has_function_privilege('anon','public.remove_organization_member(uuid,uuid[])','execute') then raise exception 'Anonymous removal allowed'; end if;
end $$;
rollback;
