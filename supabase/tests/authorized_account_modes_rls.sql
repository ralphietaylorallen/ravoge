-- Isolated local/CI fixtures only. The existing runner wraps each suite in its
-- own transaction; this suite rolls back all identities and training records.
begin;
insert into auth.users(id,aud,role,email,email_confirmed_at,raw_user_meta_data,created_at,updated_at)
select ('ab100000-0000-4000-8000-'||lpad(i::text,12,'0'))::uuid,'authenticated','authenticated','account-modes-'||i||'@example.test',now(),jsonb_build_object('full_name','Modes QA '||i),now(),now() from generate_series(1,6)i;
insert into public.organizations(id,name) values('ab200000-0000-4000-8000-000000000001','Modes Gym A'),('ab200000-0000-4000-8000-000000000002','Modes Gym B');
insert into public.organization_memberships(organization_id,user_id,role,status) values
('ab200000-0000-4000-8000-000000000001','ab100000-0000-4000-8000-000000000001','owner','active'),
('ab200000-0000-4000-8000-000000000001','ab100000-0000-4000-8000-000000000002','coach','active'),
('ab200000-0000-4000-8000-000000000001','ab100000-0000-4000-8000-000000000003','coach','active'),
('ab200000-0000-4000-8000-000000000001','ab100000-0000-4000-8000-000000000004','client','active'),
('ab200000-0000-4000-8000-000000000002','ab100000-0000-4000-8000-000000000005','owner','active'),
('ab200000-0000-4000-8000-000000000002','ab100000-0000-4000-8000-000000000006','client','active'),
('ab200000-0000-4000-8000-000000000002','ab100000-0000-4000-8000-000000000002','coach','inactive');
insert into public.coach_client_assignments(id,organization_id,coach_user_id,client_user_id) values('ab300000-0000-4000-8000-000000000001','ab200000-0000-4000-8000-000000000001','ab100000-0000-4000-8000-000000000002','ab100000-0000-4000-8000-000000000004');
insert into public.workout_assignments(id,organization_id,coach_user_id,client_user_id,title,scheduled_date) values('ab400000-0000-4000-8000-000000000001','ab200000-0000-4000-8000-000000000001','ab100000-0000-4000-8000-000000000002','ab100000-0000-4000-8000-000000000004','Preserved modes workout',current_date);
create temp table modes_before as select to_jsonb(u) auth_user,(select to_jsonb(w) from public.workout_assignments w where id='ab400000-0000-4000-8000-000000000001') workout from auth.users u where id='ab100000-0000-4000-8000-000000000002';
set local role authenticated;
select set_config('request.jwt.claim.sub','ab100000-0000-4000-8000-000000000004',true);
select set_config('request.headers','{"x-ravoge-organization":"ab200000-0000-4000-8000-000000000001","x-ravoge-view":"coach"}',true);
do $$ begin
 if private.has_active_role('ab200000-0000-4000-8000-000000000001',array['coach']::public.organization_role[]) then raise exception 'Client forged Coach view'; end if;
 begin perform public.create_my_client_access('ab200000-0000-4000-8000-000000000001'); raise exception 'Client acquired Coach self-service'; exception when insufficient_privilege then null; end;
 begin update public.organization_memberships set client_access_status='active' where user_id=auth.uid(); raise exception 'Direct role grant'; exception when insufficient_privilege then null; end;
 if (select count(*) from public.get_my_authorized_memberships())<>1 then raise exception 'Client roles wrong'; end if;
end $$;
select set_config('request.jwt.claim.sub','ab100000-0000-4000-8000-000000000002',true);
select set_config('request.headers','{}',true);
do $$ declare a uuid; b uuid; begin
 a:=public.create_my_client_access('ab200000-0000-4000-8000-000000000001');
 b:=public.create_my_client_access('ab200000-0000-4000-8000-000000000001');
 if a<>b or (select count(*) from public.organization_memberships where organization_id='ab200000-0000-4000-8000-000000000001' and user_id=auth.uid())<>1 then raise exception 'Duplicate identity/membership'; end if;
 if (select count(*) from public.get_my_authorized_memberships())<>2 then raise exception 'Dual modes missing'; end if;
 if (select account_type from public.profiles where id=auth.uid())<>'coach' then raise exception 'Coach profile converted'; end if;
 begin perform public.create_my_client_access('ab200000-0000-4000-8000-000000000002'); raise exception 'Inactive foreign gym granted access'; exception when insufficient_privilege then null; end;
 if exists(select 1 from public.coach_client_assignments where client_user_id=auth.uid()) then raise exception 'Auto-assignment created'; end if;
