-- Organization access removal only. Auth identities and historical training are retained.
create table public.member_access_removals (
 id uuid primary key default gen_random_uuid(),
 organization_id uuid not null references public.organizations(id) on delete restrict,
 membership_id uuid not null references public.organization_memberships(id) on delete restrict,
 member_user_id uuid not null references auth.users(id) on delete restrict,
 actor_user_id uuid not null references auth.users(id) on delete restrict,
 member_name text not null,
 member_role public.organization_role not null check(member_role in ('coach','client')),
 ended_assignment_ids uuid[] not null,
 created_at timestamptz not null default now()
);
create index member_access_removals_org_created_idx on public.member_access_removals(organization_id,created_at desc);
create index member_access_removals_membership_idx on public.member_access_removals(membership_id);
create index member_access_removals_member_idx on public.member_access_removals(member_user_id);
create index member_access_removals_actor_idx on public.member_access_removals(actor_user_id);
alter table public.member_access_removals enable row level security;
create policy member_access_removals_owner_read on public.member_access_removals for select to authenticated
 using ((select private.has_active_role(organization_id,array['owner']::public.organization_role[])));
revoke all on public.member_access_removals from anon,authenticated;
grant select on public.member_access_removals to authenticated;
-- Browser status writes must not bypass appointment/assignment resolution.
revoke update(status) on public.organization_memberships from authenticated;

