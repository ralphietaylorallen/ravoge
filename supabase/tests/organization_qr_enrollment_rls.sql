begin;

insert into auth.users (
  id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at
) values
  ('e1000000-0000-4000-8000-000000000001','authenticated','authenticated','qr-owner-a@example.test',crypt('TestPass123!',gen_salt('bf')),now(),'{}','{"full_name":"QR Owner A"}',now(),now()),
  ('e1000000-0000-4000-8000-000000000002','authenticated','authenticated','qr-owner-b@example.test',crypt('TestPass123!',gen_salt('bf')),now(),'{}','{"full_name":"QR Owner B"}',now(),now()),
  ('e1000000-0000-4000-8000-000000000003','authenticated','authenticated','qr-client@example.test',crypt('TestPass123!',gen_salt('bf')),now(),'{}','{"full_name":"QR Client"}',now(),now()),
  ('e1000000-0000-4000-8000-000000000004','authenticated','authenticated','qr-coach@example.test',crypt('TestPass123!',gen_salt('bf')),now(),'{}','{"full_name":"QR Coach"}',now(),now()),
  ('e1000000-0000-4000-8000-000000000005','authenticated','authenticated','qr-conflict@example.test',crypt('TestPass123!',gen_salt('bf')),now(),'{}','{"full_name":"QR Conflict"}',now(),now()),
  ('e1000000-0000-4000-8000-000000000006','authenticated','authenticated','qr-email-client@example.test',crypt('TestPass123!',gen_salt('bf')),now(),'{}','{"full_name":"QR Email Client"}',now(),now()),
  ('e1000000-0000-4000-8000-000000000007','authenticated','authenticated','qr-existing-client@example.test',crypt('TestPass123!',gen_salt('bf')),now(),'{}','{"full_name":"QR Existing Client"}',now(),now());

insert into public.organizations (id,name) values
  ('ea000000-0000-4000-8000-000000000001','QR Gym A'),
  ('eb000000-0000-4000-8000-000000000001','QR Gym B');
insert into public.organization_memberships (organization_id,user_id,role) values
  ('ea000000-0000-4000-8000-000000000001','e1000000-0000-4000-8000-000000000001','owner'),
  ('eb000000-0000-4000-8000-000000000001','e1000000-0000-4000-8000-000000000002','owner');

-- Owners can create only fixed Coach/Client credentials for their own active organization.
set local role authenticated;
select set_config('request.jwt.claim.sub','e1000000-0000-4000-8000-000000000001',true);
select * from public.ensure_organization_enrollment_credential(
  'client',
  'ec000000-0000-4000-8000-000000000001',
  'ed000000-0000-4000-8000-000000000001',
  encode(extensions.digest('ravoge-org-a-client-token-000000000001','sha256'),'hex')
);
select * from public.ensure_organization_enrollment_credential(
  'coach',
  'ec000000-0000-4000-8000-000000000002',
  'ed000000-0000-4000-8000-000000000002',
  encode(extensions.digest('ravoge-org-a-coach-token-0000000000001','sha256'),'hex')
);

do $$ begin
  begin
    perform public.ensure_organization_enrollment_credential(
      'owner',gen_random_uuid(),gen_random_uuid(),repeat('a',64)
    );
    raise exception 'Owner created an Owner QR';
  exception when raise_exception then
    if sqlerrm='Owner created an Owner QR' then raise; end if;
  end;
end $$;
reset role;
do $$ begin
  if (select count(*) from public.organization_enrollment_credentials where organization_id='ea000000-0000-4000-8000-000000000001') <> 2 then
    raise exception 'Owner credentials were not scoped to the organization';
  end if;
end $$;

