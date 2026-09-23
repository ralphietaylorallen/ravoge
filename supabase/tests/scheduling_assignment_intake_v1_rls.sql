begin;

insert into auth.users (id,aud,role,email,encrypted_password,email_confirmed_at,raw_app_meta_data,raw_user_meta_data,created_at,updated_at) values
('c1000000-0000-4000-8000-000000000001','authenticated','authenticated','v1-owner-a@example.test',crypt('TestPass123!',gen_salt('bf')),now(),'{}','{"full_name":"V1 Owner A"}',now(),now()),
('c1000000-0000-4000-8000-000000000002','authenticated','authenticated','v1-coach-a1@example.test',crypt('TestPass123!',gen_salt('bf')),now(),'{}','{"full_name":"V1 Coach A1"}',now(),now()),
('c1000000-0000-4000-8000-000000000003','authenticated','authenticated','v1-coach-a2@example.test',crypt('TestPass123!',gen_salt('bf')),now(),'{}','{"full_name":"V1 Coach A2"}',now(),now()),
('c1000000-0000-4000-8000-000000000004','authenticated','authenticated','v1-client-a1@example.test',crypt('TestPass123!',gen_salt('bf')),now(),'{}','{"full_name":"V1 Client A1"}',now(),now()),
('c1000000-0000-4000-8000-000000000005','authenticated','authenticated','v1-client-a2@example.test',crypt('TestPass123!',gen_salt('bf')),now(),'{}','{"full_name":"V1 Client A2"}',now(),now()),
('c2000000-0000-4000-8000-000000000001','authenticated','authenticated','v1-owner-b@example.test',crypt('TestPass123!',gen_salt('bf')),now(),'{}','{"full_name":"V1 Owner B"}',now(),now()),
('c2000000-0000-4000-8000-000000000002','authenticated','authenticated','v1-client-b@example.test',crypt('TestPass123!',gen_salt('bf')),now(),'{}','{"full_name":"V1 Client B"}',now(),now());

insert into public.organizations (id,name,timezone) values
('ca000000-0000-4000-8000-000000000001','V1 Organization A','UTC'),
('cb000000-0000-4000-8000-000000000001','V1 Organization B','UTC');
insert into public.organization_memberships (organization_id,user_id,role) values
('ca000000-0000-4000-8000-000000000001','c1000000-0000-4000-8000-000000000001','owner'),
('ca000000-0000-4000-8000-000000000001','c1000000-0000-4000-8000-000000000002','coach'),
('ca000000-0000-4000-8000-000000000001','c1000000-0000-4000-8000-000000000003','coach'),
('ca000000-0000-4000-8000-000000000001','c1000000-0000-4000-8000-000000000004','client'),
('ca000000-0000-4000-8000-000000000001','c1000000-0000-4000-8000-000000000005','client'),
('cb000000-0000-4000-8000-000000000001','c2000000-0000-4000-8000-000000000001','owner'),
('cb000000-0000-4000-8000-000000000001','c2000000-0000-4000-8000-000000000002','client');
insert into public.coach_client_assignments (organization_id,coach_user_id,client_user_id)
values ('ca000000-0000-4000-8000-000000000001','c1000000-0000-4000-8000-000000000003','c1000000-0000-4000-8000-000000000004');
insert into public.organization_hours (organization_id,day_of_week,is_closed,opens_at,closes_at,updated_by)
select 'ca000000-0000-4000-8000-000000000001',day,false,'08:00','18:00','c1000000-0000-4000-8000-000000000001' from generate_series(0,6) day;
insert into public.organization_session_settings (organization_id,default_duration_minutes,permitted_durations,slot_increment_minutes,minimum_notice_minutes,maximum_advance_days,cancellation_cutoff_minutes,updated_by)
values ('ca000000-0000-4000-8000-000000000001',60,array[30,60]::smallint[],30,0,30,0,'c1000000-0000-4000-8000-000000000001');
insert into public.coach_availability (organization_id,coach_user_id,day_of_week,starts_at,ends_at)
select 'ca000000-0000-4000-8000-000000000001',coach,day,'09:00','17:00'
from (values ('c1000000-0000-4000-8000-000000000002'::uuid),('c1000000-0000-4000-8000-000000000003'::uuid)) coaches(coach)
cross join generate_series(0,6) day;

