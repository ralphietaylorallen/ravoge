-- Photo-only permissions. No profile, intake, membership or source data is backfilled.
alter table public.profiles drop constraint profiles_avatar_path_check;
alter table public.profiles add constraint profiles_avatar_path_check check (
  avatar_path is null or avatar_path ~ '^[0-9a-f-]{36}/[0-9a-f-]{36}/avatar(\.(jpg|png|webp)|/[0-9a-f-]{36}\.webp|/v2-[0-9a-f-]{36}\.webp)$'
);

create function private.can_manage_profile_photo(org uuid, target uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select (select auth.uid()) is not null and exists (
    select 1 from public.profiles p where p.id=target and p.account_status='active'
  ) and case when org='00000000-0000-0000-0000-000000000000'::uuid then
    target=(select auth.uid()) and exists(select 1 from public.profiles p where p.id=target and p.account_type in ('coach','client'))
    and not exists(select 1 from public.organization_memberships m where m.user_id=target and m.status='active')
  else exists (
    select 1 from public.organization_memberships target_member
    where target_member.organization_id=org and target_member.user_id=target and target_member.status='active'
      and (
        (target=(select auth.uid()) and private.has_active_role(org,array['owner','coach','client']::public.organization_role[]))
        or (target_member.role='client' and private.has_active_role(org,array['owner','coach']::public.organization_role[]))
        or (target_member.role='coach' and private.has_active_role(org,array['owner']::public.organization_role[]))
      )
  ) end;
$$;

create or replace function private.can_write_profile_asset(asset_name text)
returns boolean language plpgsql stable security definer set search_path = '' as $$
begin
  if asset_name !~ '^[0-9a-f-]{36}/[0-9a-f-]{36}/avatar(\.(jpg|png|webp)|/[0-9a-f-]{36}\.webp|/v2-[0-9a-f-]{36}(-thumb)?\.webp)$' then return false; end if;
  return private.can_manage_profile_photo(split_part(asset_name,'/',1)::uuid,split_part(asset_name,'/',2)::uuid);
exception when invalid_text_representation then return false;
end;
$$;

create or replace function private.can_read_profile_asset(asset_name text)
returns boolean language plpgsql stable security definer set search_path = '' as $$
declare org uuid; target uuid;
begin
  if asset_name !~ '^[0-9a-f-]{36}/[0-9a-f-]{36}/avatar(\.(jpg|png|webp)|/[0-9a-f-]{36}\.webp|/v2-[0-9a-f-]{36}(-thumb)?\.webp)$' then return false; end if;
  org:=split_part(asset_name,'/',1)::uuid; target:=split_part(asset_name,'/',2)::uuid;
  if org='00000000-0000-0000-0000-000000000000'::uuid then return private.can_view_profile(target); end if;
  return exists (
    select 1 from public.organization_memberships m join public.profiles p on p.id=m.user_id
    join public.organizations o on o.id=m.organization_id
    where m.organization_id=org and m.user_id=target and m.status='active' and p.account_status='active' and o.status='active'
      and (
        private.can_manage_profile_photo(org,target)
        or (m.role='coach' and private.has_active_role(org,array['coach']::public.organization_role[]))
        or (private.can_view_profile(target) and private.has_active_role(org,array['owner','coach','client']::public.organization_role[]))
      )
  );
exception when invalid_text_representation then return false;
end;
$$;

-- Protect the currently referenced original and thumbnail from direct deletion/upsert.
-- Replacement uploads are immutable: upload new -> CAS pointer -> remove old.
create function private.can_remove_profile_asset(asset_name text)
returns boolean language sql stable security definer set search_path = '' as $$
  select private.can_write_profile_asset(asset_name) and not exists (
    select 1 from public.profiles p where p.avatar_path=asset_name
      or p.avatar_path=regexp_replace(asset_name,'-thumb\.webp$','.webp')
  );
$$;
create index profiles_avatar_path_idx on public.profiles(avatar_path) where avatar_path is not null;
alter policy profile_images_delete_self on storage.objects using (
  bucket_id='profile-images' and (select private.can_remove_profile_asset(name))
);
alter policy profile_images_update_self on storage.objects
  using (bucket_id='profile-images' and (select private.can_remove_profile_asset(name)))
  with check (bucket_id='profile-images' and (select private.can_remove_profile_asset(name)));

create function public.get_profile_photo_edit_context(target_user_id uuid, target_organization_id uuid)
returns table(avatar_path text) language plpgsql stable security definer set search_path = '' as $$
begin
  if not private.can_manage_profile_photo(target_organization_id,target_user_id) then raise exception 'Profile photo is not available'; end if;
  return query select p.avatar_path from public.profiles p where p.id=target_user_id;
end;
$$;

create function public.set_managed_profile_photo(target_user_id uuid,target_organization_id uuid,new_asset_path text,expected_asset_path text)
returns void language plpgsql security definer set search_path = '' as $$
declare previous_path text; thumbnail_path text;
begin
  if not private.can_manage_profile_photo(target_organization_id,target_user_id) then raise exception 'Profile photo is not available'; end if;
  select p.avatar_path into strict previous_path from public.profiles p where p.id=target_user_id for update;
  if previous_path is distinct from expected_asset_path then raise exception 'Photo changed; refresh before replacing it'; end if;
  if new_asset_path is not null then
    if new_asset_path !~ '^[0-9a-f-]{36}/[0-9a-f-]{36}/avatar/v2-[0-9a-f-]{36}\.webp$'
      or split_part(new_asset_path,'/',1)<>target_organization_id::text or split_part(new_asset_path,'/',2)<>target_user_id::text then
      raise exception 'Invalid scoped photo path';
    end if;
    thumbnail_path:=regexp_replace(new_asset_path,'\.webp$','-thumb.webp');
    if (select count(*) from storage.objects s where s.bucket_id='profile-images'
      and s.name in (new_asset_path,thumbnail_path) and s.metadata->>'mimetype'='image/webp'
      and (s.metadata->>'size')::bigint between 1 and 5242880)<>2 then raise exception 'Both validated photo sizes are required'; end if;
  end if;
  update public.profiles set avatar_path=new_asset_path,avatar_updated_at=now() where id=target_user_id;
end;
$$;

revoke all on function private.can_manage_profile_photo(uuid,uuid),private.can_remove_profile_asset(text) from public,anon,authenticated;
grant execute on function private.can_remove_profile_asset(text) to authenticated;
revoke all on function public.get_profile_photo_edit_context(uuid,uuid),public.set_managed_profile_photo(uuid,uuid,text,text) from public,anon,authenticated;
grant execute on function public.get_profile_photo_edit_context(uuid,uuid),public.set_managed_profile_photo(uuid,uuid,text,text) to authenticated;
comment on function public.set_managed_profile_photo(uuid,uuid,text,text) is 'Photo-only, membership-validated compare-and-swap. Does not grant access to other profile or intake fields.';
