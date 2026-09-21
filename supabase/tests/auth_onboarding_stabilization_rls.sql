begin;

insert into auth.users (
  id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at
) values
  ('71000000-0000-0000-0000-000000000001', 'authenticated', 'authenticated', 'stability-owner@example.test', crypt('TestPass123!', gen_salt('bf')), now(), '{"provider":"email","providers":["email"]}', '{"full_name":"Stability Owner"}', now(), now()),
  ('71000000-0000-0000-0000-000000000002', 'authenticated', 'authenticated', 'unaffiliated-coach@example.test', crypt('TestPass123!', gen_salt('bf')), now(), '{"provider":"email","providers":["email"]}', '{"full_name":"Unaffiliated Coach","signup_intent":"owner"}', now(), now()),
  ('71000000-0000-0000-0000-000000000003', 'authenticated', 'authenticated', 'unaffiliated-client@example.test', crypt('TestPass123!', gen_salt('bf')), now(), '{"provider":"email","providers":["email"]}', '{"full_name":"Unaffiliated Client"}', now(), now()),
  ('71000000-0000-0000-0000-000000000004', 'authenticated', 'authenticated', 'wrong-email@example.test', crypt('TestPass123!', gen_salt('bf')), now(), '{"provider":"email","providers":["email"]}', '{"full_name":"Wrong Email"}', now(), now());

insert into public.organizations (id, name)
values ('7a000000-0000-0000-0000-000000000001', 'Stability Gym');
insert into public.organization_memberships (organization_id, user_id, role)
values ('7a000000-0000-0000-0000-000000000001', '71000000-0000-0000-0000-000000000001', 'owner');

-- User-editable metadata grants nothing. The authenticated account explicitly
-- records a non-authorizing Coach identity and can maintain only its own base profile.
set local role authenticated;
select set_config('request.jwt.claim.sub', '71000000-0000-0000-0000-000000000002', true);
select set_config('request.jwt.claims', '{"sub":"71000000-0000-0000-0000-000000000002","email":"unaffiliated-coach@example.test","role":"authenticated","user_metadata":{"signup_intent":"owner"}}', true);
select public.register_unaffiliated_account_type('coach');
select public.update_own_profile('{"fullName":"Ready Coach","preferredName":"Coach","bio":"Ready for a gym invite","specialties":["Strength"],"yearsCoaching":4}'::jsonb);

do $$
begin
  if (select account_type from public.profiles where id = '71000000-0000-0000-0000-000000000002') <> 'coach' then
    raise exception 'Unaffiliated Coach identity was not registered';
  end if;
  if exists (select 1 from public.organization_memberships where user_id = '71000000-0000-0000-0000-000000000002') then
    raise exception 'Identity setup created a fake organization membership';
  end if;
  if private.can_write_profile_asset('00000000-0000-0000-0000-000000000000/71000000-0000-0000-0000-000000000003/avatar.jpg') then
    raise exception 'Coach can write another identity profile image';
  end if;
  if not private.can_write_profile_asset('00000000-0000-0000-0000-000000000000/71000000-0000-0000-0000-000000000002/avatar.jpg') then
    raise exception 'Coach cannot write own unaffiliated profile image';
  end if;
  begin
    perform public.register_unaffiliated_account_type('owner');
    raise exception 'Unverified identity self-promoted to Owner';
  exception when raise_exception then
    if sqlerrm = 'Unverified identity self-promoted to Owner' then raise; end if;
  end;
end;
$$;

reset role;
set local role authenticated;
select set_config('request.jwt.claim.sub', '71000000-0000-0000-0000-000000000003', true);
select set_config('request.jwt.claims', '{"sub":"71000000-0000-0000-0000-000000000003","email":"unaffiliated-client@example.test","role":"authenticated"}', true);
select public.register_unaffiliated_account_type('client');
select public.update_own_profile('{"fullName":"Ready Client","preferredName":"Client","bio":"Ready to join"}'::jsonb);

do $$
begin
  begin
    perform public.update_own_profile('{"specialties":["Tampered"]}'::jsonb);
    raise exception 'Client changed Coach-only profile fields';
  exception when raise_exception then
    if sqlerrm = 'Client changed Coach-only profile fields' then raise; end if;
  end;
end;
$$;

-- Owner invitation creation derives organization and inviter from the session.
reset role;
set local role authenticated;
select set_config('request.jwt.claim.sub', '71000000-0000-0000-0000-000000000001', true);
select set_config('request.jwt.claims', '{"sub":"71000000-0000-0000-0000-000000000001","email":"stability-owner@example.test","role":"authenticated"}', true);
select * from public.create_organization_invitation(
  'unaffiliated-client@example.test',
  'client',
  encode(extensions.digest('ravoge-stability-client-token-000000001', 'sha256'), 'hex'),
  now() + interval '1 day'
);
select * from public.create_organization_invitation(
  'unaffiliated-client@example.test',
  'client',
  encode(extensions.digest('ravoge-stability-client-token-000000002', 'sha256'), 'hex'),
  now() + interval '1 day'
);

do $$
begin
  if (select count(*) from public.organization_invitations where organization_id = '7a000000-0000-0000-0000-000000000001' and email = 'unaffiliated-client@example.test' and role = 'client' and accepted_at is null and revoked_at is null) <> 1 then
    raise exception 'Duplicate active invitations were not prevented';
  end if;
  begin
    insert into public.organization_invitations (
      organization_id, invited_by, email, role, token_hash, expires_at
    ) values (
      '7a000000-0000-0000-0000-000000000001',
      '71000000-0000-0000-0000-000000000001',
      'wrong-email@example.test',
      'owner',
      encode(extensions.digest('ravoge-direct-tamper-token-00000000001', 'sha256'), 'hex'),
      now() + interval '1 day'
    );
    raise exception 'Browser directly created a role-tampered invitation';
  exception when insufficient_privilege then null;
    when raise_exception then
      if sqlerrm = 'Browser directly created a role-tampered invitation' then raise; end if;
  end;
end;
$$;

-- Wrong email cannot accept; exact email accepts and receives only the stored role/org.
reset role;
set local role authenticated;
select set_config('request.jwt.claim.sub', '71000000-0000-0000-0000-000000000004', true);
select set_config('request.jwt.claims', '{"sub":"71000000-0000-0000-0000-000000000004","email":"wrong-email@example.test","role":"authenticated"}', true);
do $$ begin
  begin
    perform public.accept_organization_invitation('ravoge-stability-client-token-000000002');
    raise exception 'Wrong email accepted the invitation';
  exception when raise_exception then
    if sqlerrm = 'Wrong email accepted the invitation' then raise; end if;
  end;
end $$;

reset role;
set local role authenticated;
select set_config('request.jwt.claim.sub', '71000000-0000-0000-0000-000000000003', true);
select set_config('request.jwt.claims', '{"sub":"71000000-0000-0000-0000-000000000003","email":"unaffiliated-client@example.test","role":"authenticated"}', true);
select public.accept_organization_invitation('ravoge-stability-client-token-000000002');

do $$ begin
  if not exists (
    select 1 from public.organization_memberships
    where organization_id = '7a000000-0000-0000-0000-000000000001'
      and user_id = '71000000-0000-0000-0000-000000000003'
      and role = 'client' and status = 'active'
  ) then raise exception 'Exact invited Client did not receive the intended membership'; end if;
  if public.accept_organization_invitation('ravoge-stability-client-token-000000002') <> 'client' then
    raise exception 'Invitation acceptance was not idempotent';
  end if;
end $$;

rollback;
