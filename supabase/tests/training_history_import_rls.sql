begin;

insert into auth.users (
  id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at
) values
  ('71000000-0000-0000-0000-000000000001', 'authenticated', 'authenticated', 'import-owner-a@example.test', crypt('TestPass123!', gen_salt('bf')), now(), '{"provider":"email","providers":["email"]}', '{"full_name":"Import Owner A"}', now(), now()),
  ('71000000-0000-0000-0000-000000000002', 'authenticated', 'authenticated', 'import-coach-a@example.test', crypt('TestPass123!', gen_salt('bf')), now(), '{"provider":"email","providers":["email"]}', '{"full_name":"Import Coach A"}', now(), now()),
  ('72000000-0000-0000-0000-000000000001', 'authenticated', 'authenticated', 'import-owner-b@example.test', crypt('TestPass123!', gen_salt('bf')), now(), '{"provider":"email","providers":["email"]}', '{"full_name":"Import Owner B"}', now(), now());

insert into public.organizations (id, name) values
  ('d1000000-0000-0000-0000-000000000001', 'Import Organization A'),
  ('d2000000-0000-0000-0000-000000000001', 'Import Organization B');

insert into public.organization_memberships (organization_id, user_id, role) values
  ('d1000000-0000-0000-0000-000000000001', '71000000-0000-0000-0000-000000000001', 'owner'),
  ('d1000000-0000-0000-0000-000000000001', '71000000-0000-0000-0000-000000000002', 'coach'),
  ('d2000000-0000-0000-0000-000000000001', '72000000-0000-0000-0000-000000000001', 'owner');

set local role authenticated;
select set_config('request.jwt.claim.sub', '71000000-0000-0000-0000-000000000001', true);
select set_config('request.jwt.claims', '{"sub":"71000000-0000-0000-0000-000000000001","role":"authenticated"}', true);

do $$
declare imported integer;
begin
  imported := public.import_training_library_rows(
    'history.csv',
    'csv',
    '[
      {"rowNumber":2,"title":"Back Squat","cells":[{"column":1,"header":"Exercise","raw":"Back Squat","display":"Back Squat"}]},
      {"rowNumber":3,"title":"Bench Press","cells":[{"column":1,"header":"Exercise","raw":"Bench Press","display":"Bench Press"}]}
    ]'::jsonb
  );
  if imported <> 2 then raise exception 'Owner import count was incorrect'; end if;
  if (select count(*) from public.training_library_items where source_filename = 'history.csv') <> 2 then
    raise exception 'Owner could not read imported rows';
  end if;
  if not exists (
    select 1 from public.training_library_items
    where source_filename = 'history.csv'
      and normalized_content #>> '{cells,0,raw}' = 'Back Squat'
  ) then raise exception 'Raw source values were not preserved'; end if;
end $$;

select set_config('request.jwt.claim.sub', '71000000-0000-0000-0000-000000000002', true);
select set_config('request.jwt.claims', '{"sub":"71000000-0000-0000-0000-000000000002","role":"authenticated"}', true);
do $$ begin
  begin
    perform public.import_training_library_rows('coach.csv', 'csv', '[{"rowNumber":2,"title":"No","cells":[]}]'::jsonb);
    raise exception 'Coach imported training history';
  exception when others then
    if sqlerrm = 'Coach imported training history' then raise; end if;
  end;
  if exists (select 1 from public.training_library_items) then
    raise exception 'Coach can read owner training-library rows';
  end if;
end $$;

select set_config('request.jwt.claim.sub', '72000000-0000-0000-0000-000000000001', true);
select set_config('request.jwt.claims', '{"sub":"72000000-0000-0000-0000-000000000001","role":"authenticated"}', true);
do $$ begin
  if exists (select 1 from public.training_library_items) then
    raise exception 'Organization B owner can read Organization A imports';
  end if;
end $$;

rollback;
