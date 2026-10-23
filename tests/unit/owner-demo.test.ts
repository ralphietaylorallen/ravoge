import {test} from "node:test";
import assert from "node:assert/strict";
import {demoIntake,demoStorageKey,newDemoData,sampleExercises,toDemoWorkout} from "../../lib/demo-state.ts";
import {ownerDemoInput} from "../../lib/owner-demo-generation.ts";
import {emptySpot} from "../../lib/intake-history.ts";
import type {SupabaseClient} from "@supabase/supabase-js";

test("blank demo intake can advance using disclosed sample assumptions, while entered age and goal are retained",()=>{
  const skipped=demoIntake({});assert.equal(skipped.context.age,35);assert.ok(skipped.assumptions.some(s=>s.includes("age")));
  const entered=demoIntake({age:["68"],primaryGoal:["mobility"],experienceLevel:["intermediate"],recentWorkoutDays:["0"],trainingFrequencyGoal:["2"],sessionDurationMinutes:["30"]});
  assert.equal(entered.context.age,68);assert.equal(entered.goal,"mobility");assert.equal(entered.context.recentWorkoutDays,0);assert.equal(entered.frequency,2);assert.equal(entered.duration,30);assert.equal(entered.assumptions.length,0);
});
test("demo state is namespaced to organization and owner; sample results never invent performed work",()=>{
  assert.notEqual(demoStorageKey("a","owner"),demoStorageKey("b","owner"));assert.notEqual(demoStorageKey("a","owner"),demoStorageKey("a","other"));
  const a=newDemoData(),b=newDemoData();a.intake.age=["65"];assert.deepEqual(b.intake,{});
  const workout=toDemoWorkout(sampleExercises(),"Test",30,"mobility");assert.equal(workout.status,"assigned");assert.ok(workout.exercises.every(e=>e.workout_sets.every(s=>s.completed_at===null&&s.actual_reps===null)));
});
function readonlyGym(){
  const calls:{table:string;operation:string;args:unknown[]}[]=[];
  const exercise=(id:string,name:string,pattern:string)=>({id,name,movement_pattern:pattern,equipment_requirements:[],difficulty:"beginner",primary_quality:"general_fitness",measurement:"reps",laterality:"bilateral",primary_muscles:[],secondary_muscles:[],purposes:["strength"],default_rep_min:5,default_rep_max:20,contraindication_tags:[]});
  const tables:Record<string,unknown[]>={exercise_library:[exercise("squat","Bodyweight squat","squat"),exercise("push","Push-up","horizontal_push"),exercise("row","Row","horizontal_pull")],organization_equipment:[],organization_facilities:[],exercise_load_rules:[{exercise_id:"squat"}],training_library_items:[{id:"reference",title:"Gym sample",reference_version:1,reference_signature:{exerciseIds:["squat","push","row"],formats:["circuit"],terms:[]},normalized_content:{cells:[{display:"Bodyweight squat"},{display:"Push-up"}]}}]};
  return {calls,client:{from(table:string){const q:Record<string,unknown>={then(resolve:(r:unknown)=>unknown){return Promise.resolve({data:tables[table],error:null}).then(resolve);}};for(const operation of ["select","eq","or","is","order","limit"])q[operation]=(...args:unknown[])=>{calls.push({table,operation,args});return q;};return q;}} as unknown as SupabaseClient};
}
test("demo generation reads only the current gym and includes age, assessment and canonical reference segments",async()=>{
  const gym=readonlyGym(),data=newDemoData();data.intake={age:["68"],primaryGoal:["mobility"],squatLoadLb:["95"],movementLimitations:["Test stiffness"],coachNotes:["Test notes"]};
  const {input}=await ownerDemoInput(gym.client,"owner-gym",data);
  assert.equal(input.intakeContext?.age,68);assert.equal(input.goal,"mobility");assert.equal(input.intakeAssessment?.strengthAssessments.squatLoadLb,"95");assert.equal(input.intakeAssessment?.movementObservations.limitations,"Test stiffness");
  assert.deepEqual(input.references[0].segments,[{key:"cell_1",exerciseIds:["squat"]},{key:"cell_2",exerciseIds:["push"]}]);
  for(const table of ["organization_equipment","training_library_items","organization_facilities"])assert.ok(gym.calls.some(c=>c.table===table&&c.operation==="eq"&&c.args[0]==="organization_id"&&c.args[1]==="owner-gym"));
  assert.ok(gym.calls.every(c=>["select","eq","or","is","order","limit"].includes(c.operation)));
});
test("zero-pain surgical test history remains in input and constrains exercise selection",async()=>{
  const gym=readonlyGym(),data=newDemoData();data.spots=[{...emptySpot(),region:"shoulder",categories:["surgery"],pain:0,surgeryRepair:"Test repair"}];
  const {input}=await ownerDemoInput(gym.client,"owner-gym",data);
  assert.equal(input.injurySpots?.[0].surgeryRepair,"Test repair");assert.ok(input.candidates.every(c=>!["horizontal_push","horizontal_pull"].includes(c.pattern)));
});
