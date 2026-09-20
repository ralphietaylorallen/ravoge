begin;

insert into auth.users (
  id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at
) values
  ('71000000-0000-0000-0000-000000000001', 'authenticated', 'authenticated', 'oversight-owner-a@example.test', crypt('TestPass123!', gen_salt('bf')), now(), '{"provider":"email","providers":["email"]}', '{"full_name":"Oversight Owner A"}', now(), now()),
  ('71000000-0000-0000-0000-000000000002', 'authenticated', 'authenticated', 'oversight-coach-a1@example.test', crypt('TestPass123!', gen_salt('bf')), now(), '{"provider":"email","providers":["email"]}', '{"full_name":"Oversight Coach A1"}', now(), now()),
  ('71000000-0000-0000-0000-000000000003', 'authenticated', 'authenticated', 'oversight-coach-a2@example.test', crypt('TestPass123!', gen_salt('bf')), now(), '{"provider":"email","providers":["email"]}', '{"full_name":"Oversight Coach A2"}', now(), now()),
  ('71000000-0000-0000-0000-000000000004', 'authenticated', 'authenticated', 'oversight-client-a@example.test', crypt('TestPass123!', gen_salt('bf')), now(), '{"provider":"email","providers":["email"]}', '{"full_name":"Oversight Client A"}', now(), now()),
  ('72000000-0000-0000-0000-000000000001', 'authenticated', 'authenticated', 'oversight-owner-b@example.test', crypt('TestPass123!', gen_salt('bf')), now(), '{"provider":"email","providers":["email"]}', '{"full_name":"Oversight Owner B"}', now(), now()),
  ('72000000-0000-0000-0000-000000000002', 'authenticated', 'authenticated', 'oversight-coach-b@example.test', crypt('TestPass123!', gen_salt('bf')), now(), '{"provider":"email","providers":["email"]}', '{"full_name":"Oversight Coach B"}', now(), now()),
  ('72000000-0000-0000-0000-000000000003', 'authenticated', 'authenticated', 'oversight-client-b@example.test', crypt('TestPass123!', gen_salt('bf')), now(), '{"provider":"email","providers":["email"]}', '{"full_name":"Oversight Client B"}', now(), now());

insert into public.organizations (id, name) values
  ('7a000000-0000-0000-0000-000000000001', 'Oversight Organization A'),
  ('7b000000-0000-0000-0000-000000000001', 'Oversight Organization B');

insert into public.organization_memberships (organization_id, user_id, role) values
  ('7a000000-0000-0000-0000-000000000001', '71000000-0000-0000-0000-000000000001', 'owner'),
  ('7a000000-0000-0000-0000-000000000001', '71000000-0000-0000-0000-000000000002', 'coach'),
  ('7a000000-0000-0000-0000-000000000001', '71000000-0000-0000-0000-000000000003', 'coach'),
  ('7a000000-0000-0000-0000-000000000001', '71000000-0000-0000-0000-000000000004', 'client'),
  ('7b000000-0000-0000-0000-000000000001', '72000000-0000-0000-0000-000000000001', 'owner'),
  ('7b000000-0000-0000-0000-000000000001', '72000000-0000-0000-0000-000000000002', 'coach'),
  ('7b000000-0000-0000-0000-000000000001', '72000000-0000-0000-0000-000000000003', 'client');

insert into public.coach_client_assignments (organization_id, coach_user_id, client_user_id) values
  ('7a000000-0000-0000-0000-000000000001', '71000000-0000-0000-0000-000000000002', '71000000-0000-0000-0000-000000000004'),
  ('7b000000-0000-0000-0000-000000000001', '72000000-0000-0000-0000-000000000002', '72000000-0000-0000-0000-000000000003');

set local role authenticated;
select set_config('request.jwt.claim.sub', '71000000-0000-0000-0000-000000000001', true);
select set_config('request.jwt.claims', '{"sub":"71000000-0000-0000-0000-000000000001","email":"oversight-owner-a@example.test","role":"authenticated"}', true);

