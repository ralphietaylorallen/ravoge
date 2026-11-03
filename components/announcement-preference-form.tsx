"use client";
import {useActionState} from "react";
import {saveAnnouncementPreferenceAction,unsubscribeAnnouncementAction} from "@/app/email/announcements/actions";
import styles from "./dashboard.module.css";
export function AnnouncementPreferenceForm({optedIn}:{optedIn:boolean}){
 const [state,action,pending]=useActionState(saveAnnouncementPreferenceAction,{status:"idle",message:""});
 return <form action={action} className={styles.form}><label className={styles.checkboxLabel}><input type="checkbox" name="announcements" value="yes" defaultChecked={optedIn} disabled={pending}/>Email me optional announcements from my gym</label><p className={styles.formHint}>Off by default. You can change this at any time. Invitations and essential account emails are separate.</p><button className={styles.secondaryAction} disabled={pending}>{pending?"Saving…":"Save email preference"}</button>{state.message&&<p role={state.status==="error"?"alert":"status"}>{state.message}</p>}</form>;
}
export function AnnouncementUnsubscribeForm({token}:{token:string}){
 const [state,action,pending]=useActionState(unsubscribeAnnouncementAction,{status:"idle",message:""});return <form action={action} className={styles.form}><input type="hidden" name="token" value={token}/><button className={styles.action} disabled={pending||state.status==="success"}>{pending?"Unsubscribing…":"Unsubscribe from gym announcements"}</button>{state.message&&<p role={state.status==="error"?"alert":"status"}>{state.message}</p>}</form>;
}
