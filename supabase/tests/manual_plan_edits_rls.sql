begin;
create temporary table plan_qa (id uuid primary key, revision timestamptz not null);
grant select, insert, update on plan_qa to authenticated;
create function pg_temp.assert_true(value boolean, message text) returns void language plpgsql as $$
begin if value is distinct from true then raise exception '%',message; end if; end $$;

insert into auth.users(id,aud,role,email,email_confirmed_at,raw_app_meta_data,raw_user_meta_data,created_at,updated_at)
select ('ac110000-1000-4000-8000-'||lpad(n::text,12,'0'))::uuid,'authenticated','authenticated',
       'ravoge-plan-qa-'||n||'@example.test',now(),'{}',jsonb_build_object('full_name','Plan QA '||n),now(),now()
from generate_series(1,4) n;
insert into public.organizations(id,name) values ('ac110000-2000-4000-8000-000000000001','Isolated Plan QA');
insert into public.organization_memberships(organization_id,user_id,role) values
 ('ac110000-2000-4000-8000-000000000001','ac110000-1000-4000-8000-000000000001','owner'),
 ('ac110000-2000-4000-8000-000000000001','ac110000-1000-4000-8000-000000000002','coach'),
 ('ac110000-2000-4000-8000-000000000001','ac110000-1000-4000-8000-000000000003','client'),
 ('ac110000-2000-4000-8000-000000000001','ac110000-1000-4000-8000-000000000004','coach');
insert into public.coach_client_assignments(organization_id,coach_user_id,client_user_id)
values ('ac110000-2000-4000-8000-000000000001','ac110000-1000-4000-8000-000000000002','ac110000-1000-4000-8000-000000000003');

set local role authenticated;
select set_config('request.jwt.claim.sub','ac110000-1000-4000-8000-000000000002',true);
do $$
declare workout uuid;
begin
  workout:=public.create_planned_workout_assignment_lb('ac110000-1000-4000-8000-000000000003','Strength Tuesday',null,current_date+7,'09:00',
    '[{"name":"Goblet squat","sets":3,"reps":8,"load":"25","mode":"reps","restSeconds":60}]');
  insert into plan_qa select id,updated_at from public.workout_assignments where id=workout;
end $$;
select pg_temp.assert_true((select count(*)=1 from plan_qa),'Coach cannot see new workout');
select set_config('request.jwt.claim.sub','ac110000-1000-4000-8000-000000000003',true);
select pg_temp.assert_true((select count(*)=1 from public.workout_assignments w join plan_qa p using(id)),'Client cannot see future workout');
do $$
begin
  perform public.update_planned_workout_assignment_lb((select id from plan_qa),'ac110000-1000-4000-8000-000000000003',
    (select revision from plan_qa),'Unauthorized edit',null,current_date+7,'09:00','[]');
  raise exception 'Unexpected write';
exception when others then if sqlerrm='Unexpected write' then raise; end if; end $$;
select set_config('request.jwt.claim.sub','ac110000-1000-4000-8000-000000000002',true);
select public.update_planned_workout_assignment_lb((select id from plan_qa),'ac110000-1000-4000-8000-000000000003',
  (select revision from plan_qa),'Revised strength',null,current_date+8,'10:00',
  '[{"name":"Goblet squat","sets":3,"reps":6,"load":"20","mode":"reps","restSeconds":60},
    {"name":"Plank","sets":2,"reps":1,"mode":"time","durationSeconds":45,"restSeconds":60}]');
select set_config('request.jwt.claim.sub','ac110000-1000-4000-8000-000000000003',true);
select pg_temp.assert_true((select w.title='Revised strength' and w.scheduled_date=current_date+8 and w.scheduled_time='10:00'
  from public.workout_assignments w join plan_qa p using(id)),'Client cannot see revised schedule at original link');
select pg_temp.assert_true((select count(*)=5 from public.workout_sets s join public.workout_exercises e on e.id=s.workout_exercise_id
  join plan_qa p on p.id=e.workout_assignment_id),'Updated rows did not regenerate scheduled sets');
select pg_temp.assert_true((select e.prescription_details->>'workSeconds'='45' from public.workout_exercises e join plan_qa p on p.id=e.workout_assignment_id
  where e.exercise_name='Plank'),'Timed workout prescription was lost');
reset role;
select 'Validated coach edit, client visibility, timed rows and scheduled sets' as result;
rollback;
