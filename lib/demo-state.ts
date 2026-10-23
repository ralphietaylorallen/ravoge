import type { InjurySpot, IntakeContext } from "./intake-history.ts";
import { defaultProtocol } from "./workout-protocol.ts";
import type { RecommendationExercise } from "../components/prescription-review-form.tsx";
import type { PlayerExercise } from "../components/client-workout-player.tsx";

export type DemoWorkout = { id:string; title:string; duration:number; goal:string; status:string; exercises:PlayerExercise[] };
export type DemoData = {
  version:1; intake:Record<string,string[]>; spots:InjurySpot[];
  draft:RecommendationExercise[]; title:string; duration:number;
  workout:DemoWorkout|null; history:DemoWorkout[];
  bookings:{id:string;date:string;time:string;status:string;notes:string}[];
  profiles:{client:{name:string;bio:string};coach:{name:string;bio:string}};
  availability:string[]; readiness:Record<string,string>; coachNotes:string;
  generation:{kind:"sample"|"openai";rationale:string;assumptions:string[];sources:{title:string;url:string}[];percentage:number|null};
};
export function newDemoData():DemoData {
  return {version:1,intake:{},spots:[],draft:[],title:"Test workout",duration:45,workout:null,history:[],bookings:[],
    profiles:{client:{name:"Test Client",bio:""},coach:{name:"Test Coach",bio:""}},availability:[],readiness:{},coachNotes:"",
    generation:{kind:"sample",rationale:"Sample workout for testing controls. Use Generate with AI to program from the assessment.",assumptions:[],sources:[],percentage:null}};
}
export function demoStorageKey(organizationId:string,ownerId:string) { return `ravoge-owner-demo:v1:${organizationId}:${ownerId}`; }
export function formValues(form:FormData) {
  const result:Record<string,string[]>={};
  for(const [key,value] of form.entries()) if(typeof value==="string"&&!key.startsWith("$")) (result[key]??=[]).push(value.slice(0,4000));
  return result;
}
export function demoNumber(value:unknown,fallback:number,min=0,max=100000) {
  if(value===null||value===undefined||value==="")return fallback;
  const n=Number(value);return Number.isFinite(n)&&n>=min&&n<=max?n:fallback;
}
export function demoIntake(values:Record<string,string[]>) {
  const text=(key:string)=>String(values[key]?.[0]??"").slice(0,2000);
  const assumptions:string[]=[];
  const number=(key:string,fallback:number,min:number,max:number)=>{
    const v=text(key),n=demoNumber(v,fallback,min,max);if(!v||Number(v)!==n)assumptions.push(`${key}: sample ${fallback}`);return n;
  };
  const goal=["fat_loss","muscle_gain","mobility"].includes(text("primaryGoal"))?text("primaryGoal"):"fat_loss";
  if(!text("primaryGoal"))assumptions.push("Goal: sample Weight loss");
  const experience=["beginner","intermediate","advanced"].includes(text("experienceLevel"))?text("experienceLevel"):"beginner";
  if(!text("experienceLevel"))assumptions.push("Experience: sample beginner");
  const context:IntakeContext={version:2,age:number("age",35,18,110),recentWorkoutDays:number("recentWorkoutDays",2,0,7),
    currentWeightLb:text("currentWeightLb")?number("currentWeightLb",160,44,1100):null,success:text("success"),targetDate:/^\d{4}-\d{2}-\d{2}$/.test(text("targetDate"))?text("targetDate"):null,
    outsideActivity:text("outsideActivity"),outsideFrequency:text("outsideFrequency"),sleepHours:text("sleepHours")?number("sleepHours",7,0,24):null,
    barriers:(values.barriers??[]).filter(x=>["time","travel","discomfort","motivation","other"].includes(x)),goalTarget:text("goalTarget"),noInjuryReport:text("noInjuryReport")==="on"};
  return {goal,experience,frequency:number("trainingFrequencyGoal",3,1,7),duration:number("sessionDurationMinutes",45,20,180),context,assumptions};
}
export function sampleExercises():RecommendationExercise[] {
  return ["Bodyweight squat","Incline push-up","Dead bug"].map((name,i)=>({libraryExerciseId:`sample-${i}`,name,sets:2,reps:8,load:null,loadUnit:"lb",restSeconds:45,notes:"Button-testing sample only.",reason:"Sample for exploring the workout controls.",targetRpe:5,protocol:defaultProtocol()}));
}
export function toDemoWorkout(rows:RecommendationExercise[],title:string,duration:number,goal:string):DemoWorkout {
  return {id:crypto.randomUUID(),title,duration,goal,status:"assigned",exercises:rows.map(row=>({id:`${row.libraryExerciseId}:${crypto.randomUUID()}`,exercise_name:row.name,
    sets:demoNumber(row.sets,1,1,100),reps:demoNumber(row.reps,8,1,1000),load:row.load===null||row.load===""?null:demoNumber(row.load,0),load_unit:"lb",
    rest_seconds:row.restSeconds??0,notes:row.notes,prescription_details:row.protocol??null,exercise_library:{coach_cue:"Test session — explore the controls freely.",equipment_requirements:[]},
    workout_sets:Array.from({length:Math.floor(demoNumber(row.sets,1,1,100))},(_,i)=>({id:crypto.randomUUID(),set_number:i+1,actual_reps:null,actual_load:null,actual_load_unit:"lb",actual_work_seconds:null,actual_distance:null,actual_rpe:null,client_result:null,completed_at:null,pain_reported:false,failure_notes:null}))}))};
}
