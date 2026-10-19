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
do $$ declare day date := current_date + ((8-extract(isodow from current_date)::int)%7+1); slot record; booking uuid; begin
  -- Pick the next Monday, safely in the future.
  day := current_date + (8-extract(isodow from current_date)::int);
  for offset_day in 0..5 loop
    if (select count(*) from public.get_staff_booking_calendar('d8100000-0000-4000-8000-000000000005','d8100000-0000-4000-8000-000000000002',day+offset_day,60::smallint) where available) <> 15 then raise exception 'Fallback did not return 15 open Monday-Saturday hours'; end if;
  end loop;
  if exists(select 1 from public.get_staff_booking_calendar('d8100000-0000-4000-8000-000000000005','d8100000-0000-4000-8000-000000000002',day+6,60::smallint)) then raise exception 'Fallback opened Sunday'; end if;
  if exists(select 1 from public.get_staff_booking_calendar('d8100000-0000-4000-8000-000000000005','d8100000-0000-4000-8000-000000000002',day,30::smallint)) then raise exception 'Fallback offered non-hour duration'; end if;
  select * into strict slot from public.get_staff_booking_calendar('d8100000-0000-4000-8000-000000000005','d8100000-0000-4000-8000-000000000002',day,60::smallint) order by starts_at limit 1;
  if slot.starts_at at time zone 'America/Denver' <> day+time '05:00' or slot.timezone <> 'America/Denver' then raise exception 'Fallback ignored organization timezone'; end if;
  select * into strict slot from public.get_staff_booking_calendar('d8100000-0000-4000-8000-000000000005','d8100000-0000-4000-8000-000000000002',day,60::smallint) order by starts_at desc limit 1;
  if slot.starts_at at time zone 'America/Denver' <> day+time '19:00' then raise exception 'Final start must be 19:00'; end if;
  booking := public.create_staff_appointment('d8100000-0000-4000-8000-000000000005','d8100000-0000-4000-8000-000000000002',(day+time '05:00') at time zone 'America/Denver',60::smallint,'intake',null);
  if not exists(select 1 from public.bookings where id=booking and session_type='Intake') then raise exception 'Intake did not use shared booking record'; end if;
  if (select count(*) from public.get_staff_booking_calendar('d8100000-0000-4000-8000-000000000005','d8100000-0000-4000-8000-000000000002',day,60::smallint) where not available) <> 1 then raise exception 'Occupied intake not shown as Full'; end if;
  begin perform public.create_staff_booking('d8100000-0000-4000-8000-000000000005','d8100000-0000-4000-8000-000000000002',(day+time '05:00') at time zone 'America/Denver',60::smallint,null); raise exception 'Double-booking accepted'; exception when others then if sqlerrm='Double-booking accepted' then raise; end if; end;
  begin perform public.create_staff_booking('d8100000-0000-4000-8000-000000000005','d8100000-0000-4000-8000-000000000002',(day+time '20:00') at time zone 'America/Denver',60::smallint,null); raise exception '20:00 start accepted'; exception when others then if sqlerrm='20:00 start accepted' then raise; end if; end;
  begin perform public.create_staff_booking('d8100000-0000-4000-8000-000000000005','d8100000-0000-4000-8000-000000000002',(day+time '06:30') at time zone 'America/Denver',60::smallint,null); raise exception 'Off-grid fallback accepted'; exception when others then if sqlerrm='Off-grid fallback accepted' then raise; end if; end;
  begin perform public.get_staff_booking_calendar('d8100000-0000-4000-8000-000000000004','d8100000-0000-4000-8000-000000000002',day,60::smallint); raise exception 'Unassigned Client calendar exposed'; exception when others then if sqlerrm='Unassigned Client calendar exposed' then raise; end if; end;
  begin perform public.get_staff_booking_calendar('d8200000-0000-4000-8000-000000000002','d8100000-0000-4000-8000-000000000002',day,60::smallint); raise exception 'Cross-organization calendar exposed'; exception when others then if sqlerrm='Cross-organization calendar exposed' then raise; end if; end;
  begin perform public.create_staff_appointment('d8100000-0000-4000-8000-000000000005','d8100000-0000-4000-8000-000000000002',(day+time '06:00') at time zone 'America/Denver',60::smallint,'owner',null); raise exception 'Unknown appointment kind accepted'; exception when others then if sqlerrm='Unknown appointment kind accepted' then raise; end if; end;
  perform public.reschedule_staff_booking(booking,(day+time '06:00') at time zone 'America/Denver',60::smallint);
  perform public.cancel_staff_booking(booking,'Fixture cancellation');
  if exists(select 1 from public.get_staff_booking_calendar('d8100000-0000-4000-8000-000000000005','d8100000-0000-4000-8000-000000000002',day,60::smallint) where not available) then raise exception 'Cancelled booking blocks time'; end if;
