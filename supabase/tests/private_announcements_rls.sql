begin;
insert into auth.users(id,aud,role,email,email_confirmed_at,raw_user_meta_data,created_at,updated_at)
select ('9b000000-0000-4000-8000-'||lpad(i::text,12,'0'))::uuid,'authenticated','authenticated','announce-'||i||'@example.test',case when i<>8 then now() end,jsonb_build_object('full_name','Announcement QA '||i),now(),now() from generate_series(1,8)i;
insert into public.organizations(id,name) values('9bb00000-0000-4000-8000-000000000001','Announcement Gym A'),('9bb00000-0000-4000-8000-000000000002','Announcement Gym B');
insert into public.organization_memberships(organization_id,user_id,role,status)
select case when i in(5,6) then '9bb00000-0000-4000-8000-000000000002'::uuid else '9bb00000-0000-4000-8000-000000000001'::uuid end,('9b000000-0000-4000-8000-'||lpad(i::text,12,'0'))::uuid,case when i in(1,5) then 'owner'::public.organization_role when i=2 then 'coach'::public.organization_role else 'client'::public.organization_role end,case when i=7 then 'inactive'::public.membership_status else 'active'::public.membership_status end from generate_series(1,8)i;
create temporary table announcement_qa_state(job uuid,claim jsonb);
grant select,insert,update on announcement_qa_state to authenticated;
set local role authenticated;
select set_config('request.jwt.claim.sub','9b000000-0000-4000-8000-000000000003',true);
select public.set_announcement_preference(true);
do $$ begin begin perform public.create_announcement_preview(gen_random_uuid(),'clients','Forbidden','Not an Owner','{}'); raise exception 'Client created announcement'; exception when insufficient_privilege then null; end; end $$;
select set_config('request.jwt.claim.sub','9b000000-0000-4000-8000-000000000002',true);
select public.set_announcement_preference(true);
do $$ begin begin perform public.owner_announcement_audience(); raise exception 'Coach read audience'; exception when insufficient_privilege then null; end; end $$;
select set_config('request.jwt.claim.sub','9b000000-0000-4000-8000-000000000007',true);
do $$ begin begin perform public.set_announcement_preference(true); raise exception 'Removed member opted in'; exception when insufficient_privilege then null; end; end $$;
select set_config('request.jwt.claim.sub','9b000000-0000-4000-8000-000000000001',true);
select public.set_announcement_preference(true);
do $$ declare j uuid; begin
 if (select count(*) from public.owner_announcement_audience())<>4 or (select count(*) from public.owner_announcement_audience() where opted_in)<>3 then raise exception 'Audience includes inactive, unconfirmed, foreign or non-consenting members'; end if;
 begin perform public.create_announcement_preview(gen_random_uuid(),'selected','Wrong gym','Hello',array['9b000000-0000-4000-8000-000000000006'::uuid]); raise exception 'Foreign recipient accepted'; exception when insufficient_privilege then null; end;
 begin perform public.create_announcement_preview(gen_random_uuid(),'selected','Duplicate','Hello',array[auth.uid(),auth.uid()]); raise exception 'Duplicate selection accepted'; exception when insufficient_privilege then null; end;
 begin perform public.create_announcement_preview(gen_random_uuid(),'clients','No private addresses','announce-3@example.test','{}'); raise exception 'Address list leaked into content'; exception when invalid_parameter_value then null; end;
 j:=public.create_announcement_preview('9bc00000-0000-4000-8000-000000000001','clients','Client news','Safe gym message','{}');
 if (select count(*) from public.announcement_recipients where announcement_id=j)<>1 then raise exception 'Client opt-in filtering failed'; end if;
 if public.create_announcement_preview('9bc00000-0000-4000-8000-000000000001','clients','Client news','Safe gym message','{}')<>j then raise exception 'Preview retry duplicated job'; end if;
 begin perform public.create_announcement_preview('9bc00000-0000-4000-8000-000000000001','clients','Changed','Different','{}'); raise exception 'Existing preview changed'; exception when invalid_parameter_value then null; end;
 insert into announcement_qa_state(job) values(j);
 begin perform public.queue_announcement(j,2); raise exception 'Wrong confirmation count accepted'; exception when invalid_parameter_value then null; end;
 begin update public.announcements set message='Tampered' where id=j; raise exception 'Direct message edit accepted'; exception when insufficient_privilege then null; end;
end $$;
-- A preference change between preview and confirmation invalidates the count.
select set_config('request.jwt.claim.sub','9b000000-0000-4000-8000-000000000003',true);
select public.set_announcement_preference(false);
select set_config('request.jwt.claim.sub','9b000000-0000-4000-8000-000000000001',true);
do $$ begin begin perform public.queue_announcement((select job from announcement_qa_state),1); raise exception 'Opted-out preview sent'; exception when invalid_parameter_value then null; end; end $$;
select set_config('request.jwt.claim.sub','9b000000-0000-4000-8000-000000000003',true);
select public.set_announcement_preference(true);
select set_config('request.jwt.claim.sub','9b000000-0000-4000-8000-000000000001',true);
select public.queue_announcement((select job from announcement_qa_state),1);
select public.queue_announcement((select job from announcement_qa_state),1);
-- A queued member is removed before dispatch: no claim/email is produced.
select public.remove_organization_member('9b000000-0000-4000-8000-000000000003','{}');
do $$ begin
 if public.claim_announcement_recipient((select job from announcement_qa_state)) is not null then raise exception 'Removed member dispatched'; end if;
 if (select count(*) from public.announcement_recipients where status='skipped')<>1 then raise exception 'Removed recipient not skipped'; end if;
 update announcement_qa_state set job=public.create_announcement_preview('9bc00000-0000-4000-8000-000000000002','team','Team news','Private team message','{}');
 perform public.queue_announcement((select job from announcement_qa_state),2);
 update announcement_qa_state set claim=public.claim_announcement_recipient(job);
 if (select claim->>'email' from announcement_qa_state) not in('announce-1@example.test','announce-2@example.test') then raise exception 'Team audience role leaked'; end if;
 perform public.finish_announcement_recipient((select (claim->>'id')::uuid from announcement_qa_state),(select (claim->>'lease')::uuid from announcement_qa_state),'accepted','9bd00000-0000-4000-8000-000000000001',null,60);
 if public.retry_announcement_failures((select job from announcement_qa_state))<>0 then raise exception 'Accepted email requeued'; end if;
 if exists(select 1 from public.announcement_recipients where delivered_at is not null) then raise exception 'API acceptance counted as delivery'; end if;
