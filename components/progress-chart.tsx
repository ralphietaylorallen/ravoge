"use client";

import { useState } from "react";

import styles from "./dashboard.module.css";

export type ProgressMetric = {
  label: string;
  points: { date: string; value: number }[];
  unit: string;
};

export function ProgressChart({ metrics }: { metrics: ProgressMetric[] }) {
  const available = metrics.filter((metric) => metric.points.length > 0);
  const [selected, setSelected] = useState(available[0]?.label ?? "");
  const metric = available.find((item) => item.label === selected) ?? available[0];
  const plot = (() => {
    if (!metric) return null;
    const values = metric.points.map((point) => point.value);
    const minimum = Math.min(...values);
    const maximum = Math.max(...values);
    const spread = maximum - minimum || 1;
    const coordinates = metric.points.map((point, index) => ({
      ...point,
      x: metric.points.length === 1 ? 50 : 6 + (index / (metric.points.length - 1)) * 88,
      y: 82 - ((point.value - minimum) / spread) * 66,
    }));
    return {
      coordinates,
      maximum,
      minimum,
      path: coordinates.map((point, index) => `${index === 0 ? "M" : "L"} ${point.x} ${point.y}`).join(" "),
    };
  })();

  if (!metric || !plot) return <p className={styles.empty}>No chronological progress measurements are available yet.</p>;

  return (
    <div className={styles.progressChart}>
      <div className={styles.metricSwitch} role="group" aria-label="Progress metric">
        {available.map((item) => (
          <button
            aria-pressed={item.label === metric.label}
            key={item.label}
            onClick={() => setSelected(item.label)}
            type="button"
          >
            {item.label}
          </button>
        ))}
      </div>
      <div className={styles.chartSummary}>
        <strong>{metric.label}</strong>
        <span>{plot.minimum.toFixed(1)}–{plot.maximum.toFixed(1)} {metric.unit}</span>
      </div>
      <svg aria-label={`${metric.label} chronological chart`} role="img" viewBox="0 0 100 100">
        <line x1="6" x2="94" y1="82" y2="82" />
        <path d={plot.path} />
        {plot.coordinates.map((point) => (
          <circle key={`${point.date}-${point.value}`} cx={point.x} cy={point.y} r="1.7">
            <title>{new Date(point.date).toLocaleDateString("en-US")}: {point.value} {metric.unit}</title>
          </circle>
        ))}
      </svg>
      <div className={styles.chartDates}>
        <span>{new Date(metric.points[0].date).toLocaleDateString("en-US")}</span>
        <span>{new Date(metric.points.at(-1)!.date).toLocaleDateString("en-US")}</span>
      </div>
    </div>
  );
}
