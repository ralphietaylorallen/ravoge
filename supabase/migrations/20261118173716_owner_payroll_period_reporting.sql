-- Payroll reporting is independent of workout-generation migrations. Existing
-- booking financial snapshots stay unchanged; no payments are sent or recorded.
create function private.payroll_owner_organization() returns uuid
language plpgsql stable security definer set search_path='' as $$
declare org uuid;
begin
 select m.organization_id into org from private.request_memberships m
 where m.user_id=(select auth.uid()) and m.role='owner' and m.status='active';
 if org is null then raise exception 'Active selected Owner access required' using errcode='42501'; end if;
 return org;
end $$;
revoke all on function private.payroll_owner_organization() from public,anon,authenticated;
grant execute on function private.payroll_owner_organization() to authenticated;

create table public.organization_payroll_settings (
 organization_id uuid primary key references public.organizations(id) on delete cascade,
 cadence_days smallint not null check(cadence_days in (7,14)),
 anchor_date date not null check(anchor_date between date '1900-01-01' and date '2200-12-31'),
 updated_by uuid not null references auth.users(id) on delete restrict,
 updated_at timestamptz not null default now()
);
alter table public.organization_payroll_settings enable row level security;
revoke all on public.organization_payroll_settings from public,anon,authenticated;
grant select on public.organization_payroll_settings to authenticated;
create policy payroll_settings_owner_read on public.organization_payroll_settings for select to authenticated
 using(organization_id=(select private.payroll_owner_organization()));
create index organization_payroll_settings_updated_by_idx on public.organization_payroll_settings(updated_by);

create function private.save_owner_payroll_settings(period_days integer,first_period_start date) returns void
language plpgsql security definer set search_path='' as $$
declare org uuid:=private.payroll_owner_organization();
begin
 if period_days is null or period_days not in (7,14) or first_period_start is null or first_period_start not between date '1900-01-01' and date '2200-12-31' then
 raise exception 'Choose weekly or every two weeks and a valid anchor date' using errcode='22023'; end if;
 insert into public.organization_payroll_settings(organization_id,cadence_days,anchor_date,updated_by)
 values(org,period_days,first_period_start,auth.uid()) on conflict(organization_id) do update
 set cadence_days=excluded.cadence_days,anchor_date=excluded.anchor_date,updated_by=excluded.updated_by,updated_at=now();
end $$;
revoke all on function private.save_owner_payroll_settings(integer,date) from public,anon,authenticated;
grant execute on function private.save_owner_payroll_settings(integer,date) to authenticated;
create function public.save_owner_payroll_settings(period_days integer,first_period_start date) returns void
language sql security invoker set search_path='' as $$select private.save_owner_payroll_settings($1,$2)$$;
revoke all on function public.save_owner_payroll_settings(integer,date) from public,anon,authenticated;
grant execute on function public.save_owner_payroll_settings(integer,date) to authenticated;

create function private.get_owner_payroll_report(range_start date default null,range_end date default null) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare org uuid:=private.payroll_owner_organization(); zone text; today date; cadence integer:=7; anchor date:=date '1970-01-05'; configured boolean;
 first_date date;last_date date;report jsonb;