set local role authenticated;
select set_config('request.jwt.claim.sub','c1000000-0000-4000-8000-000000000002',true);
do $$ begin
  if (select count(*) from public.list_unassigned_clients_for_coach()) <> 1 then raise exception 'Unassigned pool exposed assigned or cross-organization Client'; end if;
  if (select count(*) from public.list_other_assigned_clients_for_coach())<>1 or not exists(select 1 from public.list_other_assigned_clients_for_coach() where client_user_id='c1000000-0000-4000-8000-000000000004' and assigned_coach_name='V1 Coach A2') then raise exception 'Other Coach assignment labels are incorrect or cross organization'; end if;
  if exists (select 1 from public.profiles where id='c1000000-0000-4000-8000-000000000004') then raise exception 'Unassigned Coach read assigned Client details'; end if;
  begin perform public.claim_unassigned_client('c1000000-0000-4000-8000-000000000004'); raise exception 'Coach stole assigned Client'; exception when others then if sqlerrm='Coach stole assigned Client' then raise; end if; end;
  begin perform public.claim_unassigned_client('c2000000-0000-4000-8000-000000000002'); raise exception 'Coach claimed cross-organization Client'; exception when others then if sqlerrm='Coach claimed cross-organization Client' then raise; end if; end;
  if public.claim_unassigned_client('c1000000-0000-4000-8000-000000000005') is null then raise exception 'Coach could not claim unassigned Client'; end if;
  if (select count(*) from public.list_unassigned_clients_for_coach()) <> 0 then raise exception 'Claimed Client remained in pool'; end if;
  begin update public.coach_client_assignments set status='inactive' where client_user_id='c1000000-0000-4000-8000-000000000005'; raise exception 'Coach directly changed assignment'; exception when insufficient_privilege then null; when raise_exception then if sqlerrm='Coach directly changed assignment' then raise; end if; end;
end $$;

reset role; set local role authenticated;
select set_config('request.jwt.claim.sub','c1000000-0000-4000-8000-000000000003',true);
do $$ begin
  begin perform public.claim_unassigned_client('c1000000-0000-4000-8000-000000000005'); raise exception 'Second Coach stole claimed Client'; exception when others then if sqlerrm='Second Coach stole claimed Client' then raise; end if; end;
  begin perform public.create_staff_booking('c1000000-0000-4000-8000-000000000005','c1000000-0000-4000-8000-000000000003',((current_date+3)+time '10:00') at time zone 'UTC',60::smallint,null); raise exception 'Coach booked another Coach client'; exception when others then if sqlerrm='Coach booked another Coach client' then raise; end if; end;
end $$;

reset role; set local role authenticated;
select set_config('request.jwt.claim.sub','c1000000-0000-4000-8000-000000000001',true);
do $$ declare booked uuid; begin
  booked := public.create_staff_booking('c1000000-0000-4000-8000-000000000005','c1000000-0000-4000-8000-000000000003',((current_date+3)+time '10:00') at time zone 'UTC',60::smallint,null);
  if booked is null or (select count(*) from public.bookings where id=booked) <> 1 then raise exception 'Owner booking did not create one shared record'; end if;
  if (select count(*) from public.coach_client_assignments where client_user_id='c1000000-0000-4000-8000-000000000005' and status='active') <> 1 then raise exception 'Owner booking silently changed primary Coach'; end if;
  perform public.reschedule_staff_booking(booked,((current_date+3)+time '11:00') at time zone 'UTC',60::smallint);
  if not exists (select 1 from public.bookings where id=booked and starts_at=((current_date+3)+time '11:00') at time zone 'UTC') then raise exception 'Owner reschedule did not update shared record'; end if;
  perform public.cancel_staff_booking(booked,'Test cancellation');
  if not exists (select 1 from public.bookings where id=booked and status='cancelled') then raise exception 'Owner cancellation did not update shared record'; end if;
end $$;
select public.assign_client_to_coach('c1000000-0000-4000-8000-000000000005','c1000000-0000-4000-8000-000000000003');

