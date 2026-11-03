begin;
insert into auth.users(id,aud,role,email,email_confirmed_at,raw_app_meta_data,raw_user_meta_data,created_at,updated_at)
select ('99000000-0000-0000-0000-'||lpad(i::text,12,'0'))::uuid,'authenticated','authenticated',
 case i when 6 then 'clear-pending@example.test' else 'clear-user-'||i||'@example.test' end,now(),'{"provider":"email"}'::jsonb,'{"full_name":"Clearing QA"}'::jsonb,now(),now() from generate_series(1,6) i;
insert into public.organizations(id,name) values ('99a00000-0000-0000-0000-000000000001','Clear Gym A'),('99a00000-0000-0000-0000-000000000002','Clear Gym B');
insert into public.organization_memberships(organization_id,user_id,role,status) values
 ('99a00000-0000-0000-0000-000000000001','99000000-0000-0000-0000-000000000001','owner','active'),
 ('99a00000-0000-0000-0000-000000000001','99000000-0000-0000-0000-000000000002','coach','active'),
 ('99a00000-0000-0000-0000-000000000002','99000000-0000-0000-0000-000000000004','owner','active'),
 ('99a00000-0000-0000-0000-000000000001','99000000-0000-0000-0000-000000000005','owner','inactive');
insert into public.organization_invitations(id,organization_id,invited_by,email,role,token_hash,created_at,expires_at,revoked_at,accepted_at,accepted_by)
select ('99b00000-0000-0000-0000-'||lpad(i::text,12,'0'))::uuid,
 case when i=5 then '99a00000-0000-0000-0000-000000000002'::uuid else '99a00000-0000-0000-0000-000000000001'::uuid end,
 case when i=5 then '99000000-0000-0000-0000-000000000004'::uuid else '99000000-0000-0000-0000-000000000001'::uuid end,
 case when i=1 then 'clear-pending@example.test' else 'clear-invite-'||i||'@example.test' end,'client',
 encode(extensions.digest(repeat(i::text,32),'sha256'),'hex'),now()-interval '2 days',
 case when i=2 then now()-interval '1 day' else now()+interval '7 days' end,
 case when i=3 then now() end,case when i=4 then now() end,case when i=4 then '99000000-0000-0000-0000-000000000003'::uuid end
from generate_series(1,6) i;
insert into public.organization_memberships(organization_id,user_id,role,status,invitation_id) values
 ('99a00000-0000-0000-0000-000000000001','99000000-0000-0000-0000-000000000003','client','active','99b00000-0000-0000-0000-000000000004');
create temporary table clear_fixture_before as select
 (select jsonb_agg(to_jsonb(u) order by id) from auth.users u where id::text like '99000000-%') as users,
 (select jsonb_agg(to_jsonb(m) order by id) from public.organization_memberships m where user_id::text like '99000000-%') as memberships;
