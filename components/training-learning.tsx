import { learningDecision, type BayesianTraining } from "@/lib/bayesian-training";
import { dashboardStyles as styles } from "./dashboard-shell";

export function TrainingLearning({ data }: { data?: BayesianTraining | null }) {
  if (!data) return null;
  const latest = [...data.exercises].sort((a,b)=>b.blocks-a.blocks).slice(0,8);
  return <details className={styles.operationCard}>
    <summary>How your training results guide the next workout</summary>
    <p>Ravoge updates a Beta model from fully recorded exercise blocks in the last 90 days. Completed blocks count as 1, modified blocks as ½, and failed, missed or painful blocks as 0. Each comparable dose starts with a neutral Beta(1, 1) prior.</p>
    <p>This estimates recorded completion, not injury risk or medical readiness. Fewer than three comparable blocks, a completion estimate below 80%, or recorded pain holds an automatic weight increase. Current effort checks and Coach approval still apply.</p>
    {latest.length ? <ul>{latest.map((row,index)=><li key={`${row.exerciseId}-${index}`}><strong>{row.name}</strong>: {row.blocks} recorded {row.blocks===1?"block":"blocks"} · {Math.round(row.mean*100)}% completion estimate · {learningDecision(row)}.</li>)}</ul> : <p>No fully recorded blocks yet. Starting weights use saved assessments and confirmed gym equipment; the Coach checks the first dose.</p>}
  </details>;
}
