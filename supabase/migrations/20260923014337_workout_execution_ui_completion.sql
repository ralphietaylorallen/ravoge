-- Extend the existing prescribed sets; targets are never replaced by outcomes.
alter table public.workout_sets
  add column execution_result text check (execution_result in ('complete','failed','not_completed','exceeded')),
  add column recorded_by uuid references auth.users(id) on delete set null;
create index workout_sets_recorded_by_idx on public.workout_sets(recorded_by);
alter table public.workout_assignments
  add column execution_started_at timestamptz,
  add column execution_duration_minutes integer check (execution_duration_minutes between 1 and 480),
  add column execution_coach_notes text check (char_length(execution_coach_notes) <= 4000);

create function public.record_coach_workout_set(target_set_id uuid, result text, performed_reps integer, performed_load numeric, reason public.set_failure_reason, notes text)
returns text language plpgsql security definer set search_path = '' as $$
declare target public.workout_sets%rowtype; workout public.workout_assignments%rowtype; final_result text;
begin
  if (select auth.uid()) is null then raise exception 'Authentication required'; end if;
  select w.* into strict workout from public.workout_assignments w
    join public.workout_exercises e on e.workout_assignment_id=w.id
    join public.workout_sets s on s.workout_exercise_id=e.id where s.id=target_set_id for update of w;
  if not private.can_manage_workout(workout.id) or workout.status not in ('assigned','in_progress') then raise exception 'An active assigned Coach and open workout are required'; end if;
  select * into strict target from public.workout_sets where id=target_set_id for update;
  if result is null or result not in ('complete','failed','not_completed') then raise exception 'Choose a valid set result'; end if;
  if result in ('complete','failed') and (performed_reps is null or performed_load is null) then raise exception 'Record actual reps and load'; end if;
  if performed_reps not between 0 and 1000 or performed_load not between 0 and 100000 or performed_load::text in ('NaN','Infinity','-Infinity') then raise exception 'Invalid actual performance'; end if;
  if result='failed' and reason is null then raise exception 'Choose why the set failed'; end if;
  if result<>'failed' and reason is not null then raise exception 'Failure reason only applies to failed sets'; end if;
  if char_length(notes)>1000 then raise exception 'Notes are too long'; end if;
  final_result := case when result='complete' and (performed_reps>target.prescribed_reps or (target.prescribed_load is not null and performed_load>target.prescribed_load)) then 'exceeded' else result end;
  update public.workout_sets set actual_reps=performed_reps,actual_load=performed_load,
    execution_result=final_result,recorded_by=(select auth.uid()),completed_at=now(),
    outcome_status=case when result='complete' then 'completed'::public.set_outcome_status else 'incomplete'::public.set_outcome_status end,
    failure_reason=case when result='failed' then reason when result='not_completed' then 'other'::public.set_failure_reason else null end,
    failure_notes=nullif(trim(notes),''),difficulty=null where id=target.id;
  update public.workout_exercises e set completed_at=case when not exists (select 1 from public.workout_sets s where s.workout_exercise_id=e.id and s.execution_result is distinct from 'complete' and s.execution_result is distinct from 'exceeded') then now() else null end where e.id=target.workout_exercise_id;
  update public.workout_assignments set status='in_progress',execution_started_at=coalesce(execution_started_at,now()) where id=workout.id;
  return final_result;
end $$;

create function public.save_coach_workout_session(target_workout_id uuid, coach_notes text, duration_minutes integer, finish boolean)
returns void language plpgsql security definer set search_path = '' as $$
declare workout public.workout_assignments%rowtype;
begin
  if (select auth.uid()) is null then raise exception 'Authentication required'; end if;
  select * into strict workout from public.workout_assignments where id=target_workout_id for update;
  if not private.can_manage_workout(workout.id) or workout.status not in ('assigned','in_progress') then raise exception 'An active assigned Coach and open workout are required'; end if;
  if char_length(coach_notes)>4000 or finish is null then raise exception 'Invalid session values'; end if;
  if finish and (duration_minutes is null or duration_minutes not between 1 and 480) then raise exception 'Record session duration'; end if;
  if finish and (not exists(select 1 from public.workout_exercises where workout_assignment_id=workout.id) or exists(select 1 from public.workout_sets s join public.workout_exercises e on e.id=s.workout_exercise_id where e.workout_assignment_id=workout.id and s.execution_result is null)) then raise exception 'Record every set as complete, failed, or not completed first'; end if;
  update public.workout_assignments set execution_coach_notes=nullif(trim(coach_notes),''),
    execution_duration_minutes=case when finish then duration_minutes else execution_duration_minutes end,
    status=case when finish then 'completed'::public.workout_status else status end,
    completed_at=case when finish then now() else completed_at end where id=workout.id;
end $$;

-- Stable question IDs and explicit versions accompany every answer snapshot.
alter table public.organization_preworkout_questions
  add column id uuid not null default gen_random_uuid() unique,
  add column question_version integer not null default 1 check(question_version>0),
  add column wording_status text not null default 'pending_product' check(wording_status in ('pending_product','approved'));
