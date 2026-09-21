alter table public.profiles
  add column preferred_name text,
  add column bio text,
  add column specialties text[] not null default '{}',
  add column years_coaching smallint,
  add column avatar_path text,
  add column avatar_updated_at timestamptz;

alter table public.profiles
  add constraint profiles_preferred_name_length_check
    check (preferred_name is null or char_length(trim(preferred_name)) between 1 and 80),
  add constraint profiles_bio_length_check
    check (bio is null or char_length(bio) <= 1200),
  add constraint profiles_specialties_limit_check
    check (cardinality(specialties) <= 20),
  add constraint profiles_years_coaching_check
    check (years_coaching is null or years_coaching between 0 and 80),
  add constraint profiles_avatar_path_check
    check (avatar_path is null or avatar_path ~ '^[0-9a-f-]{36}/[0-9a-f-]{36}/avatar\.(jpg|png|webp)$');

create table public.coach_certifications (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  coach_user_id uuid not null references auth.users (id) on delete cascade,
  certification_name text not null check (char_length(trim(certification_name)) between 2 and 160),
  issuing_organization text not null check (char_length(trim(issuing_organization)) between 2 and 160),
  credential_number text check (credential_number is null or char_length(trim(credential_number)) between 1 and 120),
  issue_date date,
  expiration_date date,
  notes text check (notes is null or char_length(notes) <= 1000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (organization_id, coach_user_id)
    references public.organization_memberships (organization_id, user_id)
    on delete cascade,
  check (expiration_date is null or issue_date is null or expiration_date >= issue_date)
);

create index coach_certifications_org_coach_idx
  on public.coach_certifications (organization_id, coach_user_id, expiration_date);

create function private.enforce_coach_certification_scope()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'UPDATE' and (
    new.organization_id <> old.organization_id
    or new.coach_user_id <> old.coach_user_id
  ) then
    raise exception 'Certification scope is immutable';
  end if;

  if not exists (
    select 1
    from public.organization_memberships membership
    join public.profiles profile on profile.id = membership.user_id
    join public.organizations organization on organization.id = membership.organization_id
    where membership.organization_id = new.organization_id
      and membership.user_id = new.coach_user_id
      and membership.role = 'coach'
      and membership.status = 'active'
      and profile.account_status = 'active'
      and organization.status = 'active'
  ) then
    raise exception 'An active coach membership is required';
  end if;

  new.certification_name := trim(new.certification_name);
  new.issuing_organization := trim(new.issuing_organization);
  new.credential_number := nullif(trim(coalesce(new.credential_number, '')), '');
  new.notes := nullif(trim(coalesce(new.notes, '')), '');
  return new;
end;
$$;

create trigger coach_certifications_enforce_scope
  before insert or update on public.coach_certifications
  for each row execute function private.enforce_coach_certification_scope();

create trigger coach_certifications_set_updated_at
  before update on public.coach_certifications
  for each row execute function private.set_updated_at();

create function public.update_own_profile(profile_patch jsonb)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_user_id uuid := (select auth.uid());
  actor_role public.organization_role;
  actor_organization_id uuid;
  normalized_specialties text[];
begin
  if actor_user_id is null or profile_patch is null or jsonb_typeof(profile_patch) <> 'object' then
    raise exception 'A valid authenticated profile update is required';
  end if;

  if profile_patch - array['fullName','preferredName','bio','specialties','yearsCoaching','avatarPath'] <> '{}'::jsonb then
    raise exception 'Profile update contains unsupported fields';
  end if;

  select membership.organization_id, membership.role
  into strict actor_organization_id, actor_role
  from public.organization_memberships membership
  join public.organizations organization on organization.id = membership.organization_id
  join public.profiles profile on profile.id = membership.user_id
  where membership.user_id = actor_user_id
    and membership.status = 'active'
    and organization.status = 'active'
    and profile.account_status = 'active'
  order by membership.created_at
  limit 1;

  normalized_specialties := case
    when profile_patch ? 'specialties' then array(
      select distinct left(trim(value), 80)
      from jsonb_array_elements_text(profile_patch -> 'specialties') value
      where char_length(trim(value)) > 0
      limit 20
    )
    else null
  end;

  if actor_role = 'coach' then
    update public.profiles
    set
      full_name = case when profile_patch ? 'fullName' then trim(profile_patch ->> 'fullName') else full_name end,
      preferred_name = case when profile_patch ? 'preferredName' then nullif(trim(profile_patch ->> 'preferredName'), '') else preferred_name end,
      bio = case when profile_patch ? 'bio' then nullif(trim(profile_patch ->> 'bio'), '') else bio end,
      specialties = coalesce(normalized_specialties, specialties),
      years_coaching = case when profile_patch ? 'yearsCoaching' and nullif(profile_patch ->> 'yearsCoaching', '') is not null
        then (profile_patch ->> 'yearsCoaching')::smallint
        when profile_patch ? 'yearsCoaching' then null else years_coaching end,
      avatar_path = case when profile_patch ? 'avatarPath' then nullif(profile_patch ->> 'avatarPath', '') else avatar_path end,
      avatar_updated_at = case when profile_patch ? 'avatarPath' then now() else avatar_updated_at end
    where id = actor_user_id;
  elsif actor_role = 'client' then
    if profile_patch ?| array['fullName','specialties','yearsCoaching'] then
      raise exception 'Clients cannot modify protected profile fields';
    end if;
    update public.profiles
    set
      preferred_name = case when profile_patch ? 'preferredName' then nullif(trim(profile_patch ->> 'preferredName'), '') else preferred_name end,
      bio = case when profile_patch ? 'bio' then nullif(trim(profile_patch ->> 'bio'), '') else bio end,
      avatar_path = case when profile_patch ? 'avatarPath' then nullif(profile_patch ->> 'avatarPath', '') else avatar_path end,
      avatar_updated_at = case when profile_patch ? 'avatarPath' then now() else avatar_updated_at end
    where id = actor_user_id;
  else
    update public.profiles
    set
      full_name = case when profile_patch ? 'fullName' then trim(profile_patch ->> 'fullName') else full_name end,
      preferred_name = case when profile_patch ? 'preferredName' then nullif(trim(profile_patch ->> 'preferredName'), '') else preferred_name end,
      bio = case when profile_patch ? 'bio' then nullif(trim(profile_patch ->> 'bio'), '') else bio end,
      avatar_path = case when profile_patch ? 'avatarPath' then nullif(profile_patch ->> 'avatarPath', '') else avatar_path end,
      avatar_updated_at = case when profile_patch ? 'avatarPath' then now() else avatar_updated_at end
    where id = actor_user_id;
  end if;
exception
  when no_data_found then raise exception 'An active organization membership is required';
  when invalid_text_representation then raise exception 'Profile values are invalid';
end;
$$;

create function private.can_write_profile_asset(asset_name text)
returns boolean
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  path_organization_id uuid;
  path_user_id uuid;
begin
  if asset_name !~ '^[0-9a-f-]{36}/[0-9a-f-]{36}/avatar\.(jpg|png|webp)$' then return false; end if;
  path_organization_id := split_part(asset_name, '/', 1)::uuid;
  path_user_id := split_part(asset_name, '/', 2)::uuid;
  return path_user_id = (select auth.uid())
    and private.has_active_role(path_organization_id, array['owner','coach','client']::public.organization_role[]);
exception when invalid_text_representation then return false;
end;
$$;

create function private.can_read_profile_asset(asset_name text)
returns boolean
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  path_organization_id uuid;
  path_user_id uuid;
begin
  if asset_name !~ '^[0-9a-f-]{36}/[0-9a-f-]{36}/avatar\.(jpg|png|webp)$' then return false; end if;
  path_organization_id := split_part(asset_name, '/', 1)::uuid;
  path_user_id := split_part(asset_name, '/', 2)::uuid;
  return exists (
    select 1 from public.organization_memberships membership
    join public.organizations organization on organization.id = membership.organization_id
    join public.profiles profile on profile.id = membership.user_id
    where membership.organization_id = path_organization_id
      and membership.user_id = path_user_id
      and membership.status = 'active'
      and organization.status = 'active'
      and profile.account_status = 'active'
  ) and private.can_view_profile(path_user_id);
exception when invalid_text_representation then return false;
end;
$$;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'profile-images',
  'profile-images',
  false,
  5242880,
  array['image/jpeg','image/png','image/webp']
)
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

