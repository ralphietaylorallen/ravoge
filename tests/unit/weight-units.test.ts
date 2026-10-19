import assert from "node:assert/strict";
import test from "node:test";
import { canonicalPounds, kilogramsToPounds, poundsToKilograms, poundsInputFromCanonical, loadInPounds, loadLabel, poundsInText } from "../../lib/weight-units.ts";
import { parsePoundBodyCompositionGoals } from "../../lib/intake-targets.ts";
import { achievableBarbellLoads, parseWeightSizes, validateWeightRange, validatePoundLoad, roundedPercentageLoad, generatedWeightTextIsLoadFree, type WeightCapability } from "../../lib/equipment-weights.ts";
import { deidentifiedGenerationInput, type GenerationInput } from "../../lib/workout-generation.ts";

test("pound conversion uses the specified exact factor, preserves blanks and rejects nonfinite values", () => {
  assert.equal(kilogramsToPounds(1), 2.20462262185);
  assert.equal(poundsToKilograms(2.20462262185), 1);
  for (const blank of [null, undefined, "", "  "]) { assert.equal(poundsToKilograms(blank), null); assert.equal(kilogramsToPounds(blank), null); }
  for (const invalid of ["NaN", "Infinity", "invalid"]) assert.throws(() => poundsToKilograms(invalid));
  assert.equal(canonicalPounds(80), "176.4");
});
test("canonical edit/resave does not accumulate one-decimal presentation rounding", () => {
  let value = 80.123;
  for (let n=0;n<100;n++) value = poundsToKilograms(poundsInputFromCanonical(value))!;
  assert.ok(Math.abs(value-80.123)<1e-9);
});
test("body composition goals convert once to existing canonical keys; muscle is mass, not percentage", () => {
  const f=new FormData(); f.set("goalWeightLb","180"); f.set("goalSkeletalMuscleMassLb","80"); f.set("goalBodyFatPercentage","18");
  const goals=parsePoundBodyCompositionGoals(f)!;
  assert.equal(goals.weightKg,poundsToKilograms(180)); assert.equal(goals.skeletalMuscleMassKg,poundsToKilograms(80)); assert.equal(goals.bodyFatPercentage,18);
  f.set("goalSkeletalMuscleMassLb","200"); assert.equal(parsePoundBodyCompositionGoals(f),null);
  assert.deepEqual(parsePoundBodyCompositionGoals(new FormData()),{});
});
test("historical explicit units convert for viewing without mutation; unknown units are never guessed",()=>{
  const row={actual_load:40,actual_load_unit:"kg"};
  assert.equal(loadInPounds(row.actual_load,row.actual_load_unit),88.184904874);
  assert.equal(loadLabel(40,"kg"),"88.2 lb"); assert.equal(loadLabel(40,"lb"),"40.0 lb");
  assert.match(loadLabel(40,null),/unit unrecorded/); assert.equal(loadInPounds(40,null),null);
  assert.deepEqual(row,{actual_load:40,actual_load_unit:"kg"});
  assert.equal(poundsInText("Historical 40 kg; 12 reps"),"Historical 88.2 lb; 12 reps");
});
const capabilities:WeightCapability[]=[{type:"barbell",minLb:35,maxLb:45,sizesLb:[35,45]},{type:"plates",minLb:2.5,maxLb:45,sizesLb:[2.5,5,10,25,35,45],pairsConfirmed:true},{type:"dumbbells",minLb:5,maxLb:50,sizesLb:[5,10,20,35,50]}];
test("generated prose cannot bypass structured load validation with hidden absolute or percentage weights",()=>{
  for(const value of ["Use 60 lb dumbbells","Use 60-pound dumbbells","Add 2.5lbs","Use 70% of max","Load pounds 100"])assert.equal(generatedWeightTextIsLoadFree(value),false);
  assert.equal(generatedWeightTextIsLoadFree("Aim for RPE 6; rest 90 seconds. Coach selects the load."),true);
});
test("equipment sizes allow decimals, normalize duplicates, and reject invalid ranges without inventing values",()=>{
  assert.deepEqual(parseWeightSizes("45, 2.5, 10, 45"),[2.5,10,45]); assert.equal(parseWeightSizes(""),null);
  for(const text of ["0","-1","Infinity","5,","2.1234"])assert.throws(()=>parseWeightSizes(text));
  assert.throws(()=>validateWeightRange(45,35,null)); assert.throws(()=>validateWeightRange(5,40,[45])); validateWeightRange(null,null,null);
});
test("individual bars/plates are distinct from total assembled load, with at most one confirmed pair per size",()=>{
  const loads=achievableBarbellLoads(capabilities)!;
  assert.ok(loads.includes(95)); assert.ok(loads.includes(290)); assert.ok(!loads.includes(96)); assert.ok(!loads.includes(300));
  assert.equal(validatePoundLoad(95,["barbell"],capabilities),"exact");
  assert.throws(()=>validatePoundLoad(96,["barbell"],capabilities)); assert.throws(()=>validatePoundLoad(25,["barbell"],capabilities));
  assert.throws(()=>validatePoundLoad(20,["barbell"],[{type:"barbell",minLb:null,maxLb:null,sizesLb:[45]}]));
  assert.throws(()=>validatePoundLoad(55,["dumbbells"],capabilities)); assert.throws(()=>validatePoundLoad(30,["dumbbells"],capabilities));
  assert.equal(validatePoundLoad(35,["dumbbells"],capabilities),"exact");
});
test("unknown quantities or unconfirmed pairs never prove arbitrary assembled weights; percentages round down to achievable pounds",()=>{
  assert.equal(achievableBarbellLoads(capabilities.map(c=>({...c,pairsConfirmed:false}))),null);
  assert.equal(validatePoundLoad(95,["barbell"],[]),"coach_confirmation");
  assert.equal(roundedPercentageLoad(137,70,["barbell"],capabilities),95);
  assert.throws(()=>roundedPercentageLoad(100,70,["barbell"],[]));
});
test("OpenAI receives pounds-only deidentified body, goals, equipment and historical performance",()=>{
  const input:GenerationInput={schemaVersion:2,snapshot:"private",intakeId:"private",goal:"strength",secondaryGoal:null,experience:"intermediate",frequency:3,duration:45,
    targets:{weightKg:80,skeletalMuscleMassKg:35,bodyFatPercentage:18},bodyComposition:{weightKg:85,skeletalMuscleMassKg:33},
    restrictions:{tags:[],hasInjuries:false,hasPain:false,hasLimitations:false,hasAvoidedExercises:false,coachReviewed:true},equipment:["barbell","plates"],weightCapabilities:capabilities,
    candidates:[{id:"private-id",name:"Private name",pattern:"squat",equipment:["barbell"],difficulty:"intermediate",quality:"strength"}],references:[],
    history:[{status:"completed",exercises:[{id:"private-id",sets:3,reps:5,restSeconds:120,performance:{recorded:3,problematic:0,averageReps:5,averageLoad:40,averageRpe:6,averageWorkSeconds:null,averageDistance:null}}]}]};
  const p=deidentifiedGenerationInput(input); const text=JSON.stringify(p);
  assert.equal(p.weightUnit,"lb"); assert.equal(p.bodyComposition.weightLb,kilogramsToPounds(85)); assert.equal(p.optionalTargets.skeletalMuscleMassLb,kilogramsToPounds(35));
  assert.ok(text.includes('"averageLoadLb":88.184904874')); assert.ok(!text.includes('"weightKg"')); assert.ok(!text.includes('"averageLoad"')); assert.ok(!text.includes("private-id"));
  assert.deepEqual(p.weightCapabilities,capabilities.map(c=>({...c,pairsConfirmed:c.pairsConfirmed===true})));
});
