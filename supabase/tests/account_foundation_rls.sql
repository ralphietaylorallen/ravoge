begin;

insert into auth.users (
  id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at
) values
  ('10000000-0000-0000-0000-000000000001', 'authenticated', 'authenticated', 'owner-a@example.test', crypt('TestPass123!', gen_salt('bf')), now(), '{"provider":"email","providers":["email"]}', '{"full_name":"Owner A"}', now(), now()),
  ('10000000-0000-0000-0000-000000000002', 'authenticated', 'authenticated', 'coach-a@example.test', crypt('TestPass123!', gen_salt('bf')), now(), '{"provider":"email","providers":["email"]}', '{"full_name":"Coach A"}', now(), now()),
  ('10000000-0000-0000-0000-000000000003', 'authenticated', 'authenticated', 'client-a@example.test', crypt('TestPass123!', gen_salt('bf')), now(), '{"provider":"email","providers":["email"]}', '{"full_name":"Client A"}', now(), now()),
  ('10000000-0000-0000-0000-000000000004', 'authenticated', 'authenticated', 'invitee-a@example.test', crypt('TestPass123!', gen_salt('bf')), now(), '{"provider":"email","providers":["email"]}', '{"full_name":"Invitee A","signup_intent":"owner"}', now(), now()),
  ('10000000-0000-0000-0000-000000000005', 'authenticated', 'authenticated', 'new-owner@example.test', crypt('TestPass123!', gen_salt('bf')), now(), '{"provider":"email","providers":["email"]}', '{"full_name":"New Owner","signup_intent":"client"}', now(), now()),
  ('10000000-0000-0000-0000-000000000006', 'authenticated', 'authenticated', 'invited-coach@example.test', crypt('TestPass123!', gen_salt('bf')), now(), '{"provider":"email","providers":["email"]}', '{"full_name":"Invited Coach","signup_intent":"owner"}', now(), now()),
  ('10000000-0000-0000-0000-000000000007', 'authenticated', 'authenticated', 'recovery-owner@example.test', crypt('TestPass123!', gen_salt('bf')), now(), '{"provider":"email","providers":["email"]}', '{"full_name":"Recovery Owner"}', now(), now()),
  ('20000000-0000-0000-0000-000000000001', 'authenticated', 'authenticated', 'owner-b@example.test', crypt('TestPass123!', gen_salt('bf')), now(), '{"provider":"email","providers":["email"]}', '{"full_name":"Owner B"}', now(), now()),
  ('20000000-0000-0000-0000-000000000002', 'authenticated', 'authenticated', 'client-b@example.test', crypt('TestPass123!', gen_salt('bf')), now(), '{"provider":"email","providers":["email"]}', '{"full_name":"Client B"}', now(), now());

insert into public.organizations (id, name) values
  ('a0000000-0000-0000-0000-000000000001', 'Organization A'),
  ('b0000000-0000-0000-0000-000000000001', 'Organization B');

insert into public.organization_memberships (organization_id, user_id, role) values
  ('a0000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001', 'owner'),
  ('a0000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000002', 'coach'),
  ('a0000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000003', 'client'),
  ('b0000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000001', 'owner'),
  ('b0000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000002', 'client');

insert into public.coach_client_assignments (
  organization_id, coach_user_id, client_user_id
) values (
  'a0000000-0000-0000-0000-000000000001',
  '10000000-0000-0000-0000-000000000002',
  '10000000-0000-0000-0000-000000000003'
);

insert into public.organization_invitations (
  organization_id, invited_by, email, role, token_hash, expires_at
) values (
  'a0000000-0000-0000-0000-000000000001',
  '10000000-0000-0000-0000-000000000002',
  'pending-client@example.test',
  'client',
  encode(extensions.digest('ravoge-coach-test-invitation-token-00001', 'sha256'), 'hex'),
  now() + interval '1 day'
);

