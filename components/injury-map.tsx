"use client";

import { useRef, useState } from "react";
import { saveInjurySpotAction, removeInjurySpotAction } from "@/app/coach/intake-actions";
import { BODY_REGIONS, HISTORY_CATEGORIES, emptySpot, type InjurySpot } from "@/lib/intake-history";
import styles from "./injury-map.module.css";
import { useDemo } from "./demo-context";

const regionLabel = (s: Pick<InjurySpot, "region" | "side" | "view">) => `${s.side === "midline" ? "" : s.side + " "}${s.region.replaceAll("_", " ")} · ${s.view}`;
const touchSpots: { region: InjurySpot["region"]; x: number; y: number; side: InjurySpot["side"] }[] = [
  { region: "head", x: 55.5, y: 9, side: "midline" },
  { region: "wrist", x: 18, y: 47, side: "right" }, { region: "wrist", x: 91, y: 47, side: "left" },
  { region: "thigh", x: 43, y: 58, side: "right" }, { region: "thigh", x: 67, y: 58, side: "left" },
  { region: "calf", x: 43, y: 78, side: "right" }, { region: "calf", x: 67, y: 78, side: "left" },
  { region: "neck", x: 55.5, y: 16, side: "midline" }, { region: "shoulder", x: 39, y: 22, side: "right" },
  { region: "shoulder", x: 72, y: 22, side: "left" }, { region: "elbow", x: 28, y: 36, side: "right" }, { region: "elbow", x: 82, y: 36, side: "left" },
  { region: "hip", x: 43, y: 47, side: "right" }, { region: "hip", x: 67, y: 47, side: "left" },
  { region: "knee", x: 43, y: 67, side: "right" }, { region: "knee", x: 67, y: 67, side: "left" },
  { region: "ankle", x: 43, y: 87, side: "right" }, { region: "ankle", x: 67, y: 87, side: "left" },
];

