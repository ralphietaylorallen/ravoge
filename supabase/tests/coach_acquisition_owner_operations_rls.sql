begin;

insert into auth.users (id,aud,role,email,encrypted_password,email_confirmed_at,raw_app_meta_data,raw_user_meta_data,created_at,updated_at) values
('a1000000-0000-4000-8000-000000000001','authenticated','authenticated','ops-owner-a@example.test',crypt('TestPass123!',gen_salt('bf')),now(),'{}','{"full_name":"Ops Owner A"}',now(),now()),
('a1000000-0000-4000-8000-000000000002','authenticated','authenticated','ops-coach-a@example.test',crypt('TestPass123!',gen_salt('bf')),now(),'{}','{"full_name":"Ops Coach A"}',now(),now()),
('a1000000-0000-4000-8000-000000000003','authenticated','authenticated','ops-coach-b@example.test',crypt('TestPass123!',gen_salt('bf')),now(),'{}','{"full_name":"Ops Coach B"}',now(),now()),
('a1000000-0000-4000-8000-000000000004','authenticated','authenticated','ops-client-coach@example.test',crypt('TestPass123!',gen_salt('bf')),now(),'{}','{"full_name":"Coach Invited Client"}',now(),now()),
('a1000000-0000-4000-8000-000000000005','authenticated','authenticated','ops-client-owner@example.test',crypt('TestPass123!',gen_salt('bf')),now(),'{}','{"full_name":"Owner Invited Client"}',now(),now()),
('a1000000-0000-4000-8000-000000000006','authenticated','authenticated','ops-wrong@example.test',crypt('TestPass123!',gen_salt('bf')),now(),'{}','{"full_name":"Wrong Email"}',now(),now()),
('b1000000-0000-4000-8000-000000000001','authenticated','authenticated','ops-owner-b@example.test',crypt('TestPass123!',gen_salt('bf')),now(),'{}','{"full_name":"Ops Owner B"}',now(),now()),
('b1000000-0000-4000-8000-000000000002','authenticated','authenticated','ops-client-b@example.test',crypt('TestPass123!',gen_salt('bf')),now(),'{}','{"full_name":"Ops Client B"}',now(),now());

insert into public.organizations (id,name,timezone) values
('aa000000-0000-4000-8000-000000000001','Acquisition Organization A','UTC'),
('bb000000-0000-4000-8000-000000000001','Acquisition Organization B','UTC');
insert into public.organization_memberships (organization_id,user_id,role) values
('aa000000-0000-4000-8000-000000000001','a1000000-0000-4000-8000-000000000001','owner'),
('aa000000-0000-4000-8000-000000000001','a1000000-0000-4000-8000-000000000002','coach'),
('aa000000-0000-4000-8000-000000000001','a1000000-0000-4000-8000-000000000003','coach'),
('bb000000-0000-4000-8000-000000000001','b1000000-0000-4000-8000-000000000001','owner'),
('bb000000-0000-4000-8000-000000000001','b1000000-0000-4000-8000-000000000002','client');

-- Coach invitation scope and role are derived server-side.
set local role authenticated;
select set_config('request.jwt.claim.sub','a1000000-0000-4000-8000-000000000002',true);
select set_config('request.jwt.claims','{"sub":"a1000000-0000-4000-8000-000000000002","email":"ops-coach-a@example.test","role":"authenticated"}',true);
select * from public.create_organization_invitation('ops-client-coach@example.test','client',encode(extensions.digest('coach-acquisition-token-000000000001','sha256'),'hex'),now()+interval '1 day');
do $$ begin
  if not exists (select 1 from public.organization_invitations where email='ops-client-coach@example.test' and organization_id='aa000000-0000-4000-8000-000000000001' and invited_by='a1000000-0000-4000-8000-000000000002' and role='client') then raise exception 'Coach invitation provenance was not persisted'; end if;
  begin perform public.create_organization_invitation('ops-wrong@example.test','owner',encode(extensions.digest('coach-owner-tamper-token-000000001','sha256'),'hex'),now()+interval '1 day'); raise exception 'Coach invited an Owner'; exception when others then if sqlerrm='Coach invited an Owner' then raise; end if; end;
  begin perform public.create_organization_invitation('ops-wrong@example.test','coach',encode(extensions.digest('coach-coach-tamper-token-00000001','sha256'),'hex'),now()+interval '1 day'); raise exception 'Coach invited another Coach'; exception when others then if sqlerrm='Coach invited another Coach' then raise; end if; end;