-- Public resolution reveals only the intended install context, not organization ids.
set local role anon;
do $$ declare context_record record; begin
  select * into context_record
  from public.get_organization_enrollment_handoff('ravoge-org-a-client-token-000000000001');
  if context_record.enrollment_kind <> 'organization_qr'
    or context_record.organization_name <> 'QR Gym A'
    or context_record.role <> 'client'
    or context_record.email is not null then
    raise exception 'Client QR did not resolve its fixed organization and role';
  end if;
  if exists (select 1 from public.get_organization_enrollment_handoff('ravoge-random-token-00000000000000000000')) then
    raise exception 'A random or edited QR token resolved';
  end if;
  begin
    perform public.accept_organization_enrollment('ravoge-org-a-client-token-000000000001');
    raise exception 'Anonymous caller accepted an enrollment';
  exception when insufficient_privilege then null;
    when raise_exception then
      if sqlerrm='Anonymous caller accepted an enrollment' then raise; end if;
  end;
end $$;

-- A Client QR creates only the stored active Client membership and is idempotent.
reset role;
set local role authenticated;
select set_config('request.jwt.claim.sub','e1000000-0000-4000-8000-000000000003',true);
select public.accept_organization_enrollment('ravoge-org-a-client-token-000000000001');
do $$ begin
  if public.accept_organization_enrollment('ravoge-org-a-client-token-000000000001') <> 'client' then
    raise exception 'Same-membership enrollment was not idempotent';
  end if;
  if not exists (
    select 1 from public.organization_memberships
    where organization_id='ea000000-0000-4000-8000-000000000001'
      and user_id='e1000000-0000-4000-8000-000000000003'
      and role='client' and status='active' and invitation_id is null
  ) then raise exception 'Client QR did not create the intended membership'; end if;
  if exists (select 1 from public.coach_client_assignments where client_user_id='e1000000-0000-4000-8000-000000000003') then
    raise exception 'Public Client QR unexpectedly assigned a Coach';
  end if;
end $$;

-- An existing unaffiliated Ravoge Client identity joins without a duplicate Auth user.
reset role;
set local role authenticated;
select set_config('request.jwt.claim.sub','e1000000-0000-4000-8000-000000000007',true);
select public.register_unaffiliated_account_type('client');
select public.accept_organization_enrollment('ravoge-org-a-client-token-000000000001');
do $$ begin
  if not exists (
    select 1 from public.organization_memberships
    where organization_id='ea000000-0000-4000-8000-000000000001'
      and user_id='e1000000-0000-4000-8000-000000000007'
      and role='client' and status='active'
  ) then raise exception 'Existing unaffiliated Client did not join through the QR'; end if;
end $$;
reset role;
do $$ begin
  if (select count(*) from auth.users where email='qr-existing-client@example.test') <> 1 then
    raise exception 'Existing Client enrollment duplicated the Auth identity';
  end if;
end $$;

-- A Coach QR creates only the fixed Coach membership.
reset role;
set local role authenticated;
select set_config('request.jwt.claim.sub','e1000000-0000-4000-8000-000000000004',true);
select public.accept_organization_enrollment('ravoge-org-a-coach-token-0000000000001');
do $$ begin
  if not exists (
    select 1 from public.organization_memberships
    where organization_id='ea000000-0000-4000-8000-000000000001'
      and user_id='e1000000-0000-4000-8000-000000000004'
      and role='coach' and status='active'
  ) then raise exception 'Coach QR did not create the intended membership'; end if;
end $$;

-- An existing conflicting identity cannot use the Client QR to change role.
reset role;
set local role authenticated;
select set_config('request.jwt.claim.sub','e1000000-0000-4000-8000-000000000005',true);
select public.register_unaffiliated_account_type('coach');
do $$ begin
  begin
    perform public.accept_organization_enrollment('ravoge-org-a-client-token-000000000001');
    raise exception 'Conflicting Coach identity became a Client';
  exception when raise_exception then
    if sqlerrm='Conflicting Coach identity became a Client' then raise; end if;
  end;
end $$;

