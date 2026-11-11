import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import ts from "typescript";
import { savedWorkoutPreparation } from "../../lib/workout-preparation.ts";

function generationHarness(initial:Record<string,unknown>) {
 const calls:string[]=[];let providerCalls=0;
 const source=readFileSync(new URL('../../lib/create-workout-draft.ts',import.meta.url),'utf8');
 const exports:Record<string,(args:unknown)=>Promise<Record<string,unknown>>>={};
 const compiled=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS}}).outputText;
 new Function('require','exports',compiled)((name:string)=>{
   if(name==='server-only')return {};
   if(name.includes('workout-intelligence'))return {generateIntelligentWorkout:()=>{providerCalls++;throw new Error('Provider must not run for existing preparation');}};
   return {};
 },exports);
 const supabase={rpc(name:string){calls.push(name);return {abortSignal:async()=>({data:initial,error:null})};}};
 return {run:()=>exports.createGeneratedWorkoutDraft({clientId:'dd000000-0000-4000-8000-000000000001',bookingId:'dd000000-0000-4000-8000-000000000002',userId:'coach',supabase}),calls,get providerCalls(){return providerCalls;}};
}
test('reopening a saved session draft does not regenerate or overwrite it',async()=>{
 const h=generationHarness({prescriptionId:'dd000000-0000-4000-8000-000000000003',reused:true});
 const result=await h.run();assert.equal(result.ok,true);assert.equal(result.prescriptionId,'dd000000-0000-4000-8000-000000000003');assert.equal(h.providerCalls,0);assert.deepEqual(h.calls,['begin_booking_workout_draft']);
});
test('repeat submission while preparation is running produces no second provider request',async()=>{
 const h=generationHarness({busy:true});const result=await h.run();assert.equal(result.ok,false);assert.equal(result.status,409);assert.equal(h.providerCalls,0);assert.equal(h.calls.length,1);
});
test('an existing assigned or manual workout opens without making a new draft',async()=>{
 const h=generationHarness({workoutId:'dd000000-0000-4000-8000-000000000004',reused:true});const result=await h.run();assert.equal(result.ok,true);assert.equal(result.workoutId,'dd000000-0000-4000-8000-000000000004');assert.equal(h.providerCalls,0);
});
test('saved edits preserve prescription details and instructions on reopening',()=>{
 const draft={title:'Tomorrow plan',instructions:'Coach edited this ahead',scheduledDate:'2026-11-20',duration:45,exercises:[{libraryExerciseId:'exercise-a',name:'Squat',sets:3,reps:7,load:125,loadUnit:'lb',notes:'Coach instruction',reason:'Goal',restSeconds:90,referenceLoadLb:'225',bandResistance:'light'}]};
 assert.deepEqual(savedWorkoutPreparation(JSON.parse(JSON.stringify(draft))),draft);
 assert.equal(savedWorkoutPreparation({title:'broken',exercises:[]}),null);
});
test('advance preparation has its own authenticated route and never fabricates a daily check-in',()=>{
 const route=readFileSync(new URL('../../app/api/coach/clients/[clientId]/sessions/[bookingId]/workout/route.ts',import.meta.url),'utf8');
 const helper=readFileSync(new URL('../../lib/create-workout-draft.ts',import.meta.url),'utf8');
 assert.match(route,/getVerifiedUser/);assert.match(route,/membership\?\.role!=="coach"/);assert.match(route,/new URL\(origin\)\.host!==host/);
 assert.doesNotMatch(route,/prepareTrainingSession|readiness:/);
 assert.match(helper,/bookingId\?\{todayReadiness:null\}/);
});