begin
 select timezone into strict zone from public.organizations where id=org;
 zone:=coalesce(zone,'America/Denver');today:=(now() at time zone zone)::date;
 select cadence_days,anchor_date into cadence,anchor from public.organization_payroll_settings where organization_id=org;
 configured:=found;cadence:=coalesce(cadence,7);anchor:=coalesce(anchor,date '1970-01-05');
 if (range_start is null)<>(range_end is null) then raise exception 'Choose both payroll dates' using errcode='22023'; end if;
 if range_start is null then
  first_date:=anchor+(floor((today-anchor)::numeric/cadence)::integer*cadence);last_date:=first_date+cadence-1;
 else first_date:=range_start;last_date:=range_end;
 end if;
 if first_date not between date '1900-01-01' and date '2200-12-31' or last_date not between date '1900-01-01' and date '2200-12-31' or last_date<first_date then raise exception 'Choose a valid inclusive payroll date range' using errcode='22023'; end if;
 with period_bookings as materialized (
  select b.*,coalesce(b.currency,p.currency,'USD') reporting_currency,
   (b.session_price_minor is null or b.coach_compensation_minor is null or coalesce(b.compensation_model::text,'none')='none' or b.payment_status='refunded') needs_review
  from public.bookings b left join public.organization_session_pricing p on p.organization_id=b.organization_id
  where b.organization_id=org and b.status='completed'
   and b.starts_at>=(first_date::timestamp at time zone zone) and b.starts_at<((last_date+1)::timestamp at time zone zone)
 ), roster as (
  select m.user_id,m.status::text status from public.organization_memberships m where m.organization_id=org and m.role='coach'
  union all
  select distinct b.coach_user_id,'historical' from period_bookings b where not exists(select 1 from public.organization_memberships m where m.organization_id=org and m.user_id=b.coach_user_id and m.role='coach')
 ), amounts as (
  select coach_user_id,reporting_currency currency,count(*) sessions,count(*) filter(where needs_review) review_count,
   count(*) filter(where session_price_minor is null) unpriced,count(*) filter(where payment_status='refunded') refunded,
   coalesce(sum(session_price_minor) filter(where payment_status<>'refunded'),0) revenue,
   coalesce(sum(coach_compensation_minor) filter(where not needs_review and compensation_model='percentage'),0) commission,
   coalesce(sum(coach_compensation_minor) filter(where not needs_review and compensation_model='hourly'),0) hourly
  from period_bookings group by coach_user_id,reporting_currency
 ), amount_json as (
  select a.*,jsonb_build_object('currency',currency,'revenueMinor',revenue::text,'commissionMinor',commission::text,'hourlyMinor',hourly::text,'totalMinor',(commission+hourly)::text,'reviewSessions',review_count,'unpriced',unpriced,'refunded',refunded) data from amounts a
 ), coaches as (
  select r.user_id,coalesce(nullif(p.preferred_name,''),p.full_name,'Former Coach') name,r.status,
  jsonb_build_object('id',r.user_id,'name',coalesce(nullif(p.preferred_name,''),p.full_name,'Former Coach'),'status',r.status,
   'model',coalesce(c.model::text,'none'),'commissionBasisPoints',c.commission_basis_points,'hourlyRateMinor',c.hourly_rate_minor::text,'currency',coalesce(c.currency,'USD'),
   'completedSessions',coalesce((select sum(a.sessions) from amounts a where a.coach_user_id=r.user_id),0),
   'reviewSessions',coalesce((select sum(a.review_count) from amounts a where a.coach_user_id=r.user_id),0),
   'amounts',coalesce((select jsonb_agg(a.data order by a.currency) from amount_json a where a.coach_user_id=r.user_id),'[]')) data
  from roster r left join public.profiles p on p.id=r.user_id left join public.coach_compensation_configs c on c.organization_id=org and c.coach_user_id=r.user_id
 ), totals as (
  select currency,sum(revenue) revenue,sum(commission) commission,sum(hourly) hourly,sum(review_count) review_count,sum(unpriced) unpriced,sum(refunded) refunded from amounts group by currency
 ) select jsonb_build_object('timezone',zone,'today',today,'startDate',first_date,'endDate',last_date,
  'settings',jsonb_build_object('cadenceDays',cadence,'anchorDate',anchor,'startWeekday',extract(dow from anchor)::integer,'configured',configured),
  'completedSessions',(select count(*) from period_bookings),'reviewSessions',(select count(*) from period_bookings where needs_review),
  'coaches',coalesce((select jsonb_agg(c.data order by c.name,c.user_id) from coaches c),'[]'),
  'totals',coalesce((select jsonb_agg(jsonb_build_object('currency',currency,'revenueMinor',revenue::text,'commissionMinor',commission::text,'hourlyMinor',hourly::text,'totalMinor',(commission+hourly)::text,'reviewSessions',review_count,'unpriced',unpriced,'refunded',refunded) order by currency) from totals),'[]')) into report;
 return report;
end $$;
revoke all on function private.get_owner_payroll_report(date,date) from public,anon,authenticated;
grant execute on function private.get_owner_payroll_report(date,date) to authenticated;
create function public.get_owner_payroll_report(range_start date default null,range_end date default null) returns jsonb
language sql stable security invoker set search_path='' as $$select private.get_owner_payroll_report($1,$2)$$;
revoke all on function public.get_owner_payroll_report(date,date) from public,anon,authenticated;
grant execute on function public.get_owner_payroll_report(date,date) to authenticated;
notify pgrst,'reload schema';
