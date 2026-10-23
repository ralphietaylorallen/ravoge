import assert from "node:assert/strict";
import test from "node:test";
import {ageFromBirthYear,repeatsRecentDraft} from "../../lib/session-programming.ts";
import {deidentifiedGenerationInput,type GenerationInput} from "../../lib/workout-generation.ts";
import {parseTrainingSession,prepareTrainingSession} from "../../lib/training-session.ts";
import type {SupabaseClient} from "@supabase/supabase-js";
import {defaultProtocol} from "../../lib/workout-protocol.ts";

test("legacy age, fresh readiness and previous drafts reach private generation without identifiers",()=>{
 const p={...defaultProtocol(),substitutionIds:["PRIVATE-ID"],group:"PRIVATE GROUP"};
 const e={libraryExerciseId:"private-exercise",name:"private name",sets:3,reps:8,restSeconds:60,targetRpe:6,load:null,notes:"",reason:"",protocol:p};
 const input={schemaVersion:2,age:ageFromBirthYear(1988,2026),goal:"fat_loss",experience:"beginner",frequency:3,duration:45,targets:{},bodyComposition:{},candidates:[{id:e.libraryExerciseId,pattern:"squat",equipment:["bodyweight"]}],equipment:["bodyweight"],references:[],history:[],restrictions:{tags:[]},todayReadiness:{answers:[2,3,2,4,3],hasPain:true,coachDecision:"accepted"},recentDrafts:[{exercises:[e]}]} as unknown as GenerationInput;
 const result=deidentifiedGenerationInput(input);assert.equal(result.age,38);assert.deepEqual(result.todayReadiness?.answers,[2,3,2,4,3]);assert.equal(result.previousDrafts[0].sequence[0].exerciseKey,"exercise_1");assert.doesNotMatch(JSON.stringify(result),/private-exercise|PRIVATE-ID|PRIVATE GROUP|private name/);
 assert.equal(repeatsRecentDraft({exercises:[e]},input),true);
 assert.equal(repeatsRecentDraft({exercises:[{...e,name:"Renamed",reason:"new explanation"}]},input),true);
 assert.equal(repeatsRecentDraft({exercises:[{...e,reps:9}]},input),false);
 assert.equal(ageFromBirthYear(null,2026),null);
});
test("every normal generation needs five bounded answers and a pain review when indicated",()=>{
 for(const raw of [null,{}, {readiness:[3,3,3,3]}, {readiness:[0,3,3,3,3]},{readiness:[3,3,3,3,6]},{readiness:[3,3,2,3,3]},{readiness:[3,3,3,3,3],painNote:"new pain"}])assert.throws(()=>parseTrainingSession(raw));
 assert.deepEqual(parseTrainingSession({readiness:[3,3,2,3,3],painReviewed:true}).answers,[3,3,2,3,3]);
});
test("a changed intake requires explicit acknowledgement before recording a generation decision",async()=>{
 const calls:string[]=[];
 const supabase={rpc:async(name:string)=>{calls.push(name);return {data:name==="get_workout_generation_readiness"?{needsSafetyReview:true,intakeId:"intake"}:"checkin",error:null};}} as unknown as SupabaseClient;
 await assert.rejects(()=>prepareTrainingSession(supabase,"client",{readiness:[3,3,3,3,3]}),/Review the updated intake/);
 assert.deepEqual(calls,["get_workout_generation_readiness"]);calls.length=0;
 await prepareTrainingSession(supabase,"client",{readiness:[3,3,3,3,3],intakeReviewed:true});
 assert.deepEqual(calls,["get_workout_generation_readiness","submit_training_readiness","review_training_readiness","confirm_intake_generation_safety"]);
});
