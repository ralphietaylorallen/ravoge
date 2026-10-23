import type { AssistedWorkout, GenerationInput } from "./workout-generation.ts";

export type RowProvenance = { referenceKey:string|null; segmentKey:string|null; adaptation:string; substitutionReason:string; evidenceIds:string[] };
export type ProvenanceAudit = { version:1; gymBouts:number; totalBouts:number; gymPercentage:number; rows:{exerciseId:string;referenceId:string|null;segmentKey:string|null;adaptation:string;substitutionReason:string;evidenceIds:string[]}[] };
export const provenanceSchema = {type:"object",additionalProperties:false,required:["referenceKey","segmentKey","adaptation","substitutionReason","evidenceIds"],properties:{
  referenceKey:{type:["string","null"]},segmentKey:{type:["string","null"]},adaptation:{type:"string",minLength:5,maxLength:500},substitutionReason:{type:"string",maxLength:500},evidenceIds:{type:"array",maxItems:4,items:{type:"string"}},
}};
/** Count prescribed work bouts, not catalog overlap, minutes, reps, or all source content. */
export function validateWorkoutProvenance(rows:AssistedWorkout["exercises"],claims:RowProvenance[],input:GenerationInput):ProvenanceAudit {
  if(!Array.isArray(claims)||claims.length!==rows.length) throw new Error("Missing exercise provenance.");
  let gymBouts=0,totalBouts=0;
  const audit=rows.map((row,i)=>{
    const c=claims[i];
    if(!c||typeof c.adaptation!=="string"||c.adaptation.trim().length<5||c.adaptation.length>500||typeof c.substitutionReason!=="string"||c.substitutionReason.length>500
      || !Array.isArray(c.evidenceIds)||c.evidenceIds.length>4||new Set(c.evidenceIds).size!==c.evidenceIds.length
      || c.evidenceIds.some(id=>!input.evidence?.sources.some(s=>s.id===id))) throw new Error("Unverified evidence or provenance.");
    const ref=typeof c.referenceKey==="string"&&/^reference_[1-9]\d*$/.test(c.referenceKey)?input.references[Number(c.referenceKey.slice(10))-1]:undefined;
    const segment=ref?.segments?.find(s=>s.key===c.segmentKey&&s.exerciseIds.includes(row.libraryExerciseId));
    const main=row.protocol?.block!=="warmup"&&row.protocol?.block!=="cooldown";
    if(c.referenceKey!==null&&!segment || c.referenceKey===null&&c.segmentKey!==null) throw new Error("Exercise does not belong to that gym reference segment.");
    if(!segment && (c.substitutionReason.trim().length<10||!c.evidenceIds.length)) throw new Error("External substitutions need a specific goal/constraint reason and verified evidence.");
    if(!segment && !input.candidates.some(e=>e.id===row.libraryExerciseId&&e.loadRuleSupported===true)) throw new Error("External substitutions need supported load rules.");
    if(main) { totalBouts+=row.sets; if(segment) gymBouts+=row.sets; }
    return {exerciseId:row.libraryExerciseId,referenceId:ref?.id??null,segmentKey:c.segmentKey,adaptation:c.adaptation,substitutionReason:c.substitutionReason,evidenceIds:c.evidenceIds};
  });
  if(!totalBouts||gymBouts*10<totalBouts*9) throw new Error("Gym library gap: fewer than 90% of main-work bouts have compatible gym provenance. No workout was assigned.");
  return {version:1,gymBouts,totalBouts,gymPercentage:Math.round(gymBouts/totalBouts*1000)/10,rows:audit};
}
