begin;

insert into auth.users (id,aud,role,email,encrypted_password,email_confirmed_at,raw_app_meta_data,raw_user_meta_data,created_at,updated_at) values
('81000000-0000-0000-0000-000000000001','authenticated','authenticated','profile-owner-a@example.test',crypt('TestPass123!',gen_salt('bf')),now(),'{}','{"full_name":"Profile Owner A"}',now(),now()),
('81000000-0000-0000-0000-000000000002','authenticated','authenticated','profile-coach-a@example.test',crypt('TestPass123!',gen_salt('bf')),now(),'{}','{"full_name":"Profile Coach A"}',now(),now()),
('81000000-0000-0000-0000-000000000003','authenticated','authenticated','profile-client-a@example.test',crypt('TestPass123!',gen_salt('bf')),now(),'{}','{"full_name":"Profile Client A"}',now(),now()),
('81000000-0000-0000-0000-000000000004','authenticated','authenticated','profile-coach-a2@example.test',crypt('TestPass123!',gen_salt('bf')),now(),'{}','{"full_name":"Profile Coach A2"}',now(),now()),
('82000000-0000-0000-0000-000000000001','authenticated','authenticated','profile-owner-b@example.test',crypt('TestPass123!',gen_salt('bf')),now(),'{}','{"full_name":"Profile Owner B"}',now(),now()),
('82000000-0000-0000-0000-000000000002','authenticated','authenticated','profile-coach-b@example.test',crypt('TestPass123!',gen_salt('bf')),now(),'{}','{"full_name":"Profile Coach B"}',now(),now());
insert into public.organizations (id,name) values ('8a000000-0000-0000-0000-000000000001','Profile Organization A'),('8b000000-0000-0000-0000-000000000001','Profile Organization B');
insert into public.organization_memberships (organization_id,user_id,role) values
('8a000000-0000-0000-0000-000000000001','81000000-0000-0000-0000-000000000001','owner'),
('8a000000-0000-0000-0000-000000000001','81000000-0000-0000-0000-000000000002','coach'),
('8a000000-0000-0000-0000-000000000001','81000000-0000-0000-0000-000000000003','client'),
('8a000000-0000-0000-0000-000000000001','81000000-0000-0000-0000-000000000004','coach'),
('8b000000-0000-0000-0000-000000000001','82000000-0000-0000-0000-000000000001','owner'),
('8b000000-0000-0000-0000-000000000001','82000000-0000-0000-0000-000000000002','coach');
insert into public.coach_client_assignments (organization_id,coach_user_id,client_user_id) values ('8a000000-0000-0000-0000-000000000001','81000000-0000-0000-0000-000000000002','81000000-0000-0000-0000-000000000003');
insert into storage.objects (bucket_id,name,metadata) values
('profile-images','8b000000-0000-0000-0000-000000000001/82000000-0000-0000-0000-000000000002/avatar.jpg','{"mimetype":"image/jpeg","size":1024}');


set local role authenticated;
select set_config('request.jwt.claim.sub','81000000-0000-0000-0000-000000000001',true);
insert into storage.objects(bucket_id,name,metadata) select 'profile-images',
'8a000000-0000-0000-0000-000000000001/81000000-0000-0000-0000-000000000003/avatar/v2-91000000-0000-4000-8000-000000000001'||suffix,
'{"mimetype":"image/webp","size":1024}'::jsonb from unnest(array['.webp','-thumb.webp']) suffix;
select public.set_managed_profile_photo('81000000-0000-0000-0000-000000000003','8a000000-0000-0000-0000-000000000001','8a000000-0000-0000-0000-000000000001/81000000-0000-0000-0000-000000000003/avatar/v2-91000000-0000-4000-8000-000000000001.webp',null);
insert into storage.objects(bucket_id,name,metadata) select 'profile-images',
'8a000000-0000-0000-0000-000000000001/81000000-0000-0000-0000-000000000002/avatar/v2-91000000-0000-4000-8000-000000000002'||suffix,
'{"mimetype":"image/webp","size":1024}'::jsonb from unnest(array['.webp','-thumb.webp']) suffix;
select public.set_managed_profile_photo('81000000-0000-0000-0000-000000000002','8a000000-0000-0000-0000-000000000001','8a000000-0000-0000-0000-000000000001/81000000-0000-0000-0000-000000000002/avatar/v2-91000000-0000-4000-8000-000000000002.webp',null);
do $$ begin
  if private.can_remove_profile_asset('8a000000-0000-0000-0000-000000000001/81000000-0000-0000-0000-000000000003/avatar/v2-91000000-0000-4000-8000-000000000001.webp') then raise exception 'Referenced client photo can be deleted'; end if;
  update storage.objects set metadata='{"mimetype":"image/webp","size":2000}' where bucket_id='profile-images' and name like '%v2-%';
  if exists(select 1 from storage.objects where bucket_id='profile-images' and metadata->>'size'='2000') then raise exception 'Referenced photo was overwritten'; end if;
  begin perform public.set_managed_profile_photo('81000000-0000-0000-0000-000000000003','8a000000-0000-0000-0000-000000000001',null,null);
    raise exception 'Stale pointer accepted'; exception when raise_exception then if sqlerrm='Stale pointer accepted' then raise; end if; end;
