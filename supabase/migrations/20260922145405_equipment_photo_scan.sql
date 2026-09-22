create table public.equipment_scan_requests (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  requested_by uuid not null references auth.users (id) on delete restrict,
  model_snapshot text not null check (char_length(model_snapshot) between 3 and 120),
  status text not null default 'reserved' check (status in ('reserved', 'succeeded', 'failed', 'saved')),
  image_count smallint not null check (image_count between 1 and 5),
  candidate_count smallint not null default 0 check (candidate_count between 0 and 40),
  latency_ms integer check (latency_ms is null or latency_ms between 0 and 300000),
  provider_request_id text check (provider_request_id is null or char_length(provider_request_id) <= 200),
  input_tokens integer check (input_tokens is null or input_tokens >= 0),
  output_tokens integer check (output_tokens is null or output_tokens >= 0),
  error_category text check (
    error_category is null
    or error_category in ('invalid_output', 'model_unavailable', 'timeout', 'upstream_rate_limit', 'upstream_error')
  ),
  created_at timestamptz not null default now(),
  completed_at timestamptz,
  saved_at timestamptz,
  foreign key (organization_id, requested_by)
    references public.organization_memberships (organization_id, user_id) on delete restrict
);

create index equipment_scan_requests_org_created_idx
  on public.equipment_scan_requests (organization_id, created_at desc);
create index equipment_scan_requests_requested_by_idx
  on public.equipment_scan_requests (requested_by, created_at desc);

alter table public.equipment_scan_requests enable row level security;

create policy equipment_scan_requests_select_owner
  on public.equipment_scan_requests for select to authenticated
  using ((select private.has_active_role(
    organization_id, array['owner']::public.organization_role[]
  )));

revoke all on public.equipment_scan_requests from public, anon, authenticated;
grant select on public.equipment_scan_requests to authenticated;

create function public.reserve_equipment_scan(
  requested_model_snapshot text,
  requested_image_count integer
)
returns table (scan_request_id uuid, organization_id uuid)
language plpgsql
security definer
set search_path = ''
as $$
declare
  authenticated_user_id uuid := (select auth.uid());
  active_organization_id uuid;
  new_request_id uuid;
begin
  if authenticated_user_id is null then
    raise exception 'Authentication required';
  end if;
  if char_length(requested_model_snapshot) not between 3 and 120
    or requested_image_count not between 1 and 5 then
    raise exception 'Invalid scan request';
  end if;

  select membership.organization_id
  into active_organization_id
  from public.organization_memberships membership
  join public.organizations organization on organization.id = membership.organization_id
  join public.profiles profile on profile.id = membership.user_id
  where membership.user_id = authenticated_user_id
    and membership.role = 'owner'
    and membership.status = 'active'
    and organization.status = 'active'
    and profile.account_status = 'active'
  order by membership.created_at
  limit 1;

  if active_organization_id is null then
    raise exception 'Active owner membership required';
  end if;

  -- Serializing on the organization row makes the rolling quota race-safe.
  perform 1
  from public.organizations organization
  where organization.id = active_organization_id
  for update;

  if (
    select count(*)
    from public.equipment_scan_requests request
    where request.organization_id = active_organization_id
      and request.created_at >= now() - interval '24 hours'
  ) >= 10 then
    raise exception 'Equipment scan daily limit reached';
  end if;

  insert into public.equipment_scan_requests (
    organization_id, requested_by, model_snapshot, image_count
  ) values (
    active_organization_id, authenticated_user_id, requested_model_snapshot, requested_image_count
  )
  returning id into new_request_id;

  return query select new_request_id, active_organization_id;
end;
$$;

