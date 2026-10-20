import assert from "node:assert/strict";
import test from "node:test";
import { analyzeTrainingIntent, generateIntelligentWorkout, planningProjection, retrieveGymKnowledge, validateTrainingAnalysis, type TrainingAnalysis } from "../../lib/workout-intelligence.ts";
import { generationSaveIssue, validateQualityWorkout } from "../../lib/workout-generation-quality.ts";
import { defaultProtocol } from "../../lib/workout-protocol.ts";
import type { GenerationInput } from "../../lib/workout-generation.ts";

function context(goal="athletic_performance"):GenerationInput {
  const candidates=["squat","hinge","horizontal_pull","conditioning"].map((pattern,index)=>({id:`private-exercise-${index}`,name:"PRIVATE PERSON private@example.test",pattern,equipment:index===3?["rower"]:["dumbbells"],difficulty:"beginner",quality:"general_fitness",measurement:index===3?"time" as const:"reps" as const,laterality:"bilateral",repMax:20}));
  const references=["athletic_performance","muscle_gain","fat_loss"].map((goal,index)=>({id:`private-source-${index}`,title:"RAW SOURCE MUST NOT BE SENT",revision:1,goal,duration:40,exercises:candidates.map(e=>({libraryExerciseId:e.id,sets:3,reps:e.measurement==="reps"?8:1,restSeconds:90,protocol:defaultProtocol(e.measurement)}))}));
  return {schemaVersion:2,snapshot:"private-snapshot",intakeId:"private-intake",goal,secondaryGoal:"strength",trainingFocus:goal==="athletic_performance"?"running_5k":goal==="muscle_gain"?"muscle_growth":"fat_loss_support",experience:"intermediate",frequency:3,duration:45,targets:{weightKg:80},bodyComposition:{weightKg:90},restrictions:{tags:["impact"],hasInjuries:true,hasPain:false,hasLimitations:true,hasAvoidedExercises:true,coachReviewed:true},equipment:["dumbbells","rower"],candidates,references,knowledgeCatalog:references,knowledgeCounts:{total:124,approved:3,eligible:3},history:[],facilities:[{type:"turf",length:25,unit:"yards"}]};
}
function analysis(goal="athletic_performance"):TrainingAnalysis {
  return {objectives:goal==="athletic_performance"?["running_economy","aerobic_endurance"]:goal==="muscle_gain"?["hypertrophy"]:["general_fitness","fat_loss_support"],priorityPatterns:goal==="athletic_performance"?["conditioning","hinge","squat"]:["squat","hinge","horizontal_pull"],methods:["warmup","strength","conditioning"],preferredFormats:["straight"],progression:"technique_then_reps",intensityCeiling:7};
}
function output(input:GenerationInput) {
  const rows=input.goal==="muscle_gain"?[0,1,2]:[0,1,2,3];
  return {title:"Individual Coach-review session",rationale:"Adapted reviewed gym structures to the saved goal, restrictions and actual resources.",durationMinutes:40,sourceReferenceKeys:["reference_1"],exercises:rows.map(index=>({exerciseKey:`exercise_${index+1}`,sets:3,reps:index===3?1:input.goal==="muscle_gain"?12:input.goal==="athletic_performance"?6:10,restSeconds:input.goal==="athletic_performance"?120:90,notes:"Coach confirms technique and load.",reason:"Compatible movement adapted to the Client goal and reviewed gym structure.",protocol:{...defaultProtocol(index===3?"time":"reps"),block:index===3?"conditioning":"strength"}}))};
}

test("runner, muscle-growth and fitness/fat-loss use a compact OpenAI intent then relevant gym retrieval and individualized validated drafts",async()=>{
  const signatures=new Set<string>();
  for(const goal of ["athletic_performance","muscle_gain","fat_loss"]) {
    const input=context(goal);let calls=0;
    const sdk={responses:{create:async(request:Record<string,unknown>)=>{
      calls++; const serialized=JSON.stringify(request); for(const secret of ["private@example.test","PRIVATE PERSON","private-source","private-exercise","RAW SOURCE","private-intake"]) assert.ok(!serialized.includes(secret));
      assert.equal(request.store,false);assert.deepEqual(request.tools,[]);
      if(calls===1) {assert.ok(!serialized.includes("publishedStructures"));assert.ok(serialized.includes(input.trainingFocus!));return {status:"completed",output_text:JSON.stringify(analysis(goal))};}
      assert.ok(serialized.includes("trainingAnalysis"));assert.ok(serialized.includes("reference_1"));assert.ok(!serialized.includes("knowledgeCatalog"));
      return {status:"completed",output_text:JSON.stringify(output(input))};
    }}};
    const result=await generateIntelligentWorkout(input,sdk as never);
    assert.equal(calls,2);assert.equal(result.intelligence?.method,"openai");assert.ok(result.workout);
    assert.equal(result.workout.sourceReviewIds?.[0],input.references.find(r=>r.goal===goal)!.id);
    assert.ok(result.workout.exercises.every(e=>e.load===null&&e.loadUnit==="lb"));signatures.add(JSON.stringify(result.workout.exercises.map(e=>[e.libraryExerciseId,e.reps,e.restSeconds])));
  }
  assert.equal(signatures.size,3);
});

