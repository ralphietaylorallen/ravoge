create or replace function public.import_training_library_rows(
  source_filename text,
  source_format text,
  source_rows jsonb
)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  active_organization_id uuid;
  imported_count integer := 0;
  source_row jsonb;
  row_title text;
begin
  if auth.uid() is null then
    raise exception 'Authentication required';
  end if;

  select membership.organization_id
    into active_organization_id
  from public.organization_memberships membership
  where membership.user_id = auth.uid()
    and membership.role = 'owner'
    and membership.status = 'active'
  limit 1;

  if active_organization_id is null then
    raise exception 'Active owner membership required';
  end if;

  source_filename := trim(coalesce(source_filename, ''));
  source_format := lower(trim(coalesce(source_format, '')));

  if char_length(source_filename) < 1 or char_length(source_filename) > 255 then
    raise exception 'Invalid source filename';
  end if;
  if source_format not in ('csv', 'xlsx') then
    raise exception 'Only CSV and XLSX imports are supported';
  end if;
  if jsonb_typeof(source_rows) <> 'array'
    or jsonb_array_length(source_rows) < 1
    or jsonb_array_length(source_rows) > 500 then
    raise exception 'Import must contain between 1 and 500 rows';
  end if;
  if octet_length(source_rows::text) > 5000000 then
    raise exception 'Import payload is too large';
  end if;

  for source_row in select value from jsonb_array_elements(source_rows)
  loop
    if jsonb_typeof(source_row) <> 'object'
      or jsonb_typeof(source_row -> 'cells') <> 'array' then
      raise exception 'Every imported row must contain a cells array';
    end if;

    row_title := trim(coalesce(source_row ->> 'title', ''));
    if char_length(row_title) < 2 or char_length(row_title) > 160 then
      row_title := 'Imported row ' || coalesce(source_row ->> 'rowNumber', (imported_count + 1)::text);
    end if;

    insert into public.training_library_items (
      organization_id,
      title,
      source_type,
      status,
      source_filename,
      normalized_content,
      created_by
    ) values (
      active_organization_id,
      row_title,
      case source_format when 'csv' then 'csv'::public.training_library_source else 'excel'::public.training_library_source end,
      'draft',
      source_filename,
      source_row,
      auth.uid()
    );

    imported_count := imported_count + 1;
  end loop;

  return imported_count;
end;
$$;

revoke all on function public.import_training_library_rows(text, text, jsonb)
  from public, anon, authenticated;
grant execute on function public.import_training_library_rows(text, text, jsonb)
  to authenticated;

comment on function public.import_training_library_rows(text, text, jsonb) is
  'Imports validated CSV/XLSX source rows into the authenticated active owner organization as draft training-library records.';
