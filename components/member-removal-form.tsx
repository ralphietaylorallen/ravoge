"use client";
import { useActionState } from "react";
import { removeTeamMemberAction } from "@/app/owner/team/removal-actions";
import styles from "./dashboard.module.css";

export function MemberRemovalForm({memberId,name,role,assignmentIds,blocked}:{memberId:string;name:string;role:"coach"|"client";assignmentIds:string[];blocked:boolean}) {
  const [state,action,pending]=useActionState(removeTeamMemberAction.bind(null,memberId,role,assignmentIds),{status:"idle",message:""});
  const label=role === "coach" ? "Remove Coach" : "Remove Client";
  return <form action={action} className={styles.form} onSubmit={event=>{if(!window.confirm(`${label}: ${name}? This removes access to this gym and ends ${assignmentIds.length} confirmed Coach assignment(s). Their login and historical intake, workout and result records stay intact. No appointments will be cancelled by this action.`))event.preventDefault();}}>
    {assignmentIds.length>0&&<label className={styles.checkboxLabel}><input name="endAssignments" value="yes" type="checkbox" required disabled={blocked||pending}/>End the {assignmentIds.length} Coach assignment(s) listed above. Clients who remain at the gym will need an Owner to assign a new Coach.</label>}
    {blocked&&<p role="status" className={styles.notice}>Resolve the appointments above before removing access. Nothing will be cancelled or reassigned automatically.</p>}
    <button className={styles.action} disabled={blocked||pending||state.status==="success"} type="submit">{pending?"Removing access…":label}</button>
    {state.message&&<p role={state.status==="error"?"alert":"status"} className={styles.notice}>{state.message}</p>}
  </form>;
}