do $$
begin
  if (select count(*) from public.organization_memberships where role = 'coach') <> 2 then
    raise exception 'Owner A cannot see every same-organization coach';
  end if;
  if (select count(*) from public.organization_memberships where role = 'client') <> 1 then
    raise exception 'Owner A cannot see every same-organization client';
  end if;
  if exists (select 1 from public.profiles where id in ('72000000-0000-0000-0000-000000000002', '72000000-0000-0000-0000-000000000003')) then
    raise exception 'Owner A can read Organization B coach or client profiles';
  end if;
end;
$$;

select public.assign_client_to_coach(
  '71000000-0000-0000-0000-000000000004',
  '71000000-0000-0000-0000-000000000003'
);

do $$
begin
  if (select count(*) from public.coach_client_assignments where client_user_id = '71000000-0000-0000-0000-000000000004' and status = 'active') <> 1 then
    raise exception 'Owner reassignment did not preserve one active primary coach';
  end if;
  if not exists (
    select 1 from public.coach_client_assignments
    where client_user_id = '71000000-0000-0000-0000-000000000004'
      and coach_user_id = '71000000-0000-0000-0000-000000000003'
      and status = 'active'
  ) then
    raise exception 'Owner could not assign the intended same-organization coach';
  end if;
  if (select count(*) from public.coach_client_assignment_audit where actor_user_id = '71000000-0000-0000-0000-000000000001') <> 2 then
    raise exception 'Assignment changes were not attributed to the real Owner identity';
  end if;
  if exists (select 1 from public.coach_client_assignment_audit where actor_user_id = '71000000-0000-0000-0000-000000000003') then
    raise exception 'Owner action was incorrectly attributed to the selected coach';
  end if;
end;
$$;

do $$
begin
  begin
    perform public.assign_client_to_coach(
      '72000000-0000-0000-0000-000000000003',
      '72000000-0000-0000-0000-000000000002'
    );
    raise exception 'Owner A assigned an Organization B client';
  exception when raise_exception then
    if sqlerrm = 'Owner A assigned an Organization B client' then raise; end if;
  end;
end;
$$;

reset role;
set local role authenticated;
select set_config('request.jwt.claim.sub', '72000000-0000-0000-0000-000000000001', true);
select set_config('request.jwt.claims', '{"sub":"72000000-0000-0000-0000-000000000001","email":"oversight-owner-b@example.test","role":"authenticated"}', true);
do $$
begin
  if exists (select 1 from public.coach_client_assignments where organization_id = '7a000000-0000-0000-0000-000000000001') then
    raise exception 'Owner B can read Organization A assignments';
  end if;
  if exists (select 1 from public.coach_client_assignment_audit where organization_id = '7a000000-0000-0000-0000-000000000001') then
    raise exception 'Owner B can read Organization A audit events';
  end if;
end;
$$;

reset role;
set local role authenticated;
select set_config('request.jwt.claim.sub', '71000000-0000-0000-0000-000000000002', true);
select set_config('request.jwt.claims', '{"sub":"71000000-0000-0000-0000-000000000002","email":"oversight-coach-a1@example.test","role":"authenticated"}', true);
do $$
begin
  if exists (select 1 from public.coach_client_assignment_audit) then
    raise exception 'Coach gained Owner audit visibility';
  end if;
  begin
    perform public.assign_client_to_coach(
      '71000000-0000-0000-0000-000000000004',
      '71000000-0000-0000-0000-000000000002'
    );
    raise exception 'Coach used the Owner assignment operation';
  exception when raise_exception then
    if sqlerrm = 'Coach used the Owner assignment operation' then raise; end if;
  end;
end;
$$;

reset role;
set local role authenticated;
select set_config('request.jwt.claim.sub', '71000000-0000-0000-0000-000000000004', true);
select set_config('request.jwt.claims', '{"sub":"71000000-0000-0000-0000-000000000004","email":"oversight-client-a@example.test","role":"authenticated"}', true);
do $$
begin
  if exists (select 1 from public.coach_client_assignment_audit) then
    raise exception 'Client gained Owner audit visibility';
  end if;
  begin
    perform public.assign_client_to_coach(
      '71000000-0000-0000-0000-000000000004',
      '71000000-0000-0000-0000-000000000002'
    );
    raise exception 'Client used the Owner assignment operation';
  exception when raise_exception then
    if sqlerrm = 'Client used the Owner assignment operation' then raise; end if;
  end;
end;
$$;

rollback;
