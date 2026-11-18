// Beta power-likelihood update, one fractional observation per fully recorded
// exercise block. Recomputed from saved results, so reloads never double-count.
export type BayesianExercise = {exerciseId:string;name:string;blocks:number;alpha:number;beta:number;mean:number;variance:number;format:string;reps:number;loadLb:number|null;pain:boolean};
export type BayesianTraining = {version:"beta-block-v1";prior:{alpha:1;beta:1};exercises:BayesianExercise[]};
export function betaBlockPosterior(outcomes:number[]) {
  if(outcomes.some(x=>!Number.isFinite(x)||x<0||x>1))throw Error("Invalid block evidence");
  const alpha=1+outcomes.reduce((n,x)=>n+x,0),beta=1+outcomes.reduce((n,x)=>n+1-x,0),total=alpha+beta;
  return {alpha,beta,mean:alpha/total,variance:alpha*beta/(total*total*(total+1)),blocks:outcomes.length};
}
export function learningDecision(row:BayesianExercise) {
  if(row.pain)return "Coach review: pain recorded";
  if(row.blocks<3)return "Building a personal baseline";
  return row.mean>=.8?"Progression eligible after current effort checks":row.mean<.5?"Review or reduce the next prescription":"Repeat and build consistency";
}
