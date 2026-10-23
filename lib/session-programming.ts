import type { AssistedWorkout, GenerationInput } from "./workout-generation.ts";

export function ageFromBirthYear(birthYear:unknown,year=new Date().getUTCFullYear()):number|null {
  const value=Number(birthYear),age=year-value;
  return Number.isInteger(value)&&age>=18&&age<=110?age:null;
}
/** Compare executable targets, never names, explanatory prose or row order. */
export function repeatsRecentDraft(workout:Pick<AssistedWorkout,"exercises">,input:GenerationInput):boolean {
  const signature=(e:NonNullable<GenerationInput["recentDrafts"]>[number]["exercises"][number])=>JSON.stringify([
    e.libraryExerciseId,e.sets,e.reps,e.restSeconds??0,e.protocol?.targetRpe??e.targetRpe??null,
    e.protocol?.block??"main",e.protocol?.format??"straight",e.protocol?.measurement??"reps",e.protocol?.workSeconds??null,
    e.protocol?.distance??null,e.protocol?.distanceUnit??null,e.protocol?.perSide??false,e.protocol?.intervalSeconds??null,e.protocol?.blockDurationSeconds??null,
  ]);
  const current=workout.exercises.map(signature).sort().join("|");
  return (input.recentDrafts??[]).some(d=>d.exercises.length===workout.exercises.length&&d.exercises.map(signature).sort().join("|")===current);
}