create function public.complete_equipment_scan(
  target_scan_request_id uuid,
  final_status text,
  final_candidate_count integer,
  final_latency_ms integer,
  final_provider_request_id text default null,
  final_input_tokens integer default null,
  final_output_tokens integer default null,
  final_error_category text default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  authenticated_user_id uuid := (select auth.uid());
begin
  if authenticated_user_id is null then
    raise exception 'Authentication required';
  end if;
  if final_status not in ('succeeded', 'failed')
    or final_candidate_count not between 0 and 40
    or final_latency_ms not between 0 and 300000
    or (final_provider_request_id is not null and char_length(final_provider_request_id) > 200)
    or (final_input_tokens is not null and final_input_tokens < 0)
    or (final_output_tokens is not null and final_output_tokens < 0)
    or (
      final_error_category is not null
      and final_error_category not in ('invalid_output', 'model_unavailable', 'timeout', 'upstream_rate_limit', 'upstream_error')
    ) then
    raise exception 'Invalid scan completion';
  end if;
  if final_status = 'succeeded' and final_error_category is not null then
    raise exception 'Successful scans cannot have an error category';
  end if;
  if final_status = 'failed' and final_error_category is null then
    raise exception 'Failed scans require an error category';
  end if;

  update public.equipment_scan_requests request
  set status = final_status,
      candidate_count = final_candidate_count,
      latency_ms = final_latency_ms,
      provider_request_id = nullif(trim(final_provider_request_id), ''),
      input_tokens = final_input_tokens,
      output_tokens = final_output_tokens,
      error_category = final_error_category,
      completed_at = now()
  where request.id = target_scan_request_id
    and request.requested_by = authenticated_user_id
    and request.status = 'reserved'
    and private.has_active_role(
      request.organization_id, array['owner']::public.organization_role[]
    );

  if not found then
    raise exception 'Equipment scan request is unavailable';
  end if;
end;
$$;

create function public.save_equipment_scan_results(
  target_scan_request_id uuid,
  approved_items jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  authenticated_user_id uuid := (select auth.uid());
  scan_request public.equipment_scan_requests%rowtype;
  item jsonb;
  item_action text;
  item_type text;
  item_name text;
  item_quantity integer;
  item_notes text;
  target_equipment_id uuid;
  added_count integer := 0;
  updated_count integer := 0;
  skipped_count integer := 0;
begin
  if authenticated_user_id is null then
    raise exception 'Authentication required';
  end if;
  if jsonb_typeof(approved_items) <> 'array'
    or jsonb_array_length(approved_items) > 40 then
    raise exception 'Invalid equipment result list';
  end if;

  select request.*
  into scan_request
  from public.equipment_scan_requests request
  where request.id = target_scan_request_id
  for update;

  if scan_request.id is null
    or scan_request.requested_by <> authenticated_user_id
    or scan_request.status <> 'succeeded'
    or not private.has_active_role(
      scan_request.organization_id, array['owner']::public.organization_role[]
    ) then
    raise exception 'Equipment scan request is unavailable';
  end if;

  for item in select value from jsonb_array_elements(approved_items)
  loop
    if jsonb_typeof(item) <> 'object' then
      raise exception 'Invalid equipment result';
    end if;
    item_action := item ->> 'action';
    if item_action = 'skip' then
      skipped_count := skipped_count + 1;
      continue;
    end if;
    if item_action not in ('add', 'update') then
      raise exception 'Invalid equipment action';
    end if;

    item_type := item ->> 'equipmentType';
    item_name := trim(coalesce(item ->> 'name', ''));
    item_notes := nullif(trim(coalesce(item ->> 'notes', '')), '');
    item_quantity := case
      when item -> 'quantity' is null or item -> 'quantity' = 'null'::jsonb then null
      when jsonb_typeof(item -> 'quantity') = 'number' then (item ->> 'quantity')::integer
      else null
    end;

    if item_type not in (
      'barbell', 'plates', 'squat_rack', 'bench', 'dumbbells', 'kettlebells',
      'cable_machine', 'selectorized_machine', 'cardio_equipment', 'sled',
      'bands', 'medicine_balls', 'specialty_equipment', 'other'
    )
      or char_length(item_name) not between 2 and 120
      or (item_quantity is not null and item_quantity not between 1 and 10000)
      or (item_notes is not null and char_length(item_notes) > 1000) then
      raise exception 'Invalid equipment values';
    end if;

    if item_action = 'add' then
      insert into public.organization_equipment (
        organization_id, equipment_type, name, quantity, is_available, notes, created_by
      ) values (
        scan_request.organization_id, item_type, item_name, item_quantity, true, item_notes, authenticated_user_id
      );
      added_count := added_count + 1;
    else
      begin
        target_equipment_id := (item ->> 'targetEquipmentId')::uuid;
      exception when others then
        raise exception 'Invalid equipment update target';
      end;

      update public.organization_equipment equipment
      set equipment_type = item_type,
          name = item_name,
          quantity = item_quantity,
          notes = item_notes,
          is_available = true
      where equipment.id = target_equipment_id
        and equipment.organization_id = scan_request.organization_id;

      if not found then
        raise exception 'Equipment update target is unavailable';
      end if;
      updated_count := updated_count + 1;
    end if;
  end loop;

  update public.equipment_scan_requests
  set status = 'saved', saved_at = now()
  where id = scan_request.id;

  return jsonb_build_object(
    'addedCount', added_count,
    'updatedCount', updated_count,
    'skippedCount', skipped_count
  );
end;
$$;

revoke all on function public.reserve_equipment_scan(text, integer) from public, anon, authenticated;
revoke all on function public.complete_equipment_scan(uuid, text, integer, integer, text, integer, integer, text) from public, anon, authenticated;
revoke all on function public.save_equipment_scan_results(uuid, jsonb) from public, anon, authenticated;
grant execute on function public.reserve_equipment_scan(text, integer) to authenticated;
grant execute on function public.complete_equipment_scan(uuid, text, integer, integer, text, integer, integer, text) to authenticated;
grant execute on function public.save_equipment_scan_results(uuid, jsonb) to authenticated;
