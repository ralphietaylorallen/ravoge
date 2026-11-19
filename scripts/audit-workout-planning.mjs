// Offline audit only: fixed synthetic data and mocked Responses transport. No network or database.
import {execFileSync} from 'node:child_process';
import {mkdir,writeFile,rm} from 'node:fs/promises';
import {pathToFileURL} from 'node:url';
import path from 'node:path';
import {generateIntelligentWorkout as revised,planningProjection as revisedProjection,retrieveGymKnowledge as revisedRetrieval} from '../lib/workout-intelligence.ts';
import {configuredWorkoutModel} from '../lib/workout-generation.ts';
import {defaultProtocol,estimateWorkoutSeconds} from '../lib/workout-protocol.ts';

const baselineCommit='d46407e0f47e4cd7955b646d8778be704d71605f';
const outputDir=path.resolve('.temp/workout-planning-audit');
await mkdir(outputDir,{recursive:true});
const baselinePath=path.join(outputDir,'baseline-intelligence.ts');
const source=execFileSync('git',['show',`${baselineCommit}:lib/workout-intelligence.ts`],{encoding:'utf8'}).replaceAll('from "./','from "../../lib/');
await writeFile(baselinePath,source);
const baseline=await import(pathToFileURL(baselinePath).href);

function fixture(beginner=false) {
 const candidates=[['squat','Goblet squat','squat'],['box-squat','Box squat','squat'],['hinge','Dumbbell hinge','hinge'],['pull','Dumbbell row','horizontal_pull']].map(([id,name,pattern])=>({id,name,canonicalName:name,pattern,equipment:['dumbbells'],difficulty:'beginner',quality:'strength',measurement:'reps',repMax:20,loadRuleSupported:true}));
 const references=[['source-a','Gym strength A','strength',['squat','hinge','pull']],['source-b','Gym strength B','strength',['box-squat','hinge','pull']],['source-c','Gym general fitness','fat_loss',['squat','pull','hinge']]].map(([id,title,goal,ids])=>({id,title,goal,revision:1,duration:beginner?25:35,segments:[{key:'main',exerciseIds:ids}],exercises:ids.map(libraryExerciseId=>({libraryExerciseId,sets:3,reps:8,restSeconds:90,protocol:defaultProtocol('reps')}))}));
 const performance=(problematic,averageReps,averageLoad)=>({recorded:3,problematic,averageReps,averageLoad,averageRpe:problematic?8:6,averageWorkSeconds:null,averageDistance:null});
 return {schemaVersion:2,snapshot:'synthetic-only',intakeId:'synthetic-intake',goal:beginner?'fat_loss':'strength',secondaryGoal:null,experience:beginner?'beginner':'intermediate',frequency:beginner?2:3,duration:beginner?25:35,trainingFocus:beginner?'fat_loss_support':null,age:beginner?54:36,targets:{},bodyComposition:{},restrictions:{tags:[],hasInjuries:false,hasPain:false,hasLimitations:false,hasAvoidedExercises:false,coachReviewed:true},equipment:['dumbbells'],candidates,references,knowledgeCatalog:references,history:beginner?[]:[{status:'completed',exercises:[{id:'squat',sets:3,reps:8,restSeconds:90,performance:performance(2,5,15)}]},{status:'completed',exercises:[{id:'squat',sets:3,reps:8,restSeconds:90,performance:performance(0,8,20)}]}],todayReadiness:{answers:Array(8).fill(beginner?6:4),hasPain:false,coachDecision:'proceed'},intakeContext:{version:2,age:beginner?54:36,currentWeightLb:null,recentWorkoutDays:beginner?1:3,success:'Synthetic audit goal',targetDate:null,outsideActivity:'',outsideFrequency:'',sleepHours:null,barriers:[],goalTarget:'',noInjuryReport:true},injurySpots:[]};
}
function transport(input,counts) {
 return {responses:{create:async request=>{
  counts.responses++;
  const schema=request.text?.format?.name;
  if(!schema) return {status:'completed',output_text:'Mock retrieval fixture only. No actual research or medical clearance.',output:[{type:'message',content:[{type:'output_text',annotations:[{type:'url_citation',url:'https://acsm.org/education/',title:'Mock exercise-evidence citation'}]}]}]};
  if(schema==='exercise_guidance') return {status:'completed',output_text:JSON.stringify({sources:[{id:'evidence_1',publishedAt:null,recommendations:['Mock gradual progression guidance.'],limitations:['Synthetic test evidence; not medical advice or a real retrieval result.'],applicability:'Synthetic adult exercise fixture only.'}]})};
  if(schema==='ravoge_training_intent') return {status:'completed',output_text:JSON.stringify({objectives:input.goal==='strength'?['strength']:['general_fitness','fat_loss_support'],priorityPatterns:['squat','hinge','horizontal_pull'],methods:['strength'],preferredFormats:['straight'],progression:input.history.length?'recovery_first':'maintain_consistency',intensityCeiling:6})};
  const projected=JSON.parse(request.input[0].content),ref=projected.publishedStructures[0];
  // Fixed reply policy for both versions: adapt the first retrieved reference.
  // This tests wiring/validation, not OpenAI's judgment or response to history.
  return {status:'completed',output_text:JSON.stringify({title:input.goal==='strength'?'Strength practice':'Beginner general fitness',rationale:'Synthetic mock: adapted the first supplied gym strength combination to the Client time and experience.',durationMinutes:input.duration,sourceReferenceKeys:[ref.referenceKey],coachReview:{goalSupport:'Synthetic example: practice the saved goal using a compatible gym combination.',weeklyPlan:Array.from({length:input.frequency},(_,i)=>({day:i+1,focus:'Coach reviews the next session against actual outcomes.'})),injuryAdaptations:[],progression:'Coach reviews actual completed work before progressing.',regression:'Reduce work if technique, pain or readiness deteriorates.',unresolvedQuestions:['Coach must confirm absolute loads.']},exercises:ref.sequence.map(e=>({exerciseKey:e.exerciseKey,sets:3,reps:input.experience==='beginner'?10:8,restSeconds:input.experience==='beginner'?90:120,notes:'Coach confirms load and technique.',reason:'Compatible movement from the selected synthetic gym reference.',protocol:{...defaultProtocol('reps'),block:'strength',targetRpe:6},provenance:{referenceKey:ref.referenceKey,segmentKey:'main',adaptation:'Adapted the synthetic gym strength segment to the Client.',substitutionReason:'',evidenceIds:[]}}))})};
 }}};
}
const results=[];
try {
 for(const beginner of [false,true]) {
  const input=fixture(beginner),versions={};
  for(const [name,generate,project,retrieve] of [['baseline',baseline.generateIntelligentWorkout,baseline.planningProjection,baseline.retrieveGymKnowledge],['revised',revised,revisedProjection,revisedRetrieval]]) {
   const counts={responses:0};const result=await generate(input,transport(input,counts));
   if(!result.workout) throw Error(`${name} ${beginner?'beginner':'history'} mock failed: ${JSON.stringify({reason:result.reason,issue:result.issue,blocker:result.blocker})}`);
   const projection=project(input);
   versions[name]={model:configuredWorkoutModel(),transport:'mocked; no provider requests',mockResponses:counts.responses,selectedReferences:retrieve(input,result.intelligence.analysis).map(r=>r.id),exerciseContext:projection.exerciseContext??null,historyOrdering:projection.historyOrdering??null,recentPerformance:projection.recentPerformance,workout:{title:result.workout.title,durationMinutes:result.workout.durationMinutes,estimatedSeconds:estimateWorkoutSeconds(result.workout.exercises),sourceReviewIds:result.workout.sourceReviewIds,gymPercentage:result.workout.provenanceAudit.gymPercentage,exercises:result.workout.exercises.map(e=>({exercise:e.name,sets:e.sets,reps:e.reps,restSeconds:e.restSeconds,targetRpe:e.targetRpe,load:e.load,loadUnit:e.loadUnit}))}};
  }
  results.push({profile:beginner?'Beginner, fat-loss support, two days/week, 25 minutes':'Intermediate strength, three days/week, 35 minutes; latest squat reduced from 44.1 lb/8 average reps to 33.1 lb/5 average reps, two problematic sets',versions});
 }
 const report={baselineCommit,liveAttemptsPreviouslyReported:1,additionalLiveAttempts:0,liveAttemptAllowanceRemaining:3,providerUsage:null,limitation:'All replies and evidence are mocked. These outputs demonstrate ranking, input projection and validation only; they do not prove improved OpenAI workout quality.',results};
 await writeFile(path.join(outputDir,'comparison.json'),JSON.stringify(report,null,2)+'\n');
 console.log(JSON.stringify(report,null,2));
} finally {await rm(baselinePath);}
