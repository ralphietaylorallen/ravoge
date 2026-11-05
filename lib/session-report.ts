import "server-only";
import type { WorkoutProtocol } from "./workout-protocol.ts";
import type { LoadPrescription } from "./starting-load.ts";
import { loadInPounds, kilogramsToPounds } from "./weight-units.ts";
import { localDateInTimeZone, shiftLocalDate } from "./timezone.ts";
import type { RecoveryEntry } from "./client-logs.ts";

export const REPORT_VERSION = 1;
export const SCORE_VERSION = "session-execution-v0.1-pending";
export type ReportSet = {
 id:string;set_number:number;prescribed_reps:number|null;prescribed_load:number|null;prescribed_load_unit:string|null;
 actual_reps:number|null;actual_load:number|null;actual_load_unit:string|null;actual_work_seconds:number|null;actual_distance:number|null;actual_rpe:number|null;
 completed_at:string|null;client_result:string|null;execution_result:string|null;outcome_status:string|null;
 pain_reported:boolean;failure_reason:string|null;failure_notes:string|null;performed_library_exercise_id:string|null;
};
export type ReportExercise = {
 id:string;exercise_name:string;library_exercise_id:string|null;sets:number;reps:number;load:number|null;load_unit:string|null;
 notes:string|null;rest_seconds:number|null;sort_order:number;prescription_details:WorkoutProtocol|null;load_prescription:LoadPrescription|null;
 exercise_library:{id:string;name:string;equipment_requirements:string[];measurement:string;laterality:string}|null;workout_sets:ReportSet[];
};
export type SessionFacts = {
 workout:{id:string;organization_id:string;client_user_id:string;coach_user_id:string;title:string;scheduled_date:string;status:string;completed_at:string|null;
 execution_duration_minutes:number|null;execution_coach_notes:string|null;client_feedback:string|null;client_difficulty:number|null;instructions:string|null};
 timezone:string;gymName:string;clientName:string;coachName:string|null;previous_report_ids:string[];exercises:ReportExercise[];
};
export type SessionScore = {
 version:string;status:"pending"|"scored";value:number|null;maximum:99;reason:string;
 components:{completion:{weight:number;value:number|null;eligibleSets:number;recordedSets:number;complete:number;modified:number;missed:number;unclassifiedSets:number};
 effort:{weight:number;value:number|null;coveredSets:number;eligibleSets:number};performance:{weight:number;value:number|null;previousReportIds:string[];coverage:string}};
 sourceInputs:unknown[];
};
export type ReportRecord={id:string;source:SessionFacts;score:SessionScore};
export type ReportBooking={id:string;starts_at:string;ends_at:string;status:string;session_type?:string};
export type SixWeekFacts={version:1;organizationId:string;clientId:string;periodStart:string;periodEnd:string;timezone:string;gymName:string;clientName:string;
 reports:ReportRecord[];bookings:ReportBooking[];recovery:RecoveryEntry[];
 measurements:{measured_at:string;weight_kg:number|null;skeletal_muscle_mass_kg:number|null;body_fat_percentage:number|null}[];
 goals:{primary_goal:string;secondary_goal:string|null;recorded_at:string}|null;
};
export type ProgressShare={id:string;period_start:string;period_end:string;revision:number;shared_at:string;coach_summary:string;next_priorities:string;source_snapshot:SixWeekFacts};
export function finite(value:unknown):number|null {return typeof value==="number"&&Number.isFinite(value)?value:null;}
export function displayNumber(value:number|null,unit="") {return value===null?"Not recorded":`${value.toLocaleString("en-US",{maximumFractionDigits:1})}${unit?` ${unit}`:""}`;}
export function recordedStatus(set:ReportSet):"complete"|"modified"|"missed"|"unrecorded" {
 if(!set.completed_at)return "unrecorded";
 const result=set.client_result??set.execution_result;
 if(result==="missed"||result==="not_completed")return "missed";
 if(result==="modified"||result==="failed")return "modified";
 return result==="complete"||result==="exceeded"||set.outcome_status==="completed"?"complete":"unrecorded";
}
export function isWorking(exercise:ReportExercise) {const block=exercise.prescription_details?.block;return block? !["warmup","preparation","cooldown"].includes(block):null;}
export function workingSets(facts:SessionFacts) {
 const counts={complete:0,modified:0,missed:0,unrecorded:0,total:0,unclassified:0};
 for(const e of facts.exercises){if(isWorking(e)===false)continue;if(isWorking(e)===null){counts.unclassified+=e.workout_sets.length;continue;}
  for(const s of e.workout_sets){counts.total++;counts[recordedStatus(s)]++;}}
 return counts;
}
export function setLiftingVolume(exercise:ReportExercise,set:ReportSet):number|null {
 if(!["complete","modified"].includes(recordedStatus(set)))return null;
 if(exercise.prescription_details?.measurement&&exercise.prescription_details.measurement!=="reps")return null;
 if(exercise.exercise_library?.measurement&&exercise.exercise_library.measurement!=="reps")return null;
 // The existing per-side result field does not identify whether actual reps are
 // per-side or combined. Never multiply that ambiguity into fabricated volume.
 if(exercise.prescription_details?.perSide)return null;
 if(exercise.load_prescription?.bandResistance||exercise.exercise_library?.equipment_requirements.includes("bands"))return null;
 const semantics=exercise.load_prescription?.semantics;
 if(!["total","each_hand","added"].includes(semantics??""))return null;
 if(semantics==="each_hand"&&["unilateral","alternating"].includes(exercise.exercise_library?.laterality??""))return null;
 if(set.performed_library_exercise_id&&set.performed_library_exercise_id!==exercise.library_exercise_id)return null;
 const reps=finite(set.actual_reps),weight=loadInPounds(set.actual_load,set.actual_load_unit);
 if(reps===null||weight===null||reps<0||weight<=0)return null;
 return reps*weight*(semantics==="each_hand"?2:1);
}
export function exerciseVolume(exercise:ReportExercise) {
 const eligible=exercise.workout_sets.filter(s=>["complete","modified"].includes(recordedStatus(s)));
 const known=eligible.map(s=>setLiftingVolume(exercise,s)).filter((v):v is number=>v!==null);
 return {value:known.length?known.reduce((a,b)=>a+b,0):null,covered:known.length,eligible:eligible.length};
}
export function sessionVolume(facts:SessionFacts) {
 const rows=facts.exercises.filter(e=>isWorking(e)!==false).map(exerciseVolume);
 const values=rows.flatMap(r=>r.value===null?[]:[r.value]);
 return {value:values.length?values.reduce((a,b)=>a+b,0):null,covered:rows.reduce((n,r)=>n+r.covered,0),eligible:rows.reduce((n,r)=>n+r.eligible,0)};
}
export function effortSummary(facts:SessionFacts) {
 const sets=facts.exercises.filter(e=>isWorking(e)===true).flatMap(e=>e.workout_sets.filter(s=>["complete","modified"].includes(recordedStatus(s))).map(s=>({actual:finite(s.actual_rpe),target:finite(e.prescription_details?.targetRpe)})));
 const actual=sets.flatMap(s=>s.actual===null?[]:[s.actual]),pairs=sets.filter((s):s is {actual:number;target:number}=>s.actual!==null&&s.target!==null);
 return {average:actual.length?actual.reduce((a,b)=>a+b,0)/actual.length:null,recorded:actual.length,total:sets.length,compared:pairs.length,
  averageDeviation:pairs.length?pairs.reduce((n,p)=>n+p.actual-p.target,0)/pairs.length:null};
}
// Display-only fallback when archiving is temporarily unavailable. No numeric
// score is calculated or persisted here; the versioned database module owns it.
export function pendingScoreDisplay(facts:SessionFacts):SessionScore {
 const counts=workingSets(facts),effort=effortSummary(facts);
 return {version:SCORE_VERSION,status:"pending",value:null,maximum:99,reason:"Score mappings are awaiting approval. The archive is temporarily unavailable.",
  components:{completion:{weight:.5,value:null,eligibleSets:counts.total,recordedSets:counts.complete+counts.modified+counts.missed,complete:counts.complete,modified:counts.modified,missed:counts.missed,unclassifiedSets:counts.unclassified},
   effort:{weight:.3,value:null,coveredSets:effort.compared,eligibleSets:counts.total},performance:{weight:.2,value:null,previousReportIds:[],coverage:"Comparable-result mapping pending"}},sourceInputs:[]};
}
export function cardioSummary(facts:SessionFacts) {
 const groups=new Map<string,{unit:string;distance:number;seconds:number;distanceSets:number;timedSets:number}>();
 for(const e of facts.exercises){const p=e.prescription_details;if(!p||p.measurement==="reps")continue;
  const unit=p.distanceUnit??"meters",key=p.measurement+unit,group=groups.get(key)??{unit,distance:0,seconds:0,distanceSets:0,timedSets:0};
  for(const s of e.workout_sets){if(!["complete","modified"].includes(recordedStatus(s)))continue;
   if(s.actual_distance!==null&&finite(s.actual_distance)!==null){group.distance+=s.actual_distance;group.distanceSets++;}
   if(s.actual_work_seconds!==null&&finite(s.actual_work_seconds)!==null){group.seconds+=s.actual_work_seconds;group.timedSets++;}}
  groups.set(key,group);}
 return [...groups.values()].filter(g=>g.distanceSets||g.timedSets);
}
export function compatibleProtocolKey(e:ReportExercise) {
 if(!e.library_exercise_id||!e.prescription_details||isWorking(e)!==true)return null;
 if(e.workout_sets.some(s=>s.performed_library_exercise_id&&s.performed_library_exercise_id!==e.library_exercise_id))return null;
 const p=e.prescription_details;
 if(!["straight","interval"].includes(p.format))return null;
 return JSON.stringify([e.library_exercise_id,e.sets,e.reps,e.rest_seconds,p.block,p.format,p.measurement,p.workSeconds,p.distance,p.distanceUnit,p.intervalSeconds,p.blockDurationSeconds,p.perSide,p.targetRpe,p.percentageLoad,
  e.load_prescription?.semantics??null,e.load_prescription?.bandResistance??null]);
}
type Comparison={exercise:string;protocolKey:string;metric:string;unit:string;previous:number;current:number;change:number;previousDate:string;basis:string};
function comparableMeasurement(e:ReportExercise) {
 if(!e.workout_sets.length||e.workout_sets.some(s=>recordedStatus(s)!=="complete"||s.pain_reported))return null;
 const volume=exerciseVolume(e);
 if(volume.value!==null&&volume.covered===e.workout_sets.length)return {metric:"Recorded lifting volume",unit:"lb",value:volume.value};
 const p=e.prescription_details;
 if(p?.measurement==="distance"&&e.workout_sets.every(s=>s.actual_distance===p.distance&&s.actual_work_seconds!==null))return {metric:`Recorded time for ${e.workout_sets.length} × ${p.distance} ${p.distanceUnit}`,unit:"sec",value:e.workout_sets.reduce((n,s)=>n+s.actual_work_seconds!,0)};
 if(p?.measurement==="time"&&e.workout_sets.every(s=>s.actual_work_seconds===p.workSeconds&&s.actual_distance!==null))return {metric:`Distance in ${e.workout_sets.length} × ${p.workSeconds} sec`,unit:p.distanceUnit,value:e.workout_sets.reduce((n,s)=>n+s.actual_distance!,0)};
 return null;
}
export function personalComparisons(current:SessionFacts,previous:SessionFacts[]):Comparison[] {
 const ordered=[...previous].filter(f=>f.workout.id!==current.workout.id).sort((a,b)=>(b.workout.completed_at??b.workout.scheduled_date).localeCompare(a.workout.completed_at??a.workout.scheduled_date));
 return current.exercises.flatMap(e=>{const key=compatibleProtocolKey(e),now=comparableMeasurement(e);if(!key||!now||current.exercises.filter(other=>compatibleProtocolKey(other)===key).length!==1)return [];
  for(const report of ordered){if((report.workout.completed_at??report.workout.scheduled_date)>=(current.workout.completed_at??current.workout.scheduled_date))continue;
   const matches=report.exercises.filter(p=>compatibleProtocolKey(p)===key),matched=matches.length===1?matches[0]:null,before=matched?comparableMeasurement(matched):null;
   if(before&&before.metric===now.metric&&before.unit===now.unit&&before.value>0)return [{exercise:e.exercise_name,protocolKey:key,metric:now.metric,unit:now.unit,previous:before.value,current:now.value,change:(now.value-before.value)/before.value*100,previousDate:report.workout.scheduled_date,
    basis:"Same exercise, sets, rep/time/distance target, format, rest, per-side convention and load basis. Completed pain-free sets only."}];}
  return [];});
}
export function factualRecap(facts:SessionFacts) {
 const sets=facts.exercises.flatMap(e=>e.workout_sets),recorded=sets.filter(s=>recordedStatus(s)!=="unrecorded").length;
 const modified=sets.filter(s=>recordedStatus(s)==="modified").length,missed=sets.filter(s=>recordedStatus(s)==="missed").length;
 return `${recorded} of ${sets.length} set/interval outcomes recorded${modified?` · ${modified} adjusted`:""}${missed?` · ${missed} missed`:""}. Actual results are saved for your Coach’s next review.`;
}
export function weekDates(date:string) {const weekday=new Date(`${date}T12:00:00Z`).getUTCDay(),start=shiftLocalDate(date,weekday===0?-6:1-weekday)!;return {start,end:shiftLocalDate(start,6)!};}
export function sixWeekRange(end:string) {return {start:shiftLocalDate(end,-41)!,end};}
export function weeklyConsistency(bookings:ReportBooking[],facts:SessionFacts[],timezone:string,start:string,end:string) {
 const inRange=(date:string)=>date>=start&&date<=end;
 const planned=bookings.filter(b=>inRange(localDateInTimeZone(b.starts_at,timezone))&&b.status!=="cancelled");
 const completed=planned.filter(b=>b.status==="completed");
 const workouts=facts.filter(f=>inRange(f.workout.completed_at?localDateInTimeZone(f.workout.completed_at,timezone):f.workout.scheduled_date));
 return {planned:planned.length,attended:completed.length,workouts:workouts.length,days:[...new Set(workouts.map(f=>f.workout.completed_at?localDateInTimeZone(f.workout.completed_at,timezone):f.workout.scheduled_date))]};
}
export function sixWeekSummary(facts:SixWeekFacts) {
 const ordered=[...facts.reports].sort((a,b)=>(a.source.workout.completed_at??a.source.workout.scheduled_date).localeCompare(b.source.workout.completed_at??b.source.workout.scheduled_date));
 const groups=new Map<string,SessionFacts[]>();for(const r of ordered)for(const e of r.source.exercises){const key=compatibleProtocolKey(e);if(key&&comparableMeasurement(e)){const rows=groups.get(key)??[];if(!rows.some(p=>p.workout.id===r.id))rows.push(r.source);groups.set(key,rows);}}
 // Compare the first and last matching protocol in this exact period; never pool
 // incompatible exercises or circuit partners into one global improvement claim.
 const comparisons=[...groups.entries()].flatMap(([key,rows])=>rows.length>1?personalComparisons(rows.at(-1)!,[rows[0]]).filter(c=>c.protocolKey===key):[]);
 const sets=ordered.flatMap(r=>r.source.exercises.filter(e=>isWorking(e)===true).flatMap(e=>e.workout_sets));
 const effort=sets.flatMap(s=>finite(s.actual_rpe)===null?[]:[s.actual_rpe!]);
 const scores=ordered.filter(r=>r.score.status==="scored"&&finite(r.score.value)!==null&&r.score.components.completion.eligibleSets>0&&r.score.components.completion.recordedSets===r.score.components.completion.eligibleSets&&r.score.components.effort.coveredSets===r.score.components.effort.eligibleSets&&r.score.components.performance.value!==null);
 const scoreVersions=[...new Set(scores.map(r=>r.score.version))];
 const recovery=["sauna","cold_plunge"].map(type=>{const rows=facts.recovery.filter(r=>r.recovery_type===type);return {type,count:rows.length,minutes:rows.length?rows.reduce((n,r)=>n+r.duration_minutes,0):null};});
 const dates=ordered.map(r=>r.source.workout.completed_at?localDateInTimeZone(r.source.workout.completed_at,facts.timezone):r.source.workout.scheduled_date);
 const body=facts.measurements.map(m=>({date:localDateInTimeZone(m.measured_at,facts.timezone),weightLb:kilogramsToPounds(m.weight_kg),muscleLb:kilogramsToPounds(m.skeletal_muscle_mass_kg),bodyFat:m.body_fat_percentage}));
 return {consistency:weeklyConsistency(facts.bookings,ordered.map(r=>r.source),facts.timezone,facts.periodStart,facts.periodEnd),
  comparisons,effort:{average:effort.length?effort.reduce((a,b)=>a+b,0)/effort.length:null,recorded:effort.length,total:sets.length},
  adjusted:sets.filter(s=>recordedStatus(s)==="modified").length,missed:sets.filter(s=>recordedStatus(s)==="missed").length,
  scoreTrend:scoreVersions.length===1?scores.map(r=>({date:r.source.workout.scheduled_date,value:r.score.value!,version:r.score.version,coverage:r.score.components})):[],
  recovery,body,firstDate:dates.at(0)??null,lastDate:dates.at(-1)??null,coveredDays:new Set(dates).size};
}
