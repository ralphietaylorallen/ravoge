-- Announcements are opt-in. An invitation never grants promotional consent.
create table public.announcement_preferences (
 organization_id uuid not null references public.organizations(id) on delete cascade,
 user_id uuid not null references auth.users(id) on delete restrict,
 email text not null,
 opted_in boolean not null default false,
 updated_at timestamptz not null default now(),
 primary key(organization_id,user_id),
 foreign key(organization_id,user_id) references public.organization_memberships(organization_id,user_id) on delete restrict
);
create index announcement_preferences_user_idx on public.announcement_preferences(user_id);
alter table public.announcement_preferences enable row level security;
create policy announcement_preferences_self_read on public.announcement_preferences for select to authenticated using(user_id=(select auth.uid()));
revoke all on public.announcement_preferences from anon,authenticated;
grant select on public.announcement_preferences to authenticated;

create table public.announcements (
 id uuid primary key default gen_random_uuid(),
 organization_id uuid not null references public.organizations(id) on delete cascade,
 created_by uuid not null references auth.users(id) on delete restrict,
 request_id uuid not null,
 audience text not null check(audience in ('clients','team','selected')),
 requested_users uuid[] not null default '{}',
 subject text not null check(char_length(subject) between 1 and 160 and subject !~ E'[\r\n]'),
 message text not null check(char_length(message) between 1 and 10000),
 gym_name text not null,
 status text not null default 'preview' check(status in ('preview','queued')),
 created_at timestamptz not null default now(),
 confirmed_at timestamptz,
 unique(organization_id,request_id), unique(id,organization_id)
);
create index announcements_owner_idx on public.announcements(created_by);
create index announcements_org_created_idx on public.announcements(organization_id,created_at desc);
alter table public.announcements enable row level security;
create policy announcements_owner_read on public.announcements for select to authenticated using((select private.has_active_role(organization_id,array['owner']::public.organization_role[])));
revoke all on public.announcements from anon,authenticated;
grant select on public.announcements to authenticated;

create table public.announcement_recipients (
 id uuid primary key default gen_random_uuid(),
 announcement_id uuid not null references public.announcements(id) on delete cascade,
 organization_id uuid not null references public.organizations(id) on delete cascade,
 user_id uuid not null references auth.users(id) on delete restrict,
 email text not null check(email=lower(trim(email)) and char_length(email)<=320),
 member_role public.organization_role not null,
 status text not null default 'draft' check(status in ('draft','queued','processing','accepted','delivered','failed','unconfirmed','skipped')),
 unsubscribe_token text not null default encode(extensions.gen_random_bytes(32),'hex') unique,
 lease_token uuid,
 lease_until timestamptz,
 attempts integer not null default 0,
 first_attempt_at timestamptz,
 next_attempt_at timestamptz not null default now(),
 provider_id text,
 accepted_at timestamptz,
 delivered_at timestamptz,
 provider_checked_at timestamptz,
 retryable boolean not null default false,
 error_code text check(char_length(error_code)<=120),
 created_at timestamptz not null default now(),
 unique(announcement_id,email),
 foreign key(announcement_id,organization_id) references public.announcements(id,organization_id) on delete cascade,
 foreign key(organization_id,user_id) references public.organization_memberships(organization_id,user_id) on delete restrict
);
create index announcement_recipients_org_job_idx on public.announcement_recipients(organization_id,announcement_id,status);
create index announcement_recipients_user_idx on public.announcement_recipients(user_id);
create index announcement_recipients_job_status_idx on public.announcement_recipients(announcement_id,status,next_attempt_at);
alter table public.announcement_recipients enable row level security;
create policy announcement_recipients_owner_read on public.announcement_recipients for select to authenticated using((select private.has_active_role(organization_id,array['owner']::public.organization_role[])));
revoke all on public.announcement_recipients from anon,authenticated;
grant select(id,announcement_id,organization_id,user_id,email,member_role,status,attempts,provider_id,accepted_at,delivered_at,provider_checked_at,retryable,error_code,created_at,first_attempt_at,next_attempt_at,lease_until) on public.announcement_recipients to authenticated;

-- One in-flight announcement dispatch across gyms limits this narrow email flow.
-- It is not a general task runner and stores no API key or Auth token.
create table private.announcement_dispatch_slot (id boolean primary key default true check(id),recipient_id uuid,lease_until timestamptz not null default now());
insert into private.announcement_dispatch_slot(id) values(true);
alter table private.announcement_dispatch_slot enable row level security;
revoke all on private.announcement_dispatch_slot from public,anon,authenticated;

