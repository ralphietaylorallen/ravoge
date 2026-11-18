import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { PGlite } from "@electric-sql/pglite";

test("manual workout edits keep the client's link, validate replacements and protect started plans", async () => {
  const db = new PGlite();
  try {
    await db.exec(`
      create role anon; create role authenticated; create schema auth; create schema private;
      grant usage on schema private to authenticated;
      create function auth.uid() returns uuid language sql stable as
        $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
      create table public.organizations(id uuid primary key, status text default 'active');
      create table public.profiles(id uuid primary key, account_status text default 'active');
      create table private.request_memberships(organization_id uuid,user_id uuid,role text,status text default 'active');
      create table private.assignments(gym uuid,coach uuid,client uuid);
      create function private.has_active_coach_client_assignment(uuid,uuid,uuid) returns boolean
        language sql stable as $$ select exists(select 1 from private.assignments a where (a.gym,a.coach,a.client)=($1,$2,$3)) $$;
      create table public.workout_assignments(id uuid primary key default gen_random_uuid(),organization_id uuid,coach_user_id uuid,
        client_user_id uuid,title text,instructions text,scheduled_date date,scheduled_time time,status text default 'assigned',
        updated_at timestamptz default now(),execution_started_at timestamptz,paired_workout_group_id uuid,source_prescription_id uuid);
      create function private.touch_workout() returns trigger language plpgsql as $$ begin new.updated_at:=clock_timestamp();return new;end $$;
      create trigger touch_workout before update on public.workout_assignments for each row execute function private.touch_workout();
      create table public.workout_exercises(id uuid primary key default gen_random_uuid(),workout_assignment_id uuid references workout_assignments,
        exercise_name text,sets integer not null,reps integer not null,load numeric,load_unit text,rest_seconds integer,notes text,
        selection_reason text,sort_order integer,prescription_details jsonb,completed_at timestamptz);
      create table public.workout_sets(workout_exercise_id uuid references workout_exercises on delete cascade,
        outcome_status text,execution_result text,actual_reps integer,actual_load numeric);
      create function private.mark_workout_pounds(uuid) returns void language sql as $$ select $$;
    `);
    const sql = await readFile(new URL("../../supabase/migrations/20261118010500_edit_manual_workout_plans.sql", import.meta.url), "utf8");
    await db.exec(sql);
    const gym = "ac100000-0000-4000-8000-000000000001";
    const coach = "ac100000-0000-4000-8000-000000000002";
    const client = "ac100000-0000-4000-8000-000000000003";
    const other = "ac100000-0000-4000-8000-000000000004";
    await db.query("insert into organizations(id) values($1)", [gym]);
    await db.query("insert into profiles(id) values($1),($2),($3)", [coach, client, other]);
    await db.query("insert into private.request_memberships values($1,$2,'coach','active'),($1,$3,'coach','active')", [gym, coach, other]);
    await db.query("insert into private.assignments values($1,$2,$3)", [gym, coach, client]);
    const actor = async (id: string) => {
      await db.exec("reset role; set role authenticated");
      await db.query("select set_config('request.jwt.claim.sub',$1,false)", [id]);
    };
    await actor(coach);
    const rows = [{ name: "Goblet squat", sets: 3, reps: 8, load: "25", mode: "reps", restSeconds: 60 }];
    const create = async (day: string) => (await db.query<{ id: string }>(
      "select public.create_planned_workout_assignment_lb($1,'Strength session',null,$2,'09:00',$3) id",
      [client, day, JSON.stringify(rows)],
    )).rows[0].id;
    const id = await create("2027-01-05");
    await create("2027-01-07");
    await db.exec("reset role");
    const revision = async () => (await db.query<{ updated_at: string }>(
      "select updated_at::text from workout_assignments where id=$1", [id],
    )).rows[0].updated_at;
    const before = await revision();
    const update = (date: string, timestamp: string, exercises = rows) => db.query<{ id: string }>(
      "select public.update_planned_workout_assignment_lb($1,$2,$3,'Revised strength',null,$4,'09:00',$5) id",
      [id, client, timestamp, date, JSON.stringify(exercises)],
    );
    await actor(other);
    await assert.rejects(() => update("2027-01-05", before), /not assigned/);
    await actor(coach);
    await assert.rejects(() => update("2027-01-07", before), /already planned/);
    const revised = [{ ...rows[0], reps: 6, load: "20" }];
    assert.equal((await update("2027-01-05", before, revised)).rows[0].id, id);
    await assert.rejects(() => update("2027-01-05", before), /another device/);
    await db.exec("reset role");
    const current = await revision();
    await actor(coach);
    await assert.rejects(() => update("2027-01-06", current, [{ ...rows[0], reps: 0 }]), /Invalid exercise/);
    await db.exec("reset role");
    const stored = (await db.query("select w.title,w.scheduled_date::text,e.reps,e.load::text from workout_assignments w join workout_exercises e on e.workout_assignment_id=w.id where w.id=$1", [id])).rows;
    assert.deepEqual(stored, [{ title: "Revised strength", scheduled_date: "2027-01-05", reps: 6, load: "20" }]);
    await db.query("update workout_assignments set status='in_progress' where id=$1", [id]);
    const started = await revision();
    await actor(coach);
    await assert.rejects(() => update("2027-01-05", started), /unstarted/);
  } finally {
    await db.close();
  }
});
