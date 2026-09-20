begin;

insert into auth.users (
  id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at
) values
  ('51000000-0000-0000-0000-000000000001', 'authenticated', 'authenticated', 'primary-a@example.test', crypt('TestPass123!', gen_salt('bf')), now(), '{"provider":"email","providers":["email"]}', '{"full_name":"Primary Owner A"}', now(), now()),
  ('51000000-0000-0000-0000-000000000002', 'authenticated', 'authenticated', 'additional-a@example.test', crypt('TestPass123!', gen_salt('bf')), now(), '{"provider":"email","providers":["email"]}', '{"full_name":"Additional Owner A"}', now(), now()),
  ('51000000-0000-0000-0000-000000000003', 'authenticated', 'authenticated', 'coach-a-multi@example.test', crypt('TestPass123!', gen_salt('bf')), now(), '{"provider":"email","providers":["email"]}', '{"full_name":"Coach A"}', now(), now()),
  ('51000000-0000-0000-0000-000000000004', 'authenticated', 'authenticated', 'client-a-multi@example.test', crypt('TestPass123!', gen_salt('bf')), now(), '{"provider":"email","providers":["email"]}', '{"full_name":"Client A"}', now(), now()),
  ('51000000-0000-0000-0000-000000000005', 'authenticated', 'authenticated', 'unrelated@example.test', crypt('TestPass123!', gen_salt('bf')), now(), '{"provider":"email","providers":["email"]}', '{"full_name":"Unrelated User"}', now(), now()),
  ('52000000-0000-0000-0000-000000000001', 'authenticated', 'authenticated', 'primary-b@example.test', crypt('TestPass123!', gen_salt('bf')), now(), '{"provider":"email","providers":["email"]}', '{"full_name":"Primary Owner B"}', now(), now());

insert into public.organizations (id, name) values
  ('5a000000-0000-0000-0000-000000000001', 'Organization A'),
  ('5b000000-0000-0000-0000-000000000001', 'Organization B');

insert into public.organization_memberships (organization_id, user_id, role) values
  ('5a000000-0000-0000-0000-000000000001', '51000000-0000-0000-0000-000000000001', 'owner'),
  ('5a000000-0000-0000-0000-000000000001', '51000000-0000-0000-0000-000000000003', 'coach'),
  ('5a000000-0000-0000-0000-000000000001', '51000000-0000-0000-0000-000000000004', 'client'),
  ('5b000000-0000-0000-0000-000000000001', '52000000-0000-0000-0000-000000000001', 'owner');

do $$
begin
  if not exists (
    select 1 from public.organization_memberships
    where organization_id = '5a000000-0000-0000-0000-000000000001'
      and user_id = '51000000-0000-0000-0000-000000000001'
      and is_primary_owner
  ) then
    raise exception 'The first active owner was not made primary owner';
  end if;
end;
$$;

-- Owner A creates an owner invitation. Organization, role, inviter, and email
-- live in the database; the acceptance RPC receives only the opaque token.
set local role authenticated;
select set_config('request.jwt.claim.sub', '51000000-0000-0000-0000-000000000001', true);
select set_config('request.jwt.claims', '{"sub":"51000000-0000-0000-0000-000000000001","email":"primary-a@example.test","role":"authenticated"}', true);

insert into public.organization_invitations (
  organization_id, invited_by, email, role, token_hash, expires_at
) values (
  '5a000000-0000-0000-0000-000000000001',
  '51000000-0000-0000-0000-000000000001',
  'additional-a@example.test',
  'owner',
  encode(extensions.digest('ravoge-owner-invitation-token-00000001', 'sha256'), 'hex'),
  now() + interval '1 day'
);

do $$
begin
  begin
    insert into public.organization_invitations (
      organization_id, invited_by, email, role, token_hash, expires_at
    ) values (
      '5b000000-0000-0000-0000-000000000001',
      '51000000-0000-0000-0000-000000000001',
      'additional-a@example.test',
      'owner',
      encode(extensions.digest('ravoge-org-tamper-token-000000000001', 'sha256'), 'hex'),
      now() + interval '1 day'
    );
    raise exception 'Owner A created an invitation for Organization B';
  exception
    when insufficient_privilege or check_violation then null;
    when raise_exception then
      if sqlerrm = 'Owner A created an invitation for Organization B' then raise; end if;
  end;

  begin
    update public.organization_invitations
    set organization_id = '5b000000-0000-0000-0000-000000000001'
    where email = 'additional-a@example.test';
    raise exception 'Invitation organization tampering succeeded';
  exception
    when insufficient_privilege then null;
    when raise_exception then
      if sqlerrm = 'Invitation organization tampering succeeded' then raise; end if;
  end;

  begin
    update public.organization_invitations
    set role = 'coach'
    where email = 'additional-a@example.test';
    raise exception 'Invitation role tampering succeeded';
  exception
    when insufficient_privilege then null;
    when raise_exception then
      if sqlerrm = 'Invitation role tampering succeeded' then raise; end if;
  end;
end;
$$;

-- An unrelated authenticated email cannot consume the invitation.
reset role;
set local role authenticated;
select set_config('request.jwt.claim.sub', '51000000-0000-0000-0000-000000000005', true);
select set_config('request.jwt.claims', '{"sub":"51000000-0000-0000-0000-000000000005","email":"unrelated@example.test","role":"authenticated"}', true);
do $$
begin
  begin
    perform public.accept_organization_invitation('ravoge-owner-invitation-token-00000001');
    raise exception 'An unrelated email consumed an owner invitation';
  exception when raise_exception then
    if sqlerrm = 'An unrelated email consumed an owner invitation' then raise; end if;
  end;
