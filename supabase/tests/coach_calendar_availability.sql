begin;

insert into auth.users (id,aud,role,email,encrypted_password,email_confirmed_at,raw_app_meta_data,raw_user_meta_data,created_at,updated_at) values
('d8100000-0000-4000-8000-000000000001','authenticated','authenticated','three-device-owner-a@example.test',crypt('TestPass123!',gen_salt('bf')),now(),'{}','{"full_name":"Three Device Owner A"}',now(),now()),
('d8100000-0000-4000-8000-000000000002','authenticated','authenticated','three-device-coach-a1@example.test',crypt('TestPass123!',gen_salt('bf')),now(),'{}','{"full_name":"Three Device Coach A1"}',now(),now()),
('d8100000-0000-4000-8000-000000000003','authenticated','authenticated','three-device-coach-a2@example.test',crypt('TestPass123!',gen_salt('bf')),now(),'{}','{"full_name":"Three Device Coach A2"}',now(),now()),
('d8100000-0000-4000-8000-000000000004','authenticated','authenticated','three-device-client-a1@example.test',crypt('TestPass123!',gen_salt('bf')),now(),'{}','{"full_name":"Three Device Client A1"}',now(),now()),
('d8100000-0000-4000-8000-000000000005','authenticated','authenticated','three-device-client-a2@example.test',crypt('TestPass123!',gen_salt('bf')),now(),'{}','{"full_name":"Three Device Client A2"}',now(),now()),
('d8200000-0000-4000-8000-000000000001','authenticated','authenticated','three-device-owner-b@example.test',crypt('TestPass123!',gen_salt('bf')),now(),'{}','{"full_name":"Three Device Owner B"}',now(),now()),
('d8200000-0000-4000-8000-000000000002','authenticated','authenticated','three-device-client-b@example.test',crypt('TestPass123!',gen_salt('bf')),now(),'{}','{"full_name":"Three Device Client B"}',now(),now());

insert into public.organizations (id,name,timezone) values
('da800000-0000-4000-8000-000000000001','Three Device Organization A','America/Denver'),
('db800000-0000-4000-8000-000000000001','Three Device Organization B','UTC');
insert into public.organization_memberships (organization_id,user_id,role) values
('da800000-0000-4000-8000-000000000001','d8100000-0000-4000-8000-000000000001','owner'),
('da800000-0000-4000-8000-000000000001','d8100000-0000-4000-8000-000000000002','coach'),
('da800000-0000-4000-8000-000000000001','d8100000-0000-4000-8000-000000000003','coach'),
('da800000-0000-4000-8000-000000000001','d8100000-0000-4000-8000-000000000004','client'),
('da800000-0000-4000-8000-000000000001','d8100000-0000-4000-8000-000000000005','client'),
('db800000-0000-4000-8000-000000000001','d8200000-0000-4000-8000-000000000001','owner'),
('db800000-0000-4000-8000-000000000001','d8200000-0000-4000-8000-000000000002','client');
insert into public.coach_client_assignments (organization_id,coach_user_id,client_user_id)
values ('da800000-0000-4000-8000-000000000001','d8100000-0000-4000-8000-000000000003','d8100000-0000-4000-8000-000000000004');

-- Both organizations intentionally have no schedule configuration.
insert into public.coach_client_assignments (organization_id,coach_user_id,client_user_id)
values ('da800000-0000-4000-8000-000000000001','d8100000-0000-4000-8000-000000000002','d8100000-0000-4000-8000-000000000005');
set local role authenticated;
select set_config('request.jwt.claim.sub','d8100000-0000-4000-8000-000000000002',true);
do $$ declare
  day date := current_date+(8-extract(isodow from current_date)::int);
  booking uuid;
  before_count integer;