reset role; set local role authenticated;
select set_config('request.jwt.claim.sub','c1000000-0000-4000-8000-000000000002',true);
do $$ begin if exists (select 1 from public.coach_client_assignments where client_user_id='c1000000-0000-4000-8000-000000000005' and status='active') then raise exception 'Prior Coach retained assignment after Owner reassignment'; end if; end $$;

reset role; set local role authenticated;
select set_config('request.jwt.claim.sub','c2000000-0000-4000-8000-000000000001',true);
do $$ begin
  if exists (select 1 from public.bookings where organization_id='ca000000-0000-4000-8000-000000000001') then raise exception 'Cross-organization Owner read bookings'; end if;
  begin perform public.create_staff_booking('c1000000-0000-4000-8000-000000000005','c1000000-0000-4000-8000-000000000003',((current_date+3)+time '12:00') at time zone 'UTC',60::smallint,null); raise exception 'Cross-organization Owner booked session'; exception when others then if sqlerrm='Cross-organization Owner booked session' then raise; end if; end;
end $$;

reset role; set local role authenticated;
select set_config('request.jwt.claim.sub','c1000000-0000-4000-8000-000000000003',true);
do $$ begin
  if not private.can_write_profile_asset('ca000000-0000-4000-8000-000000000001/c1000000-0000-4000-8000-000000000003/avatar/c3000000-0000-4000-8000-000000000001.webp') then raise exception 'Coach cannot write own versioned photo'; end if;
  if private.can_write_profile_asset('ca000000-0000-4000-8000-000000000001/c1000000-0000-4000-8000-000000000005/avatar/c3000000-0000-4000-8000-000000000002.webp') then raise exception 'Coach can write Client photo'; end if;
  perform public.update_own_profile('{"avatarPath":"ca000000-0000-4000-8000-000000000001/c1000000-0000-4000-8000-000000000003/avatar/c3000000-0000-4000-8000-000000000001.webp"}'::jsonb);
  begin perform public.update_own_profile('{"avatarPath":"cb000000-0000-4000-8000-000000000001/c1000000-0000-4000-8000-000000000003/avatar/c3000000-0000-4000-8000-000000000003.webp"}'::jsonb); raise exception 'Coach attached cross-organization photo'; exception when others then if sqlerrm='Coach attached cross-organization photo' then raise; end if; end;
end $$;
insert into storage.objects (bucket_id,name,metadata) values ('profile-images','ca000000-0000-4000-8000-000000000001/c1000000-0000-4000-8000-000000000003/avatar/c3000000-0000-4000-8000-000000000001.webp','{"mimetype":"image/webp","size":1024}');
select public.save_client_intake_v1(
  'c1000000-0000-4000-8000-000000000005',
  '{"trainingFrequencyGoal":3,"primaryGoal":"strength","secondaryGoal":"","trainingYears":2,"experienceLevel":"intermediate","recentConsistency":"building","preferredTrainingDays":[],"painAreas":[],"movementsToAvoid":[],"strengthBaseline":3,"conditioningBaseline":3,"mobilityBaseline":3,"assessmentScores":{},"sleepQuality":3,"stressLevel":3,"recoveryPerception":3,"sorenessFatigue":3,"preferredExercises":[],"avoidedExercises":[],"sessionDurationMinutes":60,"constraintTags":[],"customFields":{}}'::jsonb,
  '{"squatVariation":"back_squat","squatLoadKg":80,"squatReps":3,"squatOneRmKg":88,"squatOneRmMethod":"estimated","benchVariation":"Barbell Bench Press","benchLoadKg":60,"benchReps":3,"benchOneRmKg":66,"benchOneRmMethod":"estimated","pullupStrictReps":4,"pullupMode":"bodyweight","rowerDistanceM":2000,"rowerTimeSeconds":495}'::jsonb,
  '{"status":"pending"}'::jsonb
);
do $$ begin
  if (select count(*) from public.client_intake_baselines where client_user_id='c1000000-0000-4000-8000-000000000005') <> 1 then raise exception 'Structured baseline was not saved'; end if;
  if not exists (select 1 from public.client_intake_baselines where inbody_status='pending') then raise exception 'Pending InBody was not recorded'; end if;
  begin perform public.save_client_intake_v1('c2000000-0000-4000-8000-000000000002','{}'::jsonb,'{}'::jsonb,'{"status":"pending"}'::jsonb); raise exception 'Coach created cross-organization baseline'; exception when others then if sqlerrm='Coach created cross-organization baseline' then raise; end if; end;