alter table public.coach_certifications enable row level security;

create policy coach_certifications_select_authorized
  on public.coach_certifications for select to authenticated
  using ((select private.can_view_profile(coach_user_id)));
create policy coach_certifications_insert_self
  on public.coach_certifications for insert to authenticated
  with check (
    coach_user_id = (select auth.uid())
    and (select private.has_active_role(organization_id, array['coach']::public.organization_role[]))
  );
create policy coach_certifications_update_self
  on public.coach_certifications for update to authenticated
  using (
    coach_user_id = (select auth.uid())
    and (select private.has_active_role(organization_id, array['coach']::public.organization_role[]))
  )
  with check (
    coach_user_id = (select auth.uid())
    and (select private.has_active_role(organization_id, array['coach']::public.organization_role[]))
  );
create policy coach_certifications_delete_self
  on public.coach_certifications for delete to authenticated
  using (
    coach_user_id = (select auth.uid())
    and (select private.has_active_role(organization_id, array['coach']::public.organization_role[]))
  );

create policy profile_images_select_authorized
  on storage.objects for select to authenticated
  using (bucket_id = 'profile-images' and (select private.can_read_profile_asset(name)));
create policy profile_images_insert_self
  on storage.objects for insert to authenticated
  with check (bucket_id = 'profile-images' and (select private.can_write_profile_asset(name)));
create policy profile_images_update_self
  on storage.objects for update to authenticated
  using (bucket_id = 'profile-images' and (select private.can_write_profile_asset(name)))
  with check (bucket_id = 'profile-images' and (select private.can_write_profile_asset(name)));
create policy profile_images_delete_self
  on storage.objects for delete to authenticated
  using (bucket_id = 'profile-images' and (select private.can_write_profile_asset(name)));

revoke all on public.coach_certifications from anon, authenticated;
grant select, insert, update, delete on public.coach_certifications to authenticated;

revoke update on public.profiles from authenticated;
revoke all on function public.update_own_profile(jsonb) from public, anon, authenticated;
grant execute on function public.update_own_profile(jsonb) to authenticated;

revoke all on function private.enforce_coach_certification_scope() from public, anon, authenticated;
revoke all on function private.can_write_profile_asset(text) from public, anon, authenticated;
revoke all on function private.can_read_profile_asset(text) from public, anon, authenticated;
grant execute on function private.can_write_profile_asset(text) to authenticated;
grant execute on function private.can_read_profile_asset(text) to authenticated;

comment on table public.coach_certifications is
  'Structured coach credentials scoped to an organization. No external verification is implied.';
comment on column public.profiles.avatar_path is
  'Private Supabase Storage object path. Resolve only through an authenticated signed URL.';
