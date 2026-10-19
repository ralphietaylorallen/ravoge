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
insert into beta_ids values('prescription',public.generate_initial_prescription_v0('ab100000-0000-4000-8000-000000000003'));

create temporary table ai_fixture as select public.get_prescription_generation_input((select id from beta_ids where kind='prescription')) as payload;
grant select on ai_fixture to authenticated;
select pg_temp.assert_true((select payload->>'goal'='strength' and jsonb_array_length(payload->'references')=1 from ai_fixture),'Published references not retrieved');
select pg_temp.assert_true((select not exists(select 1 from jsonb_array_elements(payload->'candidates') c where c->'equipment' ? 'barbell') from ai_fixture),'Unavailable equipment reached candidate pool');

do $$ declare p uuid:=(select id from beta_ids where kind='prescription'); candidate jsonb; proposal jsonb; begin
  select jsonb_build_object('title','Assisted strength draft','durationMinutes',40,'rationale','Strength goals and reviewed gym programming, filtered for available equipment.',
    'exercises',jsonb_agg(x||jsonb_build_object('load',null,'restSeconds',90,'targetRpe',6,'notes','Coach selects load','reason','Goal-compatible approved exercise')))
    into proposal from public.generated_prescriptions g cross join lateral jsonb_array_elements(g.original_recommendation) x where g.id=p;
  begin perform public.complete_assisted_prescription(p,'wrong-snapshot',proposal,'{"model":"unit-mock"}'); raise exception 'Stale snapshot accepted'; exception when others then if sqlerrm='Stale snapshot accepted' then raise; end if; end;
  candidate:=jsonb_set(proposal,'{exercises,0,libraryExerciseId}',to_jsonb('00000000-0000-4000-8000-000000000000'::text));
  begin perform public.complete_assisted_prescription(p,(select payload->>'snapshot' from ai_fixture),candidate,'{"model":"unit-mock"}'); raise exception 'Unknown exercise accepted'; exception when others then if sqlerrm='Unknown exercise accepted' then raise; end if; end;
  candidate:=jsonb_set(proposal,'{exercises,0,targetRpe}','10');
  begin perform public.complete_assisted_prescription(p,(select payload->>'snapshot' from ai_fixture),candidate,'{"model":"unit-mock"}'); raise exception 'Unsafe intensity accepted'; exception when others then if sqlerrm='Unsafe intensity accepted' then raise; end if; end;
  candidate:=jsonb_set(proposal,'{exercises,1,libraryExerciseId}',proposal#>'{exercises,0,libraryExerciseId}');
  begin perform public.complete_assisted_prescription(p,(select payload->>'snapshot' from ai_fixture),candidate,'{"model":"unit-mock"}'); raise exception 'Duplicate exercise accepted'; exception when others then if sqlerrm='Duplicate exercise accepted' then raise; end if; end;
  perform public.complete_assisted_prescription(p,(select payload->>'snapshot' from ai_fixture),proposal,'{"model":"unit-mock"}');
  if not exists(select 1 from public.generated_prescriptions where id=p and status='draft' and engine_version='prescription-v0.3-openai' and jsonb_array_length(generation_context->'fallbackRecommendation')=3) then raise exception 'Assisted result did not preserve fallback or remain draft'; end if;
  begin perform public.complete_assisted_prescription(p,(select payload->>'snapshot' from ai_fixture),proposal,'{"model":"unit-mock"}'); raise exception 'Finalized generation overwritten'; exception when others then if sqlerrm='Finalized generation overwritten' then raise; end if; end;
end $$;

select set_config('request.jwt.claim.sub','ab100000-0000-4000-8000-000000000003',true);
select pg_temp.assert_true(not exists(select 1 from public.generated_prescriptions),'Client saw assisted draft');
do $$ begin
  begin perform public.get_prescription_generation_input((select id from beta_ids where kind='prescription')); raise exception 'Client obtained Coach generation payload'; exception when others then if sqlerrm='Client obtained Coach generation payload' then raise; end if; end;
  begin perform public.complete_assisted_prescription((select id from beta_ids where kind='prescription'),null,null,'{}'); raise exception 'Client wrote assisted draft'; exception when others then if sqlerrm='Client wrote assisted draft' then raise; end if; end;
end $$;
select set_config('request.jwt.claim.sub','ab100000-0000-4000-8000-000000000005',true);
do $$ begin
  begin perform public.get_prescription_generation_input((select id from beta_ids where kind='prescription')); raise exception 'Cross-gym Coach read inputs'; exception when others then if sqlerrm='Cross-gym Coach read inputs' then raise; end if; end;
  begin perform public.complete_assisted_prescription((select id from beta_ids where kind='prescription'),null,null,'{}'); raise exception 'Cross-gym Coach changed draft'; exception when others then if sqlerrm='Cross-gym Coach changed draft' then raise; end if; end;
end $$;

select set_config('request.jwt.claim.sub','ab100000-0000-4000-8000-000000000002',true);
insert into beta_ids values('assigned-assisted',public.approve_reviewed_prescription((select id from beta_ids where kind='prescription'),'Reviewed assisted strength',null,current_date,40::smallint,(select original_recommendation from public.generated_prescriptions where id=(select id from beta_ids where kind='prescription'))));
select set_config('request.jwt.claim.sub','ab100000-0000-4000-8000-000000000003',true);
select pg_temp.assert_true((select count(*)=1 from public.workout_assignments where title='Reviewed assisted strength' and estimated_duration_minutes=40),'Client cannot see assigned assisted workout or duration edit lost');
select set_config('request.jwt.claim.sub','ab100000-0000-4000-8000-000000000002',true);
insert into beta_ids values('fallback-assisted',public.generate_initial_prescription_v0('ab100000-0000-4000-8000-000000000003'));
select public.complete_assisted_prescription((select id from beta_ids where kind='fallback-assisted'),null,null,'{"reason":"not_configured"}');
select pg_temp.assert_true((select engine_version='prescription-v0.3-fallback' and status='draft' and generation_context->>'fallbackReason'='not_configured' from public.generated_prescriptions where id=(select id from beta_ids where kind='fallback-assisted')),'Fallback was not truthful or safe draft');
select pg_temp.assert_true((select jsonb_array_length(public.get_prescription_generation_input((select id from beta_ids where kind='fallback-assisted'))->'history')=1),'Prior assigned workout missing');

-- A new intake invalidates both generated inputs and approval, rather than reusing stale goals.
insert into beta_ids values('new-intake',public.upsert_client_intake('ab100000-0000-4000-8000-000000000003',
 '{"trainingFrequencyGoal":3,"primaryGoal":"strength","trainingYears":1,"experienceLevel":"beginner","recentConsistency":"building","sessionDurationMinutes":45,"sleepQuality":3,"stressLevel":3,"recoveryPerception":3,"sorenessFatigue":3,"constraintTags":["hinge"],"currentInjuries":"Reviewed hinge restriction","avoidedExercises":["Goblet Squat"],"customFields":{}}'));
select public.confirm_intake_generation_safety((select id from beta_ids where kind='new-intake'));
do $$ begin
  begin perform public.get_prescription_generation_input((select id from beta_ids where kind='fallback-assisted')); raise exception 'Stale intake reached OpenAI'; exception when others then if sqlerrm='Stale intake reached OpenAI' then raise; end if; end;
  begin perform public.approve_reviewed_prescription((select id from beta_ids where kind='fallback-assisted'),'Stale goals',null,current_date,40::smallint,(select original_recommendation from public.generated_prescriptions where id=(select id from beta_ids where kind='fallback-assisted'))); raise exception 'Stale intake approved'; exception when others then if sqlerrm='Stale intake approved' then raise; end if; end;
end $$;
reset role;
select pg_temp.assert_true(not has_function_privilege('anon','public.get_prescription_generation_input(uuid)','execute'),'Anonymous generation input exposed');
rollback;
