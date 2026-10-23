-- Synthetic users only; transaction rollback. Run on the isolated preview DB.
begin;
create function pg_temp.assert_spot(value boolean,message text) returns void language plpgsql as $$ begin if value is distinct from true then raise exception '%',message; end if; end $$;
insert into auth.users(id,aud,role,email,email_confirmed_at,raw_app_meta_data,raw_user_meta_data,created_at,updated_at)
select ('cf100000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid,'authenticated','authenticated','injury-qa-'||n||'@example.test',now(),'{}','{}',now(),now() from generate_series(1,6) n;
insert into public.organizations(id,name) values('cf200000-0000-4000-8000-000000000001','Isolated intake A'),('cf200000-0000-4000-8000-000000000002','Isolated intake B');
insert into public.organization_memberships(organization_id,user_id,role)
select ('cf200000-0000-4000-8000-'||case when n<=3 then '000000000001' else '000000000002' end)::uuid,('cf100000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid,
 case n%3 when 1 then 'owner'::public.organization_role when 2 then 'coach'::public.organization_role else 'client'::public.organization_role end from generate_series(1,6) n;
insert into public.coach_client_assignments(organization_id,coach_user_id,client_user_id) values('cf200000-0000-4000-8000-000000000001','cf100000-0000-4000-8000-000000000002','cf100000-0000-4000-8000-000000000003');
create function pg_temp.spot(sid uuid,region text,pain integer) returns jsonb language sql as $$
 select jsonb_build_object('id',sid,'region',region,'side','left','view','front','categories',jsonb_build_array('surgery','long_term'),
  'onset','Several years ago','sensation','','pain',pain,'occurrence','[]'::jsonb,'triggers','','limitations','Avoid loaded flexion',
  'clinicianInstructions','unsure','clinicianDetails','','notes','','surgeryRepair','Ligament repair','surgeryWhen','Several years ago','postoperativeRestrictions','Unknown')
$$;
set local role authenticated;
select set_config('request.jwt.claim.sub','cf100000-0000-4000-8000-000000000002',true);
select public.save_client_injury_spot('cf100000-0000-4000-8000-000000000003',pg_temp.spot('cf300000-0000-4000-8000-000000000001','knee',0),false);
select public.save_client_injury_spot('cf100000-0000-4000-8000-000000000003',pg_temp.spot('cf300000-0000-4000-8000-000000000002','shoulder',null),false);
select pg_temp.assert_spot((select count(*)=2 from public.client_injury_spots),'Independent spots saved');
select pg_temp.assert_spot((select details->>'pain'='0' and details->'categories'?'surgery' from public.client_injury_spots where id='cf300000-0000-4000-8000-000000000001'),'Zero pain must preserve surgery');
select public.save_client_injury_spot('cf100000-0000-4000-8000-000000000003',pg_temp.spot('cf300000-0000-4000-8000-000000000001','knee',1),false);
select pg_temp.assert_spot((select details->'pain'='null'::jsonb and revision=1 from public.client_injury_spots where id='cf300000-0000-4000-8000-000000000002'),'Editing knee cannot overwrite unknown shoulder');
select pg_temp.assert_spot((select count(*)=3 from public.client_injury_spot_history),'Every successful save retains history');
do $$ begin
 begin perform public.save_client_injury_spot('cf100000-0000-4000-8000-000000000003',pg_temp.spot('cf300000-0000-4000-8000-000000000001','knee',11),false); raise exception 'Invalid pain accepted'; exception when others then if sqlerrm='Invalid pain accepted' then raise; end if; end;
 begin update public.client_injury_spots set details='{}'; raise exception 'Direct write accepted'; exception when insufficient_privilege then null; end;
end $$;
select set_config('request.jwt.claim.sub','cf100000-0000-4000-8000-000000000003',true);
select pg_temp.assert_spot((select count(*)=2 from public.client_injury_spots),'Client sees own history');
do $$ begin
 begin perform public.save_client_injury_spot('cf100000-0000-4000-8000-000000000003',pg_temp.spot('cf300000-0000-4000-8000-000000000003','knee',0),false); raise exception 'Client changed protected history'; exception when no_data_found then null; end;
end $$;
select set_config('request.jwt.claim.sub','cf100000-0000-4000-8000-000000000001',true);
select pg_temp.assert_spot((select count(*)=2 from public.client_injury_spots),'Own gym Owner oversight');
select set_config('request.jwt.claim.sub','cf100000-0000-4000-8000-000000000004',true);
select pg_temp.assert_spot((select count(*)=0 from public.client_injury_spots),'Other gym Owner cannot read');
select pg_temp.assert_spot((select count(*)=0 from public.client_injury_spot_history),'Other gym Owner cannot read historical medical details');
select set_config('request.jwt.claim.sub','cf100000-0000-4000-8000-000000000005',true);
do $$ begin
 begin perform public.save_client_injury_spot('cf100000-0000-4000-8000-000000000003',pg_temp.spot('cf300000-0000-4000-8000-000000000001','knee',0),false); raise exception 'Unassigned Coach edited'; exception when no_data_found then null; end;
end $$;
select set_config('request.jwt.claim.sub','cf100000-0000-4000-8000-000000000002',true);
select public.save_client_injury_spot('cf100000-0000-4000-8000-000000000003',jsonb_build_object('id','cf300000-0000-4000-8000-000000000001'),true);
select pg_temp.assert_spot((select count(*)=4 from public.client_injury_spot_history),'Removal preserves original surgical records');
reset role;
update public.organization_memberships set status='inactive' where organization_id='cf200000-0000-4000-8000-000000000001' and user_id='cf100000-0000-4000-8000-000000000002';
set local role authenticated;
select pg_temp.assert_spot((select count(*)=0 from public.client_injury_spots),'Inactive Coach loses access with existing identity');
select 'Injury spot history and ordinary-role RLS checks passed' as result;
rollback;