update public.organization_preworkout_questions set question_text='Question ' || position,scale_min=1,scale_max=10 where question_text is null;
create or replace function private.create_preworkout_question_slots()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  insert into public.organization_preworkout_questions(organization_id,position,question_text,scale_min,scale_max)
  select new.id,p,'Question ' || p,1,10 from generate_series(1,8) p;
  return new;
end $$;
create function private.version_preworkout_question() returns trigger language plpgsql security invoker set search_path='' as $$
begin
  if new.id<>old.id or new.organization_id<>old.organization_id or new.position<>old.position then raise exception 'Question identity is immutable'; end if;
  if (new.question_text,new.scale_min,new.scale_max) is distinct from (old.question_text,old.scale_min,old.scale_max) then new.question_version:=old.question_version+1; end if;
  return new;
end $$;
create trigger version_preworkout_question before update on public.organization_preworkout_questions for each row execute function private.version_preworkout_question();
alter table public.preworkout_checkin_answers add column question_id uuid, add column question_version integer;
update public.preworkout_checkin_answers a set question_id=q.id,question_version=q.question_version
from public.preworkout_checkins c,public.organization_preworkout_questions q
where c.id=a.checkin_id and q.organization_id=c.organization_id and q.position=a.position;
alter table public.preworkout_checkin_answers alter column question_id set not null,alter column question_version set not null;
create function private.snapshot_checkin_question() returns trigger language plpgsql security definer set search_path='' as $$
begin
  select q.id,q.question_version into strict new.question_id,new.question_version
  from public.organization_preworkout_questions q join public.preworkout_checkins c on c.organization_id=q.organization_id
  where c.id=new.checkin_id and q.position=new.position;
  return new;
end $$;
create trigger snapshot_checkin_question before insert on public.preworkout_checkin_answers for each row execute function private.snapshot_checkin_question();

create function public.record_coach_preworkout_checkin(target_client_user_id uuid,target_booking_id uuid,target_workout_assignment_id uuid,submitted_answers jsonb)
returns uuid language plpgsql security definer set search_path='' as $$
declare org uuid; checkin uuid; q record; a record;
begin
  if (select auth.uid()) is null then raise exception 'Authentication required'; end if;
  select m.organization_id into strict org from public.organization_memberships m where m.user_id=(select auth.uid()) and m.role='coach' and m.status='active';
  if not private.has_active_coach_client_assignment(org,(select auth.uid()),target_client_user_id) then raise exception 'An active Client assignment is required'; end if;
  if num_nonnulls(target_booking_id,target_workout_assignment_id)<>1 or jsonb_typeof(submitted_answers)<>'array' or jsonb_array_length(submitted_answers)<>8 then raise exception 'Eight answers and one session or workout are required'; end if;
  if target_booking_id is not null and not exists(select 1 from public.bookings where id=target_booking_id and organization_id=org and client_user_id=target_client_user_id and coach_user_id=(select auth.uid()) and status='scheduled') then raise exception 'Session unavailable'; end if;
  if target_workout_assignment_id is not null and not exists(select 1 from public.workout_assignments where id=target_workout_assignment_id and organization_id=org and client_user_id=target_client_user_id and coach_user_id=(select auth.uid()) and status in ('assigned','in_progress')) then raise exception 'Workout unavailable'; end if;
  insert into public.preworkout_checkins(organization_id,client_user_id,booking_id,workout_assignment_id) values(org,target_client_user_id,target_booking_id,target_workout_assignment_id) returning id into checkin;
  for a in select * from jsonb_to_recordset(submitted_answers) as r(position smallint,answer numeric) loop
    select * into strict q from public.organization_preworkout_questions where organization_id=org and position=a.position;
    if q.question_text is null or q.scale_min is null or a.answer is null or a.answer<q.scale_min or a.answer>q.scale_max or a.answer::text in ('NaN','Infinity','-Infinity') then raise exception 'Invalid question response'; end if;
    insert into public.preworkout_checkin_answers(checkin_id,position,question_text,answer,normalized_response) values(checkin,q.position,q.question_text,a.answer,(a.answer-q.scale_min)/(q.scale_max-q.scale_min));
  end loop;
  return checkin;
end $$;

revoke all on function public.record_coach_workout_set(uuid,text,integer,numeric,public.set_failure_reason,text),public.save_coach_workout_session(uuid,text,integer,boolean),public.record_coach_preworkout_checkin(uuid,uuid,uuid,jsonb) from public,anon,authenticated;
grant execute on function public.record_coach_workout_set(uuid,text,integer,numeric,public.set_failure_reason,text),public.save_coach_workout_session(uuid,text,integer,boolean),public.record_coach_preworkout_checkin(uuid,uuid,uuid,jsonb) to authenticated;
revoke all on function private.version_preworkout_question(),private.snapshot_checkin_question() from public,anon,authenticated;