end $$;
-- Any active Coach in the same gym may manage only the Client photo, without gaining intake/profile authorization.
select set_config('request.jwt.claim.sub','81000000-0000-0000-0000-000000000004',true);
do $$ begin
  if private.can_view_profile('81000000-0000-0000-0000-000000000003') then raise exception 'Unassigned Coach gained general Client profile access'; end if;
  if not private.can_write_profile_asset('8a000000-0000-0000-0000-000000000001/81000000-0000-0000-0000-000000000003/avatar/v2-91000000-0000-4000-8000-000000000003.webp') then raise exception 'Same-gym Coach cannot manage Client photo'; end if;
  if private.can_write_profile_asset('8a000000-0000-0000-0000-000000000001/81000000-0000-0000-0000-000000000002/avatar/v2-91000000-0000-4000-8000-000000000003.webp') then raise exception 'Coach can manage another Coach'; end if;
  begin perform public.set_managed_profile_photo('81000000-0000-0000-0000-000000000002','8a000000-0000-0000-0000-000000000001',null,'8a000000-0000-0000-0000-000000000001/81000000-0000-0000-0000-000000000002/avatar/v2-91000000-0000-4000-8000-000000000002.webp');
    raise exception 'Coach removed another Coach photo'; exception when raise_exception then if sqlerrm='Coach removed another Coach photo' then raise; end if; end;
end $$;
insert into storage.objects(bucket_id,name,metadata) select 'profile-images',
'8a000000-0000-0000-0000-000000000001/81000000-0000-0000-0000-000000000003/avatar/v2-91000000-0000-4000-8000-000000000003'||suffix,
'{"mimetype":"image/webp","size":1024}'::jsonb from unnest(array['.webp','-thumb.webp']) suffix;
select public.set_managed_profile_photo('81000000-0000-0000-0000-000000000003','8a000000-0000-0000-0000-000000000001','8a000000-0000-0000-0000-000000000001/81000000-0000-0000-0000-000000000003/avatar/v2-91000000-0000-4000-8000-000000000003.webp','8a000000-0000-0000-0000-000000000001/81000000-0000-0000-0000-000000000003/avatar/v2-91000000-0000-4000-8000-000000000001.webp');
-- Hosted Storage protects direct SQL deletion. Actual object removal is tested
-- through its authenticated HTTP API; do not disable the platform safeguard.
do $$ begin if not private.can_remove_profile_asset('8a000000-0000-0000-0000-000000000001/81000000-0000-0000-0000-000000000003/avatar/v2-91000000-0000-4000-8000-000000000001.webp') then raise exception 'Replaced assets cannot be cleaned up'; end if; end $$;
-- Preserve Client self-service and own-photo read access.
select set_config('request.jwt.claim.sub','81000000-0000-0000-0000-000000000003',true);
do $$ begin
  if (select count(*) from storage.objects where bucket_id='profile-images' and name like '%v2-91000000-0000-4000-8000-000000000003%')<>2 then raise exception 'Client cannot see both own photo sizes'; end if;
  if not private.can_write_profile_asset('8a000000-0000-0000-0000-000000000001/81000000-0000-0000-0000-000000000003/avatar/v2-91000000-0000-4000-8000-000000000004.webp') then raise exception 'Client self-service regressed'; end if;
  begin perform public.get_profile_photo_edit_context('81000000-0000-0000-0000-000000000002','8a000000-0000-0000-0000-000000000001');
    raise exception 'Client can edit Coach photo'; exception when raise_exception then if sqlerrm='Client can edit Coach photo' then raise; end if; end;
end $$;
-- Cross-organization Owner and Coach, including listing, upload, delete and RPC tampering.
select set_config('request.jwt.claim.sub','82000000-0000-0000-0000-000000000001',true);
do $$ declare actor text; begin
  foreach actor in array array['82000000-0000-0000-0000-000000000001','82000000-0000-0000-0000-000000000002'] loop
    perform set_config('request.jwt.claim.sub',actor,true);
    if exists(select 1 from storage.objects where name like '8a000000%') then raise exception 'Cross-org photo listing leaked'; end if;
    begin insert into storage.objects(bucket_id,name,metadata) values('profile-images','8a000000-0000-0000-0000-000000000001/81000000-0000-0000-0000-000000000003/avatar/v2-91000000-0000-4000-8000-000000000004.webp','{"mimetype":"image/webp","size":1024}');
      raise exception 'Cross-org upload allowed'; exception when insufficient_privilege then null; end;
    begin perform public.get_profile_photo_edit_context('81000000-0000-0000-0000-000000000003','8a000000-0000-0000-0000-000000000001');
      raise exception 'Cross-org edit context leaked'; exception when raise_exception then if sqlerrm='Cross-org edit context leaked' then raise; end if; end;
    if private.can_remove_profile_asset('8a000000-0000-0000-0000-000000000001/81000000-0000-0000-0000-000000000003/avatar/v2-91000000-0000-4000-8000-000000000001.webp') then raise exception 'Cross-org delete permitted'; end if;
  end loop;
end $$;
reset role;
update public.organization_memberships set status='inactive' where user_id='81000000-0000-0000-0000-000000000002';
set local role authenticated;
select set_config('request.jwt.claim.sub','81000000-0000-0000-0000-000000000002',true);
do $$ begin if private.can_read_profile_asset('8a000000-0000-0000-0000-000000000001/81000000-0000-0000-0000-000000000003/avatar/v2-91000000-0000-4000-8000-000000000003.webp')
or private.can_write_profile_asset('8a000000-0000-0000-0000-000000000001/81000000-0000-0000-0000-000000000003/avatar/v2-91000000-0000-4000-8000-000000000003.webp') then raise exception 'Inactive Coach retained access'; end if; end $$;
reset role;
set local role anon;
select set_config('request.jwt.claim.sub','',true);
do $$ begin
  if exists(select 1 from storage.objects where bucket_id='profile-images') then raise exception 'Unauthenticated listing leaked'; end if;
  if has_function_privilege('anon','public.set_managed_profile_photo(uuid,uuid,text,text)','execute') then raise exception 'Anonymous mutation RPC exposed'; end if;
end $$;
rollback;
