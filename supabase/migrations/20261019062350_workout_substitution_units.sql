-- Substitution IDs are not a substitute prescription. Preserve the original
-- target measurement and per-side convention; otherwise the Coach must add an
-- explicitly prescribed exercise instead of reusing incompatible targets.
create function private.assert_substitution_units(base_id uuid,choices jsonb) returns void
language plpgsql stable security definer set search_path='' as $$
declare base public.exercise_library%rowtype; choice jsonb;
begin
 if choices is null or choices='null'::jsonb then return; end if;
 if jsonb_typeof(choices)<>'array' then raise exception 'Invalid approved substitutions'; end if;
 if jsonb_array_length(choices)=0 then return; end if;
 select * into strict base from public.exercise_library where id=base_id;
 for choice in select value from jsonb_array_elements(choices) loop
   if not exists(select 1 from public.exercise_library s where s.id=(choice#>>'{}')::uuid and s.is_active
     and s.measurement=base.measurement and s.laterality=base.laterality) then
     raise exception 'Substitutions must preserve measurement and per-side targets; prescribe different targets as a separate exercise';
   end if;
 end loop;
end $$;
create function private.check_assignment_substitution_units() returns trigger
language plpgsql security definer set search_path='' as $$
begin
 perform private.assert_substitution_units(new.library_exercise_id,new.prescription_details->'substitutionIds');
 return new;
end $$;
create function private.check_logged_substitution_units() returns trigger
language plpgsql security definer set search_path='' as $$
declare base_id uuid;
begin
 select library_exercise_id into strict base_id from public.workout_exercises where id=new.workout_exercise_id;
 perform private.assert_substitution_units(base_id,jsonb_build_array(new.performed_library_exercise_id::text));
 return new;
end $$;
create trigger check_assignment_substitution_units before insert or update of prescription_details,library_exercise_id on public.workout_exercises
for each row when(new.prescription_details is not null) execute function private.check_assignment_substitution_units();
create trigger check_logged_substitution_units before insert or update of performed_library_exercise_id on public.workout_sets
for each row when(new.performed_library_exercise_id is not null) execute function private.check_logged_substitution_units();
revoke all on function private.assert_substitution_units(uuid,jsonb),private.check_assignment_substitution_units(),private.check_logged_substitution_units() from public,anon,authenticated;
