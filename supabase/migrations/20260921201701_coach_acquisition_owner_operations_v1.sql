-- Coach acquisition and Owner operations are one organization-scoped system.
-- Invitation provenance is retained on organization_memberships.invitation_id;
-- a Client invited by an active Coach is assigned by the existing membership
-- acceptance trigger in the same transaction as membership creation.

create type public.coach_compensation_model as enum ('none', 'hourly', 'percentage');
create type public.booking_payment_status as enum ('not_configured', 'unpaid', 'paid', 'refunded');

create table public.organization_session_pricing (
  organization_id uuid primary key references public.organizations (id) on delete cascade,
  default_session_price_minor bigint,
  currency text not null default 'USD',
  updated_by uuid not null references auth.users (id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (default_session_price_minor is null or default_session_price_minor between 0 and 100000000),
  check (currency ~ '^[A-Z]{3}$')
);

create table public.coach_compensation_configs (
  organization_id uuid not null,
  coach_user_id uuid not null,
  model public.coach_compensation_model not null default 'none',
  hourly_rate_minor bigint,
  commission_basis_points integer,
  currency text not null default 'USD',
  updated_by uuid not null references auth.users (id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (organization_id, coach_user_id),
  foreign key (organization_id, coach_user_id)
    references public.organization_memberships (organization_id, user_id)
    on delete cascade,
  check (currency ~ '^[A-Z]{3}$'),
  check (
    (model = 'none' and hourly_rate_minor is null and commission_basis_points is null)
    or (model = 'hourly' and hourly_rate_minor between 0 and 100000000 and commission_basis_points is null)
    or (model = 'percentage' and hourly_rate_minor is null and commission_basis_points between 0 and 10000)
  )
);

create table public.client_body_composition_assessments (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  client_user_id uuid not null,
  recorded_by uuid not null references auth.users (id) on delete restrict,
  measured_at timestamptz not null,
  weight_kg numeric(7,3),
  skeletal_muscle_mass_kg numeric(7,3),
  body_fat_percentage numeric(5,2),
  body_fat_mass_kg numeric(7,3),
  inbody_score numeric(5,2),
  source text not null default 'manual',
  notes text,
  created_at timestamptz not null default now(),
  foreign key (organization_id, client_user_id)
    references public.organization_memberships (organization_id, user_id)
    on delete cascade,
  check (weight_kg is null or weight_kg between 20 and 500),
  check (skeletal_muscle_mass_kg is null or skeletal_muscle_mass_kg between 5 and 250),
  check (body_fat_percentage is null or body_fat_percentage between 0 and 80),
  check (body_fat_mass_kg is null or body_fat_mass_kg between 0 and 300),
  check (inbody_score is null or inbody_score between 0 and 200),
  check (char_length(trim(source)) between 2 and 80),
  check (notes is null or char_length(notes) <= 2000),
  check (
    weight_kg is not null
    or skeletal_muscle_mass_kg is not null
    or body_fat_percentage is not null
    or body_fat_mass_kg is not null
    or inbody_score is not null
  )
);

create index client_body_composition_org_client_measured_idx
  on public.client_body_composition_assessments (organization_id, client_user_id, measured_at desc);
create index coach_compensation_configs_coach_idx
  on public.coach_compensation_configs (coach_user_id);

alter table public.bookings
  add column session_price_minor bigint,
  add column currency text,
  add column compensation_model public.coach_compensation_model,
  add column coach_compensation_minor bigint,
  add column gym_retained_minor bigint,
  add column ravoge_platform_fee_minor bigint,
  add column payment_status public.booking_payment_status not null default 'not_configured',
  add constraint bookings_session_price_minor_check
    check (session_price_minor is null or session_price_minor between 0 and 100000000),
  add constraint bookings_currency_check
    check (currency is null or currency ~ '^[A-Z]{3}$'),
  add constraint bookings_compensation_minor_check
    check (coach_compensation_minor is null or coach_compensation_minor >= 0),
  add constraint bookings_platform_fee_minor_check
    check (ravoge_platform_fee_minor is null or ravoge_platform_fee_minor >= 0),
  add constraint bookings_financial_snapshot_check check (
    (session_price_minor is null
      and currency is null
      and compensation_model is null
      and coach_compensation_minor is null
      and gym_retained_minor is null
      and ravoge_platform_fee_minor is null
      and payment_status = 'not_configured')
    or
    (session_price_minor is not null
      and currency is not null
      and compensation_model is not null
      and coach_compensation_minor is not null
      and gym_retained_minor is not null
      and ravoge_platform_fee_minor is not null)
  );

create function private.apply_booking_financial_snapshot()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  pricing public.organization_session_pricing%rowtype;
  compensation public.coach_compensation_configs%rowtype;
  duration_minutes numeric;
begin
  select * into pricing
  from public.organization_session_pricing configured
  where configured.organization_id = new.organization_id;

  if not found or pricing.default_session_price_minor is null then
    new.session_price_minor := null;
    new.currency := null;
    new.compensation_model := null;
    new.coach_compensation_minor := null;
    new.gym_retained_minor := null;
    new.ravoge_platform_fee_minor := null;
    new.payment_status := 'not_configured';
    return new;
  end if;

  select * into compensation
  from public.coach_compensation_configs configured
  where configured.organization_id = new.organization_id
    and configured.coach_user_id = new.coach_user_id;

  duration_minutes := extract(epoch from (new.ends_at - new.starts_at)) / 60;
  new.session_price_minor := pricing.default_session_price_minor;
  new.currency := pricing.currency;
  new.compensation_model := coalesce(compensation.model, 'none');
  new.ravoge_platform_fee_minor := 0;
  new.coach_compensation_minor := case
    when compensation.model = 'hourly' then
      round(compensation.hourly_rate_minor::numeric * duration_minutes / 60)::bigint
    when compensation.model = 'percentage' then
      round(pricing.default_session_price_minor::numeric * compensation.commission_basis_points / 10000)::bigint
    else 0
  end;
  new.gym_retained_minor := new.session_price_minor
    - new.coach_compensation_minor
    - new.ravoge_platform_fee_minor;
  if new.payment_status = 'not_configured' then
    new.payment_status := 'unpaid';
  end if;
  return new;
end;
$$;

create trigger bookings_apply_financial_snapshot
  before insert or update of starts_at, ends_at on public.bookings
  for each row execute function private.apply_booking_financial_snapshot();

create trigger organization_session_pricing_set_updated_at
  before update on public.organization_session_pricing
  for each row execute function private.set_updated_at();
create trigger coach_compensation_configs_set_updated_at
  before update on public.coach_compensation_configs
  for each row execute function private.set_updated_at();

create function private.enforce_body_composition_scope()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not exists (
    select 1 from public.organization_memberships membership
    join public.profiles profile
      on profile.id = membership.user_id and profile.account_status = 'active'
    where membership.organization_id = new.organization_id
      and membership.user_id = new.client_user_id
      and membership.role = 'client'
      and membership.status = 'active'
  ) then raise exception 'An active Client membership is required'; end if;
  return new;
end;
$$;

create trigger client_body_composition_enforce_scope
  before insert on public.client_body_composition_assessments
  for each row execute function private.enforce_body_composition_scope();

create function public.configure_organization_session_pricing(
  session_price_minor bigint,
  session_currency text default 'USD'
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_user_id uuid := (select auth.uid());
  actor_organization_id uuid;
  normalized_currency text := upper(trim(session_currency));
begin
  if actor_user_id is null then raise exception 'Authentication is required'; end if;
  if session_price_minor is not null and session_price_minor not between 0 and 100000000 then
    raise exception 'Session price is outside the supported range';
  end if;
  if normalized_currency !~ '^[A-Z]{3}$' then raise exception 'A valid currency is required'; end if;

  select membership.organization_id into strict actor_organization_id
  from public.organization_memberships membership
  join public.organizations organization
    on organization.id = membership.organization_id and organization.status = 'active'
  join public.profiles profile
    on profile.id = membership.user_id and profile.account_status = 'active'
  where membership.user_id = actor_user_id
    and membership.role = 'owner'
    and membership.status = 'active';

  insert into public.organization_session_pricing (
    organization_id, default_session_price_minor, currency, updated_by
  ) values (
    actor_organization_id, session_price_minor, normalized_currency, actor_user_id
  )
  on conflict (organization_id) do update
    set default_session_price_minor = excluded.default_session_price_minor,
        currency = excluded.currency,
        updated_by = actor_user_id;
exception when no_data_found then raise exception 'An active Owner membership is required';
end;
$$;

create function public.configure_coach_compensation(
  target_coach_user_id uuid,
  compensation_model public.coach_compensation_model,
  hourly_rate_minor bigint default null,
  commission_basis_points integer default null,
  compensation_currency text default 'USD'
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_user_id uuid := (select auth.uid());
  actor_organization_id uuid;
  normalized_currency text := upper(trim(compensation_currency));
begin
  if actor_user_id is null or target_coach_user_id is null then
    raise exception 'Authentication and a Coach are required';
  end if;
  if normalized_currency !~ '^[A-Z]{3}$' then raise exception 'A valid currency is required'; end if;
  if not (
    (compensation_model = 'none' and hourly_rate_minor is null and commission_basis_points is null)
    or (compensation_model = 'hourly' and hourly_rate_minor between 0 and 100000000 and commission_basis_points is null)
    or (compensation_model = 'percentage' and hourly_rate_minor is null and commission_basis_points between 0 and 10000)
  ) then raise exception 'Compensation values do not match the selected model'; end if;

  select membership.organization_id into strict actor_organization_id
  from public.organization_memberships membership
  join public.organizations organization
    on organization.id = membership.organization_id and organization.status = 'active'
  join public.profiles profile
    on profile.id = membership.user_id and profile.account_status = 'active'
  where membership.user_id = actor_user_id
    and membership.role = 'owner'
    and membership.status = 'active';

  if not exists (
    select 1 from public.organization_memberships coach
    join public.profiles profile
      on profile.id = coach.user_id and profile.account_status = 'active'
    where coach.organization_id = actor_organization_id
      and coach.user_id = target_coach_user_id
      and coach.role = 'coach'
      and coach.status = 'active'
  ) then raise exception 'The selected Coach is not active in this organization'; end if;

  insert into public.coach_compensation_configs (
    organization_id, coach_user_id, model, hourly_rate_minor,
    commission_basis_points, currency, updated_by
  ) values (
    actor_organization_id, target_coach_user_id, compensation_model,
    hourly_rate_minor, commission_basis_points, normalized_currency, actor_user_id
  )
  on conflict (organization_id, coach_user_id) do update
    set model = excluded.model,
        hourly_rate_minor = excluded.hourly_rate_minor,
        commission_basis_points = excluded.commission_basis_points,
        currency = excluded.currency,
        updated_by = actor_user_id;
exception when no_data_found then raise exception 'An active Owner membership is required';
end;
$$;

create function public.get_organization_invitation_context_v2(invitation_token text)
returns table (
  email text,
  role public.organization_role,
  organization_name text,
  inviter_name text,
  inviter_role public.organization_role,
  expires_at timestamptz
)
language sql
stable
security definer
set search_path = ''
as $$
  select invitation.email,
    invitation.role,
    organization.name,
    coalesce(inviter.preferred_name, inviter.full_name),
    inviter_membership.role,
    invitation.expires_at
  from public.organization_invitations invitation
  join public.organizations organization
    on organization.id = invitation.organization_id and organization.status = 'active'
  join public.profiles inviter on inviter.id = invitation.invited_by
  join public.organization_memberships inviter_membership
    on inviter_membership.organization_id = invitation.organization_id
   and inviter_membership.user_id = invitation.invited_by
   and inviter_membership.status = 'active'
  where char_length(invitation_token) >= 32
    and invitation.token_hash = encode(extensions.digest(invitation_token, 'sha256'), 'hex')
    and invitation.accepted_at is null
    and invitation.revoked_at is null
    and invitation.expires_at > now()
  limit 1;
$$;

alter table public.organization_session_pricing enable row level security;
alter table public.coach_compensation_configs enable row level security;
alter table public.client_body_composition_assessments enable row level security;

create policy organization_session_pricing_select_owner
  on public.organization_session_pricing for select to authenticated
  using ((select private.has_active_role(
    organization_id,
    array['owner']::public.organization_role[]
  )));

create policy coach_compensation_configs_select_owner
  on public.coach_compensation_configs for select to authenticated
  using ((select private.has_active_role(
    organization_id,
    array['owner']::public.organization_role[]
  )));

create policy client_body_composition_select_authorized
  on public.client_body_composition_assessments for select to authenticated
  using (
    (client_user_id = (select auth.uid()) and (select private.has_active_role(
      organization_id,
      array['client']::public.organization_role[]
    )))
    or (select private.has_active_role(
      organization_id,
      array['owner']::public.organization_role[]
    ))
    or (select private.has_active_coach_client_assignment(
      organization_id,
      (select auth.uid()),
      client_user_id
    ))
  );

create policy client_body_composition_insert_authorized
  on public.client_body_composition_assessments for insert to authenticated
  with check (
    recorded_by = (select auth.uid())
    and (
      (select private.has_active_role(
        organization_id,
        array['owner']::public.organization_role[]
      ))
      or (select private.has_active_coach_client_assignment(
        organization_id,
        (select auth.uid()),
        client_user_id
      ))
    )
  );

revoke all on public.organization_session_pricing from public, anon, authenticated;
revoke all on public.coach_compensation_configs from public, anon, authenticated;
revoke all on public.client_body_composition_assessments from public, anon, authenticated;
grant select on public.organization_session_pricing to authenticated;
grant select on public.coach_compensation_configs to authenticated;
grant select, insert on public.client_body_composition_assessments to authenticated;

revoke all on function public.configure_organization_session_pricing(bigint, text)
  from public, anon, authenticated;
grant execute on function public.configure_organization_session_pricing(bigint, text)
  to authenticated;
revoke all on function public.configure_coach_compensation(
  uuid, public.coach_compensation_model, bigint, integer, text
) from public, anon, authenticated;
grant execute on function public.configure_coach_compensation(
  uuid, public.coach_compensation_model, bigint, integer, text
) to authenticated;
revoke all on function public.get_organization_invitation_context_v2(text)
  from public, anon, authenticated;
grant execute on function public.get_organization_invitation_context_v2(text)
  to anon, authenticated;

revoke execute on function private.apply_booking_financial_snapshot()
  from public, anon, authenticated;
revoke execute on function private.enforce_body_composition_scope()
  from public, anon, authenticated;

comment on table public.organization_session_pricing is
  'Owner-configured default session value in exact minor currency units. No payment processing occurs.';
comment on table public.coach_compensation_configs is
  'Owner-configured Coach compensation model. Values are exact minor units or basis points.';
comment on table public.client_body_composition_assessments is
  'Chronological, organization-scoped body-composition measurements. Values are factual and are not medically interpreted.';
comment on function public.get_organization_invitation_context_v2(text) is
  'Returns minimal organization and inviter display context for a valid opaque invitation; possession grants no membership.';