-- Owner A sees only Organization A and can manage its member status.
set local role authenticated;
select set_config('request.jwt.claim.sub', '10000000-0000-0000-0000-000000000001', true);
select set_config('request.jwt.claims', '{"sub":"10000000-0000-0000-0000-000000000001","email":"owner-a@example.test","role":"authenticated"}', true);
do $$ begin
  if (select count(*) from public.organizations) <> 1 then
    raise exception 'Owner A organization isolation failed';
  end if;
  if exists (select 1 from public.organizations where id = 'b0000000-0000-0000-0000-000000000001') then
    raise exception 'Owner A can read Organization B';
  end if;
  if (select count(*) from public.organization_memberships where organization_id = 'a0000000-0000-0000-0000-000000000001') <> 3 then
    raise exception 'Owner A cannot read intended members';
  end if;
end $$;
update public.organization_memberships
set status = 'inactive'
where organization_id = 'a0000000-0000-0000-0000-000000000001'
  and user_id = '10000000-0000-0000-0000-000000000003';

reset role;
update public.organization_memberships
set status = 'active'
where organization_id = 'a0000000-0000-0000-0000-000000000001'
  and user_id = '10000000-0000-0000-0000-000000000003';

-- Coach sees the assigned client, not Organization B's unassigned client.
set local role authenticated;
select set_config('request.jwt.claim.sub', '10000000-0000-0000-0000-000000000002', true);
select set_config('request.jwt.claims', '{"sub":"10000000-0000-0000-0000-000000000002","email":"coach-a@example.test","role":"authenticated"}', true);
do $$ begin
  if not exists (select 1 from public.profiles where id = '10000000-0000-0000-0000-000000000003') then
    raise exception 'Coach cannot read assigned client';
  end if;
  if exists (select 1 from public.profiles where id = '20000000-0000-0000-0000-000000000002') then
    raise exception 'Coach can read unassigned client';
  end if;
  if exists (select 1 from public.organizations where id = 'b0000000-0000-0000-0000-000000000001') then
    raise exception 'Coach can read another organization';
  end if;
  if (select count(*) from public.organization_invitations) <> 1 then
    raise exception 'Coach cannot read their own invitation';
  end if;
end $$;
select public.revoke_organization_invitation(id)
from public.organization_invitations
where email = 'pending-client@example.test';
do $$ begin
  begin
    update public.organization_invitations set revoked_at = null;
    raise exception 'Coach restored a revoked invitation';
  exception
    when insufficient_privilege or check_violation then
      null;
    when raise_exception then
      if sqlerrm = 'Coach restored a revoked invitation' then
        raise;
      end if;
  end;
end $$;

-- Client sees self and assigned coach, never another client, and cannot promote itself.
reset role;
set local role authenticated;
select set_config('request.jwt.claim.sub', '10000000-0000-0000-0000-000000000003', true);
select set_config('request.jwt.claims', '{"sub":"10000000-0000-0000-0000-000000000003","email":"client-a@example.test","role":"authenticated","user_metadata":{"role":"owner"}}', true);
do $$ begin
  if not exists (select 1 from public.profiles where id = '10000000-0000-0000-0000-000000000003') then
    raise exception 'Client cannot read own profile';
  end if;
  if not exists (select 1 from public.profiles where id = '10000000-0000-0000-0000-000000000002') then
    raise exception 'Client cannot read assigned coach';
  end if;
  if exists (select 1 from public.profiles where id = '20000000-0000-0000-0000-000000000002') then
    raise exception 'Client can read another client';
  end if;
  if exists (select 1 from public.organizations where id = 'b0000000-0000-0000-0000-000000000001') then
    raise exception 'Browser role tampering granted cross-organization access';
  end if;
  begin
    update public.organization_memberships
    set role = 'owner'
    where user_id = '10000000-0000-0000-0000-000000000003';
    raise exception 'Client changed its own role';
  exception when insufficient_privilege then
    null;
  end;
  begin
    insert into public.coach_client_assignments (
      organization_id, coach_user_id, client_user_id
    ) values (
      'a0000000-0000-0000-0000-000000000001',
      '10000000-0000-0000-0000-000000000002',
      '20000000-0000-0000-0000-000000000002'
    );
    raise exception 'Client created a cross-organization assignment';
  exception
    when insufficient_privilege or foreign_key_violation then
      null;
    when raise_exception then
      if sqlerrm = 'Client created a cross-organization assignment' then
        raise;
      end if;
  end;
end $$;