create function private.member_removal_context(target_user_id uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare org uuid; target public.organization_memberships%rowtype;
begin
 select m.organization_id into org from public.organization_memberships m
 where m.user_id=auth.uid() and m.role='owner' and m.status='active';
 if org is null or not private.has_active_role(org,array['owner']::public.organization_role[]) then raise exception 'Owner access required' using errcode='42501'; end if;
 select * into target from public.organization_memberships m where m.organization_id=org and m.user_id=target_user_id and m.role in ('coach','client') and not m.is_primary_owner and m.user_id<>auth.uid();
 if not found then raise exception 'Coach or Client not available in this gym' using errcode='42501'; end if;
 return jsonb_build_object('name',(select full_name from public.profiles where id=target_user_id),'role',target.role,'status',target.status,
 'gym',(select name from public.organizations where id=org),
 'assignments',coalesce((select jsonb_agg(jsonb_build_object('id',a.id,'coach',cp.full_name,'client',p.full_name,'clientId',a.client_user_id) order by a.id)
 from public.coach_client_assignments a join public.profiles cp on cp.id=a.coach_user_id join public.profiles p on p.id=a.client_user_id
 where a.organization_id=org and a.status='active' and target_user_id in (a.coach_user_id,a.client_user_id)),'[]'::jsonb),
 'bookings',coalesce((select jsonb_agg(jsonb_build_object('id',b.id,'coachName',cp.full_name,'clientName',p.full_name,'clientUserId',b.client_user_id,'startsAt',b.starts_at,'endsAt',b.ends_at,'timezone',b.timezone,'status',b.status,'sessionType',b.session_type,'gymName',o.name) order by b.starts_at)
 from public.bookings b join public.profiles cp on cp.id=b.coach_user_id join public.profiles p on p.id=b.client_user_id join public.organizations o on o.id=b.organization_id
 where b.organization_id=org and b.status='scheduled' and b.ends_at>now() and target_user_id in (b.coach_user_id,b.client_user_id)),'[]'::jsonb));
end $$;
create function public.member_removal_context(target_user_id uuid) returns jsonb language sql security invoker set search_path='' as $$ select private.member_removal_context(target_user_id); $$;

-- Serialize new scheduled bookings/active assignments with membership removal.
-- The established schedule checks and collision constraints still run unchanged.
create function private.lock_training_member_access() returns trigger language plpgsql security definer set search_path='' as $$
declare matched integer;
begin
 if tg_table_name='bookings' then if new.status<>'scheduled' then return new; end if;
 else if new.status<>'active' then return new; end if; end if;
 perform m.id from public.organization_memberships m where m.organization_id=new.organization_id and m.user_id in (new.coach_user_id,new.client_user_id) order by m.user_id for share;
 select count(*) into matched from public.organization_memberships m join public.profiles p on p.id=m.user_id and p.account_status='active'
 where m.organization_id=new.organization_id and m.status='active' and ((m.user_id=new.coach_user_id and m.role='coach') or (m.user_id=new.client_user_id and m.role='client'));
 if matched<>2 then raise exception 'An active Coach and Client in this gym are required'; end if;
 return new;
end $$;
create trigger bookings_member_access_lock before insert or update on public.bookings for each row execute function private.lock_training_member_access();
create trigger assignments_member_access_lock before insert or update on public.coach_client_assignments for each row execute function private.lock_training_member_access();
revoke all on function private.lock_training_member_access() from public,anon,authenticated;

-- Ending an assignment is safe even if one partner was already inactivated by
-- an earlier administrative operation. Identity and FK constraints stay intact.
create or replace function private.enforce_assignment_membership_roles() returns trigger language plpgsql security definer set search_path='' as $$
begin
 if tg_op='UPDATE' and (new.organization_id<>old.organization_id or new.coach_user_id<>old.coach_user_id or new.client_user_id<>old.client_user_id) then raise exception 'Assignment identity is immutable'; end if;
 if tg_op='UPDATE' and new.status='inactive' then return new; end if;
 if not exists(select 1 from public.organization_memberships where organization_id=new.organization_id and user_id=new.coach_user_id and role='coach' and status='active') then raise exception 'Coach must have an active coach membership in the organization'; end if;
 if not exists(select 1 from public.organization_memberships where organization_id=new.organization_id and user_id=new.client_user_id and role='client' and status='active') then raise exception 'Client must have an active client membership in the organization'; end if;
 return new;
end $$;

create function private.remove_organization_member(target_user_id uuid,confirmed_assignment_ids uuid[]) returns boolean
language plpgsql security definer set search_path='' as $$
declare org uuid; target public.organization_memberships%rowtype; actual_ids uuid[]; supplied_ids uuid[];
begin
 select m.organization_id into org from public.organization_memberships m where m.user_id=auth.uid() and m.role='owner' and m.status='active' for share;
 if org is null or not private.has_active_role(org,array['owner']::public.organization_role[]) then raise exception 'Owner access required' using errcode='42501'; end if;
 select * into target from public.organization_memberships m where m.organization_id=org and m.user_id=target_user_id for update;
 if not found or target.role not in ('coach','client') or target.is_primary_owner or target.user_id=auth.uid() then raise exception 'Only another Coach or Client in this gym may be removed' using errcode='42501'; end if;
 if target.status='inactive' then return false; end if;
 if exists(select 1 from public.bookings b where b.organization_id=org and b.status='scheduled' and b.ends_at>now() and target_user_id in (b.coach_user_id,b.client_user_id)) then raise exception 'Resolve future or in-progress appointments before removing access' using errcode='22023'; end if;
 perform a.id from public.coach_client_assignments a where a.organization_id=org and a.status='active' and target_user_id in (a.coach_user_id,a.client_user_id) order by a.id for update;
 select coalesce(array_agg(a.id order by a.id),'{}'::uuid[]) into actual_ids from public.coach_client_assignments a where a.organization_id=org and a.status='active' and target_user_id in (a.coach_user_id,a.client_user_id);
 select coalesce(array_agg(id order by id),'{}'::uuid[]) into supplied_ids from unnest(confirmed_assignment_ids) id;
 if confirmed_assignment_ids is null or cardinality(confirmed_assignment_ids)>1000 or supplied_ids is distinct from actual_ids then raise exception 'Assignments changed. Review and explicitly confirm each affected assignment' using errcode='22023'; end if;
 update public.coach_client_assignments set status='inactive' where organization_id=org and id=any(actual_ids);
 update public.organization_memberships set status='inactive' where id=target.id;
 insert into public.member_access_removals(organization_id,membership_id,member_user_id,actor_user_id,member_name,member_role,ended_assignment_ids)
 select org,target.id,target_user_id,auth.uid(),p.full_name,target.role,actual_ids from public.profiles p where p.id=target_user_id;
 return true;
end $$;
create function public.remove_organization_member(target_user_id uuid,confirmed_assignment_ids uuid[]) returns boolean language sql security invoker set search_path='' as $$ select private.remove_organization_member(target_user_id,confirmed_assignment_ids); $$;
revoke all on function private.member_removal_context(uuid),public.member_removal_context(uuid),private.remove_organization_member(uuid,uuid[]),public.remove_organization_member(uuid,uuid[]) from public,anon;
grant execute on function private.member_removal_context(uuid),public.member_removal_context(uuid),private.remove_organization_member(uuid,uuid[]),public.remove_organization_member(uuid,uuid[]) to authenticated;
