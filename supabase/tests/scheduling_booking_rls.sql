begin;
insert into auth.users (id,aud,role,email,encrypted_password,email_confirmed_at,raw_app_meta_data,raw_user_meta_data,created_at,updated_at) values
('91000000-0000-0000-0000-000000000001','authenticated','authenticated','schedule-owner-a@example.test',crypt('TestPass123!',gen_salt('bf')),now(),'{}','{"full_name":"Schedule Owner A"}',now(),now()),
('91000000-0000-0000-0000-000000000002','authenticated','authenticated','schedule-coach-a@example.test',crypt('TestPass123!',gen_salt('bf')),now(),'{}','{"full_name":"Schedule Coach A"}',now(),now()),
('91000000-0000-0000-0000-000000000003','authenticated','authenticated','schedule-client-a1@example.test',crypt('TestPass123!',gen_salt('bf')),now(),'{}','{"full_name":"Schedule Client A1"}',now(),now()),
('91000000-0000-0000-0000-000000000004','authenticated','authenticated','schedule-client-a2@example.test',crypt('TestPass123!',gen_salt('bf')),now(),'{}','{"full_name":"Schedule Client A2"}',now(),now()),
('92000000-0000-0000-0000-000000000001','authenticated','authenticated','schedule-owner-b@example.test',crypt('TestPass123!',gen_salt('bf')),now(),'{}','{"full_name":"Schedule Owner B"}',now(),now());
insert into public.organizations (id,name,timezone) values ('9a000000-0000-0000-0000-000000000001','Schedule Organization A','UTC'),('9b000000-0000-0000-0000-000000000001','Schedule Organization B','UTC');
insert into public.organization_memberships (organization_id,user_id,role) values
('9a000000-0000-0000-0000-000000000001','91000000-0000-0000-0000-000000000001','owner'),
('9a000000-0000-0000-0000-000000000001','91000000-0000-0000-0000-000000000002','coach'),
('9a000000-0000-0000-0000-000000000001','91000000-0000-0000-0000-000000000003','client'),
('9a000000-0000-0000-0000-000000000001','91000000-0000-0000-0000-000000000004','client'),
('9b000000-0000-0000-0000-000000000001','92000000-0000-0000-0000-000000000001','owner');
insert into public.coach_client_assignments (organization_id,coach_user_id,client_user_id) values
('9a000000-0000-0000-0000-000000000001','91000000-0000-0000-0000-000000000002','91000000-0000-0000-0000-000000000003'),
('9a000000-0000-0000-0000-000000000001','91000000-0000-0000-0000-000000000002','91000000-0000-0000-0000-000000000004');
insert into public.organization_hours (organization_id,day_of_week,is_closed,opens_at,closes_at,updated_by)
select '9a000000-0000-0000-0000-000000000001', day, false, '08:00', '18:00', '91000000-0000-0000-0000-000000000001' from generate_series(0,6) day;
insert into public.organization_session_settings (organization_id,default_duration_minutes,permitted_durations,slot_increment_minutes,minimum_notice_minutes,maximum_advance_days,cancellation_cutoff_minutes,updated_by)
values ('9a000000-0000-0000-0000-000000000001',60,array[30,60]::smallint[],30,0,30,0,'91000000-0000-0000-0000-000000000001');
insert into public.coach_availability (organization_id,coach_user_id,day_of_week,starts_at,ends_at)
select '9a000000-0000-0000-0000-000000000001','91000000-0000-0000-0000-000000000002',day,'09:00','17:00' from generate_series(0,6) day;

set local role authenticated;
select set_config('request.jwt.claim.sub','91000000-0000-0000-0000-000000000003',true);
do $$ declare target_start timestamptz := ((current_date + 3) + time '10:00') at time zone 'UTC'; new_id uuid; begin
  begin
    perform private.booking_slot_is_available(
      '9b000000-0000-0000-0000-000000000001',
      '91000000-0000-0000-0000-000000000002',
      '91000000-0000-0000-0000-000000000003',
      target_start,
      target_start + interval '1 hour',
      null
    );
    raise exception 'Client directly executed the private availability helper';
  exception
    when insufficient_privilege then null;
    when raise_exception then
      if sqlerrm = 'Client directly executed the private availability helper' then raise; end if;
  end;
  if not exists (select 1 from public.get_client_booking_availability(current_date + 3,60::smallint) slot where slot.starts_at=target_start) then raise exception 'Valid availability was not generated'; end if;
  if exists (select 1 from public.get_client_booking_availability(current_date + 3,45::smallint)) then raise exception 'Invalid duration generated availability'; end if;
  new_id := public.create_client_booking(target_start,60::smallint,null);
  if new_id is null then raise exception 'Valid booking did not succeed'; end if;
  begin perform public.create_client_booking(((current_date + 3)+time '07:00') at time zone 'UTC',60::smallint,null); raise exception 'Out-of-hours booking succeeded'; exception when raise_exception then if sqlerrm='Out-of-hours booking succeeded' then raise; end if; end;
end $$;
select public.finalize_own_booking_email_delivery(
  (select id from public.booking_email_deliveries where status = 'pending' limit 1),
  'skipped'::public.email_delivery_status,
  'resend',
  null,
  'Transactional email is not configured.'
);
do $$ begin
  if not exists (select 1 from public.bookings where status = 'scheduled') then raise exception 'Skipping email removed the booking'; end if;
  if not exists (select 1 from public.booking_email_deliveries where status = 'skipped') then raise exception 'Missing email configuration was not recorded as skipped'; end if;
end $$;

reset role; set local role authenticated;
select set_config('request.jwt.claim.sub','91000000-0000-0000-0000-000000000004',true);
do $$ declare target_start timestamptz := ((current_date + 3)+time '10:00') at time zone 'UTC'; begin
  begin perform public.create_client_booking(target_start,60::smallint,null); raise exception 'Coach double booking succeeded'; exception when raise_exception then if sqlerrm='Coach double booking succeeded' then raise; end if; end;
  if exists (select 1 from public.bookings) then raise exception 'Client can read another Client booking'; end if;
end $$;

reset role; set local role authenticated;
select set_config('request.jwt.claim.sub','91000000-0000-0000-0000-000000000002',true);
do $$ begin if (select count(*) from public.bookings) <> 1 then raise exception 'Coach cannot read own schedule'; end if; end $$;

reset role; set local role authenticated;
select set_config('request.jwt.claim.sub','91000000-0000-0000-0000-000000000001',true);
do $$ begin if (select count(*) from public.bookings) <> 1 then raise exception 'Owner cannot read master schedule'; end if; end $$;
insert into public.organization_special_hours (organization_id,local_date,label,is_closed,created_by) values ('9a000000-0000-0000-0000-000000000001',current_date+4,'Test closure',true,'91000000-0000-0000-0000-000000000001');

reset role; set local role authenticated;
select set_config('request.jwt.claim.sub','91000000-0000-0000-0000-000000000003',true);
do $$ begin if exists (select 1 from public.get_client_booking_availability(current_date+4,60::smallint)) then raise exception 'Closure still exposes slots'; end if; end $$;

reset role; set local role authenticated;
select set_config('request.jwt.claim.sub','92000000-0000-0000-0000-000000000001',true);
do $$ begin if exists (select 1 from public.bookings) then raise exception 'Cross-organization owner can read bookings'; end if; end $$;
rollback;
