begin;

insert into auth.users (
  id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at
) values
  ('e1000000-0000-4000-8000-000000000001', 'authenticated', 'authenticated', 'scan-owner-a@example.test', crypt('TestPass123!', gen_salt('bf')), now(), '{}', '{"full_name":"Scan Owner A"}', now(), now()),
  ('e1000000-0000-4000-8000-000000000002', 'authenticated', 'authenticated', 'scan-coach-a@example.test', crypt('TestPass123!', gen_salt('bf')), now(), '{}', '{"full_name":"Scan Coach A"}', now(), now()),
  ('e1000000-0000-4000-8000-000000000003', 'authenticated', 'authenticated', 'scan-client-a@example.test', crypt('TestPass123!', gen_salt('bf')), now(), '{}', '{"full_name":"Scan Client A"}', now(), now()),
  ('e2000000-0000-4000-8000-000000000001', 'authenticated', 'authenticated', 'scan-owner-b@example.test', crypt('TestPass123!', gen_salt('bf')), now(), '{}', '{"full_name":"Scan Owner B"}', now(), now()),
  ('e2000000-0000-4000-8000-000000000002', 'authenticated', 'authenticated', 'scan-owner-b-inactive@example.test', crypt('TestPass123!', gen_salt('bf')), now(), '{}', '{"full_name":"Scan Inactive Owner B"}', now(), now());

insert into public.organizations (id, name) values
  ('e1000000-1000-4000-8000-000000000001', 'Scan Organization A'),
  ('e2000000-2000-4000-8000-000000000001', 'Scan Organization B');

insert into public.organization_memberships (organization_id, user_id, role) values
  ('e1000000-1000-4000-8000-000000000001', 'e1000000-0000-4000-8000-000000000001', 'owner'),
  ('e1000000-1000-4000-8000-000000000001', 'e1000000-0000-4000-8000-000000000002', 'coach'),
  ('e1000000-1000-4000-8000-000000000001', 'e1000000-0000-4000-8000-000000000003', 'client'),
  ('e2000000-2000-4000-8000-000000000001', 'e2000000-0000-4000-8000-000000000001', 'owner'),
  ('e2000000-2000-4000-8000-000000000001', 'e2000000-0000-4000-8000-000000000002', 'owner');

do $$ begin
  if not (select relrowsecurity from pg_catalog.pg_class where oid = 'public.equipment_scan_requests'::regclass) then
    raise exception 'Equipment scan audit table does not have RLS enabled';
  end if;
  if has_table_privilege('anon', 'public.equipment_scan_requests', 'select')
    or has_table_privilege('authenticated', 'public.equipment_scan_requests', 'insert,update,delete') then
    raise exception 'Equipment scan audit Data API grants are too broad';
  end if;
  if has_function_privilege('anon', 'public.reserve_equipment_scan(text,integer)', 'execute')
    or has_function_privilege('anon', 'public.complete_equipment_scan(uuid,text,integer,integer,text,integer,integer,text)', 'execute')
    or has_function_privilege('anon', 'public.save_equipment_scan_results(uuid,jsonb)', 'execute') then
    raise exception 'Anonymous users can execute equipment scan functions';
  end if;
  if position('FOR UPDATE' in upper(pg_get_functiondef('public.reserve_equipment_scan(text,integer)'::regprocedure))) = 0 then
    raise exception 'Equipment scan quota is not serialized for concurrent requests';
  end if;
end $$;

create temporary table scan_test_ids (kind text primary key, id uuid not null) on commit drop;
grant select, insert on scan_test_ids to authenticated;

reset role;
set local role authenticated;
select set_config('request.jwt.claim.sub', 'e1000000-0000-4000-8000-000000000001', true);

insert into scan_test_ids
select 'owner-a-first', scan_request_id
from public.reserve_equipment_scan('gpt-5.4-mini-2026-03-17', 2);

do $$
declare request_id uuid := (select id from scan_test_ids where kind = 'owner-a-first');
begin
  if request_id is null then raise exception 'Owner could not reserve an equipment scan'; end if;
  if (select count(*) from public.equipment_scan_requests) <> 1 then
    raise exception 'Owner cannot read their own scan request';
  end if;
  perform public.complete_equipment_scan(request_id, 'succeeded', 3, 1200, 'req_safe_test', 100, 50, null);
  if not exists (
    select 1 from public.equipment_scan_requests
    where id = request_id and status = 'succeeded' and candidate_count = 3
  ) then raise exception 'Scan completion metadata was not persisted'; end if;
end $$;

select public.save_equipment_scan_results(
  (select id from scan_test_ids where kind = 'owner-a-first'),
  '[
    {"action":"add","equipmentType":"squat_rack","name":"West wall squat racks","quantity":3,"notes":"Owner reviewed"},
    {"action":"add","equipmentType":"dumbbells","name":"Dumbbell sets","quantity":null,"notes":null},
    {"action":"skip"}
  ]'::jsonb
);