end $$;

reset role; set local role authenticated;
select set_config('request.jwt.claim.sub','c1000000-0000-4000-8000-000000000001',true);
do $$ declare position_number integer; begin
  for position_number in 1..8 loop
    perform public.configure_preworkout_question(position_number::smallint, 'Approved test question ' || position_number, 0, 10);
  end loop;
  if (select count(*) from public.organization_preworkout_questions where question_text is not null) <> 8 then raise exception 'Eight configurable slots were not saved'; end if;
end $$;

reset role; set local role authenticated;
select set_config('request.jwt.claim.sub','c1000000-0000-4000-8000-000000000003',true);
do $$ declare booked uuid; begin
  booked := public.create_staff_booking('c1000000-0000-4000-8000-000000000005','c1000000-0000-4000-8000-000000000003',((current_date+4)+time '10:00') at time zone 'UTC',60::smallint,null);
  if booked is null then raise exception 'Assigned Coach could not book own Client'; end if;
end $$;

reset role; set local role authenticated;
select set_config('request.jwt.claim.sub','c1000000-0000-4000-8000-000000000005',true);
do $$ declare booked uuid; checkin uuid; begin
  select id into strict booked from public.bookings where client_user_id='c1000000-0000-4000-8000-000000000005' and status='scheduled';
  checkin := public.submit_preworkout_checkin(booked,null,'[{"position":1,"answer":5},{"position":2,"answer":5},{"position":3,"answer":5},{"position":4,"answer":5},{"position":5,"answer":5},{"position":6,"answer":5},{"position":7,"answer":5},{"position":8,"answer":5}]'::jsonb);
  if (select count(*) from public.preworkout_checkin_answers where checkin_id=checkin and normalized_response=0.5) <> 8 then raise exception 'Historical numeric check-in was not normalized'; end if;
  if (select count(*) from public.client_intake_baselines where client_user_id='c1000000-0000-4000-8000-000000000005') <> 1 then raise exception 'Client cannot read own baseline'; end if;
  begin perform public.submit_preworkout_checkin(booked,null,'[{"position":1,"answer":11}]'::jsonb); raise exception 'Malformed check-in was accepted'; exception when others then if sqlerrm='Malformed check-in was accepted' then raise; end if; end;
end $$;

reset role; set local role authenticated;
select set_config('request.jwt.claim.sub','c1000000-0000-4000-8000-000000000004',true);
do $$ begin
  if exists (select 1 from public.client_intake_baselines) then raise exception 'Client read another Client baseline'; end if;
  if exists (select 1 from public.preworkout_checkins) then raise exception 'Client read another Client check-in'; end if;
end $$;

reset role;
update public.organization_memberships set status='inactive' where user_id='c1000000-0000-4000-8000-000000000005';
set local role authenticated;
select set_config('request.jwt.claim.sub','c1000000-0000-4000-8000-000000000005',true);
do $$ begin
  if exists (select 1 from public.client_intake_baselines) then raise exception 'Inactive Client retained baseline access'; end if;
  if exists (select 1 from public.preworkout_checkins) then raise exception 'Inactive Client retained check-in access'; end if;
end $$;

reset role;
update public.organization_memberships set status='inactive' where user_id='c1000000-0000-4000-8000-000000000003';
set local role authenticated;
select set_config('request.jwt.claim.sub','c1000000-0000-4000-8000-000000000003',true);
do $$ begin
  if exists (select 1 from public.client_intake_baselines) then raise exception 'Inactive Coach retained Client baseline access'; end if;
  if private.can_write_profile_asset('ca000000-0000-4000-8000-000000000001/c1000000-0000-4000-8000-000000000003/avatar/c3000000-0000-4000-8000-000000000004.webp') then raise exception 'Inactive Coach retained photo upload access'; end if;
  begin perform public.list_unassigned_clients_for_coach(); raise exception 'Inactive Coach retained claim pool'; exception when others then if sqlerrm='Inactive Coach retained claim pool' then raise; end if; end;
end $$;

rollback;