create function private.announcement_owner_org() returns uuid language plpgsql security definer set search_path='' as $$
declare org uuid; begin
 select m.organization_id into org from public.organization_memberships m where m.user_id=auth.uid() and m.role='owner' and m.status='active';
 if org is null or not private.has_active_role(org,array['owner']::public.organization_role[]) then raise exception 'Owner access required' using errcode='42501'; end if;
 return org;
end $$;
revoke all on function private.announcement_owner_org() from public,anon,authenticated;

create function private.owner_announcement_audience() returns table(user_id uuid,name text,email text,role public.organization_role,opted_in boolean)
language sql stable security definer set search_path='' as $$
 select m.user_id,p.full_name,lower(trim(u.email)),m.role,coalesce(a.opted_in and a.email=lower(trim(u.email)),false)
 from public.organization_memberships m join public.profiles p on p.id=m.user_id and p.account_status='active'
 join auth.users u on u.id=m.user_id and u.email_confirmed_at is not null
 left join public.announcement_preferences a on a.organization_id=m.organization_id and a.user_id=m.user_id
 where m.organization_id=private.announcement_owner_org() and m.status='active' and u.email is not null
 order by p.full_name,m.user_id;
$$;
create function public.owner_announcement_audience() returns table(user_id uuid,name text,email text,role public.organization_role,opted_in boolean)
language sql security invoker set search_path='' as $$ select * from private.owner_announcement_audience(); $$;

create function private.set_announcement_preference(allow_announcements boolean) returns void language plpgsql security definer set search_path='' as $$
declare org uuid; address text; begin
 select m.organization_id,lower(trim(u.email)) into org,address from public.organization_memberships m join auth.users u on u.id=m.user_id and u.email_confirmed_at is not null
 where m.user_id=auth.uid() and m.status='active';
 if org is null or allow_announcements is null or not private.has_active_role(org,array['owner','coach','client']::public.organization_role[]) then raise exception 'Active membership required' using errcode='42501'; end if;
 insert into public.announcement_preferences(organization_id,user_id,email,opted_in) values(org,auth.uid(),address,allow_announcements)
 on conflict(organization_id,user_id) do update set email=excluded.email,opted_in=excluded.opted_in,updated_at=now();
end $$;
create function public.set_announcement_preference(allow_announcements boolean) returns void language sql security invoker set search_path='' as $$ select private.set_announcement_preference(allow_announcements); $$;

create function private.announcement_recipient_eligible(recipient_id uuid) returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.announcement_recipients r join public.organization_memberships m on m.organization_id=r.organization_id and m.user_id=r.user_id and m.status='active' and m.role=r.member_role
 join public.profiles p on p.id=r.user_id and p.account_status='active'
 join public.organizations o on o.id=r.organization_id and o.status='active'
 join auth.users u on u.id=r.user_id and u.email_confirmed_at is not null and lower(trim(u.email))=r.email
 join public.announcement_preferences a on a.organization_id=r.organization_id and a.user_id=r.user_id and a.opted_in and a.email=r.email
 where r.id=recipient_id);
$$;
revoke all on function private.announcement_recipient_eligible(uuid) from public,anon,authenticated;

