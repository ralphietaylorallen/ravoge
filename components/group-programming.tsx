"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { loadGroupHistoryAction, loadGroupWeekAction, publishGroupDatesAction, saveGroupDraftAction } from "@/app/group-programming-actions";
import { groupDateLabel, groupStatus, groupWeek, moveGroupDate, publishableGroupDates, MINDBODY_BLOCKER, type GroupProgram, type GroupVersion } from "@/lib/group-programming";
import styles from "./group-programming.module.css";

export function GroupProgramming({ role, gym, initialWeek, currentWeek, initialPrograms, initialError, names }: {
  role: "owner" | "coach"; gym: string; initialWeek: string; currentWeek: string; initialPrograms: GroupProgram[]; initialError?: string; names: Record<string,string>;
}) {
  const router = useRouter();
  const [week, setWeek] = useState(initialWeek), [date, setDate] = useState(initialWeek);
  const [programs, setPrograms] = useState(initialPrograms), [text, setText] = useState(initialPrograms.find(p => p.programming_date === initialWeek)?.raw_workout_text ?? "");
  const [selected, setSelected] = useState<string[]>([]), [busy, setBusy] = useState("");
  const [message, setMessage] = useState(initialError ?? ""), [error, setError] = useState(Boolean(initialError));
  const [leaving, setLeaving] = useState<{ date?: string; week?: string; href?: string } | null>(null);
  const [publishing, setPublishing] = useState<string[] | null>(null), [history, setHistory] = useState<GroupVersion[] | null>(null);
  const dialog = useRef<HTMLDivElement>(null), priorFocus = useRef<HTMLElement | null>(null);
  const program = programs.find(p => p.programming_date === date);
  const dirty = text !== (program?.raw_workout_text ?? ""), days = groupWeek(week), modal = Boolean(leaving || publishing);
  function inform(value: string, isError = false) { setMessage(value); setError(isError); }
  function merge(rows: GroupProgram[]) { setPrograms(old => [...old.filter(p => !rows.some(row => row.programming_date === p.programming_date)), ...rows]); }
  useEffect(() => {
    if (!dirty) return;
    const unload = (event: BeforeUnloadEvent) => { event.preventDefault(); };
    const navigation = (event: MouseEvent) => {
      if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
      const anchor = (event.target as Element)?.closest("a");
      if (!anchor?.href || anchor.target === "_blank" || new URL(anchor.href).origin !== location.origin) return;
      event.preventDefault(); setLeaving({ href: anchor.href });
    };
    window.addEventListener("beforeunload", unload); document.addEventListener("click", navigation, true);
    return () => { window.removeEventListener("beforeunload", unload); document.removeEventListener("click", navigation, true); };
  }, [dirty]);
  useEffect(() => {
    if (!modal) return;
    priorFocus.current = document.activeElement as HTMLElement;
    const container = dialog.current; container?.focus();
    function keyboard(event: KeyboardEvent) {
      if (event.key === "Escape" && !busy) { setLeaving(null); setPublishing(null); }
      if (event.key !== "Tab") return;
      const nodes = container?.querySelectorAll<HTMLElement>("button:not(:disabled),a[href],[tabindex='0']");
      if (!nodes?.length) { event.preventDefault(); return; }
      const first = nodes[0], last = nodes[nodes.length - 1];
      if (event.shiftKey && (document.activeElement === first || document.activeElement === container)) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    }
    document.addEventListener("keydown", keyboard);
    return () => { document.removeEventListener("keydown", keyboard); priorFocus.current?.focus(); };
  }, [modal, busy]);

  async function navigate(target: { date?: string; week?: string; href?: string }) {
    setLeaving(null); setHistory(null);
    if (target.href) { setText(program?.raw_workout_text ?? ""); router.push(target.href); return; }
    if (target.week) {
      setBusy("Loading week…");
      try {
        const result = await loadGroupWeekAction(role, target.week);
        if (result.status === "error") { inform(result.message, true); return; }
        const rows = result.programs ?? []; setPrograms(rows); setWeek(target.week); setDate(target.week); setSelected([]);
        setText(rows.find(p => p.programming_date === target.week)?.raw_workout_text ?? ""); inform("");
      } catch { inform("Could not load this week. Your text has been kept. Try again.", true); }
      finally { setBusy(""); }
    } else if (target.date) {
      setDate(target.date); setText(programs.find(p => p.programming_date === target.date)?.raw_workout_text ?? ""); inform("");
    }
  }
  function leave(target: { date?: string; week?: string }) { if (dirty) setLeaving(target); else void navigate(target); }
  async function save() {
    setBusy("Saving draft…");
    try { const result = await saveGroupDraftAction(role, date, text, program?.revision ?? 0);
      inform(result.message, result.status === "error"); if (result.programs) merge(result.programs); return result.status === "success";
    } catch { inform("Save was not confirmed. Your text is still here. Reload before retrying.", true); return false; }
    finally { setBusy(""); }
  }
  function prepare(dates: string[]) {
    const ready = publishableGroupDates(programs, dates);
    if (!ready.length) { inform("Save workout text for at least one selected date first.", true); return; }
    setPublishing(ready);
  }
  async function publish(dates: string[], retry = false) {
    setBusy(retry ? "Checking Mindbody sync…" : "Publishing…"); setPublishing(null);
    try {
      const result = await publishGroupDatesAction(role, dates.map(day => ({ date: day, revision: programs.find(p => p.programming_date === day)!.revision })), retry);
      if (result.programs) merge(result.programs); inform(result.message, result.status === "error");
    } catch { inform("Publication was not confirmed. Reload this week before retrying.", true); }
    finally { setBusy(""); }
  }
  async function showHistory() {
    if (!program) return; setBusy("Loading history…");
    try { const result = await loadGroupHistoryAction(role, program.id); setHistory(result.versions ?? null); if (result.status === "error") inform(result.message, true); }
    catch { inform("History could not load. Try again.", true); } finally { setBusy(""); }
  }
  return <div className={styles.workspace} aria-busy={Boolean(busy)}>
    <div className={styles.toolbar}>
      <button className={styles.button} disabled={Boolean(busy)} onClick={() => leave({ week: moveGroupDate(week, -7) })}>Previous week</button>
      <button className={styles.button} disabled={Boolean(busy)} onClick={() => leave({ week: currentWeek })}>Current week</button>
      <strong>{groupDateLabel(week)} – {groupDateLabel(days[5], true)}</strong>
      <button className={styles.button} disabled={Boolean(busy)} onClick={() => leave({ week: moveGroupDate(week, 7) })}>Next week</button>
    </div>
    <div className={styles.week} aria-label="Monday through Saturday">
      {days.map(day => <div key={day} className={styles.dateCard} data-selected={day === date}>
        <button className={styles.day} aria-pressed={day === date} disabled={Boolean(busy)} onClick={() => day !== date && leave({ date: day })}>
          <strong>{groupDateLabel(day)}</strong><small>{busy === "Publishing…" && day === date ? "Publishing" : groupStatus(programs.find(p => p.programming_date === day), day === date && dirty)}</small>
        </button>
        <label className={styles.check}><input aria-label={`Select ${groupDateLabel(day, true)}`} type="checkbox" checked={selected.includes(day)} disabled={Boolean(busy)} onChange={e => setSelected(e.target.checked ? [...selected, day] : selected.filter(d => d !== day))} />Select date</label>
      </div>)}
    </div>
    <section className={styles.panel}>
      <h3><label htmlFor="group-workout-text">{groupDateLabel(date, true)} workout</label></h3>
      <p className={styles.hint}>Paste the complete workout from Notepad. Your wording, spacing and line breaks stay intact. Save each date, then publish when ready.</p>
      <textarea id="group-workout-text" className={styles.editor} value={text} disabled={Boolean(busy)} maxLength={50000} spellCheck={false} onChange={e => setText(e.target.value)} />
      <p className={styles.hint}>{groupStatus(program, dirty)} · {text.length.toLocaleString()} / 50,000 characters{program ? ` · Last editor: ${names[program.updated_by] ?? "Gym team member"}` : ""}</p>
      <div className={styles.actions}>
        <button className={`${styles.button} ${styles.primary}`} disabled={Boolean(busy)} onClick={() => void save()}>{busy === "Saving draft…" ? busy : "Save Draft"}</button>
        <button className={styles.button} disabled={Boolean(busy) || dirty} onClick={() => prepare([date])}>{program?.published_revision ? "Republish This Date" : "Publish This Date"}</button>
        <button className={styles.button} disabled={Boolean(busy) || dirty} onClick={() => prepare(selected)}>Publish Selected Dates</button>
        <button className={styles.button} disabled={Boolean(busy) || dirty} onClick={() => prepare(days)}>Publish Week</button>
        {program && <button className={styles.button} disabled={Boolean(busy)} onClick={() => void showHistory()}>Version history</button>}
      </div>
      {dirty && <p className={styles.hint}>Save Draft before publishing. Publishing always uses saved text.</p>}
      {busy && <p role="status">{busy}</p>}
      {message && <p className={`${styles.message} ${error ? styles.error : ""}`} role={error ? "alert" : "status"}>{message}</p>}
    </section>
    <section className={styles.panel} aria-label="Mindbody synchronization status"><h3>Mindbody: not connected</h3><p className={styles.hint}>{MINDBODY_BLOCKER}</p>
      {program?.published_revision && <><p className={styles.hint}>{program.last_safe_sync_error}</p><button className={styles.button} disabled={Boolean(busy) || dirty || program.published_revision !== program.revision} onClick={() => void publish([date], true)}>Retry Mindbody sync check</button></>}
    </section>
    {history && <section className={`${styles.panel} ${styles.history}`}><h3>Version history · {groupDateLabel(date)}</h3><p className={styles.hint}>Latest 50 saves. Restoring text changes only this editor until you save it.</p>{history.map(version => <details key={version.revision}><summary>Version {version.revision} · {names[version.edited_by] ?? "Gym team member"} · {new Date(version.edited_at).toLocaleString()} · {version.published_at ? `Published ${new Date(version.published_at).toLocaleString()}` : "Draft"}</summary><pre>{version.raw_workout_text}</pre><button className={styles.button} disabled={Boolean(busy)} onClick={() => { if (!dirty || window.confirm("Replace your unsaved editor text with this saved version?")) setText(version.raw_workout_text); }}>Use this text in editor</button></details>)}</section>}
    {modal && <div className={styles.overlay}><div ref={dialog} tabIndex={-1} role="dialog" aria-modal="true" aria-labelledby="group-dialog-title" className={styles.dialog}>
      {leaving ? <><h3 id="group-dialog-title">Save this draft before leaving?</h3><p>Your changes have not been saved.</p><div className={styles.actions}><button className={`${styles.button} ${styles.primary}`} disabled={Boolean(busy)} onClick={async () => { const target = leaving; if (await save()) await navigate(target); }}>Save and Continue</button><button className={styles.button} disabled={Boolean(busy)} onClick={() => void navigate(leaving)}>Discard Changes</button><button className={styles.button} disabled={Boolean(busy)} onClick={() => setLeaving(null)}>Stay Here</button></div></> : <><h3 id="group-dialog-title">Publish group programming?</h3><p><strong>{gym}</strong> · {publishing!.length} workout{publishing!.length === 1 ? "" : "s"}</p><ul>{publishing!.map(day => <li key={day}>{groupDateLabel(day, true)}</li>)}</ul><p>Mindbody destination: not connected.</p><p>This will publish the selected group programming to Ravoge. Mindbody delivery is unavailable; no external updates will be sent.</p><div className={styles.actions}><button className={styles.button} onClick={() => setPublishing(null)}>Cancel</button><button className={`${styles.button} ${styles.primary}`} onClick={() => void publish(publishing!)}>Publish</button></div></>}
      {busy && <p role="status">{busy}</p>}{error && message && <p role="alert">{message}</p>}
    </div></div>}
  </div>;
}
