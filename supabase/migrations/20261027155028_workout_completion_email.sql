-- Delivery claims prevent duplicate completion emails across all finish actions.
create table private.workout_completion_emails (
  workout_id uuid primary key references public.workout_assignments(id) on delete cascade,
  claim_id uuid not null,
  claimed_by uuid not null references auth.users(id),
  status text not null check (status in ('sending','sent','failed','skipped')),
  provider_message_id text,
  updated_at timestamptz not null default now()
);
alter table private.workout_completion_emails enable row level security;
revoke all on private.workout_completion_emails from public, anon, authenticated;

create function private.claim_workout_completion_email(target_workout_id uuid)
returns table(claim_id uuid, recipient_email text)
language plpgsql security definer set search_path = '' as $$
declare delivery_claim uuid := gen_random_uuid(); recipient text;
begin
  if auth.uid() is null or not private.can_read_workout(target_workout_id) then
    raise exception 'Workout unavailable' using errcode = '42501';
  end if;
  select u.email into recipient
  from public.workout_assignments w join auth.users u on u.id=w.client_user_id
  join public.organization_memberships m on m.organization_id=w.organization_id
    and m.user_id=w.client_user_id and m.role='client' and m.status='active'
  join public.profiles p on p.id=w.client_user_id and p.account_status='active'
  where w.id=target_workout_id and w.status='completed';
  if recipient is null then return; end if;
  insert into private.workout_completion_emails as d(workout_id,claim_id,claimed_by,status)
  values(target_workout_id,delivery_claim,auth.uid(),'sending')
  on conflict (workout_id) do update set claim_id=excluded.claim_id,
    claimed_by=excluded.claimed_by,status='sending',updated_at=now()
  where d.status in ('failed','skipped') and d.updated_at < now()-interval '1 minute';
  if not found then return; end if;
  return query select delivery_claim, recipient;
end $$;

create function private.finalize_workout_completion_email(target_workout_id uuid, delivery_claim uuid, delivery_status text, message_id text default null)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is null or not private.can_read_workout(target_workout_id) then
    raise exception 'Workout unavailable' using errcode = '42501';
  end if;
  if delivery_status is null or delivery_status not in ('sent','failed','skipped') then
    raise exception 'Invalid delivery status';
  end if;
  update private.workout_completion_emails set status=delivery_status,
    provider_message_id=left(message_id,500),updated_at=now()
  where workout_id=target_workout_id and claim_id=delivery_claim
    and claimed_by=auth.uid() and status='sending';
  if not found then raise exception 'Delivery claim unavailable'; end if;
end $$;

create function public.claim_workout_completion_email(target_workout_id uuid)
returns table(claim_id uuid, recipient_email text)
language sql security invoker set search_path = '' as $$
  select * from private.claim_workout_completion_email(target_workout_id);
$$;
create function public.finalize_workout_completion_email(target_workout_id uuid, delivery_claim uuid, delivery_status text, message_id text default null)
returns void language sql security invoker set search_path = '' as $$
  select private.finalize_workout_completion_email(target_workout_id,delivery_claim,delivery_status,message_id);
$$;
revoke all on function private.claim_workout_completion_email(uuid), public.claim_workout_completion_email(uuid),
  private.finalize_workout_completion_email(uuid,uuid,text,text), public.finalize_workout_completion_email(uuid,uuid,text,text) from public, anon;
grant execute on function private.claim_workout_completion_email(uuid), public.claim_workout_completion_email(uuid),
  private.finalize_workout_completion_email(uuid,uuid,text,text), public.finalize_workout_completion_email(uuid,uuid,text,text) to authenticated;