end;
$$;

-- The already-existing Auth identity accepts the invite and becomes a second
-- owner without creating another auth.users row.
reset role;
set local role authenticated;
select set_config('request.jwt.claim.sub', '51000000-0000-0000-0000-000000000002', true);
select set_config('request.jwt.claims', '{"sub":"51000000-0000-0000-0000-000000000002","email":"additional-a@example.test","role":"authenticated"}', true);
do $$
begin
  if public.accept_organization_invitation('ravoge-owner-invitation-token-00000001') <> 'owner' then
    raise exception 'Owner invitation returned the wrong database-controlled role';
  end if;

  if not exists (
    select 1 from public.organization_memberships
    where organization_id = '5a000000-0000-0000-0000-000000000001'
      and user_id = '51000000-0000-0000-0000-000000000002'
      and role = 'owner'
      and status = 'active'
      and not is_primary_owner
  ) then
    raise exception 'Owner B did not receive the intended shared organization access';
  end if;

  if (select count(*) from public.organizations) <> 1 then
    raise exception 'Owner B can read outside the shared organization';
  end if;
end;
$$;

reset role;
do $$
begin
  if (select count(*) from auth.users where email = 'additional-a@example.test') <> 1 then
    raise exception 'Invite acceptance duplicated the existing Auth identity';
  end if;
end;
$$;

-- Both owner identities independently resolve the same organization.
set local role authenticated;
select set_config('request.jwt.claim.sub', '51000000-0000-0000-0000-000000000001', true);
select set_config('request.jwt.claims', '{"sub":"51000000-0000-0000-0000-000000000001","email":"primary-a@example.test","role":"authenticated"}', true);
do $$ begin
  if not exists (select 1 from public.organizations where id = '5a000000-0000-0000-0000-000000000001') then
    raise exception 'Owner A lost Organization A access';
  end if;
end; $$;

reset role;
set local role authenticated;
select set_config('request.jwt.claim.sub', '51000000-0000-0000-0000-000000000002', true);
select set_config('request.jwt.claims', '{"sub":"51000000-0000-0000-0000-000000000002","email":"additional-a@example.test","role":"authenticated"}', true);
do $$ begin
  if not exists (select 1 from public.organizations where id = '5a000000-0000-0000-0000-000000000001') then
    raise exception 'Owner B lost Organization A access';
  end if;
  if exists (select 1 from public.organizations where id = '5b000000-0000-0000-0000-000000000001') then
    raise exception 'Owner B can read Organization B';
  end if;

  update public.organizations
  set name = 'Tampered Organization B'
  where id = '5b000000-0000-0000-0000-000000000001';
  if found then
    raise exception 'Owner B changed Organization B';
  end if;
end; $$;

-- A coach cannot mint an owner invite or promote their own membership.
reset role;
set local role authenticated;
select set_config('request.jwt.claim.sub', '51000000-0000-0000-0000-000000000003', true);
select set_config('request.jwt.claims', '{"sub":"51000000-0000-0000-0000-000000000003","email":"coach-a-multi@example.test","role":"authenticated"}', true);
do $$
begin
  begin
    insert into public.organization_invitations (
      organization_id, invited_by, email, role, token_hash, expires_at
    ) values (
      '5a000000-0000-0000-0000-000000000001',
      '51000000-0000-0000-0000-000000000003',
      'unrelated@example.test',
      'owner',
      encode(extensions.digest('ravoge-coach-owner-token-000000000001', 'sha256'), 'hex'),
      now() + interval '1 day'
    );
    raise exception 'Coach created an owner invitation';
  exception
    when insufficient_privilege or check_violation then null;
    when raise_exception then
      if sqlerrm = 'Coach created an owner invitation' then raise; end if;
  end;

  begin
    update public.organization_memberships
    set role = 'owner'
    where user_id = '51000000-0000-0000-0000-000000000003';
    raise exception 'Coach promoted themselves to owner';
  exception
    when insufficient_privilege then null;
    when raise_exception then
      if sqlerrm = 'Coach promoted themselves to owner' then raise; end if;
  end;
end;
$$;

-- The primary owner cannot be deactivated or deleted, even while another owner
-- exists. An additional owner can be deactivated while the primary remains.
reset role;
set local role authenticated;
select set_config('request.jwt.claim.sub', '51000000-0000-0000-0000-000000000001', true);
select set_config('request.jwt.claims', '{"sub":"51000000-0000-0000-0000-000000000001","email":"primary-a@example.test","role":"authenticated"}', true);
do $$
begin
  begin
    update public.organization_memberships
    set status = 'inactive'
    where user_id = '51000000-0000-0000-0000-000000000001';
    raise exception 'Primary owner was deactivated without transfer';
  exception when raise_exception then
    if sqlerrm = 'Primary owner was deactivated without transfer' then raise; end if;
  end;
end;
$$;

update public.organization_memberships
set status = 'inactive'
where user_id = '51000000-0000-0000-0000-000000000002';

reset role;
do $$
begin
  begin
    delete from public.organization_memberships
    where user_id = '51000000-0000-0000-0000-000000000001';
    raise exception 'Primary owner was deleted without transfer';
  exception when raise_exception then
    if sqlerrm = 'Primary owner was deleted without transfer' then raise; end if;
  end;
end;
$$;

rollback;