end $$;

-- Wrong email cannot consume the invite.
reset role; set local role authenticated;
select set_config('request.jwt.claim.sub','a1000000-0000-4000-8000-000000000006',true);
select set_config('request.jwt.claims','{"sub":"a1000000-0000-4000-8000-000000000006","email":"ops-wrong@example.test","role":"authenticated"}',true);
do $$ begin begin perform public.accept_organization_invitation('coach-acquisition-token-000000000001'); raise exception 'Wrong email consumed Coach invitation'; exception when others then if sqlerrm='Wrong email consumed Coach invitation' then raise; end if; end; end $$;

-- Exact Client acceptance atomically creates one membership and one active assignment; reuse is idempotent.
reset role; set local role authenticated;
select set_config('request.jwt.claim.sub','a1000000-0000-4000-8000-000000000004',true);
select set_config('request.jwt.claims','{"sub":"a1000000-0000-4000-8000-000000000004","email":"ops-client-coach@example.test","role":"authenticated"}',true);
select public.accept_organization_invitation('coach-acquisition-token-000000000001');
select public.accept_organization_invitation('coach-acquisition-token-000000000001');
do $$ begin
  if (select count(*) from public.organization_memberships where user_id='a1000000-0000-4000-8000-000000000004' and organization_id='aa000000-0000-4000-8000-000000000001' and role='client' and status='active')<>1 then raise exception 'Coach-invited membership was not created exactly once'; end if;
  if (select count(*) from public.coach_client_assignments where client_user_id='a1000000-0000-4000-8000-000000000004' and coach_user_id='a1000000-0000-4000-8000-000000000002' and status='active')<>1 then raise exception 'Coach-invited Client was not assigned exactly once'; end if;
end $$;

-- Owner-created Client invitation joins the organization but remains unassigned.
reset role; set local role authenticated;
select set_config('request.jwt.claim.sub','a1000000-0000-4000-8000-000000000001',true);
select set_config('request.jwt.claims','{"sub":"a1000000-0000-4000-8000-000000000001","email":"ops-owner-a@example.test","role":"authenticated"}',true);
select * from public.create_organization_invitation('ops-client-owner@example.test','client',encode(extensions.digest('owner-acquisition-token-000000000001','sha256'),'hex'),now()+interval '1 day');
reset role; set local role authenticated;
select set_config('request.jwt.claim.sub','a1000000-0000-4000-8000-000000000005',true);
select set_config('request.jwt.claims','{"sub":"a1000000-0000-4000-8000-000000000005","email":"ops-client-owner@example.test","role":"authenticated"}',true);
select public.accept_organization_invitation('owner-acquisition-token-000000000001');
do $$ begin if exists (select 1 from public.coach_client_assignments where client_user_id='a1000000-0000-4000-8000-000000000005' and status='active') then raise exception 'Owner-created Client was assigned an arbitrary Coach'; end if; end $$;

-- Owner configures exact values and hands the same canonical Client to Coach B.
reset role; set local role authenticated;
select set_config('request.jwt.claim.sub','a1000000-0000-4000-8000-000000000001',true);
select public.configure_organization_session_pricing(10000,'USD');
select public.configure_coach_compensation('a1000000-0000-4000-8000-000000000003','percentage',null,3000,'USD');
select public.assign_client_to_coach('a1000000-0000-4000-8000-000000000004','a1000000-0000-4000-8000-000000000003');
insert into public.client_body_composition_assessments (organization_id,client_user_id,recorded_by,measured_at,weight_kg,skeletal_muscle_mass_kg,body_fat_percentage) values ('aa000000-0000-4000-8000-000000000001','a1000000-0000-4000-8000-000000000004','a1000000-0000-4000-8000-000000000001',now(),84.1,38.5,19.2);
reset role;
insert into public.bookings (organization_id,coach_user_id,client_user_id,session_type,starts_at,ends_at,timezone,blocked_span,booked_by) values ('aa000000-0000-4000-8000-000000000001','a1000000-0000-4000-8000-000000000003','a1000000-0000-4000-8000-000000000004','Private training',now()+interval '40 days',now()+interval '40 days 1 hour','UTC',tstzrange(now()+interval '40 days',now()+interval '40 days 1 hour','[)'),'a1000000-0000-4000-8000-000000000001');
do $$ begin
  if not exists (select 1 from public.bookings where session_price_minor=10000 and coach_compensation_minor=3000 and gym_retained_minor=7000 and ravoge_platform_fee_minor=0 and compensation_model='percentage' and payment_status='unpaid') then raise exception 'Exact percentage calculation did not produce 3000/7000 minor units'; end if;
  if exists (select 1 from public.coach_client_assignments where coach_user_id='a1000000-0000-4000-8000-000000000002' and client_user_id='a1000000-0000-4000-8000-000000000004' and status='active') then raise exception 'Prior Coach remained active after handoff'; end if;