set local role authenticated;
select set_config('request.jwt.claim.sub','99000000-0000-0000-0000-000000000002',true);
do $$ begin begin perform public.clear_email_invitations(array['99b00000-0000-0000-0000-000000000001'::uuid]); raise exception 'Coach cleared invites'; exception when insufficient_privilege then null; end; end $$;
select set_config('request.jwt.claim.sub','99000000-0000-0000-0000-000000000003',true);
do $$ begin begin perform public.clear_email_invitations(array['99b00000-0000-0000-0000-000000000001'::uuid]); raise exception 'Client cleared invites'; exception when insufficient_privilege then null; end; end $$;
select set_config('request.jwt.claim.sub','99000000-0000-0000-0000-000000000005',true);
do $$ begin begin perform public.clear_email_invitations(array['99b00000-0000-0000-0000-000000000001'::uuid]); raise exception 'Inactive Owner cleared invites'; exception when insufficient_privilege then null; end; end $$;
select set_config('request.jwt.claim.sub','99000000-0000-0000-0000-000000000001',true);
do $$ declare accepted_before jsonb; fresh record; cleared_time timestamptz; begin
  select to_jsonb(i) into accepted_before from public.organization_invitations i where id='99b00000-0000-0000-0000-000000000004';
  if not exists(select 1 from public.get_organization_enrollment_handoff(repeat('1',32))) then raise exception 'Pending fixture link was not valid before clearing'; end if;
  begin perform public.clear_email_invitations(array['99b00000-0000-0000-0000-000000000001'::uuid,'99b00000-0000-0000-0000-000000000005'::uuid]); raise exception 'Cross-gym batch accepted'; exception when insufficient_privilege then null; end;
  begin perform public.clear_email_invitations(array['99b00000-0000-0000-0000-000000000006'::uuid,'99b00000-0000-0000-0000-000000000004'::uuid]); raise exception 'Accepted invitation cleared'; exception when insufficient_privilege then null; end;
  if exists(select 1 from public.organization_invitations where id in ('99b00000-0000-0000-0000-000000000001','99b00000-0000-0000-0000-000000000006') and revoked_at is not null) then raise exception 'Rejected batch partially cleared'; end if;
  begin perform public.clear_email_invitations(array[]::uuid[]); raise exception 'Empty batch accepted'; exception when invalid_parameter_value then null; end;
  begin perform public.clear_email_invitations(array[null::uuid]); raise exception 'Null ID accepted'; exception when invalid_parameter_value then null; end;
  if public.clear_email_invitations(array['99b00000-0000-0000-0000-000000000001'::uuid,'99b00000-0000-0000-0000-000000000002'::uuid,'99b00000-0000-0000-0000-000000000003'::uuid])<>3 then raise exception 'Eligible batch not cleared'; end if;
  if (select count(*) from public.organization_invitations where cleared_at is not null and revoked_at is not null and cleared_by=auth.uid())<>3 then raise exception 'Revocation/audit actor missing'; end if;
  if (select count(*) from public.organization_invitations)<>5 then raise exception 'Invitation audit rows deleted or gym isolation broken'; end if;
  if exists(select 1 from public.get_organization_enrollment_handoff(repeat('1',32))) or exists(select 1 from public.get_organization_invitation_context(repeat('1',32))) then raise exception 'Cleared signup link still valid'; end if;
  select cleared_at into cleared_time from public.organization_invitations where id='99b00000-0000-0000-0000-000000000001';
  if public.clear_email_invitations(array['99b00000-0000-0000-0000-000000000001'::uuid])<>0 then raise exception 'Retry altered audit'; end if;
  if (select cleared_at from public.organization_invitations where id='99b00000-0000-0000-0000-000000000001') is distinct from cleared_time then raise exception 'Audit timestamp changed on retry'; end if;
  if (select to_jsonb(i) from public.organization_invitations i where id='99b00000-0000-0000-0000-000000000004') is distinct from accepted_before then raise exception 'Accepted invitation changed'; end if;
  begin update public.organization_invitations set cleared_at=now() where id='99b00000-0000-0000-0000-000000000004'; raise exception 'Direct clearing bypassed RPC'; exception when insufficient_privilege then null; end;
  select * into fresh from public.create_organization_invitation('clear-pending@example.test','client',encode(extensions.digest(repeat('n',32),'sha256'),'hex'),now()+interval '7 days');
  if fresh.invitation_id is null or fresh.invitation_id='99b00000-0000-0000-0000-000000000001'::uuid then raise exception 'Fresh invitation not created'; end if;
  if not exists(select 1 from public.get_organization_enrollment_handoff(repeat('n',32)) where role='client' and email='clear-pending@example.test') then raise exception 'Fresh invitation signup unavailable'; end if;
end $$;
select set_config('request.jwt.claim.sub','99000000-0000-0000-0000-000000000006',true);
do $$ begin
  begin perform public.accept_organization_enrollment(repeat('1',32)); raise exception 'Cleared invitation redeemed'; exception when raise_exception then if sqlerrm='Cleared invitation redeemed' then raise; end if; end;
  if exists(select 1 from public.organization_memberships where user_id=auth.uid()) then raise exception 'Revoked link created membership'; end if;
end $$;
select set_config('request.jwt.claim.sub','99000000-0000-0000-0000-000000000004',true);
do $$ begin
  if exists(select 1 from public.organization_invitations where cleared_at is not null) then raise exception 'Other gym read cleared history'; end if;
  if (select revoked_at from public.organization_invitations where id='99b00000-0000-0000-0000-000000000005') is not null then raise exception 'Other gym invitation changed'; end if;
end $$;
reset role;
do $$ begin
  if (select jsonb_agg(to_jsonb(u) order by id) from auth.users u where id::text like '99000000-%') is distinct from (select users from clear_fixture_before) then raise exception 'Clearing changed Auth accounts'; end if;
  if (select jsonb_agg(to_jsonb(m) order by id) from public.organization_memberships m where user_id::text like '99000000-%') is distinct from (select memberships from clear_fixture_before) then raise exception 'Clearing changed memberships'; end if;
  if has_function_privilege('anon','public.clear_email_invitations(uuid[])','execute') or has_function_privilege('anon','private.clear_email_invitations(uuid[])','execute') then raise exception 'Anonymous clear exposed'; end if;
end $$;
rollback;
