begin;

insert into auth.users (id,aud,role,email,encrypted_password,email_confirmed_at,raw_app_meta_data,raw_user_meta_data,created_at,updated_at) values
('a1000000-0000-0000-0000-000000000001','authenticated','authenticated','hardening-owner-a@example.test',crypt('TestPass123!',gen_salt('bf')),now(),'{}','{"full_name":"Hardening Owner A"}',now(),now()),
('a1000000-0000-0000-0000-000000000002','authenticated','authenticated','hardening-client@example.test',crypt('TestPass123!',gen_salt('bf')),now(),'{}','{"full_name":"Hardening Client"}',now(),now()),
('b1000000-0000-0000-0000-000000000001','authenticated','authenticated','hardening-owner-b@example.test',crypt('TestPass123!',gen_salt('bf')),now(),'{}','{"full_name":"Hardening Owner B"}',now(),now());

insert into public.organizations (id,name,timezone) values
('aa000000-0000-0000-0000-000000000001','Hardening Gym A','UTC'),
('bb000000-0000-0000-0000-000000000001','Hardening Gym B','UTC');
insert into public.organization_memberships (organization_id,user_id,role) values
('aa000000-0000-0000-0000-000000000001','a1000000-0000-0000-0000-000000000001','owner'),
('bb000000-0000-0000-0000-000000000001','b1000000-0000-0000-0000-000000000001','owner');

set local role authenticated;
select set_config('request.jwt.claim.sub','a1000000-0000-0000-0000-000000000001',true);
select * from public.create_organization_invitation(
  'hardening-client@example.test',
  'client',
  encode(extensions.digest('ravoge-hardening-client-token-00000001','sha256'),'hex'),
  now() + interval '1 day'
);

reset role;
set local role anon;
do $$
declare context_record record;
begin
  select * into context_record
  from public.get_organization_invitation_handoff('ravoge-hardening-client-token-00000001');
  if context_record.email <> 'hardening-client@example.test'
    or context_record.role <> 'client'
    or context_record.organization_name <> 'Hardening Gym A'
    or not context_record.account_exists then
    raise exception 'Valid opaque handoff did not resolve the expected server context';
  end if;
  if exists (select 1 from public.get_organization_invitation_handoff('malformed')) then
    raise exception 'Malformed handoff token resolved';
  end if;
end;
$$;

reset role;
set local role authenticated;
select set_config('request.jwt.claim.sub','b1000000-0000-0000-0000-000000000001',true);
do $$ begin
  begin
    perform public.revoke_organization_invitation((select id from public.organization_invitations where email='hardening-client@example.test'));
    raise exception 'Cross-organization Owner revoked an invitation';
  exception when raise_exception then
    if sqlerrm = 'Cross-organization Owner revoked an invitation' then raise; end if;
  end;
end $$;

reset role;
set local role authenticated;
select set_config('request.jwt.claim.sub','a1000000-0000-0000-0000-000000000001',true);
select public.save_organization_schedule_settings(
  'America/Denver', '100 Test Way',
  '[{"day_of_week":0,"is_closed":true,"opens_at":null,"closes_at":null},{"day_of_week":1,"is_closed":false,"opens_at":"08:00","closes_at":"18:00"},{"day_of_week":2,"is_closed":false,"opens_at":"08:00","closes_at":"18:00"},{"day_of_week":3,"is_closed":false,"opens_at":"08:00","closes_at":"18:00"},{"day_of_week":4,"is_closed":false,"opens_at":"08:00","closes_at":"18:00"},{"day_of_week":5,"is_closed":false,"opens_at":"08:00","closes_at":"18:00"},{"day_of_week":6,"is_closed":true,"opens_at":null,"closes_at":null}]'::jsonb,
  60::smallint, array[30,60]::smallint[], 15::smallint, 120, 60::smallint, 720, 0::smallint, 0::smallint
);
do $$ begin
  if (select timezone from public.organizations where id='aa000000-0000-0000-0000-000000000001') <> 'America/Denver'
    or (select count(*) from public.organization_hours where organization_id='aa000000-0000-0000-0000-000000000001') <> 7 then
    raise exception 'Atomic schedule save did not commit all records';
  end if;
  begin
    perform public.save_organization_schedule_settings(
      'UTC', 'Changed but must roll back',
      '[{"day_of_week":0,"is_closed":false,"opens_at":"19:00","closes_at":"08:00"}]'::jsonb,
      60::smallint, array[60]::smallint[], 15::smallint, 120, 60::smallint, 720, 0::smallint, 0::smallint
    );
    raise exception 'Invalid partial schedule save succeeded';
  exception when raise_exception then
    if sqlerrm = 'Invalid partial schedule save succeeded' then raise; end if;
  end;
  if (select timezone from public.organizations where id='aa000000-0000-0000-0000-000000000001') <> 'America/Denver'
    or (select address from public.organizations where id='aa000000-0000-0000-0000-000000000001') <> '100 Test Way' then
    raise exception 'Invalid schedule save partially changed the organization';
  end if;
end $$;

reset role;
set local role authenticated;
select set_config('request.jwt.claim.sub','b1000000-0000-0000-0000-000000000001',true);
select public.save_organization_schedule_settings(
  'America/New_York', null,
  (select jsonb_agg(jsonb_build_object('day_of_week', day, 'is_closed', true, 'opens_at', null, 'closes_at', null) order by day) from generate_series(0,6) day),
  60::smallint, array[60]::smallint[], 15::smallint, 120, 60::smallint, 720, 0::smallint, 0::smallint
);
do $$ begin
  if (select timezone from public.organizations where id='bb000000-0000-0000-0000-000000000001') <> 'America/New_York' then
    raise exception 'Owner could not save their own organization schedule';
  end if;
  if (select timezone from public.organizations where id='aa000000-0000-0000-0000-000000000001') <> 'America/Denver' then
    raise exception 'Owner schedule save crossed organizations';
  end if;
end $$;

reset role;
set local role authenticated;
select set_config('request.jwt.claim.sub','a1000000-0000-0000-0000-000000000001',true);
select public.revoke_organization_invitation((select id from public.organization_invitations where email='hardening-client@example.test'));
reset role;
set local role anon;
do $$ begin
  if exists (select 1 from public.get_organization_invitation_handoff('ravoge-hardening-client-token-00000001')) then
    raise exception 'Revoked invitation still resolves';
  end if;
end $$;

rollback;
