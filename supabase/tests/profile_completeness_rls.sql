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
select set_config('request.jwt.claim.sub','81000000-0000-0000-0000-000000000002',true);
select public.update_own_profile('{"fullName":"Coach Updated","preferredName":"Coach U","bio":"Strength and movement coach.","specialties":["Strength","Mobility"],"yearsCoaching":8,"avatarPath":"8a000000-0000-0000-0000-000000000001/81000000-0000-0000-0000-000000000002/avatar.jpg"}'::jsonb);
insert into public.coach_certifications (organization_id,coach_user_id,certification_name,issuing_organization,credential_number,issue_date,expiration_date)
values ('8a000000-0000-0000-0000-000000000001','81000000-0000-0000-0000-000000000002','Certified Strength Coach','Test Institute','CERT-1','2025-01-01','2028-01-01');
insert into storage.objects (bucket_id,name,metadata) values
('profile-images','8a000000-0000-0000-0000-000000000001/81000000-0000-0000-0000-000000000002/avatar.jpg','{"mimetype":"image/jpeg","size":1024}');
do $$ begin
  if (select full_name from public.profiles where id='81000000-0000-0000-0000-000000000002') <> 'Coach Updated' then raise exception 'Coach could not edit own profile'; end if;
  if not private.can_write_profile_asset('8a000000-0000-0000-0000-000000000001/81000000-0000-0000-0000-000000000002/avatar.jpg') then raise exception 'Coach cannot write own scoped photo'; end if;
  if private.can_write_profile_asset('8a000000-0000-0000-0000-000000000001/81000000-0000-0000-0000-000000000004/avatar.jpg') then raise exception 'Coach can write another Coach photo'; end if;
  begin insert into storage.objects (bucket_id,name,metadata) values ('profile-images','8a000000-0000-0000-0000-000000000001/81000000-0000-0000-0000-000000000004/avatar.jpg','{"mimetype":"image/jpeg","size":1024}'); raise exception 'Coach uploaded another Coach photo'; exception when insufficient_privilege then null; when raise_exception then if sqlerrm='Coach uploaded another Coach photo' then raise; end if; end;
  begin update public.profiles set full_name='Tampered' where id='81000000-0000-0000-0000-000000000004'; raise exception 'Coach edited another Coach'; exception when insufficient_privilege then null; when raise_exception then if sqlerrm='Coach edited another Coach' then raise; end if; end;
  begin insert into public.coach_certifications (organization_id,coach_user_id,certification_name,issuing_organization) values ('8b000000-0000-0000-0000-000000000001','82000000-0000-0000-0000-000000000002','Cross Org','Bad'); raise exception 'Coach inserted cross-organization certification'; exception when insufficient_privilege or raise_exception then if sqlerrm='Coach inserted cross-organization certification' then raise; end if; end;
end $$;

reset role; set local role authenticated;
select set_config('request.jwt.claim.sub','81000000-0000-0000-0000-000000000003',true);
select public.update_own_profile('{"fullName":"Client Updated","preferredName":"Client Preferred","bio":"Training consistently.","avatarPath":"8a000000-0000-0000-0000-000000000001/81000000-0000-0000-0000-000000000003/avatar.webp"}'::jsonb);
do $$ begin
  if (select preferred_name from public.profiles where id='81000000-0000-0000-0000-000000000003') <> 'Client Preferred' then raise exception 'Client could not update allowed fields'; end if;
  if (select full_name from public.profiles where id='81000000-0000-0000-0000-000000000003') <> 'Client Updated' then raise exception 'Client could not update base full name'; end if;
  begin perform public.update_own_profile('{"accountType":"owner"}'::jsonb); raise exception 'Client changed a protected profile field'; exception when raise_exception then if sqlerrm='Client changed a protected profile field' then raise; end if; end;
  if exists (select 1 from public.profiles where id='82000000-0000-0000-0000-000000000002') then raise exception 'Client can read another organization profile'; end if;
  if not private.can_read_profile_asset('8a000000-0000-0000-0000-000000000001/81000000-0000-0000-0000-000000000002/avatar.jpg') then raise exception 'Assigned Client cannot read Coach photo'; end if;
end $$;

reset role; set local role authenticated;
select set_config('request.jwt.claim.sub','81000000-0000-0000-0000-000000000001',true);
do $$ begin
  if not exists (select 1 from public.coach_certifications where coach_user_id='81000000-0000-0000-0000-000000000002') then raise exception 'Owner cannot view own-organization Coach certifications'; end if;
  if exists (select 1 from public.profiles where id='82000000-0000-0000-0000-000000000002') then raise exception 'Owner can view cross-organization Coach'; end if;
  if exists (select 1 from storage.objects where name='8b000000-0000-0000-0000-000000000001/82000000-0000-0000-0000-000000000002/avatar.jpg') then raise exception 'Owner can read cross-organization profile photo'; end if;
end $$;

rollback;
