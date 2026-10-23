"use client";

import { useActionState, useEffect, useState } from "react";

import {
  parseTrainingHistoryAction,
  saveTrainingHistoryAction,
} from "@/app/owner/actions";

import styles from "./dashboard.module.css";

export function TrainingHistoryImport() {
  const [parseState, parseAction, parsing] = useActionState(parseTrainingHistoryAction, { status: "idle" as const });
  const [saveState, saveAction, saving] = useActionState(saveTrainingHistoryAction, { status: "idle" as const });
  const previewRows = parseState.data?.rows.slice(0, 20) ?? [];
  const [original,setOriginal]=useState<{url:string;name:string}|null>(null);
  useEffect(()=>()=>{if(original)URL.revokeObjectURL(original.url);},[original]);

  return (
    <>
      <form action={parseAction} className={styles.importForm}>
        <div className={styles.field}>
          <label htmlFor="trainingHistory">Workout history file</label>
          <input
            accept=".csv,.xlsx,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
            id="trainingHistory"
            name="trainingHistory"
            required
            type="file"
            onChange={event=>{const file=event.target.files?.[0];if(file)setOriginal({url:URL.createObjectURL(file),name:file.name});}}
          />
        </div>
        <p className={styles.formHint}>CSV or XLSX, up to 5 MB, 500 rows, and 40 columns. The first row is used as column headings.</p>
        <button className={styles.action} disabled={parsing} type="submit">
          {parsing ? "Parsing…" : "Parse and preview"}
        </button>
      </form>
      {original&&<p>Your original file is retained in this browser while this page stays open, including if parsing or saving fails. <a href={original.url} download={original.name}>Download original file</a></p>}

      {parseState.message && (
        <p className={`${styles.notice} ${parseState.status === "error" ? styles.error : ""}`} role={parseState.status === "error" ? "alert" : "status"}>
          {parseState.message}
        </p>
      )}

      {parseState.data && (
        <section className={styles.importPreview} aria-labelledby="import-preview-heading">
          <div className={styles.sectionHeading}>
            <div>
              <p className={styles.eyebrow}>Preview</p>
              <h3 id="import-preview-heading">{parseState.data.fileName}</h3>
            </div>
            <p>Showing {previewRows.length} of {parseState.data.rows.length} parsed rows.</p>
          </div>
          <div className={styles.tableScroll} tabIndex={0}>
            <table className={styles.previewTable}>
              <thead><tr>{parseState.data.headers.map((header, index) => <th key={`${header}-${index}`}>{header}</th>)}</tr></thead>
              <tbody>
                {previewRows.map((row) => (
                  <tr key={row.rowNumber}>{row.cells.map((cell) => <td key={cell.column}>{cell.display || <span aria-label="blank">—</span>}</td>)}</tr>
                ))}
              </tbody>
            </table>
          </div>
          <form action={saveAction} className={styles.importSaveForm}>
            <input name="parsedImport" type="hidden" value={JSON.stringify(parseState.data)} />
            <button className={styles.action} disabled={saving || saveState.status === "success"} type="submit">
              {saving ? "Saving…" : saveState.status === "success" ? "Imported" : "Save import"}
            </button>
          </form>
          {saveState.message && (
            <p className={`${styles.notice} ${saveState.status === "error" ? styles.error : ""}`} role={saveState.status === "error" ? "alert" : "status"}>
              {saveState.message}
            </p>
          )}
        </section>
      )}
    </>
  );
}