create function private.create_announcement_preview(request_nonce uuid,audience_kind text,announcement_subject text,announcement_message text,selected_user_ids uuid[]) returns uuid
language plpgsql security definer set search_path='' as $$
declare org uuid:=private.announcement_owner_org(); existing public.announcements%rowtype; job uuid;
begin
 if request_nonce is null or audience_kind not in ('clients','team','selected') or audience_kind is null or char_length(trim(announcement_subject)) not between 1 and 160 or announcement_subject~E'[\r\n]' or char_length(trim(announcement_message)) not between 1 and 10000 or announcement_subject is null or announcement_message is null then raise exception 'Enter an audience, subject and message' using errcode='22023'; end if;
 select * into existing from public.announcements where organization_id=org and request_id=request_nonce;
 if found then
  if existing.created_by<>auth.uid() or existing.subject<>trim(announcement_subject) or existing.message<>trim(announcement_message) or existing.audience<>audience_kind or existing.requested_users is distinct from coalesce(selected_user_ids,'{}'::uuid[]) then raise exception 'Preview request changed. Start a new preview' using errcode='22023'; end if;
  return existing.id;
 end if;
 if (select count(*) from public.announcements where organization_id=org and created_at>now()-interval '5 minutes')>=30 then raise exception 'Please wait before creating another preview' using errcode='22023'; end if;
 if audience_kind='selected' and (selected_user_ids is null or cardinality(selected_user_ids) not between 1 and 500 or (select count(*) from public.organization_memberships where organization_id=org and user_id=any(selected_user_ids) and status='active')<>cardinality(selected_user_ids)) then raise exception 'Select different active members in this gym' using errcode='42501'; end if;
 -- A plain announcement must not embed the selected audience's private addresses.
 if exists(select 1 from private.owner_announcement_audience() a where a.opted_in and ((audience_kind='clients' and a.role='client') or (audience_kind='team' and a.role in ('owner','coach')) or (audience_kind='selected' and a.user_id=any(selected_user_ids))) and position(a.email in lower(announcement_subject||' '||announcement_message))>0) then raise exception 'Remove recipient email addresses from the subject and message' using errcode='22023'; end if;
 insert into public.announcements(organization_id,created_by,request_id,audience,requested_users,subject,message,gym_name) values(org,auth.uid(),request_nonce,audience_kind,coalesce(selected_user_ids,'{}'::uuid[]),trim(announcement_subject),trim(announcement_message),(select name from public.organizations where id=org)) returning id into job;
 insert into public.announcement_recipients(announcement_id,organization_id,user_id,email,member_role)
 select distinct on(a.email) job,org,a.user_id,a.email,a.role from private.owner_announcement_audience() a where a.opted_in and ((audience_kind='clients' and a.role='client') or (audience_kind='team' and a.role in ('owner','coach')) or (audience_kind='selected' and a.user_id=any(selected_user_ids))) order by a.email,a.user_id;
 if (select count(*) from public.announcement_recipients where announcement_id=job) not between 1 and 500 then raise exception 'No eligible opted-in recipients, or audience exceeds 500' using errcode='22023'; end if;
 return job;
end $$;
create function public.create_announcement_preview(request_nonce uuid,audience_kind text,announcement_subject text,announcement_message text,selected_user_ids uuid[]) returns uuid language sql security invoker set search_path='' as $$ select private.create_announcement_preview(request_nonce,audience_kind,announcement_subject,announcement_message,selected_user_ids); $$;

create function private.queue_announcement(job_id uuid,expected_count integer) returns void language plpgsql security definer set search_path='' as $$
declare org uuid:=private.announcement_owner_org(); job public.announcements%rowtype; total integer;
begin
 select * into job from public.announcements where id=job_id and organization_id=org for update;
 if not found then raise exception 'Announcement not available' using errcode='42501'; end if;
 if job.status='queued' then return; end if;
 select count(*) into total from public.announcement_recipients where announcement_id=job_id;
 if expected_count is distinct from total or exists(select 1 from public.announcement_recipients r where r.announcement_id=job_id and not private.announcement_recipient_eligible(r.id)) then raise exception 'Audience changed. Create a new preview and confirm its count' using errcode='22023'; end if;
 update public.announcement_recipients set status='queued' where announcement_id=job_id and status='draft';
 update public.announcements set status='queued',confirmed_at=now() where id=job_id;
end $$;
create function public.queue_announcement(job_id uuid,expected_count integer) returns void language sql security invoker set search_path='' as $$ select private.queue_announcement(job_id,expected_count); $$;