begin
  booking := public.create_staff_appointment('d8100000-0000-4000-8000-000000000005','d8100000-0000-4000-8000-000000000002',(day+time '05:00') at time zone 'America/Denver',60::smallint,'training',null);
  insert into public.coach_availability_exceptions(organization_id,coach_user_id,kind,starts_at,ends_at,label)
  values('da800000-0000-4000-8000-000000000001',auth.uid(),'vacation',(day+time '10:00') at time zone 'America/Denver',(day+time '11:00') at time zone 'America/Denver','Existing vacation');
  perform public.save_coach_calendar_day('da800000-0000-4000-8000-000000000001',day,45,'[{"start":300,"end":345},{"start":420,"end":480}]');
  if not exists(select 1 from public.coach_availability_exceptions where label='Ravoge calendar availability v1:45' and kind='available_override' and starts_at=(day+time '05:00') at time zone 'America/Denver' and ends_at=(day+time '05:45') at time zone 'America/Denver') then raise exception '45 minute selection not persisted'; end if;
  if (select count(*) from public.get_staff_booking_calendar('d8100000-0000-4000-8000-000000000005',auth.uid(),day,60::smallint) where available)<>1 then raise exception 'Calendar save not reflected in shared booking system'; end if;
  if not exists(select 1 from public.bookings where id=booking and status='scheduled') then raise exception 'Existing booking changed'; end if;
  if not exists(select 1 from public.coach_availability_exceptions where label='Existing vacation') then raise exception 'Existing time off changed'; end if;
  select count(*) into before_count from public.coach_availability_exceptions where label like 'Ravoge calendar availability%';
  begin
    perform public.save_coach_calendar_day('da800000-0000-4000-8000-000000000001',day,45,'[{"start":600,"end":500}]');
    raise exception 'Invalid range accepted';
  exception when others then if sqlerrm='Invalid range accepted' then raise; end if; end;
  if (select count(*) from public.coach_availability_exceptions where label like 'Ravoge calendar availability%')<>before_count then raise exception 'Failed save removed existing times'; end if;
  perform public.save_coach_calendar_day('da800000-0000-4000-8000-000000000001',day+1,60,'[{"start":600,"end":720}]');
  perform public.save_coach_calendar_day('da800000-0000-4000-8000-000000000001',day,60,'[]');
  if exists(select 1 from public.get_staff_booking_calendar('d8100000-0000-4000-8000-000000000005',auth.uid(),day,60::smallint) where available) then raise exception 'Empty saved day reopened default availability'; end if;
  if not exists(select 1 from public.coach_availability_exceptions where starts_at=(day+1+time '10:00') at time zone 'America/Denver' and kind='available_override') then raise exception 'Another date was changed'; end if;
  if not exists(select 1 from public.bookings where id=booking and status='scheduled') then raise exception 'Booking lost after all-unavailable save'; end if;
  begin
    perform public.save_coach_calendar_day('db800000-0000-4000-8000-000000000001',day,60,'[]');
    raise exception 'Cross-gym save accepted';
  exception when insufficient_privilege then null; end;
  if exists(select 1 from public.get_coach_client_enrollment_credential('da800000-0000-4000-8000-000000000001')) then raise exception 'Missing enrollment invented'; end if;
  begin
    perform public.get_coach_client_enrollment_credential('db800000-0000-4000-8000-000000000001');
    raise exception 'Cross-gym QR exposed';
  exception when insufficient_privilege then null; end;
end $$;
reset role;
set local role authenticated;
select set_config('request.jwt.claim.sub','d8100000-0000-4000-8000-000000000005',true);
do $$ begin
  begin
    perform public.save_coach_calendar_day('da800000-0000-4000-8000-000000000001',current_date+1,60,'[]');
    raise exception 'Client saved Coach availability';
  exception when insufficient_privilege then null; end;
  begin
    perform public.get_coach_client_enrollment_credential('da800000-0000-4000-8000-000000000001');
    raise exception 'Client read Coach QR';
  exception when insufficient_privilege then null; end;
end $$;
rollback;