test("retrieval searches all 124 reviewed entries instead of a newest-three prefix and respects gym identity",()=>{
  const input=context();const generic=input.references[2];
  input.knowledgeCatalog=Array.from({length:124},(_,i)=>({...generic,id:`review-${String(i).padStart(3,"0")}`,goal:i===123?"athletic_performance":"general_fitness"}));
  assert.equal(retrieveGymKnowledge(input,analysis())[0].id,"review-123");assert.equal(retrieveGymKnowledge(input,analysis()).length,3);
  const another=context();another.knowledgeCatalog=[{...another.references[0],id:"different-gym-immutable-review",exercises:another.references[0].exercises.slice(1)}];
  assert.notDeepEqual(retrieveGymKnowledge(input,analysis()),retrieveGymKnowledge(another,analysis()));
});

test("analysis cache is bounded to validated deidentified context and invalidates on changed goals/history",async()=>{
  const input=context();input.duration=37;let calls=0;
  const sdk={responses:{create:async()=>{calls++;return {status:"completed",output_text:JSON.stringify(analysis())};}}};
  const a=await analyzeTrainingIntent(input,sdk as never),b=await analyzeTrainingIntent(input,sdk as never);
  assert.equal(a.cacheHit,false);assert.equal(b.cacheHit,true);assert.equal(calls,1);
  input.history=[{status:"completed",exercises:[{id:input.candidates[0].id,sets:3,reps:8,restSeconds:90,performance:{recorded:3,problematic:1,averageReps:5,averageLoad:20,averageRpe:8,averageWorkSeconds:null,averageDistance:null}}]}];
  await analyzeTrainingIntent(input,sdk as never);assert.equal(calls,2);
  const p=JSON.stringify(planningProjection(input));assert.ok(!p.includes("PRIVATE PERSON"));assert.ok(!p.includes("RAW SOURCE"));assert.ok(p.includes("averageLoadLb"));
});

test("retrieval excludes a whole incompatible circuit while preserving independent compatible blocks",()=>{
  const input=context(); const reference=input.references[0];
  const grouped={...defaultProtocol("reps"),format:"circuit" as const,group:"A"};
  reference.exercises=[{...reference.exercises[0],protocol:grouped},{...reference.exercises[1],libraryExerciseId:"unavailable",protocol:grouped},reference.exercises[2]];
  input.knowledgeCatalog=[reference];
  assert.deepEqual(retrieveGymKnowledge(input,analysis())[0].exercises,[reference.exercises[2]]);
});

test("unsafe/unknown analysis is rejected and a provider failure is a truthful structured-goal fallback",async()=>{
  const input=context();input.duration=38;
  for(const bad of [{...analysis(),priorityPatterns:["invented"]},{...analysis(),intensityCeiling:10},{...analysis(),progression:"prescribe_maximal_load"},{...analysis(),objectives:["diagnose_injury"]}]) assert.throws(()=>validateTrainingAnalysis(bad,input));
  let calls=0;const sdk={responses:{create:async()=>{calls++;throw Error("private provider failure");}}};
  assert.equal((await analyzeTrainingIntent(input,sdk as never)).method,"rules_fallback");assert.equal(calls,1);
});

test("no approved sources yields explicit general programming without fabricated historical source credits",()=>{
  const input=context();input.knowledgeCatalog=[];input.references=[];input.intelligence={analysis:analysis(),method:"openai",cacheHit:false};
  assert.deepEqual(retrieveGymKnowledge(input,analysis()),[]);
  const proposed=output(input);proposed.sourceReferenceKeys=[];
  assert.deepEqual(validateQualityWorkout(JSON.stringify(proposed),input).sourceReviewIds,[]);
  proposed.sourceReferenceKeys=["reference_1"];assert.throws(()=>validateQualityWorkout(JSON.stringify(proposed),input));
});

test("source claims and planned intensity cannot bypass existing review validation",()=>{
  const input=context();input.intelligence={analysis:analysis(),method:"openai",cacheHit:false};
  const missing=output(input);missing.sourceReferenceKeys=[];assert.throws(()=>validateQualityWorkout(JSON.stringify(missing),input));
  const forged=output(input);forged.sourceReferenceKeys=["foreign-source"];assert.throws(()=>validateQualityWorkout(JSON.stringify(forged),input));
  const intense=output(input);intense.exercises[0].protocol.targetRpe=8;assert.throws(()=>validateQualityWorkout(JSON.stringify(intense),input));
  assert.equal(generationSaveIssue("Invalid training analysis"),"Invalid training analysis");
  assert.equal(generationSaveIssue("private@example.test invalid raw workout"),"other_database_validation");
});
