import assert from "node:assert/strict";
import { test } from "node:test";
import { validateWorkoutProvenance, type RowProvenance } from "../../lib/workout-provenance.ts";
import { defaultProtocol } from "../../lib/workout-protocol.ts";
import type { AssistedWorkout, GenerationInput } from "../../lib/workout-generation.ts";
import { allowedEvidenceUrl, researchContext, verifiedEvidenceSources } from "../../lib/exercise-evidence.ts";
import type OpenAI from "openai";
import { deidentifiedGenerationInput, generateAssistedWorkout } from "../../lib/workout-generation.ts";
import { retrieveExerciseEvidence } from "../../lib/exercise-evidence.ts";
import { validateQualityWorkout } from "../../lib/workout-generation-quality.ts";
import { generateIntelligentWorkout } from "../../lib/workout-intelligence.ts";
import { emptySpot } from "../../lib/intake-history.ts";

const input={goal:"fat_loss",experience:"beginner",intakeContext:{version:2,age:68},injurySpots:[],candidates:[{id:"a",loadRuleSupported:true},{id:"b",loadRuleSupported:true}],references:[{id:"real-gym-source",segments:[{key:"cell_2",exerciseIds:["a"]}]}],evidence:{sources:[{id:"evidence_1"}]}} as unknown as GenerationInput;
const row=(id:string,sets:number,block="strength")=>({libraryExerciseId:id,sets,protocol:{...defaultProtocol(),block}}) as AssistedWorkout["exercises"][number];
const gym:RowProvenance={referenceKey:"reference_1",segmentKey:"cell_2",adaptation:"Reduced rounds for recovery",substitutionReason:"",evidenceIds:[]};
const sub:RowProvenance={referenceKey:null,segmentKey:null,adaptation:"Low-impact alternative",substitutionReason:"A lower-impact option for the saved goal and limitations",evidenceIds:["evidence_1"]};
test("90% uses prescribed main-work bouts, including rounds, not movement count",()=>{
  const result=validateWorkoutProvenance([row("a",9),row("b",1)],[gym,sub],input);
  assert.equal(result.gymPercentage,90); assert.equal(result.totalBouts,10);
  assert.throws(()=>validateWorkoutProvenance([row("a",8),row("b",2)],[gym,sub],input),/library gap/);
});
test("warm-up/cooldown cannot pad the gym ratio",()=>{
  assert.throws(()=>validateWorkoutProvenance([row("a",20,"warmup"),row("b",1)],[gym,sub],input),/library gap/);
  assert.throws(()=>validateWorkoutProvenance([row("a",1,"cooldown")],[gym],input),/library gap/);
});
test("global exercise overlap, fake segment, fake reference and fake evidence fail",()=>{
  for(const bad of [{...gym,referenceKey:"reference_2"},{...gym,segmentKey:"cell_99"},{...sub,evidenceIds:["invented"]},{...sub,substitutionReason:""}]) assert.throws(()=>validateWorkoutProvenance([row("b",1)],[bad],input));
  assert.throws(()=>validateWorkoutProvenance([row("b",1)],[gym],input));
});
test("public research queries are a closed deidentified vocabulary",()=>{
  const context=researchContext({...input, snapshot:"secret-client-id",intakeContext:{...input.intakeContext!,success:"Alice alice@example.test",targetDate:"2027-01-01"}});
  assert.equal(context.ageBand,"older_adult"); assert.doesNotMatch(JSON.stringify(context),/Alice|@|2027|secret/);
  assert.equal(allowedEvidenceUrl("https://pubmed.ncbi.nlm.nih.gov/123/"),true);
  for(const url of ["https://reddit.com/a","https://nsca.com.evil.test/","https://nsca.com@evil.test/","http://acsm.org/x","javascript:alert(1)"]) assert.equal(allowedEvidenceUrl(url),false);
});
test("only actual allowed citation metadata becomes a source; no invented publication date",()=>{
  const response={output:[{type:"message",content:[{type:"output_text",annotations:[{type:"url_citation",url:"https://orthoinfo.aaos.org/en/recovery/",title:"AAOS guidance"},{type:"url_citation",url:"https://reddit.com/fake",title:"Excluded"}]}]}]} as OpenAI.Responses.Response;
  const sources=verifiedEvidenceSources(response); assert.equal(sources.length,1); assert.equal(sources[0].publishedAt,null); assert.equal(sources[0].title,"AAOS guidance");
});
test("private generation receives saved goal, all spots, observations, recovery and pound-converted strength",()=>{
  const full={...input,schemaVersion:2,candidates:[],equipment:[],references:[],history:[],targets:{},bodyComposition:{},restrictions:{tags:[],coachReviewed:true},
    intakeAssessment:{movementObservations:{limitations:"No overhead pressing"},strengthAssessments:{bench_one_rm_kg:50},recovery:{sleepQuality:2},preferences:["Walking"],dislikes:[]},
    injurySpots:[{id:"one",region:"shoulder",clinicianDetails:"No overhead pressing",pain:0},{id:"two",region:"knee",pain:null}] } as unknown as GenerationInput;
  const p=deidentifiedGenerationInput(full); assert.equal(p.injurySpots?.length,2); assert.equal(p.assessments?.movementObservations.limitations,"No overhead pressing");
  assert.equal(p.savedIntake?.noInjuryReport,false); assert.equal(p.injurySpots?.[0].id,undefined);
  assert.ok(Math.abs(Number(p.assessments?.strengthAssessments?.bench_one_rm_lb)-110.23113109243879)<1e-9);
  assert.equal(p.assessments?.strengthAssessments?.bench_one_rm_kg,undefined);
});
test("retrieval uses current supported domain-filtered search, validates citations and reuses cache",async()=>{
  const calls:Record<string,unknown>[]=[];
  const client={responses:{create:async(request:Record<string,unknown>)=>{
    calls.push(request);
    return calls.length===1?{status:"completed",output_text:"General adult training advice, not surgical clearance.",output:[{type:"message",content:[{type:"output_text",annotations:[{type:"url_citation",url:"https://acsm.org/education/",title:"ACSM adult guidance"}]}]}]}:
      {status:"completed",output_text:JSON.stringify({sources:[{id:"evidence_1",publishedAt:null,recommendations:["Progress gradually based on recovery."],limitations:["Not individual medical clearance."],applicability:"General older-adult beginner training guidance; surgery-specific restrictions need clinical review."}]})};
  }}} as unknown as Pick<OpenAI,"responses">;
  const a=await retrieveExerciseEvidence(input,client); assert.equal(a.sources.length,1); assert.equal(a.cacheHit,false);
  assert.deepEqual((calls[0].tools as {filters:{allowed_domains:string[]}}[])[0].filters.allowed_domains.includes("acsm.org"),true);
  assert.equal(calls[0].store,false); assert.doesNotMatch(String(calls[0].input),/secret|@/);
  const b=await retrieveExerciseEvidence(input,client); assert.equal(b.cacheHit,true); assert.equal(calls.length,2);
});
test("new intake provider contract carries all saved context and rejects forged provenance/citations",async()=>{
  const candidates=["squat","horizontal_pull","hinge"].map((pattern,i)=>({id:`canonical-${i}`,name:`Canonical exercise ${i}`,pattern,equipment:["dumbbells"],difficulty:"beginner",quality:"strength",measurement:"reps" as const,loadRuleSupported:true}));
  const ctx={...input,schemaVersion:2,snapshot:"private",intakeId:"private",secondaryGoal:null,frequency:3,duration:45,targets:{},bodyComposition:{},equipment:["dumbbells"],candidates,history:[],
    restrictions:{tags:[],hasInjuries:true,hasPain:false,hasLimitations:true,hasAvoidedExercises:false,coachReviewed:true},
    intakeContext:{...input.intakeContext!,age:40,success:"Walk comfortably",recentWorkoutDays:2,sleepHours:7,goalTarget:"Gradual progress"},
    injurySpots:[{...emptySpot(),region:"knee",categories:["surgery"],pain:0,clinicianInstructions:"unsure",clinicianDetails:"Recorded restriction"}],
    references:[{id:"actual-source",title:"Private source title",revision:1,goal:"fat_loss",duration:0,exercises:[],sourceKind:"raw_reference",rawStyle:{exerciseIds:candidates.map(c=>c.id),formats:[],terms:[],rawProtocolsUnverified:true},segments:[{key:"cell_1",exerciseIds:candidates.map(c=>c.id)}]}],
    intelligence:{method:"openai",cacheHit:false,analysis:{objectives:["strength"],priorityPatterns:["squat"],methods:["strength"],preferredFormats:["straight"],progression:"technique_then_reps",intensityCeiling:6}},
  } as GenerationInput;
  const output={title:"Gym-based adapted session",rationale:"Uses saved goals, restrictions, recovery and gym movements.",durationMinutes:30,sourceReferenceKeys:["reference_1"],coachReview:{goalSupport:"Gradual training for the recorded goal.",weeklyPlan:[1,2,3].map(day=>({day,focus:"Conservative training with recovery"})),injuryAdaptations:["Respect the saved restriction without inferring surgical clearance."],progression:"Progress only after successful recorded work.",regression:"Stop for pain and review with the Coach.",unresolvedQuestions:["Confirm current clinician restrictions."]},
    exercises:candidates.map((_,i)=>({exerciseKey:`exercise_${i+1}`,sets:3,reps:8,restSeconds:120,notes:"Controlled technique.",reason:"Adapted compatible gym movement.",protocol:defaultProtocol(),provenance:{...gym,segmentKey:"cell_1"}}))};
  let called=false;
  const client={responses:{create:async(request:Record<string,unknown>)=>{
    called=true;const payload=JSON.parse((request.input as {content:string}[])[0].content);
    assert.equal(payload.savedIntake.success,"Walk comfortably");assert.equal(payload.injurySpots[0].pain,0);assert.equal(payload.injurySpots[0].clinicianDetails,"Recorded restriction");
    assert.equal(payload.publishedStructures[0].segments[0].key,"cell_1");assert.deepEqual(request.tools,[]);
    return {status:"completed",output_text:JSON.stringify(output)};
  }}};
  const result=await generateAssistedWorkout(ctx,client as never);assert.ok(called);assert.equal(result.workout?.provenanceAudit?.gymPercentage,100);
  const forged=structuredClone(output);forged.exercises[0].provenance.evidenceIds=["fabricated-source"];
  assert.throws(()=>validateQualityWorkout(JSON.stringify(forged),ctx));
  forged.exercises[0].provenance={...gym,segmentKey:"invented-cell"};assert.throws(()=>validateQualityWorkout(JSON.stringify(forged),ctx));
  assert.throws(()=>validateQualityWorkout(JSON.stringify(output),{...ctx,equipment:[]}));
});
test("new intake never becomes a canned fallback when evidence retrieval fails",async()=>{
  const context={...input,schemaVersion:2,intakeContext:{...input.intakeContext!,age:42}} as GenerationInput;
  const result=await generateIntelligentWorkout(context,{responses:{create:async()=>{throw new Error("Provider unavailable");}}} as never);
  assert.equal(result.workout,null);assert.equal(result.method,undefined);assert.ok("blocker" in result);
});
