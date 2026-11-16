begin;

create function pg_temp.assert_true(value boolean,message text) returns void language plpgsql as $$ begin if value is distinct from true then raise exception '%',message; end if; end $$;
create temporary table beta_ids(kind text primary key,id uuid not null);
grant select,insert,update on beta_ids to authenticated;

insert into auth.users(id,aud,role,email,email_confirmed_at,raw_app_meta_data,raw_user_meta_data,created_at,updated_at)
select ('ab100000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid,'authenticated','authenticated','assisted-generation-'||n||'@example.test',now(),'{}',jsonb_build_object('full_name','Beta QA '||n),now(),now() from generate_series(1,9) n;
insert into public.organizations(id,name) values('ab200000-0000-4000-8000-000000000001','Beta Isolated A'),('ab200000-0000-4000-8000-000000000002','Beta Isolated B');
insert into public.organization_memberships(organization_id,user_id,role) values
('ab200000-0000-4000-8000-000000000001','ab100000-0000-4000-8000-000000000001','owner'),
('ab200000-0000-4000-8000-000000000001','ab100000-0000-4000-8000-000000000002','coach'),
('ab200000-0000-4000-8000-000000000001','ab100000-0000-4000-8000-000000000003','client'),
('ab200000-0000-4000-8000-000000000002','ab100000-0000-4000-8000-000000000004','owner'),
('ab200000-0000-4000-8000-000000000002','ab100000-0000-4000-8000-000000000005','coach'),
('ab200000-0000-4000-8000-000000000002','ab100000-0000-4000-8000-000000000006','client');
insert into public.coach_client_assignments(organization_id,coach_user_id,client_user_id)
values('ab200000-0000-4000-8000-000000000001','ab100000-0000-4000-8000-000000000002','ab100000-0000-4000-8000-000000000003');
insert into public.training_library_items(id,organization_id,title,created_by,source_type,normalized_content) values
('ab300000-0000-4000-8000-000000000001','ab200000-0000-4000-8000-000000000001','Original source','ab100000-0000-4000-8000-000000000001','csv','{"cells":[{"header":"Description","raw":"Goblet Squat 3 x 8\nDumbbell RDL 3 x 8\nBand Row 3 x 8"}]}'),
('ab300000-0000-4000-8000-000000000002','ab200000-0000-4000-8000-000000000001','Complex source','ab100000-0000-4000-8000-000000000001','csv','{"cells":[{"header":"Description","raw":"EMOM 15 Minutes\nGoblet Squat x8 @ 50-60% each side"}]}');
insert into beta_ids(kind,id) select name,id from public.exercise_library where organization_id is null and name in ('Goblet Squat','Dumbbell RDL','Band Row');

set local role authenticated;
select set_config('request.jwt.claim.sub','ab100000-0000-4000-8000-000000000001',true);
select public.add_equipment_checklist(array['dumbbells','bands']);
select public.add_equipment_checklist(array['dumbbells','bands']);
select pg_temp.assert_true((select count(*)=2 from public.organization_equipment),'Equipment checklist created duplicate inventory');
select pg_temp.assert_true((public.get_workout_generation_readiness('ab100000-0000-4000-8000-000000000003')->>'ready')::boolean=false,'Missing intake reported ready');
insert into beta_ids values('review',public.review_training_library_item('ab300000-0000-4000-8000-000000000001','Published gym strength','published','strength',45,
  (select jsonb_agg(jsonb_build_object('libraryExerciseId',id,'sets',3,'reps',8,'sourceText',kind||' 3 x 8','load',null,'restSeconds',null,'notes','') order by case kind when 'Goblet Squat' then 1 when 'Dumbbell RDL' then 2 else 3 end) from beta_ids where kind in ('Goblet Squat','Dumbbell RDL','Band Row')),'Reviewed against the original explicit source'));
do $$ begin
  begin
    perform public.review_training_library_item('ab300000-0000-4000-8000-000000000002','Unsafe flattening','published','strength',45,
      jsonb_build_array(jsonb_build_object('libraryExerciseId',(select id from beta_ids where kind='Goblet Squat'),'sets',3,'reps',8,'sourceText','Invented fixed target')),'Must not publish');
    raise exception 'Complex source was flattened and published';
  exception when raise_exception then if sqlerrm='Complex source was flattened and published' then raise; end if; end;
  begin
    perform public.review_training_library_item('ab300000-0000-4000-8000-000000000001','Altered target','published','strength',45,
      jsonb_build_array(jsonb_build_object('libraryExerciseId',(select id from beta_ids where kind='Goblet Squat'),'sets',99,'reps',8,'sourceText','Invented')),'Must not publish');
    raise exception 'Invented source quantities published';
  exception when raise_exception then if sqlerrm='Invented source quantities published' then raise; end if; end;
end $$;
select public.review_training_library_item('ab300000-0000-4000-8000-000000000002','Complex source','review',null,null,'[]','Timed and percentage protocol requires review');
select pg_temp.assert_true((select normalized_content->'cells'->0->>'raw'='EMOM 15 Minutes'||E'\n'||'Goblet Squat x8 @ 50-60% each side' from public.training_library_items where id='ab300000-0000-4000-8000-000000000002'),'Raw source changed');

-- Refresh reads email, gym and role from the locked invitation, not request data.
insert into beta_ids select 'invite',invitation_id from public.create_organization_invitation(' ASSISTED-GENERATION-7@EXAMPLE.TEST ','coach',encode(extensions.digest('assisted-generation-invite-original-000001','sha256'),'hex'),now()+interval '1 day');
select * from public.refresh_organization_invitation((select id from beta_ids where kind='invite'),encode(extensions.digest('assisted-generation-invite-refreshed-00001','sha256'),'hex'),now()+interval '7 days');
select pg_temp.assert_true((select email='assisted-generation-7@example.test' and role='coach' and organization_id='ab200000-0000-4000-8000-000000000001' from public.organization_invitations where id=(select id from beta_ids where kind='invite')),'Refresh changed recipient, role or gym');
select public.record_organization_invitation_delivery((select id from beta_ids where kind='invite'),'not_configured',null,null);
select pg_temp.assert_true((select delivery_status='not_configured' from public.organization_invitations where id=(select id from beta_ids where kind='invite')),'Unconfigured invitation marked sent');

-- A different Owner cannot read, publish, refresh or generate across organizations.
select set_config('request.jwt.claim.sub','ab100000-0000-4000-8000-000000000004',true);
select pg_temp.assert_true(not exists(select 1 from public.training_library_reviews),'Cross-organization review read');
do $$ begin
  begin perform * from public.refresh_organization_invitation((select id from beta_ids where kind='invite'),repeat('d',64),now()+interval '1 day'); raise exception 'Cross-org refresh'; exception when raise_exception then if sqlerrm='Cross-org refresh' then raise; end if; end;
  begin perform public.get_workout_generation_readiness('ab100000-0000-4000-8000-000000000003'); raise exception 'Cross-org readiness'; exception when raise_exception then if sqlerrm='Cross-org readiness' then raise; end if; end;
  begin perform public.review_training_library_item('ab300000-0000-4000-8000-000000000001','Cross-org','review',null,null,'[]','Attempt'); raise exception 'Cross-org publication'; exception when raise_exception then if sqlerrm='Cross-org publication' then raise; end if; end;
end $$;
select set_config('request.jwt.claim.sub','ab100000-0000-4000-8000-000000000008',true);
do $$ begin
  begin perform public.accept_organization_enrollment('assisted-generation-invite-refreshed-00001'); raise exception 'Wrong email accepted'; exception when others then if sqlerrm='Wrong email accepted' then raise; end if; end;
end $$;
select set_config('request.jwt.claim.sub','ab100000-0000-4000-8000-000000000007',true);
select public.register_unaffiliated_account_type('coach');
do $$ begin
  begin perform public.accept_organization_enrollment('assisted-generation-invite-original-000001'); raise exception 'Replaced invite accepted'; exception when others then if sqlerrm='Replaced invite accepted' then raise; end if; end;
end $$;
select public.accept_organization_enrollment('assisted-generation-invite-refreshed-00001');
select public.accept_organization_enrollment('assisted-generation-invite-refreshed-00001');
select pg_temp.assert_true((select count(*)=1 from public.organization_memberships where user_id='ab100000-0000-4000-8000-000000000007'),'Existing identity acceptance duplicated membership');
do $$ begin
  begin perform * from public.create_organization_invitation('assisted-generation-9@example.test','owner',repeat('c',64),now()+interval '1 day'); raise exception 'Coach self-promotion'; exception when raise_exception then if sqlerrm='Coach self-promotion' then raise; end if; end;
  begin perform * from public.refresh_organization_invitation((select id from beta_ids where kind='invite'),repeat('b',64),now()+interval '1 day'); raise exception 'Coach refreshed Owner invite'; exception when raise_exception then if sqlerrm='Coach refreshed Owner invite' then raise; end if; end;
end $$;

-- Expiry and revocation are enforced at acceptance, independently of the UI.
select set_config('request.jwt.claim.sub','ab100000-0000-4000-8000-000000000001',true);
insert into beta_ids select 'expires',invitation_id from public.create_organization_invitation('assisted-generation-9@example.test','coach',encode(extensions.digest('assisted-generation-expiring-invite-000001','sha256'),'hex'),now()+interval '1 day');
reset role;
update public.organization_invitations set created_at=now()-interval '2 days',expires_at=now()-interval '1 second' where id=(select id from beta_ids where kind='expires');
set local role authenticated;
select set_config('request.jwt.claim.sub','ab100000-0000-4000-8000-000000000009',true);
do $$ begin
  begin perform public.accept_organization_enrollment('assisted-generation-expiring-invite-000001'); raise exception 'Expired invitation accepted'; exception when others then if sqlerrm='Expired invitation accepted' then raise; end if; end;
end $$;
select set_config('request.jwt.claim.sub','ab100000-0000-4000-8000-000000000001',true);
select * from public.refresh_organization_invitation((select id from beta_ids where kind='expires'),encode(extensions.digest('assisted-generation-renewed-invite-0000001','sha256'),'hex'),now()+interval '7 days');
select public.revoke_organization_invitation((select id from beta_ids where kind='expires'));
select set_config('request.jwt.claim.sub','ab100000-0000-4000-8000-000000000009',true);
do $$ begin
  begin perform public.accept_organization_enrollment('assisted-generation-renewed-invite-0000001'); raise exception 'Revoked invitation accepted'; exception when others then if sqlerrm='Revoked invitation accepted' then raise; end if; end;
end $$;

-- Scoped recent context fixtures (never production data).
reset role;
insert into public.coach_client_assignments(organization_id,coach_user_id,client_user_id)
values('ab200000-0000-4000-8000-000000000002','ab100000-0000-4000-8000-000000000005','ab100000-0000-4000-8000-000000000006');
insert into public.workout_assignments(id,organization_id,coach_user_id,client_user_id,title,scheduled_date,status,completed_at,client_feedback) values
('ab600000-0000-4000-8000-000000000001','ab200000-0000-4000-8000-000000000001','ab100000-0000-4000-8000-000000000002','ab100000-0000-4000-8000-000000000003','Report context',current_date-1,'completed',now()-interval '1 day','Own scoped feedback'),
('ab600000-0000-4000-8000-000000000002','ab200000-0000-4000-8000-000000000002','ab100000-0000-4000-8000-000000000005','ab100000-0000-4000-8000-000000000006','Other gym',current_date-1,'completed',now()-interval '1 day','MUST NOT LEAK');
insert into public.client_recovery_entries(organization_id,client_user_id,workout_assignment_id,log_date,recovery_type,duration_minutes,occurred_at,notes) values
('ab200000-0000-4000-8000-000000000001','ab100000-0000-4000-8000-000000000003','ab600000-0000-4000-8000-000000000001',((now()-interval '1 day') at time zone (select timezone from public.organizations where id='ab200000-0000-4000-8000-000000000001'))::date,'sauna',12,now()-interval '1 day','Own recovery'),
('ab200000-0000-4000-8000-000000000002','ab100000-0000-4000-8000-000000000006','ab600000-0000-4000-8000-000000000002',((now()-interval '1 day') at time zone (select timezone from public.organizations where id='ab200000-0000-4000-8000-000000000002'))::date,'sauna',15,now()-interval '1 day','MUST NOT LEAK');
set local role authenticated;
-- Coach-led intake -> published source -> draft -> approval -> Client visibility.
select set_config('request.jwt.claim.sub','ab100000-0000-4000-8000-000000000002',true);
insert into beta_ids values('intake',public.upsert_client_intake('ab100000-0000-4000-8000-000000000003',
 '{"trainingFrequencyGoal":3,"primaryGoal":"strength","trainingYears":1,"experienceLevel":"beginner","recentConsistency":"building","sessionDurationMinutes":45,"sleepQuality":3,"stressLevel":3,"recoveryPerception":3,"sorenessFatigue":3,"constraintTags":[],"customFields":{}}'));
select pg_temp.assert_true((public.get_workout_generation_readiness('ab100000-0000-4000-8000-000000000003')->>'needsSafetyReview')::boolean,'Intake safety confirmation was skipped');
do $$ begin
  begin perform public.generate_initial_prescription_v0('ab100000-0000-4000-8000-000000000003'); raise exception 'Unreviewed safety generated'; exception when raise_exception then if sqlerrm='Unreviewed safety generated' then raise; end if; end;
end $$;
select public.confirm_intake_generation_safety((select id from beta_ids where kind='intake'));
select pg_temp.assert_true(public.get_workout_generation_readiness('ab100000-0000-4000-8000-000000000003')->>'sourceType'='organization_workout','Published gym workout was not preferred');

select set_config('request.jwt.claim.sub','ab100000-0000-4000-8000-000000000001',true);
insert into beta_ids values('owner-readiness',public.submit_training_readiness('ab100000-0000-4000-8000-000000000003',null,array[4,4,4,4,4]::smallint[],null));
select public.review_training_readiness((select id from beta_ids where kind='owner-readiness'),'accepted','Owner checked current readiness before an unscheduled session');
insert into beta_ids values('owner-draft',public.generate_initial_prescription_v0('ab100000-0000-4000-8000-000000000003'));
select pg_temp.assert_true((select coach_user_id=auth.uid() from public.generated_prescriptions where id=(select id from beta_ids where kind='owner-draft')),'Owner was not recorded as trainer');
select pg_temp.assert_true(public.get_pound_generation_input((select id from beta_ids where kind='owner-draft'))->>'intakeId'=(select id::text from beta_ids where kind='intake'),'Owner cannot load exact Client generation inputs');
select public.get_recent_session_report_context((select id from beta_ids where kind='owner-draft'));
select public.complete_quality_prescription((select id from beta_ids where kind='owner-draft'),public.get_quality_generation_input((select id from beta_ids where kind='owner-draft'))->>'snapshot',null,'{"reason":"not_configured"}'::jsonb);
select public.save_workout_preparation((select id from beta_ids where kind='owner-draft'),0,jsonb_build_object('title','Owner Workout Now','instructions','','scheduledDate',current_date,'duration',45,'exercises',(select original_recommendation from public.generated_prescriptions where id=(select id from beta_ids where kind='owner-draft'))));
insert into beta_ids values('owner-workout',public.approve_prepared_prescription((select id from beta_ids where kind='owner-draft'),1,'Owner Workout Now',null,current_date,45::smallint,(select jsonb_agg(x||jsonb_build_object('loadUnit','lb','load',case when r.prescription_type in ('weighted','carry','sled') then coalesce(r.minimum_lb,5) else null end,'bandResistance',case when r.prescription_type='band' then 'Light band' else null end)) from public.generated_prescriptions p cross join lateral jsonb_array_elements(p.original_recommendation) x left join public.exercise_load_rules r on r.exercise_id=(x->>'libraryExerciseId')::uuid and r.organization_id is null and r.active where p.id=(select id from beta_ids where kind='owner-draft'))));
select public.manage_quality_workout((select id from beta_ids where kind='owner-workout'),'start',null,null);
select pg_temp.assert_true((select status='in_progress' from public.workout_assignments where id=(select id from beta_ids where kind='owner-workout')),'Unscheduled Owner workout could not start');
select pg_temp.assert_true((select count(*)=0 from public.bookings where organization_id='ab200000-0000-4000-8000-000000000001'),'Workout Now created a booking');
-- Owner in a different organization and unassigned Coach must remain denied.
select set_config('request.jwt.claim.sub','ab100000-0000-4000-8000-000000000004',true);
do $$begin begin perform public.generate_initial_prescription_v0('ab100000-0000-4000-8000-000000000003'); raise exception 'LEAK cross gym owner'; exception when others then if sqlerrm='LEAK cross gym owner' then raise; end if; end; end$$;
select set_config('request.jwt.claim.sub','ab100000-0000-4000-8000-000000000005',true);
do $$begin begin perform public.generate_initial_prescription_v0('ab100000-0000-4000-8000-000000000003'); raise exception 'LEAK unassigned coach'; exception when others then if sqlerrm='LEAK unassigned coach' then raise; end if; end; end$$;
select set_config('request.jwt.claim.sub','ab100000-0000-4000-8000-000000000003',true);
select pg_temp.assert_true(exists(select 1 from public.workout_assignments where id=(select id from beta_ids where kind='owner-workout')),'Client cannot see Owner-created workout');
select public.manage_quality_workout((select id from beta_ids where kind='owner-workout'),'start',null,null);
select set_config('request.jwt.claim.sub','ab100000-0000-4000-8000-000000000001',true);
do $$declare sid uuid; begin
 for sid in select s.id from public.workout_sets s join public.workout_exercises e on e.id=s.workout_exercise_id where e.workout_assignment_id=(select id from beta_ids where kind='owner-workout') loop
  perform public.record_quality_workout_set((select id from beta_ids where kind='owner-workout'),sid,'missed','{"notes":"Isolated authorization test; no actual exercise performed","loadUnit":"lb"}'::jsonb);
 end loop;
end$$;
select public.manage_quality_workout((select id from beta_ids where kind='owner-workout'),'finish',2,'Isolated rollback-only authorization fixture');
select pg_temp.assert_true((select status='completed' from public.workout_assignments where id=(select id from beta_ids where kind='owner-workout')),'Owner workout completion did not save');
select set_config('request.jwt.claim.sub','ab100000-0000-4000-8000-000000000003',true);
select pg_temp.assert_true((select status='completed' from public.workout_assignments where id=(select id from beta_ids where kind='owner-workout')),'Client cannot see completed Owner session');
select 'Owner generated, reviewed and started an unscheduled Client workout; Client can open it; cross-gym access denied' as result;

rollback;
