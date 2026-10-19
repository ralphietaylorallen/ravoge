"use client";

import { useState } from "react";
import { BLOCKS, FORMATS, defaultProtocol, type WorkoutProtocol } from "@/lib/workout-protocol";
import styles from "./dashboard.module.css";

export function WorkoutProtocolFields({ value, substitutions = false, library = [] }: {
  value?: WorkoutProtocol | null; substitutions?: boolean; library?: { id: string; name: string }[];
}) {
  const initial = value ?? defaultProtocol();
  const [measurement, setMeasurement] = useState(initial.measurement);
  const [format, setFormat] = useState(initial.format);
  const [selected, setSelected] = useState(initial.substitutionIds);
  const number = (key: keyof WorkoutProtocol, label: string, min: number, max: number, show = true) => show
    ? <label className={styles.field}><span>{label}</span><input name={`protocol-${key}`} type="number" min={min} max={max} step={key === "targetRpe" || key === "distance" || key === "percentageLoad" ? "0.5" : "1"} defaultValue={initial[key] as number ?? ""} /></label>
    : <input type="hidden" name={`protocol-${key}`} value="" />;
  return <div className={styles.formColumns}>
    <label className={styles.field}><span>Workout block</span><select name="protocol-block" defaultValue={initial.block}>{BLOCKS.map(v => <option key={v}>{v}</option>)}</select></label>
    <label className={styles.field}><span>Format</span><select name="protocol-format" value={format} onChange={e => setFormat(e.target.value as WorkoutProtocol["format"])}>{FORMATS.map(v => <option key={v}>{v}</option>)}</select></label>
    <label className={styles.field}><span>Group / circuit label</span><input name="protocol-group" maxLength={60} defaultValue={initial.group} placeholder="e.g. A or Finisher" /></label>
    <label className={styles.field}><span>Target measurement</span><select name="protocol-measurement" value={measurement} onChange={e => setMeasurement(e.target.value as WorkoutProtocol["measurement"])}><option value="reps">Repetitions</option><option value="time">Time</option><option value="distance">Distance</option></select></label>
    {number("workSeconds", "Work seconds", 5, 1200, measurement === "time")}
    {number("distance", "Distance per length / set", 1, 3000, measurement === "distance")}
    <label className={styles.field}><span>Distance unit</span><select name="protocol-distanceUnit" defaultValue={initial.distanceUnit}><option value="meters">Meters</option><option value="yards">Yards</option></select></label>
    {number("intervalSeconds", "EMOM slot seconds (work must fit)", 10, 1200, format === "emom")}
    {number("blockDurationSeconds", "AMRAP block seconds", 30, 3600, format === "amrap")}
    {number("targetRpe", "Target effort (RPE)", 1, 10)}
    {number("percentageLoad", "Percentage of Coach-confirmed 1RM (optional)", 1, 100)}
    <label className={styles.field}><span>Per-side instruction</span><select name="protocol-perSide" defaultValue={String(initial.perSide)}><option value="false">No per-side target</option><option value="true">Complete each side</option></select></label>
    <input type="hidden" name="protocol-substitutionIds" value={JSON.stringify(selected)} />
    {substitutions && <label className={styles.field}><span>Coach-approved substitutions (up to 5)</span><select multiple value={selected} onChange={e => setSelected([...e.target.selectedOptions].map(o => o.value).slice(0, 5))}>{library.map(e => <option key={e.id} value={e.id}>{e.name}</option>)}</select><small>Only compatible selections can be assigned. Leave empty if no substitution is approved.</small></label>}
  </div>;
}