export function InjuryMap({ clientId, initialSpots, noInjuryReport=false }: { clientId: string; initialSpots: InjurySpot[]; noInjuryReport?:boolean }) {
  const demo=useDemo();
  const [spots, setSpots] = useState(initialSpots);
  const [editing, setEditing] = useState<InjurySpot>(emptySpot);
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const dialog = useRef<HTMLDialogElement>(null);
  const opener = useRef<HTMLElement | null>(null);
  function open(s: InjurySpot, target: HTMLElement) {
    opener.current = target; setEditing(structuredClone(s)); setError(""); dialog.current?.showModal();
  }
  function close() { if (pending) return; dialog.current?.close(); opener.current?.focus(); }
  function update<K extends keyof InjurySpot>(key: K, value: InjurySpot[K]) { setEditing(s => ({ ...s, [key]: value })); }
  async function save() {
    setPending(true); setError("");
    try {
      const result = demo ? await demo.saveSpot(editing) : await saveInjurySpotAction(clientId, editing);
      if (!result.ok) { setError(result.message); return; }
      setSpots(s => [...s.filter(x => x.id !== result.spot.id), result.spot]);
      setMessage(`${regionLabel(result.spot)} saved.`); dialog.current?.close(); opener.current?.focus();
    } catch { setError("This spot was not saved. Your answers are still here; please try again."); }
    finally { setPending(false); }
  }
  async function remove(s: InjurySpot) {
    setPending(true); setError("");
    try {
      const result = demo ? await demo.removeSpot(s.id) : await removeInjurySpotAction(clientId, s.id);
      if (!result.ok) { setMessage(result.message); return; }
      setSpots(all => all.filter(x => x.id !== s.id)); setMessage("Spot removed from the current report. Earlier history is preserved.");
    } catch { setMessage("The spot could not be removed. Please try again."); } finally { setPending(false); }
  }
  return <section className={styles.root} aria-label="Body map and injury history">
    <h3>How does your body feel?</h3><p>Tap a spot, add the details, then save.</p>
    <p className={styles.hint}>Left and right are from the client’s perspective.</p>
    <div className={styles.maps}>{(["front", "back"] as const).map(view => <div className={styles.map} key={view}>
      <strong>{view.toUpperCase()}</strong><div className={styles.figure}><div aria-hidden="true" className={styles.anatomy} data-view={view}/>
        {[...touchSpots, {region:view === "back" ? "upper_back" as const : "chest" as const,x:55.5,y:29,side:"midline" as const}, { region: view === "back" ? "lower_back" as const : "abdomen" as const, x: 55.5, y: 42, side: "midline" as const }].map((p,i) => {
          const side = view === "back" && p.side !== "midline" ? p.side === "left" ? "right" : "left" : p.side;
          const selected = spots.filter(s => s.region === p.region && s.side === side && s.view === view);
          return <button type="button" key={i} className={`${styles.hotspot} ${selected.length ? styles.saved : ""}`} style={{left:`${view === "back" ? p.x - 8 : p.x}%`,top:`${p.y}%`}}
            aria-label={`${selected.length ? "Edit saved" : "Add"} ${side} ${p.region.replaceAll("_", " ")} ${view}`}
            onClick={e => open(selected[0] ?? {...emptySpot(), region:p.region, side, view}, e.currentTarget)}><span aria-hidden="true">{selected.length || "+"}</span></button>;
        })}
      </div>
    </div>)}</div>
    <button type="button" className={styles.add} disabled={pending} onClick={e => open(emptySpot(), e.currentTarget)}>+ Add another spot / choose a region</button>
    <ul className={styles.savedList}>{spots.map(s => <li key={s.id}><button type="button" onClick={e => open(s,e.currentTarget)} disabled={pending}>{regionLabel(s)} · {s.pain === null ? "Pain unknown" : `Pain ${s.pain}/10`}{s.categories.includes("surgery") ? " · Surgery history" : ""} — Edit</button><button aria-label={`Remove ${regionLabel(s)}`} disabled={pending} type="button" onClick={()=>remove(s)}>Remove</button></li>)}</ul>
    <label className={styles.noReport}><input type="checkbox" name="noInjuryReport" defaultChecked={noInjuryReport&&initialSpots.length===0} disabled={spots.length > 0}/>No pain, injuries, or restrictions to report</label>
    {spots.length > 0 && <p className={styles.hint}>Saved history remains active until individually updated or removed; “no current pain” never deletes surgical history.</p>}
    <p role="status">{message}</p>
    <dialog ref={dialog} className={styles.dialog} aria-labelledby="injury-title" onKeyDown={e=>{if(e.key==="Enter"&&["INPUT","SELECT"].includes((e.target as HTMLElement).tagName)) e.preventDefault();}} onCancel={e=>{e.preventDefault();close();}} onClose={()=>opener.current?.focus()}>
      <header><h3 id="injury-title">{regionLabel(editing)}</h3><button type="button" aria-label="Cancel spot editing" disabled={pending} onClick={close}>×</button></header>
      <fieldset disabled={pending} className={styles.scroll}>
        <div className={styles.columns}><label>Region<select value={editing.region} onChange={e=>update("region",e.target.value as InjurySpot["region"])}>{BODY_REGIONS.map(r=><option key={r} value={r}>{r.replaceAll("_"," ")}</option>)}</select></label>
          <label>Side<select value={editing.side} onChange={e=>update("side",e.target.value as InjurySpot["side"])}><option value="left">Client’s left</option><option value="right">Client’s right</option><option value="midline">Midline</option></select></label>
          <label>View<select value={editing.view} onChange={e=>update("view",e.target.value as InjurySpot["view"])}><option value="front">Front</option><option value="back">Back</option></select></label></div>
        <fieldset><legend>What applies to this spot? Select all that apply.</legend>{HISTORY_CATEGORIES.map(([key,label])=><label className={styles.check} key={key}><input type="checkbox" checked={editing.categories.includes(key)} onChange={e=>update("categories",e.target.checked?[...editing.categories,key]:editing.categories.filter(v=>v!==key))}/>{label}</label>)}</fieldset>
        {([["onset","When did the injury or issue start? (approximate is fine)"],["sensation","What does the pain or discomfort feel like?"]] as const).map(([key,label])=><label key={key}>{label}<input maxLength={2000} value={editing[key]} onChange={e=>update(key,e.target.value)}/></label>)}
        <label>Current pain (0–10; leave blank if unknown)<input type="number" min={0} max={10} step={1} value={editing.pain ?? ""} onChange={e=>update("pain",e.target.value===""?null:Number(e.target.value))}/><span className={styles.hint}>0 — No pain · 10 — Worst pain</span></label>
        <fieldset><legend>When does it occur?</legend>{([["rest","At rest"],["movement","During movement"],["after_activity","After activity"]] as const).map(([key,label])=><label className={styles.check} key={key}><input type="checkbox" checked={editing.occurrence.includes(key)} onChange={e=>update("occurrence",e.target.checked?[...editing.occurrence,key]:editing.occurrence.filter(v=>v!==key))}/>{label}</label>)}</fieldset>
        {([["triggers","Which movements or activities trigger it?"],["limitations","What movement limitations exist?"]] as const).map(([key,label])=><label key={key}>{label}<textarea maxLength={2000} value={editing[key]} onChange={e=>update(key,e.target.value)}/></label>)}
        <label>Current clinician instructions or restrictions?<select value={editing.clinicianInstructions} onChange={e=>update("clinicianInstructions",e.target.value as InjurySpot["clinicianInstructions"])}><option value="unsure">Unsure</option><option value="yes">Yes</option><option value="no">No</option></select></label>
        <label>Clinician instructions / details<textarea maxLength={2000} value={editing.clinicianDetails} onChange={e=>update("clinicianDetails",e.target.value)}/></label>
        {editing.categories.includes("surgery") && <fieldset><legend>Surgical history</legend>{([["surgeryRepair","What was repaired?"],["surgeryWhen","Approximately when was surgery?"],["postoperativeRestrictions","Current postoperative instructions or restrictions"]] as const).map(([key,label])=><label key={key}>{label}<input maxLength={2000} value={editing[key]} onChange={e=>update(key,e.target.value)}/></label>)}<p className={styles.hint}>Time since surgery and zero pain do not establish medical clearance.</p></fieldset>}
        <label>Additional notes (optional)<textarea maxLength={2000} value={editing.notes} onChange={e=>update("notes",e.target.value)}/></label>
        {error && <p role="alert">{error}</p>}
      </fieldset><footer><button type="button" disabled={pending} onClick={close}>Cancel</button><button type="button" disabled={pending} onClick={save}>{pending?"Saving spot…":"Save this spot"}</button></footer>
    </dialog>
  </section>;
}
