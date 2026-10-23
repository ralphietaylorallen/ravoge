import "server-only";
import type { AssistedWorkout, GenerationInput } from "./workout-generation.ts";
import { defaultProtocol, estimateWorkoutSeconds } from "./workout-protocol.ts";

// Explicitly reference-inspired, not a reconstruction of ambiguous raw sets.
// Uses the same canonical candidate filter, protocol validator and pound engine.
export function referenceFallback(input:GenerationInput):AssistedWorkout|null {
  const refs=input.references;
  if(!refs.length) return null;
  const ids=[...new Set(refs.flatMap(r=>r.rawStyle?.exerciseIds??r.exercises.map(e=>e.libraryExerciseId??"")))];
  const ranked=[...input.candidates].sort((a,b)=>Number(ids.includes(b.id))-Number(ids.includes(a.id))||a.id.localeCompare(b.id));
  const chosen=ranked.filter(c=>c.equipment.every(e=>input.equipment.includes(e))&&(!c.equipment.includes('turf')||(input.facilities??[]).some(f=>f.type==='turf'&&f.length*(f.unit==='yards'?.9144:1)>=10))).slice(0,Math.min(5,ranked.length));
  if(chosen.length<3) return null;
  const exercises=chosen.map(c=>({libraryExerciseId:c.id,name:c.name,sets:input.duration<30?2:3,reps:c.measurement&&c.measurement!=="reps"?1:Math.min(8,c.repMax??8),
    restSeconds:90,load:null,loadUnit:"lb" as const,targetRpe:Math.min(6,input.intelligence?.analysis.intensityCeiling??6),notes:"Conservative adaptation, not a verified copy of raw source protocols. Coach must review.",
    reason:ids.includes(c.id)?"Recognized gym-reference movement adapted to the saved goal and restrictions.":"Compatible canonical addition for balance; not claimed as a source movement.",
    protocol:{...defaultProtocol(c.measurement??"reps"),perSide:c.laterality==="unilateral",targetRpe:Math.min(6,input.intelligence?.analysis.intensityCeiling??6),block:c.pattern==="conditioning"?"conditioning" as const:"strength" as const}}));
  while(estimateWorkoutSeconds(exercises)>input.duration*60+180 && exercises.some(e=>e.sets>1)) for(const e of exercises) e.sets=Math.max(1,e.sets-1);
  if(estimateWorkoutSeconds(exercises)<Math.min(15,input.duration*.4)*60) return null;
  const used=refs.filter(r=>(r.rawStyle?.exerciseIds??r.exercises.map(e=>e.libraryExerciseId??'')).some(id=>exercises.some(e=>e.libraryExerciseId===id)));
  if(!used.length) return null;
  return {title:"Reference-inspired Coach-review fallback",rationale:"The AI service could not finish. This deterministic alternative uses recognized gym-reference movements and compatible canonical additions. Unverified raw protocols were not copied. Review all targets before assignment.",durationMinutes:Math.max(20,Math.min(input.duration,Math.ceil(estimateWorkoutSeconds(exercises)/60))),exercises,sourceReviewIds:used.map(r=>r.id)};
}
