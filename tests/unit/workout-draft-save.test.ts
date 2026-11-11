import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import test from 'node:test';
import ts from 'typescript';

const client='ee000000-0000-4000-8000-000000000001', prescription='ee000000-0000-4000-8000-000000000002', exercise='ee000000-0000-4000-8000-000000000003';
function setup(saveError: {message:string}|null=null){
 const calls:{name:string;args:Record<string,unknown>}[]=[];
 const from=(table:string)=>{
   const builder={select(){return builder;},eq(){return builder;},in(){return builder;},maybeSingle:async()=>({data:{status:'draft',generation_context:{preparedBookingId:'booking-a'},original_recommendation:[]},error:null}),then(resolve:(value:unknown)=>unknown){return Promise.resolve({data:table==='exercise_library'?[{id:exercise,name:'Squat'}]:[],error:null}).then(resolve);}};
   return builder;
 };
 const supabase={from,rpc:async(name:string,args:Record<string,unknown>)=>{calls.push({name,args});return {data:saveError?null:3,error:saveError};}};
 const exports:Record<string,unknown>={};
 const source=ts.transpileModule(readFileSync(new URL('../../app/coach/actions.ts',import.meta.url),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS}}).outputText;
 new Function('require','exports',source)((name:string)=>{
  if(name==='@/lib/auth')return {requireRole:async()=>({supabase,membership:{organization_id:'org'},userId:'coach'})};
  if(name==='next/cache')return {revalidatePath(){}};
  if(name==='next/navigation')return {redirect(){throw new Error('Save Draft must not assign or redirect');}};
  return {};
 },exports);
 const form=new FormData();
 for(const [name,value] of Object.entries({intent:'save-draft',draftRevision:'2',title:'Ahead of next session',instructions:'Coach edited note',scheduledDate:'2026-12-05',estimatedDurationMinutes:'45',libraryExerciseId:exercise,exerciseSets:'3',exerciseReps:'7',exerciseLoad:'125',exerciseRest:'90',exerciseRpe:'',exerciseNotes:'Controlled tempo',exerciseReason:'Coach choice',referenceLoadLb:'225',bandResistance:''}))form.set(name,value);
 return {calls,run:()=> (exports.approvePrescriptionAction as (...args:unknown[])=>Promise<{status:string;draftRevision?:number;message?:string}>)(client,prescription,{status:'idle'},form)};
}
test('Save Draft stores coach edits and the revision without calling assignment',async()=>{
 const h=setup();const result=await h.run();assert.equal(result.status,'success');assert.equal(result.draftRevision,3);assert.deepEqual(h.calls.map(c=>c.name),['save_workout_preparation']);
 const args=h.calls[0].args;assert.equal(args.expected_revision,2);
 const draft=args.coach_draft as {instructions:string;exercises:{load:string;referenceLoadLb:string;reps:number}[]};assert.equal(draft.instructions,'Coach edited note');assert.equal(draft.exercises[0].load,'125');assert.equal(draft.exercises[0].referenceLoadLb,'225');assert.equal(draft.exercises[0].reps,7);
});
test('a stale-device save produces an error and never assigns a workout',async()=>{
 const h=setup({message:'Draft changed on another device. Reopen it before saving'});const result=await h.run();assert.equal(result.status,'error');assert.match(result.message!,/another device/);assert.deepEqual(h.calls.map(c=>c.name),['save_workout_preparation']);
});