create function private.claim_announcement_recipient(job_id uuid) returns jsonb language plpgsql security definer set search_path='' as $$
declare org uuid:=private.announcement_owner_org(); r public.announcement_recipients%rowtype; job public.announcements%rowtype; slot private.announcement_dispatch_slot%rowtype;
begin
 select * into job from public.announcements where id=job_id and organization_id=org and status='queued';
 if not found then raise exception 'Confirmed announcement not available' using errcode='42501'; end if;
 select * into slot from private.announcement_dispatch_slot where id for update;
 if slot.lease_until>now() then return jsonb_build_object('busy',true); end if;
 -- A lost HTTP response is unconfirmed, not failed or delivered. It needs a
 -- targeted, idempotent retry, never an automatic whole-audience resend.
 update public.announcement_recipients set status='unconfirmed',retryable=first_attempt_at>now()-interval '23 hours' and attempts<5,error_code='interrupted_unconfirmed'
 where announcement_id=job_id and status='processing' and lease_until<=now();
 update public.announcement_recipients set status='skipped',retryable=false,error_code='access_or_preference_changed'
 where announcement_id=job_id and status='queued' and not private.announcement_recipient_eligible(id);
 select * into r from public.announcement_recipients where announcement_id=job_id and status='queued' and next_attempt_at<=now() order by created_at,id limit 1 for update;
 if not found then return null; end if;
 if r.attempts>=5 or (r.first_attempt_at is not null and r.first_attempt_at<=now()-interval '23 hours') then
  update public.announcement_recipients set status='unconfirmed',retryable=false,error_code='safe_retry_window_closed' where id=r.id;
  return jsonb_build_object('busy',true);
 end if;
 -- Recheck active membership under a shared lock, serialized with removal.
 perform m.id from public.organization_memberships m where m.organization_id=org and m.user_id=r.user_id for share;
 if not private.announcement_recipient_eligible(r.id) then update public.announcement_recipients set status='skipped',error_code='access_or_preference_changed' where id=r.id; return jsonb_build_object('busy',true); end if;
 r.lease_token:=gen_random_uuid();
 update public.announcement_recipients set status='processing',attempts=attempts+1,first_attempt_at=coalesce(first_attempt_at,now()),lease_token=r.lease_token,lease_until=now()+interval '2 minutes',retryable=false,error_code=null where id=r.id;
 update private.announcement_dispatch_slot set recipient_id=r.id,lease_until=now()+interval '2 minutes' where id;
 return jsonb_build_object('id',r.id,'lease',r.lease_token,'email',r.email,'subject',job.subject,'message',job.message,'unsubscribeToken',r.unsubscribe_token,'gym',job.gym_name);
end $$;
create function public.claim_announcement_recipient(job_id uuid) returns jsonb language sql security invoker set search_path='' as $$ select private.claim_announcement_recipient(job_id); $$;

create function private.announcement_dispatch_eligible(recipient_id uuid,claim_token uuid) returns boolean language plpgsql security definer set search_path='' as $$
declare org uuid:=private.announcement_owner_org(); begin
 return exists(select 1 from public.announcement_recipients r where r.id=recipient_id and r.organization_id=org and r.status='processing' and r.lease_token=claim_token and r.lease_until>now() and private.announcement_recipient_eligible(r.id));
end $$;
create function public.announcement_dispatch_eligible(recipient_id uuid,claim_token uuid) returns boolean language sql security invoker set search_path='' as $$ select private.announcement_dispatch_eligible(recipient_id,claim_token); $$;

create function private.finish_announcement_recipient(recipient_id uuid,claim_token uuid,result_status text,provider_message_id text,result_code text,retry_after_seconds integer default 60) returns void language plpgsql security definer set search_path='' as $$
declare org uuid:=private.announcement_owner_org(); r public.announcement_recipients%rowtype;
begin
 if result_status not in ('accepted','failed','unconfirmed','skipped') or result_status is null or char_length(coalesce(result_code,''))>120 or retry_after_seconds is null or retry_after_seconds not between 1 and 86400 then raise exception 'Invalid dispatch result' using errcode='22023'; end if;
 if result_status='accepted' and (provider_message_id is null or provider_message_id !~ '^[0-9a-fA-F-]{36}$') then raise exception 'Provider acceptance ID required' using errcode='22023'; end if;
 perform 1 from private.announcement_dispatch_slot where id for update;
 select * into r from public.announcement_recipients where id=recipient_id and organization_id=org for update;
 if not found then raise exception 'Recipient not available' using errcode='42501'; end if;
 if r.lease_token is distinct from claim_token or r.status not in ('processing','unconfirmed') then return; end if;
 update public.announcement_recipients set status=result_status,provider_id=case when result_status='accepted' then provider_message_id else provider_id end,
 accepted_at=case when result_status='accepted' then coalesce(accepted_at,now()) else accepted_at end,
 retryable=result_status in ('failed','unconfirmed') and (result_code in ('provider_401','provider_403','provider_429','provider_5xx','network_unconfirmed','response_unconfirmed','not_configured','preflight_unconfirmed') or result_code ~ '^(suppression_check|preference_check)_(401|403|429|5[0-9]{2})$') and attempts<5 and first_attempt_at>now()-interval '23 hours',
 error_code=result_code,lease_until=null,next_attempt_at=now()+make_interval(secs=>retry_after_seconds) where id=r.id;
 update private.announcement_dispatch_slot s set recipient_id=null,lease_until=now()+make_interval(secs=>case when result_code ~ '_429$' then retry_after_seconds else 1 end) where s.id and s.recipient_id=r.id;
 if result_status='skipped' and result_code in ('suppressed','unsubscribed') then update public.announcement_preferences set opted_in=false,updated_at=now() where organization_id=org and user_id=r.user_id and email=r.email; end if;