-- Owner organization provisioning requires durable server-controlled intent.
-- Browser metadata cannot create a request or choose a different identity.
reset role;
set local role anon;
select set_config('request.jwt.claims', '{"role":"anon"}', true);
select public.begin_owner_signup(
  'new-owner@example.test',
  'New Owner Gym',
  'ravoge-owner-signup-token-000000000001'
);

reset role;
set local role authenticated;
select set_config('request.jwt.claim.sub', '10000000-0000-0000-0000-000000000005', true);
select set_config('request.jwt.claims', '{"sub":"10000000-0000-0000-0000-000000000005","email":"new-owner@example.test","role":"authenticated","user_metadata":{"signup_intent":"client"}}', true);
do $$ begin
  begin
    insert into public.organization_creation_requests (requested_by, organization_name)
    values ('10000000-0000-0000-0000-000000000001', 'Tampered Gym');
    raise exception 'Organization request identity tampering succeeded';
  exception
    when insufficient_privilege or check_violation then
      null;
    when raise_exception then
      if sqlerrm = 'Organization request identity tampering succeeded' then
        raise;
      end if;
  end;

  begin
    insert into public.organization_creation_requests (requested_by, organization_name)
    values ('10000000-0000-0000-0000-000000000005', 'Direct Bypass Gym');
    raise exception 'Direct organization provisioning bypass succeeded';
  exception
    when insufficient_privilege then
      null;
    when raise_exception then
      if sqlerrm = 'Direct organization provisioning bypass succeeded' then
        raise;
      end if;
  end;
end $$;

do $$ begin
  begin
    perform public.complete_owner_signup('ravoge-wrong-owner-signup-token-0000001');
    raise exception 'An invalid Owner signup token was accepted';
  exception when raise_exception then
    if sqlerrm = 'An invalid Owner signup token was accepted' then
      raise;
    end if;
  end;
end $$;

select public.complete_owner_signup(
  'ravoge-owner-signup-token-000000000001'
);

do $$ begin
  if not exists (
    select 1
    from public.organization_memberships membership
    join public.organizations organization on organization.id = membership.organization_id
    where membership.user_id = '10000000-0000-0000-0000-000000000005'
      and membership.role = 'owner'
      and membership.status = 'active'
      and membership.is_primary_owner
      and organization.name = 'New Owner Gym'
  ) then
    raise exception 'Owner organization provisioning failed';
  end if;

  if (select count(*) from public.organizations where name = 'New Owner Gym') <> 1 then
    raise exception 'Owner provisioning created a duplicate gym';
  end if;
end $$;

-- A pending Coach invitation is authoritative; even an `owner` metadata value
-- cannot turn that invited identity into a first Owner.
reset role;
insert into public.organization_invitations (
  organization_id, invited_by, email, role, token_hash, expires_at
) values (
  'a0000000-0000-0000-0000-000000000001',
  '10000000-0000-0000-0000-000000000001',
  'invited-coach@example.test',
  'coach',
  encode(extensions.digest('ravoge-invited-coach-token-0000000001', 'sha256'), 'hex'),
  now() + interval '1 day'
);
set local role anon;
select set_config('request.jwt.claims', '{"role":"anon"}', true);
do $$ begin
  begin
    perform public.begin_owner_signup(
      'invited-coach@example.test',
      'Promotion Attempt Gym',
      'ravoge-owner-promotion-token-000000001'
    );
    raise exception 'Invited Coach created an Owner signup intent';
  exception when raise_exception then
    if sqlerrm = 'Invited Coach created an Owner signup intent' then
      raise;
    end if;
  end;
end $$;
reset role;
delete from public.organization_invitations
where email = 'invited-coach@example.test';

-- A confirmed Owner can recover an interrupted signup without the original
-- browser token, but only by confirming the exact server-stored gym name.
set local role anon;
select set_config('request.jwt.claims', '{"role":"anon"}', true);
select public.begin_owner_signup(
  'recovery-owner@example.test',
  'Recovery Gym',
  'ravoge-recovery-owner-token-00000000001'
);
reset role;
set local role authenticated;
select set_config('request.jwt.claim.sub', '10000000-0000-0000-0000-000000000007', true);
select set_config('request.jwt.claims', '{"sub":"10000000-0000-0000-0000-000000000007","email":"recovery-owner@example.test","role":"authenticated"}', true);
do $$ begin
  if not public.has_pending_owner_signup() then
    raise exception 'Interrupted Owner signup was not recoverable';
  end if;

  begin
    perform public.complete_owner_signup(null, 'Wrong Gym');
    raise exception 'Wrong gym confirmation completed Owner recovery';
  exception when raise_exception then
    if sqlerrm = 'Wrong gym confirmation completed Owner recovery' then
      raise;
    end if;
  end;