end $$;
-- Advance only the isolated fixture clock between ordinary request contexts.
reset role;
update private.announcement_dispatch_slot set lease_until=now()-interval '1 second';
set local role authenticated;
select set_config('request.jwt.claim.sub','9b000000-0000-4000-8000-000000000001',true);
do $$ begin
 update announcement_qa_state set claim=public.claim_announcement_recipient(job);
 perform public.finish_announcement_recipient((select (claim->>'id')::uuid from announcement_qa_state),(select (claim->>'lease')::uuid from announcement_qa_state),'failed',null,'provider_429',120);
 if public.retry_announcement_failures((select job from announcement_qa_state))<>0 then raise exception 'Provider backoff ignored'; end if;
 if (select count(*) from public.announcement_recipients where status='failed' and retryable)<>1 then raise exception 'Rate-limited recipient cannot retry'; end if;
 if public.claim_announcement_recipient((select job from announcement_qa_state))->>'busy' is distinct from 'true' then raise exception 'Global backoff ignored'; end if;
end $$;
reset role;
update private.announcement_dispatch_slot set lease_until=now()-interval '1 second';
update public.announcement_recipients set next_attempt_at=now()-interval '1 second' where status='failed' and organization_id='9bb00000-0000-4000-8000-000000000001';
set local role authenticated;
select set_config('request.jwt.claim.sub','9b000000-0000-4000-8000-000000000001',true);
do $$ declare prior jsonb; begin
 if public.retry_announcement_failures((select job from announcement_qa_state))<>1 then raise exception 'Only failed recipient must retry'; end if;
 prior:=(select claim from announcement_qa_state);
 update announcement_qa_state set claim=public.claim_announcement_recipient(job);
 if (select claim->>'id' from announcement_qa_state)<>prior->>'id' or (select claim->>'unsubscribeToken' from announcement_qa_state)<>prior->>'unsubscribeToken' then raise exception 'Retry changed immutable recipient identity'; end if;
 perform public.finish_announcement_recipient((select (claim->>'id')::uuid from announcement_qa_state),(select (claim->>'lease')::uuid from announcement_qa_state),'accepted','9bd00000-0000-4000-8000-000000000002',null,60);
 perform public.record_announcement_delivery((select (claim->>'id')::uuid from announcement_qa_state),'sent');
 if exists(select 1 from public.announcement_recipients where delivered_at is not null) then raise exception 'Unconfirmed delivery reported'; end if;
 perform public.record_announcement_delivery((select (claim->>'id')::uuid from announcement_qa_state),'delivered');
 if (select count(*) from public.announcement_recipients where accepted_at is not null)<>2 or (select count(*) from public.announcement_recipients where delivered_at is not null)<>1 then raise exception 'Provider status counts wrong'; end if;
 begin update public.announcement_recipients set status='queued'; raise exception 'Direct resend bypass'; exception when insufficient_privilege then null; end;
end $$;
-- Anonymous opt-out can only reduce consent for the unguessable link's member.
reset role;
select set_config('test.announcement_unsubscribe',(select claim->>'unsubscribeToken' from announcement_qa_state),true);
set local role anon;
select public.unsubscribe_announcement(current_setting('test.announcement_unsubscribe'));
do $$ begin begin perform public.unsubscribe_announcement(repeat('f',64)); raise exception 'Forged opt-out accepted'; exception when invalid_parameter_value then null; end; end $$;
reset role;set local role authenticated;
select set_config('request.jwt.claim.sub','9b000000-0000-4000-8000-000000000005',true);
do $$ begin
 if exists(select 1 from public.announcements) or exists(select 1 from public.announcement_recipients) then raise exception 'Other gym announcement data exposed'; end if;
 begin perform public.queue_announcement((select job from announcement_qa_state),2); raise exception 'Foreign job queued'; exception when insufficient_privilege then null; end;
end $$;
select set_config('request.jwt.claim.sub','9b000000-0000-4000-8000-000000000002',true);
do $$ begin if exists(select 1 from public.announcements) or exists(select 1 from public.announcement_recipients) then raise exception 'Coach read Owner announcement data'; end if; end $$;
reset role;
do $$ begin
 if not exists(select 1 from public.announcement_preferences a join announcement_qa_state s on a.email=s.claim->>'email' where not a.opted_in) then raise exception 'Unsubscribe did not reduce consent'; end if;
 if (select count(*) from auth.users where id::text like '9b000000-%')<>8 then raise exception 'Announcement flow changed Auth identities'; end if;
 if has_function_privilege('anon','public.queue_announcement(uuid,integer)','execute') or has_function_privilege('anon','public.claim_announcement_recipient(uuid)','execute') then raise exception 'Anonymous dispatch exposed'; end if;
 if has_schema_privilege('anon','private','usage') then raise exception 'Anonymous private schema access expanded'; end if;
end $$;
rollback;
