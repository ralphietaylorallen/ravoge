-- Cover the foreign keys introduced by this operational release.
create index body_composition_intake_scope_idx on public.client_body_composition_assessments(intake_id,organization_id,client_user_id);
create index intake_baselines_intake_scope_idx on public.client_intake_baselines(intake_id,organization_id,client_user_id);
create index intake_baselines_recorder_scope_idx on public.client_intake_baselines(organization_id,recorded_by);
create index intake_baselines_recorder_idx on public.client_intake_baselines(recorded_by);
create index preworkout_questions_updated_by_idx on public.organization_preworkout_questions(updated_by);
create index preworkout_checkins_booking_scope_idx on public.preworkout_checkins(booking_id,organization_id,client_user_id);
create index preworkout_checkins_workout_scope_idx on public.preworkout_checkins(workout_assignment_id,organization_id,client_user_id);

-- Join date is basic directory context, not private training/intake data.
drop function public.list_unassigned_clients_for_coach();
create function public.list_unassigned_clients_for_coach()
returns table(client_user_id uuid,full_name text,preferred_name text,avatar_path text,account_status text,joined_at timestamptz)
language plpgsql stable security definer set search_path='' as $$
declare actor_organization_id uuid;
begin
  select m.organization_id into strict actor_organization_id
  from public.organization_memberships m
  join public.organizations o on o.id=m.organization_id and o.status='active'
  join public.profiles p on p.id=m.user_id and p.account_status='active'
  where m.user_id=(select auth.uid()) and m.role='coach' and m.status='active';
  return query select m.user_id,p.full_name,p.preferred_name,p.avatar_path,p.account_status::text,m.created_at
  from public.organization_memberships m join public.profiles p on p.id=m.user_id and p.account_status='active'
  where m.organization_id=actor_organization_id and m.role='client' and m.status='active'
  and not exists(select 1 from public.coach_client_assignments a where a.organization_id=actor_organization_id and a.client_user_id=m.user_id and a.status='active')
  order by p.full_name,m.user_id;
exception when no_data_found then raise exception 'An active Coach membership is required';
end $$;
revoke all on function public.list_unassigned_clients_for_coach() from public,anon,authenticated;
grant execute on function public.list_unassigned_clients_for_coach() to authenticated;

-- Clients cannot read other users' membership rows. Return only the public
-- profile fields of their own active assigned Coach without broadening RLS.
create function public.get_my_assigned_coach()
returns table(coach_user_id uuid,full_name text,preferred_name text,avatar_path text,bio text,specialties text[])
language sql stable security definer set search_path='' as $$
  select cp.id,cp.full_name,cp.preferred_name,cp.avatar_path,cp.bio,cp.specialties
  from public.organization_memberships client
  join public.organizations org on org.id=client.organization_id and org.status='active'
  join public.profiles actor on actor.id=client.user_id and actor.account_status='active'
  join public.coach_client_assignments a on a.organization_id=client.organization_id and a.client_user_id=client.user_id and a.status='active'
  join public.organization_memberships coach on coach.organization_id=a.organization_id and coach.user_id=a.coach_user_id and coach.role='coach' and coach.status='active'
  join public.profiles cp on cp.id=coach.user_id and cp.account_status='active'
  where client.user_id=(select auth.uid()) and client.role='client' and client.status='active';
$$;
revoke all on function public.get_my_assigned_coach() from public,anon,authenticated;
grant execute on function public.get_my_assigned_coach() to authenticated;