end $$;
select public.complete_owner_signup(null, 'Recovery Gym');
do $$ begin
  if public.has_pending_owner_signup() then
    raise exception 'Consumed Owner recovery remains pending';
  end if;
  if not exists (
    select 1
    from public.organization_memberships membership
    join public.organizations organization on organization.id = membership.organization_id
    where membership.user_id = '10000000-0000-0000-0000-000000000007'
      and membership.role = 'owner'
      and membership.status = 'active'
      and membership.is_primary_owner
      and organization.name = 'Recovery Gym'
  ) then
    raise exception 'Interrupted Owner recovery did not provision the gym';
  end if;
end $$;

-- Inactive memberships lose organization and assignment access immediately.
reset role;
update public.organization_memberships
set status = 'inactive'
where user_id = '10000000-0000-0000-0000-000000000002';
set local role authenticated;
select set_config('request.jwt.claim.sub', '10000000-0000-0000-0000-000000000002', true);
select set_config('request.jwt.claims', '{"sub":"10000000-0000-0000-0000-000000000002","email":"coach-a@example.test","role":"authenticated"}', true);
do $$ begin
  if exists (select 1 from public.organizations) then
    raise exception 'Inactive coach retained organization access';
  end if;
  if exists (select 1 from public.coach_client_assignments) then
    raise exception 'Inactive coach retained assignment access';
  end if;
  if exists (
    select 1 from public.profiles
    where id = '10000000-0000-0000-0000-000000000003'
  ) then
    raise exception 'Inactive coach retained client profile access';
  end if;
  if exists (select 1 from public.organization_memberships) then
    raise exception 'Inactive coach retained membership access';
  end if;
  if exists (select 1 from public.organization_invitations) then
    raise exception 'Inactive coach retained invitation access';
  end if;
end $$;

-- Invitation acceptance requires the exact token and derives organization/role
-- from the locked server-side invitation, never browser intent.
reset role;
insert into public.organization_invitations (
  organization_id, invited_by, email, role, token_hash, expires_at
) values (
  'a0000000-0000-0000-0000-000000000001',
  '10000000-0000-0000-0000-000000000001',
  'invitee-a@example.test',
  'client',
  encode(extensions.digest('ravoge-valid-test-invitation-token-0001', 'sha256'), 'hex'),
  now() + interval '1 day'
);
set local role authenticated;
select set_config('request.jwt.claim.sub', '10000000-0000-0000-0000-000000000004', true);
select set_config('request.jwt.claims', '{"sub":"10000000-0000-0000-0000-000000000004","email":"invitee-a@example.test","role":"authenticated","user_metadata":{"signup_intent":"owner"}}', true);
do $$ begin
  begin
    perform public.accept_organization_invitation('ravoge-invalid-test-invitation-token-001');
    raise exception 'A tampered invitation token was accepted';
  exception when raise_exception then
    if sqlerrm = 'A tampered invitation token was accepted' then
      raise;
    end if;
  end;

  if exists (
    select 1 from public.organization_memberships
    where user_id = '10000000-0000-0000-0000-000000000004'
  ) then
    raise exception 'A tampered invitation created a membership';
  end if;

  if public.accept_organization_invitation('ravoge-valid-test-invitation-token-0001') <> 'client' then
    raise exception 'Invitation did not return its server-controlled role';
  end if;

  if not exists (
    select 1 from public.organization_memberships
    where user_id = '10000000-0000-0000-0000-000000000004'
      and organization_id = 'a0000000-0000-0000-0000-000000000001'
      and role = 'client'
      and status = 'active'
  ) then
    raise exception 'Valid invitation did not create the intended membership';
  end if;
end $$;

rollback;