-- Rotation invalidates the printed/old QR and activates the replacement.
reset role;
set local role authenticated;
select set_config('request.jwt.claim.sub','e1000000-0000-4000-8000-000000000001',true);
select public.rotate_organization_enrollment_credential(
  'client',
  'ed000000-0000-4000-8000-000000000003',
  encode(extensions.digest('ravoge-org-a-client-rotated-00000000001','sha256'),'hex')
);
reset role;
set local role anon;
do $$ begin
  if exists (select 1 from public.get_organization_enrollment_handoff('ravoge-org-a-client-token-000000000001')) then
    raise exception 'Rotated old QR still resolves';
  end if;
  if not exists (select 1 from public.get_organization_enrollment_handoff('ravoge-org-a-client-rotated-00000000001')) then
    raise exception 'Rotated replacement QR does not resolve';
  end if;
end $$;

-- Disable blocks future use but does not alter established members.
reset role;
set local role authenticated;
select set_config('request.jwt.claim.sub','e1000000-0000-4000-8000-000000000001',true);
select public.disable_organization_enrollment_credential('client');
reset role;
set local role anon;
do $$ begin
  if exists (select 1 from public.get_organization_enrollment_handoff('ravoge-org-a-client-rotated-00000000001')) then
    raise exception 'Disabled QR still resolves';
  end if;
end $$;
reset role;
do $$ begin
  if not exists (
    select 1 from public.organization_memberships
    where user_id='e1000000-0000-4000-8000-000000000003' and status='active'
  ) then raise exception 'Disabling a QR changed an existing member'; end if;
end $$;

-- Email invitations use the same canonical acceptance engine and preserve Coach assignment.
set local role authenticated;
select set_config('request.jwt.claim.sub','e1000000-0000-4000-8000-000000000004',true);
select * from public.create_organization_invitation(
  'qr-email-client@example.test',
  'client',
  encode(extensions.digest('ravoge-email-enrollment-token-0000000001','sha256'),'hex'),
  now() + interval '1 day'
);
reset role;
set local role authenticated;
select set_config('request.jwt.claim.sub','e1000000-0000-4000-8000-000000000006',true);
select public.accept_organization_enrollment('ravoge-email-enrollment-token-0000000001');
do $$ begin
  if not exists (
    select 1 from public.coach_client_assignments
    where organization_id='ea000000-0000-4000-8000-000000000001'
      and coach_user_id='e1000000-0000-4000-8000-000000000004'
      and client_user_id='e1000000-0000-4000-8000-000000000006'
      and status='active'
  ) then raise exception 'Coach email invitation did not assign the accepted Client'; end if;
end $$;

-- Another organization cannot inspect or mutate credentials through the Data API or Owner RPCs.
reset role;
set local role authenticated;
select set_config('request.jwt.claim.sub','e1000000-0000-4000-8000-000000000002',true);
do $$ begin
  begin
    perform * from public.organization_enrollment_credentials;
    raise exception 'Authenticated browser directly read credential records';
  exception when insufficient_privilege then null;
    when raise_exception then
      if sqlerrm='Authenticated browser directly read credential records' then raise; end if;
  end;
end $$;
select * from public.ensure_organization_enrollment_credential(
  'coach',
  'ec000000-0000-4000-8000-000000000003',
  'ed000000-0000-4000-8000-000000000004',
  encode(extensions.digest('ravoge-org-b-coach-token-0000000000001','sha256'),'hex')
);
reset role;
do $$ begin
  if (select status from public.organization_enrollment_credentials where organization_id='ea000000-0000-4000-8000-000000000001' and authorized_role='coach') <> 'active' then
    raise exception 'Owner B changed Owner A Coach QR';
  end if;
  if not exists (
    select 1 from public.organization_enrollment_credentials
    where organization_id='eb000000-0000-4000-8000-000000000001'
      and authorized_role='coach'
  ) then raise exception 'Owner B could not create only their own credential'; end if;
end $$;

rollback;