end $$;

-- Former Coach loses access, current Coach gains it, and financial config is Owner-only.
reset role; set local role authenticated;
select set_config('request.jwt.claim.sub','a1000000-0000-4000-8000-000000000002',true);
do $$ begin
  if exists (select 1 from public.profiles where id='a1000000-0000-4000-8000-000000000004') then raise exception 'Former Coach retained Client profile access'; end if;
  if exists (select 1 from public.client_body_composition_assessments where client_user_id='a1000000-0000-4000-8000-000000000004') then raise exception 'Former Coach retained body-composition access'; end if;
  if exists (select 1 from public.organization_session_pricing) then raise exception 'Coach read Owner pricing'; end if;
end $$;
reset role; set local role authenticated;
select set_config('request.jwt.claim.sub','a1000000-0000-4000-8000-000000000003',true);
do $$ begin
  if not exists (select 1 from public.profiles where id='a1000000-0000-4000-8000-000000000004') then raise exception 'Assigned Coach cannot read Client profile'; end if;
  if not exists (select 1 from public.client_body_composition_assessments where client_user_id='a1000000-0000-4000-8000-000000000004') then raise exception 'Assigned Coach cannot read Client progress'; end if;
  begin insert into public.coach_client_assignments (organization_id,coach_user_id,client_user_id) values ('bb000000-0000-4000-8000-000000000001','a1000000-0000-4000-8000-000000000003','b1000000-0000-4000-8000-000000000002'); raise exception 'Coach assigned a cross-organization Client'; exception when others then if sqlerrm='Coach assigned a cross-organization Client' then raise; end if; end;
end $$;

-- Client tampering and cross-organization Owner reads fail at the database layer.
reset role; set local role authenticated;
select set_config('request.jwt.claim.sub','a1000000-0000-4000-8000-000000000004',true);
do $$ begin
  begin update public.organization_memberships set role='owner' where user_id='a1000000-0000-4000-8000-000000000004'; raise exception 'Client promoted own membership'; exception when others then if sqlerrm='Client promoted own membership' then raise; end if; end;
  begin update public.coach_client_assignments set coach_user_id='a1000000-0000-4000-8000-000000000002' where client_user_id='a1000000-0000-4000-8000-000000000004'; raise exception 'Client changed assigned Coach'; exception when others then if sqlerrm='Client changed assigned Coach' then raise; end if; end;
end $$;
reset role; set local role authenticated;
select set_config('request.jwt.claim.sub','b1000000-0000-4000-8000-000000000001',true);
do $$ begin
  if exists (select 1 from public.organization_session_pricing where organization_id='aa000000-0000-4000-8000-000000000001') then raise exception 'Cross-organization Owner read pricing'; end if;
  if exists (select 1 from public.coach_compensation_configs where organization_id='aa000000-0000-4000-8000-000000000001') then raise exception 'Cross-organization Owner read compensation'; end if;
  if exists (select 1 from public.client_body_composition_assessments where organization_id='aa000000-0000-4000-8000-000000000001') then raise exception 'Cross-organization Owner read Client progress'; end if;
  if exists (select 1 from public.bookings where organization_id='aa000000-0000-4000-8000-000000000001') then raise exception 'Cross-organization Owner read revenue bookings'; end if;
end $$;

rollback;