do $$ begin
  if (select count(*) from public.organization_equipment where organization_id = 'e1000000-1000-4000-8000-000000000001') <> 2 then
    raise exception 'Approved equipment was not saved';
  end if;
  if not exists (
    select 1 from public.equipment_scan_requests
    where id = (select id from scan_test_ids where kind = 'owner-a-first') and status = 'saved'
  ) then raise exception 'Saved scan status was not recorded'; end if;
end $$;

-- A rolling 24-hour quota counts reserved attempts and rejects the eleventh.
do $$
declare i integer;
begin
  for i in 2..10 loop
    perform public.reserve_equipment_scan('gpt-5.4-mini-2026-03-17', 1);
  end loop;
  begin
    perform public.reserve_equipment_scan('gpt-5.4-mini-2026-03-17', 1);
    raise exception 'Eleventh scan reservation succeeded';
  exception when others then
    if sqlerrm = 'Eleventh scan reservation succeeded' then raise; end if;
    if sqlerrm <> 'Equipment scan daily limit reached' then raise; end if;
  end;
end $$;

-- Other organizations cannot observe Organization A audit metadata.
reset role;
set local role authenticated;
select set_config('request.jwt.claim.sub', 'e2000000-0000-4000-8000-000000000001', true);
do $$ begin
  if exists (
    select 1 from public.equipment_scan_requests
    where organization_id = 'e1000000-1000-4000-8000-000000000001'
  ) then raise exception 'Cross-organization scan metadata leaked'; end if;
end $$;

insert into scan_test_ids
select 'owner-b', scan_request_id
from public.reserve_equipment_scan('gpt-5.4-mini-2026-03-17', 1);
select public.complete_equipment_scan(
  (select id from scan_test_ids where kind = 'owner-b'), 'succeeded', 2, 900, null, 80, 35, null
);

-- A cross-organization update makes the entire approval transaction roll back.
do $$
declare before_count integer;
begin
  select count(*) into before_count
  from public.organization_equipment
  where organization_id = 'e2000000-2000-4000-8000-000000000001';
  begin
    perform public.save_equipment_scan_results(
      (select id from scan_test_ids where kind = 'owner-b'),
      jsonb_build_array(
        jsonb_build_object('action','add','equipmentType','bench','name','Must roll back','quantity',1),
        jsonb_build_object(
          'action','update','targetEquipmentId',
          (select id from public.organization_equipment where organization_id = 'e1000000-1000-4000-8000-000000000001' limit 1),
          'equipmentType','bench','name','Cross tenant update','quantity',1
        )
      )
    );
    raise exception 'Cross-organization equipment update succeeded';
  exception when others then
    if sqlerrm = 'Cross-organization equipment update succeeded' then raise; end if;
  end;
  if (select count(*) from public.organization_equipment where organization_id = 'e2000000-2000-4000-8000-000000000001') <> before_count then
    raise exception 'Failed approval partially saved equipment';
  end if;
end $$;

-- Coaches and Clients cannot reserve scans, save results, or read metadata.
reset role;
set local role authenticated;
select set_config('request.jwt.claim.sub', 'e1000000-0000-4000-8000-000000000002', true);
do $$ begin
  if exists (select 1 from public.equipment_scan_requests) then raise exception 'Coach can read scan metadata'; end if;
  begin
    perform public.reserve_equipment_scan('gpt-5.4-mini-2026-03-17', 1);
    raise exception 'Coach reserved an equipment scan';
  exception when others then if sqlerrm = 'Coach reserved an equipment scan' then raise; end if; end;
end $$;

reset role;
set local role authenticated;
select set_config('request.jwt.claim.sub', 'e1000000-0000-4000-8000-000000000003', true);
do $$ begin
  if exists (select 1 from public.equipment_scan_requests) then raise exception 'Client can read scan metadata'; end if;
  begin
    perform public.reserve_equipment_scan('gpt-5.4-mini-2026-03-17', 1);
    raise exception 'Client reserved an equipment scan';
  exception when others then if sqlerrm = 'Client reserved an equipment scan' then raise; end if; end;
end $$;

-- Existing sessions lose scanner access as soon as the Owner membership becomes inactive.
reset role;
update public.organization_memberships
set status = 'inactive'
where organization_id = 'e2000000-2000-4000-8000-000000000001'
  and user_id = 'e2000000-0000-4000-8000-000000000002';
set local role authenticated;
select set_config('request.jwt.claim.sub', 'e2000000-0000-4000-8000-000000000002', true);
do $$ begin
  if exists (select 1 from public.equipment_scan_requests) then raise exception 'Inactive Owner can read scan metadata'; end if;
  begin
    perform public.reserve_equipment_scan('gpt-5.4-mini-2026-03-17', 1);
    raise exception 'Inactive Owner reserved an equipment scan';
  exception when others then if sqlerrm = 'Inactive Owner reserved an equipment scan' then raise; end if; end;
end $$;

rollback;
