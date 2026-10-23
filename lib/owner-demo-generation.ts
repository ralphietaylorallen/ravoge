import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { demoIntake, type DemoData } from "./demo-state.ts";
import { validateInjurySpot } from "./intake-history.ts";
import type { GenerationInput } from "./workout-generation.ts";
import { poundsToKilograms } from "./weight-units.ts";

const words=(s:string)=>` ${s.toLowerCase().replace(/\bdb\b/g,"dumbbell").replace(/\bbb\b/g,"barbell").replace(/\brdl\b/g,"romanian deadlift").replace(/[^a-z0-9]+/g," ").trim()} `;
const blockedPatterns=(region:string)=>["head","neck","chest","abdomen"].includes(region)?["squat","hinge","horizontal_push","vertical_push","horizontal_pull","vertical_pull","carry","conditioning","unilateral","power","rotation"]
  :["shoulder","upper_arm","elbow","forearm","wrist","hand"].includes(region)?["horizontal_push","vertical_push","horizontal_pull","vertical_pull","carry","power"]
  :["upper_back","lower_back"].includes(region)?["squat","hinge","carry","rotation","power","vertical_push"]:["squat","hinge","unilateral","knee_flexion","carry","conditioning","power"];

/** Owner-authenticated read-only gym context. Never creates a Client, intake, assignment or booking. */
export async function ownerDemoInput(supabase:SupabaseClient,org:string,data:DemoData):Promise<{input:GenerationInput;assumptions:string[]}> {
  if(!data||data.version!==1||!data.intake||typeof data.intake!=="object"||Array.isArray(data.intake)||Object.keys(data.intake).length>150
    || Object.values(data.intake).some(v=>!Array.isArray(v)||v.length>30||v.some(s=>typeof s!=="string"||s.length>4000))
    || !Array.isArray(data.spots)||data.spots.length>50||!Array.isArray(data.history)||data.history.length>20) throw new Error("Reset the demo and try again.");
  const parsed=demoIntake(data.intake);
  const spots=data.spots.map(s=>validateInjurySpot({...s,categories:s.categories?.length?s.categories:["unexplained_pain"]}));
  const [exerciseResult,equipmentResult,referenceResult,facilityResult,ruleResult]=await Promise.all([
    supabase.from("exercise_library").select("id,name,movement_pattern,equipment_requirements,difficulty,primary_quality,measurement,laterality,primary_muscles,secondary_muscles,purposes,default_rep_min,default_rep_max,contraindication_tags").eq("is_active",true).or(`organization_id.is.null,organization_id.eq.${org}`).limit(1000),
    supabase.from("organization_equipment").select("equipment_type,min_weight_lb,max_weight_lb,weight_sizes_lb,paired_sizes_confirmed").eq("organization_id",org).eq("is_available",true),
    supabase.from("training_library_items").select("id,title,reference_version,reference_signature,normalized_content").eq("organization_id",org).eq("reference_enabled",true).eq("generation_excluded",false).is("reference_deleted_at",null).order("id").limit(1000),
    supabase.from("organization_facilities").select("feature_type,usable_length,length_unit").eq("organization_id",org).eq("is_available",true),
    supabase.from("exercise_load_rules").select("exercise_id").eq("active",true).or(`organization_id.is.null,organization_id.eq.${org}`),
  ]);
  if([exerciseResult,equipmentResult,referenceResult,facilityResult,ruleResult].some(r=>r.error))throw new Error("Gym programming could not be loaded. Your test assessment is preserved.");
  const equipment=[...new Set(["bodyweight",...(equipmentResult.data??[]).map(e=>e.equipment_type)])];
  const facilities=(facilityResult.data??[]).map(f=>({type:f.feature_type,length:Number(f.usable_length),unit:f.length_unit}));
  for(const f of facilities)if(!equipment.includes(f.type))equipment.push(f.type);
  const rules=new Set((ruleResult.data??[]).map(r=>r.exercise_id));
  const excluded=new Set(spots.flatMap(s=>blockedPatterns(s.region)));
  const tags=data.intake.constraintTags??[];
  const avoided=(data.intake.avoidedExercises?.[0]??"").toLowerCase().split(",").map(s=>s.trim()).filter(Boolean);
  const candidates:GenerationInput["candidates"]=(exerciseResult.data??[]).filter(e=>e.equipment_requirements.every((t:string)=>equipment.includes(t))&&!excluded.has(e.movement_pattern)
    &&!(e.contraindication_tags??[]).some((t:string)=>tags.includes(t))&&!avoided.includes(e.name.toLowerCase())
    &&(parsed.experience!=="beginner"||e.difficulty!=="advanced")).map(e=>({id:e.id,name:e.name,canonicalName:e.name,pattern:e.movement_pattern,equipment:e.equipment_requirements,
      difficulty:e.difficulty,quality:e.primary_quality,measurement:e.measurement,laterality:e.laterality,primaryMuscles:e.primary_muscles,secondaryMuscles:e.secondary_muscles,purposes:e.purposes,repMin:e.default_rep_min,repMax:e.default_rep_max,loadRuleSupported:rules.has(e.id)}));
  const candidateIds=new Set(candidates.map(e=>e.id));
  const references:GenerationInput["references"]=(referenceResult.data??[]).map(t=>{
    const sig=t.reference_signature??{};
    const ids=(Array.isArray(sig.exerciseIds)?sig.exerciseIds:[]).filter((id:unknown):id is string=>typeof id==="string"&&candidateIds.has(id));
    const cells=Array.isArray(t.normalized_content?.cells)?t.normalized_content.cells:[];
    return {id:t.id,title:t.title,revision:t.reference_version,goal:sig.goal??"",duration:Number(sig.duration)||0,exercises:[],sourceKind:"raw_reference" as const,
      rawStyle:{exerciseIds:ids,formats:Array.isArray(sig.formats)?sig.formats:[],terms:Array.isArray(sig.terms)?sig.terms:[],rawProtocolsUnverified:true},
      segments:cells.map((cell:{display?:string;raw?:string},i:number)=>({key:`cell_${i+1}`,exerciseIds:candidates.filter(e=>ids.includes(e.id)&&words(String(cell.display??cell.raw??"")).includes(words(e.name))).map(e=>e.id)})).filter((s:{exerciseIds:string[]})=>s.exerciseIds.length)};
  }).filter(r=>r.rawStyle.exerciseIds.length>0);
  const optional=(key:string)=>{const n=Number(data.intake[key]?.[0]);return data.intake[key]?.[0]&&Number.isFinite(n)?n:null;};
  const bodyComposition:GenerationInput["bodyComposition"]={weightKg:parsed.context.currentWeightLb?poundsToKilograms(parsed.context.currentWeightLb):null,bodyFatPercentage:optional("bodyFatPercentage")};
  const history:GenerationInput["history"]=data.history.slice(-5).map(w=>({status:w.status,exercises:w.exercises.slice(0,30).map(e=>{
    const sets=e.workout_sets.filter(s=>s.completed_at);
    const average=(key:"actual_reps"|"actual_load"|"actual_rpe"|"actual_work_seconds"|"actual_distance")=>{const ns=sets.map(s=>s[key]).filter((n):n is number=>typeof n==="number"&&Number.isFinite(n));return ns.length?ns.reduce((a,b)=>a+b,0)/ns.length:null;};
    return {id:e.id.split(":")[0],sets:e.sets,reps:e.reps,restSeconds:e.rest_seconds,protocol:e.prescription_details??undefined,
      performance:{recorded:sets.length,problematic:sets.filter(s=>s.pain_reported||s.client_result==="missed").length,averageReps:average("actual_reps"),averageLoad:average("actual_load")===null?null:poundsToKilograms(average("actual_load")!),averageRpe:average("actual_rpe"),averageWorkSeconds:average("actual_work_seconds"),averageDistance:average("actual_distance")}};})}));
  return {assumptions:parsed.assumptions,input:{schemaVersion:2,snapshot:"owner-demo",intakeId:"owner-demo",goal:parsed.goal,secondaryGoal:null,experience:parsed.experience,frequency:parsed.frequency,duration:parsed.duration,
    age:parsed.context.age,recentDrafts:data.draft?.length?[{exercises:data.draft.map(e=>({...e,restSeconds:e.restSeconds??undefined,targetRpe:e.targetRpe??undefined}))}]:[],
    todayReadiness:{answers:["Energy","Sleep quality","Physical comfort / recovery","Manageable stress","Readiness to train"].map(q=>Number(data.readiness?.[q])||3),hasPain:spots.some(s=>(s.pain??0)>0),coachDecision:"demo"},
    targets:{},bodyComposition,equipment,candidates,references,knowledgeCatalog:references,publishedCount:references.length,history,facilities,
    weightCapabilities:(equipmentResult.data??[]).map(e=>({type:e.equipment_type,minLb:e.min_weight_lb,maxLb:e.max_weight_lb,sizesLb:e.weight_sizes_lb,pairsConfirmed:e.paired_sizes_confirmed})),
    restrictions:{tags,hasInjuries:spots.length>0||!!data.intake.currentInjuries?.[0],hasPain:spots.some(s=>(s.pain??0)>0),hasLimitations:!!data.intake.movementLimitations?.[0],hasAvoidedExercises:avoided.length>0,coachReviewed:true},
    intakeContext:parsed.context,injurySpots:spots,intakeAssessment:{movementObservations:{limitations:data.intake.movementLimitations?.[0]??"",injuries:data.intake.currentInjuries?.[0]??"",coachNotes:data.intake.coachNotes?.[0]??"",movementsToAvoid:data.intake.movementsToAvoid?.[0]??""},
      strengthAssessments:Object.fromEntries(Object.entries(data.intake).filter(([k])=>/squat|bench|pullup|deadlift|overhead|rower|versa/i.test(k)).map(([k,v])=>[k,v[0]??null])),
      recovery:{sleepQuality:optional("sleepQuality"),stress:optional("stressLevel"),recovery:optional("recoveryPerception"),sorenessFatigue:optional("sorenessFatigue")},preferences:(data.intake.preferredExercises?.[0]??"").split(","),dislikes:avoided}}};
}
