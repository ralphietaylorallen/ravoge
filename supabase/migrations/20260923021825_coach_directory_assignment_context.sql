-- Basic assignment labels only. Other Coaches' clients remain inaccessible
-- through profile/intake/workout policies and cannot be claimed or reassigned.
create function public.list_other_assigned_clients_for_coach()
returns table(client_user_id uuid,full_name text,preferred_name text,assigned_coach_name text)
language sql stable security definer set search_path='' as $$
  select client.user_id,cp.full_name,cp.preferred_name,coalesce(nullif(coach_profile.preferred_name,''),coach_profile.full_name)
  from public.organization_memberships actor
  join public.organizations org on org.id=actor.organization_id and org.status='active'
  join public.profiles actor_profile on actor_profile.id=actor.user_id and actor_profile.account_status='active'
  join public.coach_client_assignments a on a.organization_id=actor.organization_id and a.status='active' and a.coach_user_id<>actor.user_id
  join public.organization_memberships client on client.organization_id=a.organization_id and client.user_id=a.client_user_id and client.role='client' and client.status='active'
  join public.profiles cp on cp.id=client.user_id and cp.account_status='active'
  join public.organization_memberships coach on coach.organization_id=a.organization_id and coach.user_id=a.coach_user_id and coach.role='coach' and coach.status='active'
  join public.profiles coach_profile on coach_profile.id=coach.user_id and coach_profile.account_status='active'
  where actor.user_id=(select auth.uid()) and actor.role='coach' and actor.status='active'
  order by cp.full_name,client.user_id;
$$;
revoke all on function public.list_other_assigned_clients_for_coach() from public,anon,authenticated;
grant execute on function public.list_other_assigned_clients_for_coach() to authenticated;
