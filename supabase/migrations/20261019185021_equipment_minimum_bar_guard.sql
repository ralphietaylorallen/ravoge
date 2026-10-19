-- Exact known bare-bar sizes establish a lower bound even when the optional
-- range was left unknown. No data updates or historical unit changes.
create or replace function private.assert_pound_load(org uuid,requirements text[],load_lb numeric)
returns void language plpgsql stable security definer set search_path='' as $$
declare matched boolean; plate_sizes numeric[]; bars numeric[];
begin
 if load_lb is null then return; end if;
 if load_lb::text in ('NaN','Infinity','-Infinity') or load_lb<0 or load_lb>100000 then raise exception 'Invalid load in lb'; end if;
 if 'barbell'=any(requirements) then
   if exists(select 1 from public.organization_equipment where organization_id=org and equipment_type='barbell' and is_available)
     and not exists(select 1 from public.organization_equipment where organization_id=org and equipment_type='barbell' and is_available and (coalesce((select min(n) from unnest(weight_sizes_lb) n),min_weight_lb) is null or load_lb>=coalesce((select min(n) from unnest(weight_sizes_lb) n),min_weight_lb)))
     then raise exception 'Load below unloaded bar weight'; end if;
   select array_agg(distinct n) into bars from public.organization_equipment e cross join lateral unnest(e.weight_sizes_lb) n
     where e.organization_id=org and e.equipment_type='barbell' and e.is_available;
   select array_agg(distinct n order by n) into plate_sizes from public.organization_equipment e cross join lateral unnest(e.weight_sizes_lb) n
     where e.organization_id=org and e.equipment_type='plates' and e.is_available and e.paired_sizes_confirmed;
   if cardinality(plate_sizes)>16 then raise exception 'Too many distinct paired plate sizes; review inventory'; end if;
   if bars is not null and plate_sizes is not null then
     with recursive sums(position,total) as (
       select 0,0::numeric union all select position+1,total+added from sums
       cross join lateral (values(0::numeric),(2*plate_sizes[position+1])) q(added) where position<cardinality(plate_sizes)
     ) select exists(select 1 from sums cross join unnest(bars) bar where position=cardinality(plate_sizes) and abs(total+bar-load_lb)<0.00001) into matched;
     if not matched then raise exception 'Load cannot be assembled from confirmed bars and matched plate pairs'; end if;
   end if;
 elsif exists(select 1 from public.organization_equipment where organization_id=org and equipment_type=any(requirements) and is_available
   and (min_weight_lb is not null or max_weight_lb is not null or weight_sizes_lb is not null)) then
   if not exists(select 1 from public.organization_equipment where organization_id=org and equipment_type=any(requirements) and is_available
     and (min_weight_lb is not null or max_weight_lb is not null or weight_sizes_lb is not null)
     and (min_weight_lb is null or load_lb>=min_weight_lb) and (max_weight_lb is null or load_lb<=max_weight_lb)
     and (weight_sizes_lb is null or load_lb=any(weight_sizes_lb))) then raise exception 'Load outside confirmed available weights'; end if;
 end if;
 -- Unknown quantities/capacities are not evidence of client capacity. Coach
 -- review is still mandatory; no guessed numeric loads are generated.
end $$;
