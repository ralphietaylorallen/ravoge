import styles from "./dashboard.module.css";

export type BaselineRecord = {
  intake_id: string;
  version: number;
  completed_at: string;
  squat_variation: string;
  squat_one_rm_kg: number;
  squat_one_rm_method: string;
  bench_variation: string;
  bench_one_rm_kg: number;
  bench_one_rm_method: string;
  pullup_strict_reps: number;
  pullup_mode: string;
  rower_distance_m: number | null;
  rower_time_seconds: number | null;
  versa_duration_seconds: number | null;
  versa_feet: number | null;
  inbody_status: string;
  inbody_score?: number | null;
  body_fat_percentage?: number | null;
};

function duration(seconds: number) {
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
}

export function BaselineSummary({ records }: { records: BaselineRecord[] }) {
  if (!records.length) return <p className={styles.empty}>No measured baseline has been recorded yet.</p>;
  const latest = records[0];
  return <>
    <div className={styles.stateGrid}>
      <article><span>Squat · {latest.squat_variation.replaceAll("_", " ")}</span><strong>{latest.squat_one_rm_kg} kg {latest.squat_one_rm_method}</strong></article>
      <article><span>Bench · {latest.bench_variation}</span><strong>{latest.bench_one_rm_kg} kg {latest.bench_one_rm_method}</strong></article>
      <article><span>Pull-Ups · {latest.pullup_mode}</span><strong>{latest.pullup_strict_reps} strict</strong></article>
      <article><span>Conditioning</span><strong>{latest.rower_distance_m && latest.rower_time_seconds ? `Rower ${latest.rower_distance_m} m · ${duration(latest.rower_time_seconds)}` : latest.versa_duration_seconds && latest.versa_feet ? `Versa ${latest.versa_feet} ft · ${duration(latest.versa_duration_seconds)}` : "Pending"}</strong></article>
      <article><span>InBody</span><strong>{latest.inbody_status === "pending" ? "Pending · baseline incomplete" : `Score ${latest.inbody_score ?? "—"} · Body fat ${latest.body_fat_percentage ?? "—"}%`}</strong></article>
      <article><span>Intake date</span><strong>{new Date(latest.completed_at).toLocaleDateString("en-US")}</strong></article>
    </div>
    {records.length > 1 && <details className={styles.formSection}><summary>Compare prior baselines ({records.length - 1})</summary><div className={styles.tableScroll} tabIndex={0}><table className={styles.previewTable}><thead><tr><th>Version</th><th>Date</th><th>Squat 1RM</th><th>Bench 1RM</th><th>Pull-Ups</th><th>InBody</th></tr></thead><tbody>{records.map((record) => <tr key={record.intake_id}><td>{record.version}</td><td>{new Date(record.completed_at).toLocaleDateString("en-US")}</td><td>{record.squat_one_rm_kg} kg</td><td>{record.bench_one_rm_kg} kg</td><td>{record.pullup_strict_reps}</td><td>{record.inbody_status}</td></tr>)}</tbody></table></div></details>}
  </>;
}
