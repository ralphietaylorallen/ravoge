import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { PGlite } from "@electric-sql/pglite";

// Execute the real new migration and existing daily/booked workers in isolated
// PostgreSQL. Core auth tables and the external generation/approval RPCs are fixtures.
test("week/month availability and unbooked workout plans save atomically with Coach isolation", async () => {
  const db = new PGlite();
  const org = "fe000000-0000-4000-8000-000000000001";
  const coach = "fe000000-0000-4000-8000-000000000002";
  const client = "fe000000-0000-4000-8000-000000000003";
  const other = "fe000000-0000-4000-8000-000000000004";
  try {
    await db.exec(`
      create role anon; create role authenticated; create schema auth; create schema private;
      grant usage on schema auth,private to authenticated;
      create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
      create type public.organization_role as enum('owner','coach','client');
      create table organizations(id uuid primary key,timezone text,status text default 'active');
      create table memberships(organization_id uuid,user_id uuid,role public.organization_role,status text default 'active');
      create table assignments(org uuid,coach uuid,client uuid,status text default 'active');
      create function public.get_my_authorized_memberships() returns setof public.memberships language sql security definer set search_path='' as $$ select * from public.memberships where user_id=auth.uid() $$;
      create function private.has_active_role(org uuid,roles public.organization_role[]) returns boolean language sql security definer set search_path='' as $$ select exists(select 1 from public.memberships m where m.organization_id=$1 and m.user_id=auth.uid() and m.role=any($2) and m.status='active') $$;
      create function private.can_manage_client_domain(org uuid,client uuid) returns boolean language sql security definer set search_path='' as $$ select exists(select 1 from public.assignments a where a.org=$1 and a.client=$2 and a.coach=auth.uid() and a.status='active') $$;
      create table organization_hours(organization_id uuid,day_of_week integer,is_closed boolean,opens_at time,closes_at time);
      create table organization_special_hours(organization_id uuid,local_date date,is_closed boolean,opens_at time,closes_at time);
      create table coach_availability_exceptions(organization_id uuid,coach_user_id uuid,kind text,starts_at timestamptz,ends_at timestamptz,label text,check(ends_at>starts_at));
      alter table coach_availability_exceptions enable row level security;
      create policy own_hours on coach_availability_exceptions to authenticated using(coach_user_id=auth.uid() and private.has_active_role(organization_id,array['coach']::public.organization_role[]));
      grant select on organizations,organization_hours,organization_special_hours to authenticated;
      grant select,insert,delete on coach_availability_exceptions to authenticated;
      create table bookings(id uuid primary key default gen_random_uuid(),organization_id uuid,coach_user_id uuid,client_user_id uuid,starts_at timestamptz,ends_at timestamptz,timezone text,status text default 'scheduled',session_type text default 'Private training');
      create table generated_prescriptions(id uuid primary key default gen_random_uuid(),organization_id uuid,coach_user_id uuid,client_user_id uuid,engine_version text default 'prescription-v0.2',status text default 'draft',title text default 'Generated workout',generated_at timestamptz default now(),workout_assignment_id uuid,generation_context jsonb default '{}',original_recommendation jsonb default '[]',final_prescription jsonb default '[]');
      create table workout_assignments(id uuid primary key default gen_random_uuid(),organization_id uuid,coach_user_id uuid,client_user_id uuid,source_prescription_id uuid,scheduled_date date,scheduled_time time,status text default 'assigned',title text,created_at timestamptz default now());
      create function public.generate_initial_prescription_v0(target_client_user_id uuid) returns uuid language plpgsql security definer set search_path='' as $$ declare result uuid; begin
        insert into public.generated_prescriptions(organization_id,coach_user_id,client_user_id) select a.org,a.coach,a.client from public.assignments a where a.client=$1 and a.coach=auth.uid() returning id into result; return result; end $$;
      create function public.approve_pound_prescription(target_prescription_id uuid,workout_title text,workout_instructions text,workout_scheduled_date date,workout_duration_minutes smallint,exercises jsonb) returns uuid language plpgsql security definer set search_path='' as $$ declare p public.generated_prescriptions%rowtype; result uuid; begin
        select * into strict p from public.generated_prescriptions where id=$1 for update;
        insert into public.workout_assignments(organization_id,coach_user_id,client_user_id,source_prescription_id,title,scheduled_date) values(p.organization_id,p.coach_user_id,p.client_user_id,p.id,$2,$4) returning id into result;
        update public.generated_prescriptions set status='assigned',workout_assignment_id=result where id=p.id; return result; end $$;
    `);
    const daily = await readFile("supabase/migrations/20261109211201_coach_calendar_availability.sql", "utf8");
    await db.exec(daily.split("-- Coaches can share")[0]);
    await db.exec(await readFile("supabase/migrations/20261111225804_booked_workout_preparation.sql", "utf8"));
    await db.exec(await readFile("supabase/migrations/20261119165000_coach_period_availability_and_planned_generation.sql", "utf8"));
    await db.query("insert into organizations(id,timezone) values($1,'America/Denver')", [org]);
    await db.query("insert into memberships(organization_id,user_id,role) values($1,$2,'coach'),($1,$3,'client'),($1,$4,'coach')", [org, coach, client, other]);
    await db.query("insert into assignments values($1,$2,$3)", [org, coach, client]);
    const { rows: [period] } = await db.query<{ first: string; monday: string; closed: string }>(`select
      (date_trunc('month',current_date)+interval '1 month')::date::text first,
      (date_trunc('month',current_date)+interval '1 month'+interval '21 days')::date::text closed,
      (date_trunc('week',current_date)+interval '14 days')::date::text monday`);
    await db.query("insert into organization_special_hours values($1,$2,true,null,null)", [org, period.closed]);
    await db.query("insert into coach_availability_exceptions values($1,$2,'vacation',($3::date+time '10:00') at time zone 'America/Denver',($3::date+time '11:00') at time zone 'America/Denver','Keep time off')", [org, coach, period.first]);
    const actor = async (id: string) => {
      await db.exec("reset role; set role authenticated");
      await db.query("select set_config('request.jwt.claim.sub',$1,false)", [id]);
    };
    const repeat = async (date: string, scope: string, days = [1, 2, 3, 4, 5, 6], ranges = [{ start: 300, end: 480 }]) =>
      (await db.query<{ result: { savedDates: string[] } }>("select public.save_coach_calendar_period($1,$2,45,$3::jsonb,$4,$5::integer[]) result", [org, date, JSON.stringify(ranges), scope, days])).rows[0].result.savedDates;
    await actor(coach);
    await assert.rejects(() => db.query("select public.save_coach_calendar_period($1,$2,60,'[]','month',array[1])", [other, period.first]), /Active Coach access required/);
    await assert.rejects(() => db.query("select public.begin_planned_workout_draft($1,$2,$3,'09:00')", [other, client, period.first]), /Assigned Coach access required/);
    const month = await repeat(period.first, "month");
    assert.ok(month.length >= 22);
    assert.ok(month.every(date => date.slice(0, 7) === period.first.slice(0, 7) && new Date(`${date}T12:00:00Z`).getUTCDay() !== 0));
    assert.ok(!month.includes(period.closed));
    const week = await repeat(period.monday, "week", [1, 3, 5]);
    assert.equal(week.length, 3);
    assert.deepEqual(week.map(date => new Date(`${date}T12:00:00Z`).getUTCDay()), [1, 3, 5]);
    // A later single-day edit is retained when reopening that date, leaving other days intact.
    await db.query("select public.save_coach_calendar_day($1,$2,60,'[]')", [org, week[1]]);
    const exceptions = await db.query<{ local_day: string; kind: string }>("select (starts_at at time zone 'America/Denver')::date::text local_day,kind from coach_availability_exceptions where label like 'Ravoge calendar availability%' and (starts_at at time zone 'America/Denver')::date=any($1::date[])", [week]);
    assert.ok(!exceptions.rows.some(row => row.local_day === week[1] && row.kind === "available_override"));
    assert.ok(exceptions.rows.some(row => row.local_day === week[0] && row.kind === "available_override"));
    assert.equal((await db.query("select label from coach_availability_exceptions where label='Keep time off'")).rows.length, 1);
    const snapshot = (await db.query("select * from coach_availability_exceptions order by starts_at,label")).rows;
    await assert.rejects(() => repeat(period.first, "month", [1, 2], [{ start: 480, end: 300 }]), /Invalid time range/);
    assert.deepEqual((await db.query("select * from coach_availability_exceptions order by starts_at,label")).rows, snapshot);
    await assert.rejects(() => repeat(period.first, "month", []), /Invalid availability/);
    // Force a later write to fail after earlier dates have been replaced.
    await db.exec("reset role");
    await db.exec(`alter table coach_availability_exceptions add constraint injected_save_failure check(kind<>'available_override' or (starts_at at time zone 'America/Denver')::date<>date '${week[2]}') not valid`);
    await actor(coach);
    await assert.rejects(() => repeat(period.monday, "week", [1, 3, 5], [{ start: 360, end: 540 }]), /injected_save_failure/);
    assert.deepEqual((await db.query("select * from coach_availability_exceptions order by starts_at,label")).rows, snapshot);
    await db.exec("reset role; alter table coach_availability_exceptions drop constraint injected_save_failure");
    await actor(coach);

    const begin = async (time = "09:00") => (await db.query<{ result: { prescriptionId?: string; workoutId?: string; busy?: boolean; reused?: boolean } }>(
      "select public.begin_planned_workout_draft($1,$2,$3,$4) result", [org, client, period.first, time])).rows[0].result;
    const draft = await begin();
    assert.ok(draft.prescriptionId);
    assert.equal((await begin()).busy, true);
    await db.exec("reset role");
    await db.query("update generated_prescriptions set engine_version='prescription-v0.4-openai' where id=$1", [draft.prescriptionId]);
    await actor(coach);
    assert.equal((await begin()).prescriptionId, draft.prescriptionId);
    await actor(other);
    await assert.rejects(begin, /Assigned Coach access required/);
    await actor(client);
    await assert.rejects(begin, /Assigned Coach access required/);
    await assert.rejects(() => repeat(period.first, "month"), /Active Coach access required/);
    await actor(coach);
    const approve = async (time = "09:00", revision = 0) => (await db.query<{ id: string }>(
      "select public.approve_scheduled_prescription($1,$2,'Saved plan',null,$3,$4,60::smallint,'[]') id", [draft.prescriptionId, revision, period.first, time])).rows[0].id;
    await assert.rejects(() => approve("10:00"), /choose its date and time/);
    await assert.rejects(() => approve("09:00", 1), /Draft changed/);
    const workoutId = await approve();
    assert.equal(await approve(), workoutId);
    assert.equal((await begin()).workoutId, workoutId);
    await db.exec("reset role");
    const saved = (await db.query<{ day: string; time: string }>('select scheduled_date::text as "day",scheduled_time::text as "time" from workout_assignments where id=$1', [workoutId])).rows[0];
    assert.deepEqual(saved, { day: period.first, time: "09:00:00" });
    assert.equal((await db.query("select id from workout_assignments")).rows.length, 1);
    assert.equal((await db.query("select id from bookings")).rows.length, 0);
    await db.query("insert into bookings(organization_id,coach_user_id,client_user_id,starts_at,ends_at,timezone) values($1,$2,$3,($4::date+time '10:00') at time zone 'America/Denver',($4::date+time '11:00') at time zone 'America/Denver','America/Denver')", [org, coach, client, period.first]);
    await actor(coach);
    const bookedDraft = await begin("10:00");
    await db.exec("reset role");
    const bookedContext = (await db.query<{ context: { preparedBookingId?: string } }>("select generation_context context from generated_prescriptions where id=$1", [bookedDraft.prescriptionId])).rows[0].context;
    assert.ok(bookedContext.preparedBookingId);
    await db.query("insert into organization_special_hours values($1,$2,false,'06:00','07:00')", [org, week[0]]);
    await actor(coach);
    await repeat(period.monday, "week", [1]);
    const clipped = (await db.query<{ start: string; end: string }>(`select (starts_at at time zone 'America/Denver')::time::text as "start",
      (ends_at at time zone 'America/Denver')::time::text as "end" from coach_availability_exceptions
      where kind='available_override' and (starts_at at time zone 'America/Denver')::date=$1`, [week[0]])).rows;
    assert.deepEqual(clipped, [{ start: "06:00:00", end: "07:00:00" }]);
    await repeat(period.first, "month");
    await db.exec("reset role");
    assert.equal((await db.query("select id from bookings where status='scheduled'")).rows.length, 1);
    const security = (await db.query<{ anonymous: boolean; definer: boolean }>("select has_function_privilege('anon','public.begin_planned_workout_draft(uuid,uuid,date,time)','execute') anonymous,(select prosecdef from pg_proc where oid='public.begin_planned_workout_draft(uuid,uuid,date,time)'::regprocedure) definer")).rows[0];
    assert.deepEqual(security, { anonymous: false, definer: false });
  } finally { await db.close(); }
});
