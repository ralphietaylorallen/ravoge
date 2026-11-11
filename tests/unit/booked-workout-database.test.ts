import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { PGlite } from "@electric-sql/pglite";

// Isolated PostgreSQL/WASM. Core schema and pre-existing generation/approval RPCs
// are stand-ins; the new migration, RLS, triggers and private workers are real SQL.
// Full Ravoge migration integration remains in supabase/tests/booked_workout_preparation.sql.
test("isolated database: appointment drafts, private edits, stale saves, approval, rescheduling and cancellation", async () => {
 const db=new PGlite();
 try {
 await db.exec(`
 create role anon; create role authenticated; create schema auth; create schema private;
 create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
 grant usage on schema auth,private to authenticated;
 create type public.organization_role as enum('owner','coach','client');
 create table public.memberships(org uuid,user_id uuid,role public.organization_role,status text default 'active');
 create table public.assignments(org uuid,coach uuid,client uuid,status text default 'active');
 create function private.has_active_role(org uuid,roles public.organization_role[]) returns boolean language sql security definer set search_path='' as $$ select exists(select 1 from public.memberships m where m.org=$1 and m.user_id=auth.uid() and m.role=any($2) and m.status='active') $$;
 create function private.can_manage_client_domain(org uuid,client uuid) returns boolean language sql security definer set search_path='' as $$ select exists(select 1 from public.assignments a join public.memberships m on m.org=a.org and m.user_id=a.client and m.status='active' where a.org=$1 and a.client=$2 and a.coach=auth.uid() and a.status='active') $$;
 create table public.bookings(id uuid primary key,organization_id uuid,coach_user_id uuid,client_user_id uuid,starts_at timestamptz,ends_at timestamptz,timezone text,status text default 'scheduled',session_type text default 'Private training');
 create table public.generated_prescriptions(id uuid primary key default gen_random_uuid(),organization_id uuid,coach_user_id uuid,client_user_id uuid,engine_version text default 'prescription-v0.2',status text default 'draft',title text default 'Generated workout',generated_at timestamptz default now(),workout_assignment_id uuid,generation_context jsonb default '{}',original_recommendation jsonb default '[]',final_prescription jsonb default '[]');
 create table public.workout_assignments(id uuid primary key default gen_random_uuid(),organization_id uuid,coach_user_id uuid,client_user_id uuid,source_prescription_id uuid,scheduled_date date,scheduled_time time,status text default 'assigned',title text,created_at timestamptz default now());
 alter table public.generated_prescriptions enable row level security;
 create policy draft_read on public.generated_prescriptions for select to authenticated using(coach_user_id=auth.uid() or (status='assigned' and client_user_id=auth.uid()));
 grant select on public.generated_prescriptions to authenticated;
 create function public.generate_initial_prescription_v0(target_client_user_id uuid) returns uuid language plpgsql security definer set search_path='' as $$ declare result uuid; begin
 insert into public.generated_prescriptions(organization_id,coach_user_id,client_user_id) select a.org,a.coach,a.client from public.assignments a where a.client=$1 and a.coach=auth.uid() returning id into result;return result;end $$;
 create function public.approve_pound_prescription(target_prescription_id uuid,workout_title text,workout_instructions text,workout_scheduled_date date,workout_duration_minutes smallint,exercises jsonb) returns uuid language plpgsql security definer set search_path='' as $$ declare p public.generated_prescriptions%rowtype; result uuid;begin
 select * into strict p from public.generated_prescriptions where id=$1 for update;
 insert into public.workout_assignments(organization_id,coach_user_id,client_user_id,source_prescription_id,title,scheduled_date) values(p.organization_id,p.coach_user_id,p.client_user_id,p.id,$2,$4) returning id into result;
 update public.generated_prescriptions set status='assigned',workout_assignment_id=result where id=p.id;return result;end $$;
 `);
 const migration=await readFile(new URL("../../supabase/migrations/20261111213059_booked_workout_preparation.sql",import.meta.url),"utf8");
 await db.exec(migration);
 const org='cc000000-0000-4000-8000-000000000001', coach='cc000000-0000-4000-8000-000000000002', client='cc000000-0000-4000-8000-000000000003', other='cc000000-0000-4000-8000-000000000004', booking='cc000000-0000-4000-8000-000000000005';
 await db.query("insert into memberships(org,user_id,role) values($1,$2,'coach'),($1,$3,'client'),($1,$4,'coach')",[org,coach,client,other]);
 await db.query("insert into assignments(org,coach,client) values($1,$2,$3)",[org,coach,client]);
 await db.query("insert into bookings(id,organization_id,coach_user_id,client_user_id,starts_at,ends_at,timezone) values($1,$2,$3,$4,'2027-01-05T16:00:00Z','2027-01-05T17:00:00Z','America/Denver')",[booking,org,coach,client]);
 const actor=async(id:string)=>{await db.exec("reset role; set role authenticated");await db.query("select set_config('request.jwt.claim.sub',$1,false)",[id]);};
 const begin=async()=> (await db.query<{draft:{prescriptionId:string;busy?:boolean;reused?:boolean;workoutId?:string}}>("select public.begin_booking_workout_draft($1,$2) draft",[booking,client])).rows[0].draft;
 await actor(coach);
 const initial=await begin();assert.ok(initial.prescriptionId);
 assert.equal((await begin()).busy,true);
 await db.exec("reset role");await db.query("update generated_prescriptions set engine_version='prescription-v0.4-openai' where id=$1",[initial.prescriptionId]);
 await actor(coach);await db.query("select public.finish_booking_workout_draft($1)",[initial.prescriptionId]);
 assert.equal((await begin()).prescriptionId,initial.prescriptionId);
 const draft={title:'Coach edited plan',instructions:'Keep this saved',scheduledDate:'2026-01-01',duration:60,exercises:[{libraryExerciseId:'cc000000-0000-4000-8000-000000000006',name:'Squat',sets:3,reps:5,load:95,loadUnit:'lb',notes:'Coach note',reason:'Saved edit'}]};
 const save=async(revision:number)=>(await db.query<{revision:number}>("select public.save_workout_preparation($1,$2,$3::jsonb) revision",[initial.prescriptionId,revision,JSON.stringify(draft)])).rows[0].revision;
 assert.equal(await save(0),1);
 await assert.rejects(()=>save(0),/another device/);
 const stored=(await db.query<{status:string;generation_context:{coachDraft:typeof draft};original_recommendation:unknown[]}>("select status,generation_context,original_recommendation from generated_prescriptions where id=$1",[initial.prescriptionId])).rows[0];
 assert.equal(stored.status,'draft');assert.equal(stored.generation_context.coachDraft.exercises[0].load,95);assert.equal(stored.generation_context.coachDraft.scheduledDate,'2027-01-05');assert.deepEqual(stored.original_recommendation,[]);
 await actor(other);await assert.rejects(begin,/assigned Coach required/);await assert.rejects(()=>save(1),/assigned Coach draft required/);
 await actor(client);assert.equal((await db.query("select id from generated_prescriptions where id=$1",[initial.prescriptionId])).rows.length,0);await assert.rejects(()=>save(1),/assigned Coach draft required/);
 await actor(coach);
 const approve=async()=> (await db.query<{id:string}>("select public.approve_prepared_prescription($1,1,'Saved session',null,'2026-01-01',60::smallint,$2::jsonb) id",[initial.prescriptionId,JSON.stringify(draft.exercises)])).rows[0].id;
 const workout=await approve();assert.equal(await approve(),workout);assert.equal((await begin()).workoutId,workout);
 await db.exec("reset role");
 let scheduled=(await db.query<{scheduled_date:string;scheduled_time:string}>("select scheduled_date::text,scheduled_time::text from workout_assignments where id=$1",[workout])).rows[0];
 assert.equal(scheduled.scheduled_date,'2027-01-05');assert.equal(scheduled.scheduled_time,'09:00:00');
 await db.query("update bookings set starts_at='2027-01-06T17:30:00Z',ends_at='2027-01-06T18:30:00Z' where id=$1",[booking]);
 scheduled=(await db.query<{scheduled_date:string;scheduled_time:string}>("select scheduled_date::text,scheduled_time::text from workout_assignments where id=$1",[workout])).rows[0];
 assert.equal(scheduled.scheduled_date,'2027-01-06');assert.equal(scheduled.scheduled_time,'10:30:00');
 await db.query("update bookings set status='cancelled' where id=$1",[booking]);await actor(coach);await assert.rejects(begin,/Scheduled session/);
 await db.exec("reset role");
 const second='cc000000-0000-4000-8000-000000000007', manual='cc000000-0000-4000-8000-000000000008';
 await db.query("insert into bookings(id,organization_id,coach_user_id,client_user_id,starts_at,ends_at,timezone) values($1,$2,$3,$4,'2027-01-09T16:00:00Z','2027-01-09T17:00:00Z','America/Denver')",[second,org,coach,client]);
 await db.query("insert into workout_assignments(id,organization_id,coach_user_id,client_user_id,scheduled_date,scheduled_time,title) values($1,$2,$3,$4,'2027-01-09','09:00','Manual plan')",[manual,org,coach,client]);
 await actor(coach);
 const manualResult=(await db.query<{result:{workoutId:string}}>("select public.begin_booking_workout_draft($1,$2) result",[second,client])).rows[0].result;
 assert.equal(manualResult.workoutId,manual);
 assert.equal((await db.query("select id from generated_prescriptions")).rows.length,1);
 await db.exec("reset role");
 const privileges=(await db.query<{anonymous:boolean;definer:boolean}>("select has_function_privilege('anon','public.save_workout_preparation(uuid,integer,jsonb)','execute') anonymous,(select prosecdef from pg_proc where oid='public.save_workout_preparation(uuid,integer,jsonb)'::regprocedure) definer")).rows[0];
 assert.equal(privileges.anonymous,false);assert.equal(privileges.definer,false);
 } finally {await db.close();}
});