end $$;

-- Owner can schedule another active same-gym Client without changing assignments.
reset role; set local role authenticated;
select set_config('request.jwt.claim.sub','d8100000-0000-4000-8000-000000000001',true);
select public.create_staff_booking('d8100000-0000-4000-8000-000000000004','d8100000-0000-4000-8000-000000000002',((current_date+(8-extract(isodow from current_date)::int))+time '07:00') at time zone 'America/Denver',60::smallint,null);

reset role; set local role authenticated;
select set_config('request.jwt.claim.sub','d8100000-0000-4000-8000-000000000005',true);
do $$ declare day date := current_date+(8-extract(isodow from current_date)::int); booking uuid; begin
  if (select count(*) from public.get_client_booking_calendar(day,60::smallint) where not available)<>1 then raise exception 'Client cannot see occupied time as Full'; end if;
  if exists(select 1 from public.bookings where client_user_id='d8100000-0000-4000-8000-000000000004') then raise exception 'Client can read another Client booking'; end if;
  booking := public.create_client_booking((day+time '08:00') at time zone 'America/Denver',60::smallint,null);
  perform public.reschedule_client_booking(booking,(day+time '09:00') at time zone 'America/Denver',60::smallint);
  perform public.cancel_client_booking(booking,'Fixture cancellation');
  begin perform public.get_staff_booking_calendar('d8100000-0000-4000-8000-000000000005','d8100000-0000-4000-8000-000000000002',day,60::smallint); raise exception 'Client used staff calendar'; exception when others then if sqlerrm='Client used staff calendar' then raise; end if; end;
end $$;

reset role; set local role authenticated;
select set_config('request.jwt.claim.sub','d8200000-0000-4000-8000-000000000001',true);
do $$ begin
  begin perform public.get_staff_booking_calendar('d8100000-0000-4000-8000-000000000005','d8100000-0000-4000-8000-000000000002',current_date+2,60::smallint); raise exception 'Other Owner used calendar'; exception when others then if sqlerrm='Other Owner used calendar' then raise; end if; end;
end $$;

reset role;
do $$ begin
  if exists(select 1 from public.organization_session_settings where organization_id in ('da800000-0000-4000-8000-000000000001','db800000-0000-4000-8000-000000000001')) then raise exception 'Virtual fallback mutated configuration'; end if;
  if has_function_privilege('anon','public.get_staff_booking_calendar(uuid,uuid,date,smallint)','execute')
    or has_function_privilege('authenticated','private.effective_schedule_settings(uuid)','execute') then raise exception 'Private scheduling helper exposed'; end if;
end $$;

-- Explicit organization hours and a partial weekly Coach configuration replace defaults.
insert into public.organization_hours(organization_id,day_of_week,is_closed,opens_at,closes_at,updated_by)
values('da800000-0000-4000-8000-000000000001',1,false,'08:00','10:00','d8100000-0000-4000-8000-000000000001');
insert into public.coach_availability(organization_id,coach_user_id,day_of_week,starts_at,ends_at)
values('da800000-0000-4000-8000-000000000001','d8100000-0000-4000-8000-000000000002',1,'08:00','10:00');
set local role authenticated;
select set_config('request.jwt.claim.sub','d8100000-0000-4000-8000-000000000005',true);
do $$ declare day date := current_date+(8-extract(isodow from current_date)::int); begin
  if (select count(*) from public.get_client_booking_calendar(day,60::smallint))<>2 then raise exception 'Explicit hours were overridden'; end if;
  if exists(select 1 from public.get_client_booking_calendar(day+1,60::smallint)) then raise exception 'Partial configured week opened missing day'; end if;
end $$;
reset role;
insert into public.organization_special_hours(organization_id,local_date,label,is_closed,created_by)
values('da800000-0000-4000-8000-000000000001',current_date+(8-extract(isodow from current_date)::int),'Fixture closure',true,'d8100000-0000-4000-8000-000000000001');
set local role authenticated;
select set_config('request.jwt.claim.sub','d8100000-0000-4000-8000-000000000005',true);
do $$ begin
  if exists(select 1 from public.get_client_booking_calendar(current_date+(8-extract(isodow from current_date)::int),60::smallint)) then raise exception 'Closure ignored'; end if;
end $$;
reset role;
update public.organization_memberships set status='inactive' where user_id='d8100000-0000-4000-8000-000000000005';
set local role authenticated;
select set_config('request.jwt.claim.sub','d8100000-0000-4000-8000-000000000005',true);
do $$ begin
  begin perform public.get_client_booking_calendar(current_date+2,60::smallint); raise exception 'Inactive membership retained access'; exception when others then if sqlerrm='Inactive membership retained access' then raise; end if; end;
end $$;
rollback;
