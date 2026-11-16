-- Owners may personally train a Client in their selected gym. Coach assignment
-- boundaries, prescription ownership, readiness, safety, loads and approval
-- validators stay in place. No membership or Coach assignment is changed.
create or replace function private.can_manage_client_domain(target_organization_id uuid,target_client_user_id uuid)
returns boolean language sql stable security definer set search_path='' as $$
 select private.has_active_coach_client_assignment(target_organization_id,(select auth.uid()),target_client_user_id)
 or (private.has_active_role(target_organization_id,array['owner']::public.organization_role[])
   and exists(select 1 from private.member_roles m join public.profiles p on p.id=m.user_id
     where m.organization_id=target_organization_id and m.user_id=target_client_user_id and m.role='client' and m.status='active' and p.account_status='active'));
$$;
create or replace function private.can_manage_workout(target_workout_assignment_id uuid)
returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.workout_assignments w where w.id=target_workout_assignment_id
   and w.coach_user_id=(select auth.uid()) and private.can_manage_client_domain(w.organization_id,w.client_user_id));
$$;
-- Change only trainer-role checks in this explicit workflow dependency list.
-- Existing functions retain their grants, security settings and other checks.
do $owner_training$
declare f record; definition text; updated text;
begin
 for f in select p.oid,p.proname,n.nspname from pg_proc p join pg_namespace n on n.oid=p.pronamespace
 where n.nspname in ('public','private') and p.proname in (
 'generate_initial_prescription_v0','submit_training_readiness','review_training_readiness',
 'get_prescription_generation_input','discard_incomplete_quality_draft','get_recent_session_report_context',
 'approve_quality_prescription','approve_reviewed_prescription','record_quality_workout_set','manage_quality_workout',
 'save_workout_preparation','approve_prepared_prescription') loop
  definition:=pg_get_functiondef(f.oid);
  updated:=replace(definition,'array[''coach'']::public.organization_role[]','array[''owner'',''coach'']::public.organization_role[]');
  if f.proname='generate_initial_prescription_v0' then
    updated:=replace(updated,'m.role=''coach''','m.role in (''owner'',''coach'')');
  end if;
  if updated is distinct from definition then execute updated; end if;
 end loop;
 select pg_get_functiondef('public.approve_generated_prescription_v0(uuid,text,text,date,jsonb)'::regprocedure) into definition;
 updated:=replace(definition,'private.has_active_coach_client_assignment('||E'\n      prescription.organization_id, actor_user_id, prescription.client_user_id'||E'\n    )',
 'private.can_manage_client_domain(prescription.organization_id,prescription.client_user_id)');
 if updated=definition then raise exception 'Expected prescription assignment guard not found'; end if;
 execute updated;
end $owner_training$;
-- An Owner-created training session keeps the Owner as its recorded trainer.
-- Identity immutability remains unchanged, including when the Client logs sets.
create or replace function private.enforce_workout_identity()
returns trigger language plpgsql set search_path='' as $$
begin
 if tg_op='UPDATE' and (new.organization_id<>old.organization_id or new.coach_user_id<>old.coach_user_id or new.client_user_id<>old.client_user_id) then raise exception 'Workout assignment identities are immutable'; end if;
 if not private.has_active_coach_client_assignment(new.organization_id,new.coach_user_id,new.client_user_id)
 and not exists(select 1 from private.member_roles trainer join public.profiles p on p.id=trainer.user_id
   join private.member_roles client on client.organization_id=trainer.organization_id and client.user_id=new.client_user_id and client.role='client' and client.status='active'
   where trainer.organization_id=new.organization_id and trainer.user_id=new.coach_user_id and trainer.role='owner' and trainer.status='active' and p.account_status='active') then
  raise exception 'An active Coach assignment or active Owner trainer is required';
 end if;
 return new;
end $$;
