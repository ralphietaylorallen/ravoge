-- Reuse the single-workout authorization and validation in one transaction.
create function public.assign_workout_to_dates(
  target_client_id uuid, title text, instructions text, dates date[], start_time time, exercises jsonb
) returns uuid[]
language plpgsql security invoker set search_path = ''
as $$
declare
  workout_date date;
  assigned_ids uuid[] := '{}';
begin
  if dates is null or cardinality(dates) not between 2 and 7
    or exists (select 1 from unnest(dates) as day(value) where value is null)
    or cardinality(dates) <> (select count(distinct value) from unnest(dates) as day(value)) then
    raise exception 'Choose between two and seven distinct workout dates' using errcode = '22023';
  end if;

  -- Acquire the underlying workout-slot locks in a consistent order.
  for workout_date in select value from unnest(dates) as day(value) order by value loop
    assigned_ids := array_append(assigned_ids, public.create_planned_workout_assignment_lb(
      target_client_id, title, instructions, workout_date, start_time, exercises
    ));
  end loop;
  return assigned_ids;
end;
$$;

revoke all on function public.assign_workout_to_dates(uuid,text,text,date[],time,jsonb) from public, anon, authenticated;
grant execute on function public.assign_workout_to_dates(uuid,text,text,date[],time,jsonb) to authenticated;
