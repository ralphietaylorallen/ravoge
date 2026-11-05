"use client";
import { useActionState } from "react";
import Link from "next/link";
import { shareProgressAction, type ProgressShareState } from "@/app/progress-report-actions";
import styles from "./session-report.module.css";

export function ProgressShareForm({role,clientId,end,previous,summary,priorities}:{role:"owner"|"coach";clientId:string;end:string;previous?:string;summary:string;priorities:string}) {
 const [state,action,pending]=useActionState(shareProgressAction.bind(null,role,clientId),{status:"idle",message:""} as ProgressShareState);
 return <form action={action} className={`${styles.card} ${styles.shareForm}`}><h2 className={styles.sectionTitle}>Coach summary & next block</h2><input type="hidden" name="end" value={end}/><input type="hidden" name="previous" value={previous??""}/>
  <label>Summary<textarea name="summary" required maxLength={4000} rows={5} defaultValue={summary}/></label>
  <label>Next priorities<textarea name="priorities" required maxLength={2000} rows={3} defaultValue={priorities}/></label>
  {previous&&<label className={styles.confirm}><input type="checkbox" name="revision" value="yes" required/>Publish an explicit new revision if the facts or commentary changed. Keep the previous snapshot.</label>}
  <p className={styles.hint}>Preview the facts above before sharing. Only this Client and their authorized gym staff can view it. No email is sent.</p>
  <button disabled={pending} className={styles.primary}>{pending?"Sharing…":previous?"Share new revision":"Share with Client"}</button>
  {state.message&&<p role={state.status==="error"?"alert":"status"}>{state.message}{state.shareId&&<> <Link href={`/${role}/clients/${clientId}/progress?share=${state.shareId}`}>Open shared snapshot →</Link></>}</p>}
 </form>;
}