end $$;
create function public.finish_announcement_recipient(recipient_id uuid,claim_token uuid,result_status text,provider_message_id text,result_code text,retry_after_seconds integer default 60) returns void language sql security invoker set search_path='' as $$ select private.finish_announcement_recipient(recipient_id,claim_token,result_status,provider_message_id,result_code,retry_after_seconds); $$;

create function private.retry_announcement_failures(job_id uuid) returns integer language plpgsql security definer set search_path='' as $$
declare org uuid:=private.announcement_owner_org(); changed integer;
begin
 if not exists(select 1 from public.announcements where id=job_id and organization_id=org and status='queued') then raise exception 'Announcement unavailable' using errcode='42501'; end if;
 update public.announcement_recipients set status='unconfirmed',error_code='interrupted_unconfirmed',retryable=first_attempt_at>now()-interval '23 hours' and attempts<5 where announcement_id=job_id and status='processing' and lease_until<=now();
 update public.announcement_recipients set status='queued' where announcement_id=job_id and status in ('failed','unconfirmed') and retryable and first_attempt_at>now()-interval '23 hours' and next_attempt_at<=now() and attempts<5;
 get diagnostics changed=row_count;
 return changed;
end $$;
create function public.retry_announcement_failures(job_id uuid) returns integer language sql security invoker set search_path='' as $$ select private.retry_announcement_failures(job_id); $$;

create function private.record_announcement_delivery(recipient_id uuid,provider_event text) returns void language plpgsql security definer set search_path='' as $$
declare org uuid:=private.announcement_owner_org(); r public.announcement_recipients%rowtype;
begin
 select * into r from public.announcement_recipients where id=recipient_id and organization_id=org and provider_id is not null for update;
 if not found then raise exception 'Accepted recipient unavailable' using errcode='42501'; end if;
 update public.announcement_recipients set provider_checked_at=now() where id=r.id;
 if provider_event in ('delivered','opened','clicked') then
  update public.announcement_recipients set status='delivered',delivered_at=coalesce(delivered_at,now()),retryable=false,error_code=null where id=r.id and status in ('accepted','delivered');
 elsif provider_event in ('bounced','complained','suppressed','failed') then
  update public.announcement_recipients set status='failed',retryable=false,error_code='provider_'||provider_event where id=r.id;
  if provider_event in ('bounced','complained','suppressed') then update public.announcement_preferences set opted_in=false,updated_at=now() where organization_id=org and user_id=r.user_id and email=r.email; end if;
 end if;
end $$;
create function public.record_announcement_delivery(recipient_id uuid,provider_event text) returns void language sql security invoker set search_path='' as $$ select private.record_announcement_delivery(recipient_id,provider_event); $$;

create function private.unsubscribe_announcement(opaque_token text) returns void language plpgsql security definer set search_path='' as $$
declare r public.announcement_recipients%rowtype;
begin
 if opaque_token is null or opaque_token !~ '^[0-9a-f]{64}$' then raise exception 'Invalid unsubscribe link' using errcode='22023'; end if;
 select * into r from public.announcement_recipients where unsubscribe_token=opaque_token;
 if not found then raise exception 'Invalid unsubscribe link' using errcode='22023'; end if;
 update public.announcement_preferences set opted_in=false,updated_at=now() where organization_id=r.organization_id and user_id=r.user_id and email=r.email;
end $$;
-- Public opt-out is intentionally token-authorized and can only reduce consent.
-- Keep anon out of the private schema and every other privileged helper.
create function public.unsubscribe_announcement(opaque_token text) returns void language sql security definer set search_path='' as $$ select private.unsubscribe_announcement(opaque_token); $$;

-- New RPCs are session-checked, with non-exposed definers and invoker wrappers.
do $$ declare f record; begin
 for f in select p.oid::regprocedure as signature from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname in ('public','private') and p.proname in ('owner_announcement_audience','set_announcement_preference','create_announcement_preview','queue_announcement','claim_announcement_recipient','announcement_dispatch_eligible','finish_announcement_recipient','retry_announcement_failures','record_announcement_delivery','unsubscribe_announcement') loop
  execute format('revoke all on function %s from public,anon,authenticated',f.signature);
  execute format('grant execute on function %s to authenticated',f.signature);
 end loop;
end $$;
grant execute on function public.unsubscribe_announcement(text) to anon;