end $$;
select set_config('request.headers','{"x-ravoge-organization":"ab200000-0000-4000-8000-000000000001","x-ravoge-view":"client"}',true);
do $$ begin
 if not private.has_active_role('ab200000-0000-4000-8000-000000000001',array['client']::public.organization_role[]) then raise exception 'Client mode denied'; end if;
 -- Selecting Client does not revoke the same person's independently valid
 -- Coach permissions. Client pages still scope their records by user_id.
 if exists(select 1 from public.workout_assignments where client_user_id=auth.uid()) then raise exception 'Unexpected self-assignment'; end if;
 perform public.update_own_profile('{"preferredName":"Modes Client"}');
end $$;
select set_config('request.headers','{"x-ravoge-organization":"ab200000-0000-4000-8000-000000000002","x-ravoge-view":"client"}',true);
do $$ begin if exists(select 1 from public.organizations where id='ab200000-0000-4000-8000-000000000002') then raise exception 'Forged gym preference leaked organization'; end if; end $$;
select set_config('request.jwt.claim.sub','ab100000-0000-4000-8000-000000000001',true);
select set_config('request.headers','{}',true);
select public.assign_client_to_coach('ab100000-0000-4000-8000-000000000002','ab100000-0000-4000-8000-000000000003');
do $$ begin
 begin perform public.assign_client_to_coach('ab100000-0000-4000-8000-000000000002','ab100000-0000-4000-8000-000000000002'); raise exception 'Self assignment'; exception when raise_exception then if sqlerrm='Self assignment' then raise; end if; end;
 if (public.member_removal_context('ab100000-0000-4000-8000-000000000002','coach')->'assignments')::jsonb @> '[{"clientId":"ab100000-0000-4000-8000-000000000002"}]' then raise exception 'Wrong role assignments included'; end if;
 perform public.remove_organization_member('ab100000-0000-4000-8000-000000000002','coach',array['ab300000-0000-4000-8000-000000000001'::uuid]);
end $$;
select set_config('request.jwt.claim.sub','ab100000-0000-4000-8000-000000000002',true);
select set_config('request.headers','{"x-ravoge-organization":"ab200000-0000-4000-8000-000000000001","x-ravoge-view":"coach"}',true);
do $$ begin
 if private.has_active_role('ab200000-0000-4000-8000-000000000001',array['coach']::public.organization_role[]) then raise exception 'Revoked Coach session retained access'; end if;
 if (select count(*) from public.get_my_authorized_memberships())<>1 then raise exception 'Coach removal deleted Client role'; end if;
 begin perform public.create_my_client_access('ab200000-0000-4000-8000-000000000001'); raise exception 'Inactive Coach activated role'; exception when insufficient_privilege then null; end;
end $$;
select set_config('request.headers','{"x-ravoge-organization":"ab200000-0000-4000-8000-000000000001","x-ravoge-view":"client"}',true);
do $$ begin
 if not private.has_active_role('ab200000-0000-4000-8000-000000000001',array['client']::public.organization_role[]) then raise exception 'Client lost access with Coach revocation'; end if;
 if (select count(*) from public.get_my_assigned_coach())<>1 then raise exception 'Client assignment lost'; end if;
end $$;
select set_config('request.jwt.claim.sub','ab100000-0000-4000-8000-000000000001',true);
select set_config('request.headers','{}',true);
select public.remove_organization_member('ab100000-0000-4000-8000-000000000002','client',array(select id from public.coach_client_assignments where client_user_id='ab100000-0000-4000-8000-000000000002' and status='active'));
-- Test the reverse revocation order on a different Coach.
select set_config('request.jwt.claim.sub','ab100000-0000-4000-8000-000000000003',true);
select public.create_my_client_access('ab200000-0000-4000-8000-000000000001');
select set_config('request.jwt.claim.sub','ab100000-0000-4000-8000-000000000001',true);
select public.remove_organization_member('ab100000-0000-4000-8000-000000000003','client','{}');
select set_config('request.jwt.claim.sub','ab100000-0000-4000-8000-000000000003',true);
do $$ begin
 if not private.has_active_role('ab200000-0000-4000-8000-000000000001',array['coach']::public.organization_role[])
   or private.has_active_role('ab200000-0000-4000-8000-000000000001',array['client']::public.organization_role[]) then raise exception 'Client revocation changed Coach authority'; end if;
end $$;
select set_config('request.jwt.claim.sub','ab100000-0000-4000-8000-000000000002',true);
do $$ begin if exists(select 1 from public.get_my_authorized_memberships()) then raise exception 'Revoked roles still active'; end if; end $$;
reset role;
do $$ begin
 if (select auth_user from modes_before) is distinct from (select to_jsonb(u) from auth.users u where id='ab100000-0000-4000-8000-000000000002') then raise exception 'Auth identity changed'; end if;
 if (select workout from modes_before) is distinct from (select to_jsonb(w) from public.workout_assignments w where id='ab400000-0000-4000-8000-000000000001') then raise exception 'Historical workout changed'; end if;
end $$;
rollback;
