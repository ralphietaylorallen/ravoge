begin;
create function pg_temp.assert_true(value boolean,message text) returns void language plpgsql as $$ begin if value is distinct from true then raise exception '%',message; end if; end $$;
create temporary table beta_ids(kind text primary key,id uuid not null);
grant select,insert,update on beta_ids to authenticated;

insert into auth.users(id,aud,role,email,email_confirmed_at,raw_app_meta_data,raw_user_meta_data,created_at,updated_at)
select ('fa100000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid,'authenticated','authenticated','beta-readiness-'||n||'@example.test',now(),'{}',jsonb_build_object('full_name','Beta QA '||n),now(),now() from generate_series(1,9) n;
insert into public.organizations(id,name) values('fa200000-0000-4000-8000-000000000001','Beta Isolated A'),('fa200000-0000-4000-8000-000000000002','Beta Isolated B');
insert into public.organization_memberships(organization_id,user_id,role) values
('fa200000-0000-4000-8000-000000000001','fa100000-0000-4000-8000-000000000001','owner'),
('fa200000-0000-4000-8000-000000000001','fa100000-0000-4000-8000-000000000002','coach'),
('fa200000-0000-4000-8000-000000000001','fa100000-0000-4000-8000-000000000003','client'),
('fa200000-0000-4000-8000-000000000002','fa100000-0000-4000-8000-000000000004','owner'),
('fa200000-0000-4000-8000-000000000002','fa100000-0000-4000-8000-000000000005','coach'),
('fa200000-0000-4000-8000-000000000002','fa100000-0000-4000-8000-000000000006','client');
insert into public.coach_client_assignments(organization_id,coach_user_id,client_user_id)
values('fa200000-0000-4000-8000-000000000001','fa100000-0000-4000-8000-000000000002','fa100000-0000-4000-8000-000000000003');
insert into public.training_library_items(id,organization_id,title,created_by,source_type,normalized_content) values
('fa300000-0000-4000-8000-000000000001','fa200000-0000-4000-8000-000000000001','Original source','fa100000-0000-4000-8000-000000000001','csv','{"cells":[{"header":"Description","raw":"Goblet Squat 3 x 8\nDumbbell RDL 3 x 8\nBand Row 3 x 8"}]}'),
('fa300000-0000-4000-8000-000000000002','fa200000-0000-4000-8000-000000000001','Complex source','fa100000-0000-4000-8000-000000000001','csv','{"cells":[{"header":"Description","raw":"EMOM 15 Minutes\nGoblet Squat x8 @ 50-60% each side"}]}');
insert into beta_ids(kind,id) select name,id from public.exercise_library where organization_id is null and name in ('Goblet Squat','Dumbbell RDL','Band Row');

set local role authenticated;
select set_config('request.jwt.claim.sub','fa100000-0000-4000-8000-000000000001',true);
select public.add_equipment_checklist(array['dumbbells','bands']);
select public.add_equipment_checklist(array['dumbbells','bands']);
select pg_temp.assert_true((select count(*)=2 from public.organization_equipment),'Equipment checklist created duplicate inventory');
select pg_temp.assert_true((public.get_workout_generation_readiness('fa100000-0000-4000-8000-000000000003')->>'ready')::boolean=false,'Missing intake reported ready');
insert into beta_ids values('review',public.review_training_library_item('fa300000-0000-4000-8000-000000000001','Published gym strength','published','strength',45,
  (select jsonb_agg(jsonb_build_object('libraryExerciseId',id,'sets',3,'reps',8,'sourceText',kind||' 3 x 8','load',null,'restSeconds',null,'notes','') order by case kind when 'Goblet Squat' then 1 when 'Dumbbell RDL' then 2 else 3 end) from beta_ids where kind in ('Goblet Squat','Dumbbell RDL','Band Row')),'Reviewed against the original explicit source'));
do $$ begin
  begin
    perform public.review_training_library_item('fa300000-0000-4000-8000-000000000002','Unsafe flattening','published','strength',45,
      jsonb_build_array(jsonb_build_object('libraryExerciseId',(select id from beta_ids where kind='Goblet Squat'),'sets',3,'reps',8,'sourceText','Invented fixed target')),'Must not publish');
    raise exception 'Complex source was flattened and published';
  exception when raise_exception then if sqlerrm='Complex source was flattened and published' then raise; end if; end;
  begin
    perform public.review_training_library_item('fa300000-0000-4000-8000-000000000001','Altered target','published','strength',45,
      jsonb_build_array(jsonb_build_object('libraryExerciseId',(select id from beta_ids where kind='Goblet Squat'),'sets',99,'reps',8,'sourceText','Invented')),'Must not publish');
    raise exception 'Invented source quantities published';
  exception when raise_exception then if sqlerrm='Invented source quantities published' then raise; end if; end;
end $$;
select public.review_training_library_item('fa300000-0000-4000-8000-000000000002','Complex source','review',null,null,'[]','Timed and percentage protocol requires review');
select pg_temp.assert_true((select normalized_content->'cells'->0->>'raw'='EMOM 15 Minutes'||E'\n'||'Goblet Squat x8 @ 50-60% each side' from public.training_library_items where id='fa300000-0000-4000-8000-000000000002'),'Raw source changed');

-- Refresh reads email, gym and role from the locked invitation, not request data.
insert into beta_ids select 'invite',invitation_id from public.create_organization_invitation(' BETA-READINESS-7@EXAMPLE.TEST ','coach',encode(extensions.digest('beta-readiness-invite-original-000001','sha256'),'hex'),now()+interval '1 day');
select * from public.refresh_organization_invitation((select id from beta_ids where kind='invite'),encode(extensions.digest('beta-readiness-invite-refreshed-00001','sha256'),'hex'),now()+interval '7 days');
select pg_temp.assert_true((select email='beta-readiness-7@example.test' and role='coach' and organization_id='fa200000-0000-4000-8000-000000000001' from public.organization_invitations where id=(select id from beta_ids where kind='invite')),'Refresh changed recipient, role or gym');
select public.record_organization_invitation_delivery((select id from beta_ids where kind='invite'),'not_configured',null,null);
select pg_temp.assert_true((select delivery_status='not_configured' from public.organization_invitations where id=(select id from beta_ids where kind='invite')),'Unconfigured invitation marked sent');

-- A different Owner cannot read, publish, refresh or generate across organizations.
select set_config('request.jwt.claim.sub','fa100000-0000-4000-8000-000000000004',true);
select pg_temp.assert_true(not exists(select 1 from public.training_library_reviews),'Cross-organization review read');
do $$ begin
  begin perform * from public.refresh_organization_invitation((select id from beta_ids where kind='invite'),repeat('d',64),now()+interval '1 day'); raise exception 'Cross-org refresh'; exception when raise_exception then if sqlerrm='Cross-org refresh' then raise; end if; end;
  begin perform public.get_workout_generation_readiness('fa100000-0000-4000-8000-000000000003'); raise exception 'Cross-org readiness'; exception when raise_exception then if sqlerrm='Cross-org readiness' then raise; end if; end;
  begin perform public.review_training_library_item('fa300000-0000-4000-8000-000000000001','Cross-org','review',null,null,'[]','Attempt'); raise exception 'Cross-org publication'; exception when raise_exception then if sqlerrm='Cross-org publication' then raise; end if; end;
end $$;
select set_config('request.jwt.claim.sub','fa100000-0000-4000-8000-000000000008',true);
do $$ begin
  begin perform public.accept_organization_enrollment('beta-readiness-invite-refreshed-00001'); raise exception 'Wrong email accepted'; exception when others then if sqlerrm='Wrong email accepted' then raise; end if; end;
end $$;
select set_config('request.jwt.claim.sub','fa100000-0000-4000-8000-000000000007',true);
select public.register_unaffiliated_account_type('coach');
do $$ begin
  begin perform public.accept_organization_enrollment('beta-readiness-invite-original-000001'); raise exception 'Replaced invite accepted'; exception when others then if sqlerrm='Replaced invite accepted' then raise; end if; end;
end $$;
select public.accept_organization_enrollment('beta-readiness-invite-refreshed-00001');
select public.accept_organization_enrollment('beta-readiness-invite-refreshed-00001');
select pg_temp.assert_true((select count(*)=1 from public.organization_memberships where user_id='fa100000-0000-4000-8000-000000000007'),'Existing identity acceptance duplicated membership');
do $$ begin
  begin perform * from public.create_organization_invitation('beta-readiness-9@example.test','owner',repeat('c',64),now()+interval '1 day'); raise exception 'Coach self-promotion'; exception when raise_exception then if sqlerrm='Coach self-promotion' then raise; end if; end;
  begin perform * from public.refresh_organization_invitation((select id from beta_ids where kind='invite'),repeat('b',64),now()+interval '1 day'); raise exception 'Coach refreshed Owner invite'; exception when raise_exception then if sqlerrm='Coach refreshed Owner invite' then raise; end if; end;
end $$;

-- Expiry and revocation are enforced at acceptance, independently of the UI.
select set_config('request.jwt.claim.sub','fa100000-0000-4000-8000-000000000001',true);
insert into beta_ids select 'expires',invitation_id from public.create_organization_invitation('beta-readiness-9@example.test','coach',encode(extensions.digest('beta-readiness-expiring-invite-000001','sha256'),'hex'),now()+interval '1 day');
reset role;
update public.organization_invitations set created_at=now()-interval '2 days',expires_at=now()-interval '1 second' where id=(select id from beta_ids where kind='expires');
set local role authenticated;
select set_config('request.jwt.claim.sub','fa100000-0000-4000-8000-000000000009',true);
do $$ begin
  begin perform public.accept_organization_enrollment('beta-readiness-expiring-invite-000001'); raise exception 'Expired invitation accepted'; exception when others then if sqlerrm='Expired invitation accepted' then raise; end if; end;
end $$;
select set_config('request.jwt.claim.sub','fa100000-0000-4000-8000-000000000001',true);
select * from public.refresh_organization_invitation((select id from beta_ids where kind='expires'),encode(extensions.digest('beta-readiness-renewed-invite-0000001','sha256'),'hex'),now()+interval '7 days');
select public.revoke_organization_invitation((select id from beta_ids where kind='expires'));
select set_config('request.jwt.claim.sub','fa100000-0000-4000-8000-000000000009',true);
do $$ begin
  begin perform public.accept_organization_enrollment('beta-readiness-renewed-invite-0000001'); raise exception 'Revoked invitation accepted'; exception when others then if sqlerrm='Revoked invitation accepted' then raise; end if; end;
end $$;

-- Coach-led intake -> published source -> draft -> approval -> Client visibility.
select set_config('request.jwt.claim.sub','fa100000-0000-4000-8000-000000000002',true);
insert into beta_ids values('intake',public.upsert_client_intake('fa100000-0000-4000-8000-000000000003',
 '{"trainingFrequencyGoal":3,"primaryGoal":"strength","trainingYears":1,"experienceLevel":"beginner","recentConsistency":"building","sessionDurationMinutes":45,"sleepQuality":3,"stressLevel":3,"recoveryPerception":3,"sorenessFatigue":3,"constraintTags":[],"customFields":{}}'));
select pg_temp.assert_true((public.get_workout_generation_readiness('fa100000-0000-4000-8000-000000000003')->>'needsSafetyReview')::boolean,'Intake safety confirmation was skipped');
do $$ begin
  begin perform public.generate_initial_prescription_v0('fa100000-0000-4000-8000-000000000003'); raise exception 'Unreviewed safety generated'; exception when raise_exception then if sqlerrm='Unreviewed safety generated' then raise; end if; end;
end $$;
select public.confirm_intake_generation_safety((select id from beta_ids where kind='intake'));
select pg_temp.assert_true(public.get_workout_generation_readiness('fa100000-0000-4000-8000-000000000003')->>'sourceType'='organization_workout','Published gym workout was not preferred');
insert into beta_ids values('prescription',public.generate_initial_prescription_v0('fa100000-0000-4000-8000-000000000003'));
select pg_temp.assert_true((select source_training_review_id=(select id from beta_ids where kind='review') and generation_context->>'intakeId'=(select id::text from beta_ids where kind='intake') and estimated_duration_minutes=45 from public.generated_prescriptions where id=(select id from beta_ids where kind='prescription')),'Source or intake provenance missing');
select set_config('request.jwt.claim.sub','fa100000-0000-4000-8000-000000000003',true);
select pg_temp.assert_true(not exists(select 1 from public.generated_prescriptions),'Client read a draft prescription');
select pg_temp.assert_true(not exists(select 1 from public.workout_assignments),'Client saw unassigned workout');
select pg_temp.assert_true(not exists(select 1 from public.training_library_reviews),'Client read programming source drafts');

-- Equipment changes invalidate stale draft approval, without partial assignment.
select set_config('request.jwt.claim.sub','fa100000-0000-4000-8000-000000000001',true);
update public.organization_equipment set is_available=false where equipment_type='bands';
select set_config('request.jwt.claim.sub','fa100000-0000-4000-8000-000000000002',true);
do $$ begin
  begin perform public.approve_generated_prescription_v0((select id from beta_ids where kind='prescription'),'Reviewed Gym Workout',null,current_date,(select final_prescription from public.generated_prescriptions where id=(select id from beta_ids where kind='prescription'))); raise exception 'Unavailable equipment approved'; exception when others then if sqlerrm='Unavailable equipment approved' then raise; end if; end;
end $$;
select pg_temp.assert_true(not exists(select 1 from public.workout_assignments),'Failed approval partially created a workout');
select set_config('request.jwt.claim.sub','fa100000-0000-4000-8000-000000000001',true);
update public.organization_equipment set is_available=true where equipment_type='bands';
select set_config('request.jwt.claim.sub','fa100000-0000-4000-8000-000000000002',true);
insert into beta_ids values('workout',public.approve_generated_prescription_v0((select id from beta_ids where kind='prescription'),'Reviewed Gym Workout',null,current_date,(select final_prescription from public.generated_prescriptions where id=(select id from beta_ids where kind='prescription'))));
select set_config('request.jwt.claim.sub','fa100000-0000-4000-8000-000000000003',true);
select pg_temp.assert_true((select count(*)=1 from public.workout_assignments where title='Reviewed Gym Workout'),'Client cannot see assigned workout');
select pg_temp.assert_true((select count(*)=3 from public.workout_exercises),'Client exercise visibility incorrect');

-- A new version requires fresh safety review and filters injured/avoided patterns.
select set_config('request.jwt.claim.sub','fa100000-0000-4000-8000-000000000002',true);
insert into beta_ids values('intake2',public.upsert_client_intake('fa100000-0000-4000-8000-000000000003',
 '{"trainingFrequencyGoal":3,"primaryGoal":"strength","trainingYears":1,"experienceLevel":"beginner","recentConsistency":"building","sessionDurationMinutes":30,"sleepQuality":3,"stressLevel":3,"recoveryPerception":3,"sorenessFatigue":3,"constraintTags":["hinge"],"currentInjuries":"Coach reviewed hinge restriction","avoidedExercises":["Goblet Squat"],"customFields":{}}'));
select pg_temp.assert_true((public.get_workout_generation_readiness('fa100000-0000-4000-8000-000000000003')->>'needsSafetyReview')::boolean,'Old safety review unlocked a new intake');
select public.confirm_intake_generation_safety((select id from beta_ids where kind='intake2'));
select pg_temp.assert_true(not (public.get_workout_generation_readiness('fa100000-0000-4000-8000-000000000003')->'exercises' @? '$[*] ? (@.name == "Dumbbell RDL" || @.name == "Goblet Squat")'),'Injury or avoided-exercise filter failed');
-- Library growth adds legitimate alternatives, so explicitly test a genuinely
-- insufficient pool instead of assuming two exclusions leave fewer than three.
insert into beta_ids values('insufficient-intake',public.upsert_client_intake('fa100000-0000-4000-8000-000000000003',
 '{"trainingFrequencyGoal":3,"primaryGoal":"strength","trainingYears":1,"experienceLevel":"beginner","recentConsistency":"building","sessionDurationMinutes":30,"sleepQuality":3,"stressLevel":3,"recoveryPerception":3,"sorenessFatigue":3,"constraintTags":["hinge","knee_flexion","horizontal_push","axial_load","balance","conditioning"],"currentInjuries":"Coach reviewed movement restrictions","avoidedExercises":["Goblet Squat"],"customFields":{}}'));
select public.confirm_intake_generation_safety((select id from beta_ids where kind='insufficient-intake'));
select pg_temp.assert_true((public.get_workout_generation_readiness('fa100000-0000-4000-8000-000000000003')->>'ready')::boolean=false,'Unsafe insufficient exercise pool generated');

-- Unpublishing a source excludes it immediately; raw data and prior revisions remain.
select set_config('request.jwt.claim.sub','fa100000-0000-4000-8000-000000000001',true);
select public.review_training_library_item('fa300000-0000-4000-8000-000000000001','Pending re-review','review',null,null,'[]','Owner requested another review');
select pg_temp.assert_true((select count(*)=2 from public.training_library_reviews where training_item_id='fa300000-0000-4000-8000-000000000001'),'Review history was overwritten');
select pg_temp.assert_true((select normalized_content->'cells'->0->>'raw'='Goblet Squat 3 x 8'||E'\n'||'Dumbbell RDL 3 x 8'||E'\n'||'Band Row 3 x 8' from public.training_library_items where id='fa300000-0000-4000-8000-000000000001'),'Original import was rewritten');
select set_config('request.jwt.claim.sub','fa100000-0000-4000-8000-000000000002',true);
insert into beta_ids values('intake3',public.upsert_client_intake('fa100000-0000-4000-8000-000000000003',
 '{"trainingFrequencyGoal":3,"primaryGoal":"strength","trainingYears":1,"experienceLevel":"beginner","recentConsistency":"building","sessionDurationMinutes":20,"sleepQuality":3,"stressLevel":3,"recoveryPerception":3,"sorenessFatigue":3,"constraintTags":[],"customFields":{}}'));
select public.confirm_intake_generation_safety((select id from beta_ids where kind='intake3'));
select pg_temp.assert_true(public.get_workout_generation_readiness('fa100000-0000-4000-8000-000000000003')->>'sourceType'='global_library','Draft review did not exclude source or global fallback failed');
insert into beta_ids values('fallback',public.generate_initial_prescription_v0('fa100000-0000-4000-8000-000000000003'));
select pg_temp.assert_true((select estimated_duration_minutes=20 and source_training_review_id is null from public.generated_prescriptions where id=(select id from beta_ids where kind='fallback')),'Fallback ignored duration or retained an unpublished source');
reset role;
select pg_temp.assert_true((select count(*)=1 from auth.users where email='beta-readiness-7@example.test'),'Invite acceptance duplicated an Auth identity');
rollback;
