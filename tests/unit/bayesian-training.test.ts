import assert from 'node:assert/strict';
import test from 'node:test';
import {readFile} from 'node:fs/promises';
import {PGlite} from '@electric-sql/pglite';
import {betaBlockPosterior,learningDecision,type BayesianExercise} from '../../lib/bayesian-training.ts';
import {parseWorkoutRequest} from '../../lib/workout-request.ts';

test('Beta completion posterior starts neutral, weights each block once and retains uncertainty',()=>{
 assert.deepEqual(betaBlockPosterior([]),{alpha:1,beta:1,mean:.5,variance:1/12,blocks:0});
 const successes=betaBlockPosterior([1,1,1]);assert.equal(successes.mean,.8);assert.equal(successes.blocks,3);assert.ok(successes.variance<1/12);
 assert.equal(betaBlockPosterior([.5]).mean,.5);assert.equal(betaBlockPosterior([0]).mean,1/3);
 for(const bad of [NaN,2,-1])assert.throws(()=>betaBlockPosterior([bad]));
 assert.match(learningDecision({blocks:20,mean:.95,pain:true} as BayesianExercise),/pain/);
});
test('Coach request permits multiple focus areas but rejects unknown choices, impossible dates and time',()=>{
 assert.deepEqual(parseWorkoutRequest({sections:['legs','shoulders','legs'],duration:45,scheduledDate:'2027-01-02'}),{sections:['legs','shoulders'],duration:45,scheduledDate:'2027-01-02'});
 for(const request of [{sections:['fake'],duration:45},{sections:[],duration:45},{sections:['legs'],duration:0},{sections:['legs'],duration:45,scheduledDate:'2027-02-30'}])assert.throws(()=>parseWorkoutRequest(request));
});
// Execute the actual additive migration. Earlier system RPCs are stand-ins;
// posterior aggregation, access checks, request snapshots and hold logic are real.
test('database learning is scoped, repeatable, excludes partial/substituted blocks and holds uncertain increases',async()=>{
 const db=new PGlite();
 try{
 await db.exec(`create role anon;create role authenticated;create schema private;create schema auth;
 create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
 create table public.memberships(organization_id uuid,user_id uuid,status text);
 create view private.request_memberships as select * from public.memberships where user_id=auth.uid();
 create function private.can_read_client_domain(org uuid,client uuid) returns boolean language sql as $$select auth.uid()=client or exists(select 1 from public.memberships where organization_id=org and user_id=auth.uid())$$;
 create function private.can_manage_client_domain(org uuid,client uuid) returns boolean language sql as $$select exists(select 1 from public.memberships where organization_id=org and user_id=auth.uid())$$;
 create table public.generated_prescriptions(id uuid primary key,organization_id uuid,client_user_id uuid,coach_user_id uuid,status text,generation_context jsonb default '{}');
 create table public.workout_assignments(id uuid primary key,organization_id uuid,client_user_id uuid,status text,created_at timestamptz default now());
 create table public.exercise_library(id uuid primary key,name text,equipment_requirements text[]);
 create table public.workout_exercises(id uuid primary key,workout_assignment_id uuid,library_exercise_id uuid,prescription_details jsonb default '{}',load_prescription jsonb default '{}',reps int,sets int,load numeric,load_unit text);
 create table public.workout_sets(id uuid default gen_random_uuid(),workout_exercise_id uuid,completed_at timestamptz,pain_reported boolean,client_result text,execution_result text,performed_library_exercise_id uuid,failure_reason text);
 create function public.get_prescription_generation_input(target_prescription_id uuid) returns jsonb language sql as $$select '{"duration":45,"snapshot":"before"}'::jsonb$$;
 create function public.get_pound_generation_input(target_prescription_id uuid) returns jsonb language sql as $$select public.get_prescription_generation_input($1)$$;
 create function public.complete_pound_prescription(target_prescription_id uuid,expected_snapshot text,proposed_workout jsonb,generation_details jsonb) returns void language sql as $$select null::void$$;
 create function private.resolve_starting_load(prescription uuid,row_data jsonb) returns jsonb language sql as $$select '{"load":55,"loadPrescription":{"load":55,"semantics":"total","calibrationRequired":false}}'::jsonb$$;
 create function private.confirmed_loads(org uuid,equipment text[],semantics text) returns numeric[] language sql as $$select array[25,50,55]::numeric[]$$;
 `);
 await db.exec(await readFile('supabase/migrations/20261118154859_research_grounding_bayesian_learning.sql','utf8'));
 const org='ed000000-0000-4000-8000-000000000001',coach='ed000000-0000-4000-8000-000000000002',client='ed000000-0000-4000-8000-000000000003',ex='ed000000-0000-4000-8000-000000000004',draft='ed000000-0000-4000-8000-000000000005';
 await db.query("insert into memberships values($1,$2,'active'),($1,$3,'active')",[org,coach,client]);
 await db.query("insert into exercise_library values($1,'Squat',array['barbell'])",[ex]);
 await db.query("insert into generated_prescriptions values($1,$2,$3,$4,'draft','{}')",[draft,org,client,coach]);
 const actor=async(id:string)=>db.query("select set_config('request.jwt.claim.sub',$1,false)",[id]);
 const get=async()=> (await db.query<{data:{exercises:BayesianExercise[]}}>('select public.get_bayesian_training_context($1) data',[client])).rows[0].data;
 await actor(coach);assert.equal((await get()).exercises.length,0);
 for(let i=0;i<5;i++){
  const workout=crypto.randomUUID(),block=crypto.randomUUID();
  await db.query("insert into workout_assignments(id,organization_id,client_user_id,status) values($1,$2,$3,'completed')",[workout,org,client]);
  await db.query("insert into workout_exercises(id,workout_assignment_id,library_exercise_id,reps,sets,load,load_unit) values($1,$2,$3,8,3,50,'lb')",[block,workout,ex]);
  await db.query("insert into workout_sets(workout_exercise_id,completed_at,pain_reported,client_result) select $1,case when $2=3 and n=3 then null else now() end,false,'complete' from generate_series(1,3)n",[block,i]);
  if(i===4)await db.query("update workout_sets set performed_library_exercise_id=$2 where workout_exercise_id=$1",[block,crypto.randomUUID()]);
  if(i===0){
   const row=(await get()).exercises[0];assert.equal(row.blocks,1);assert.equal(row.mean,2/3);assert.deepEqual(await get(),await get());
   const resolved=(await db.query<{data:{load:number}}>('select private.resolve_starting_load($1,$2) data',[draft,JSON.stringify({libraryExerciseId:ex,reps:8,protocol:{format:'straight'}})])).rows[0].data;assert.equal(resolved.load,50);
  }
 }
 const learned=(await get()).exercises[0];assert.equal(learned.blocks,3);assert.equal(learned.mean,.8);
 const resolved=(await db.query<{data:{load:number}}>('select private.resolve_starting_load($1,$2) data',[draft,JSON.stringify({libraryExerciseId:ex,reps:8,protocol:{format:'straight'}})])).rows[0].data;assert.equal(resolved.load,55);
 await db.query("select public.configure_workout_generation($1,$2)",[draft,JSON.stringify({sections:['legs','shoulders'],duration:60,scheduledDate:'2027-01-05'})]);
 const projected=(await db.query<{data:{duration:number;sessionRequest:{sections:string[]};bayesianTraining:{exercises:BayesianExercise[]}}}>('select public.get_prescription_generation_input($1) data',[draft])).rows[0].data;
 assert.equal(projected.duration,60);assert.deepEqual(projected.sessionRequest.sections,['legs','shoulders']);assert.equal(projected.bayesianTraining.exercises[0].blocks,3);
 await actor(crypto.randomUUID());await assert.rejects(get,/access denied/);await assert.rejects(()=>db.query('select public.configure_workout_generation($1,$2)',[draft,'{"sections":["legs"],"duration":45}']),/access required/);
 const privileges=(await db.query<{allowed:boolean}>("select has_function_privilege('anon','public.get_bayesian_training_context(uuid)','execute') allowed")).rows[0];assert.equal(privileges.allowed,false);
 }finally{await db.close();}
});
