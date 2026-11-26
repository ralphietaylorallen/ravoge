"use client";

import { useActionState, useEffect, useRef } from "react";
import { saveAnnouncementPreferenceAction, unsubscribeAnnouncementAction } from "@/app/email/announcements/actions";
import styles from "./dashboard.module.css";

export function AnnouncementPreferenceForm({ optedIn }: { optedIn: boolean }) {
  const [state, action, pending] = useActionState(saveAnnouncementPreferenceAction, { status: "idle", message: "" });
  const settings = useRef<HTMLDetailsElement>(null);
  const summary = useRef<HTMLElement>(null);

  useEffect(() => {
    if (state.status === "success" && settings.current?.open) {
      const restoreFocus = settings.current.contains(document.activeElement);
      settings.current.open = false;
      if (restoreFocus) summary.current?.focus();
    }
  }, [state]);

  return <>
    <details ref={settings} className={styles.announcementSettings}>
      <summary ref={summary}>Gym announcement emails · {optedIn ? "On" : "Off"}</summary>
      <form action={action} onReset={event => event.preventDefault()} className={styles.form}>
        <label className={styles.checkboxLabel}>
          <input key={String(optedIn)} type="checkbox" name="announcements" value="yes" defaultChecked={optedIn} />
          Email me optional announcements from my gym
        </label>
        <button className={styles.secondaryAction} disabled={pending}>{pending ? "Saving…" : "Save email preference"}</button>
        {state.status === "error" && <p role="alert">{state.message}</p>}
      </form>
    </details>
    <div role="status">{state.status === "success" && state.message}</div>
  </>;
}
export function AnnouncementUnsubscribeForm({token}:{token:string}){
 const [state,action,pending]=useActionState(unsubscribeAnnouncementAction,{status:"idle",message:""});return <form action={action} className={styles.form}><input type="hidden" name="token" value={token}/><button className={styles.action} disabled={pending||state.status==="success"}>{pending?"Unsubscribing…":"Unsubscribe from gym announcements"}</button>{state.message&&<p role={state.status==="error"?"alert":"status"}>{state.message}</p>}</form>;
}
