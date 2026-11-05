import Link from "next/link";
import { notFound } from "next/navigation";
import { requireRole } from "@/lib/auth";
import { DashboardShell, dashboardStyles as styles } from "@/components/dashboard-shell";
import { MemberRemovalForm } from "@/components/member-removal-form";
import { MutationActionForm } from "@/components/mutation-action-form";
import { cancelRemovalAppointmentAction } from "@/app/owner/team/removal-actions";
import { formatZonedDateTime } from "@/lib/timezone";

type Context={name:string;role:"coach"|"client";status:string;gym:string;assignments:{id:string;coach:string;client:string;clientId:string}[];bookings:{id:string;coachName:string;clientName:string;clientUserId:string;startsAt:string;endsAt:string;timezone:string;sessionType:string}[]};
export default async function RemoveMemberPage({params,searchParams}:{params:Promise<{memberId:string}>;searchParams:Promise<{role?:string}>}) {
  const {memberId}=await params; const {supabase,userId}=await requireRole("owner");
  const role=(await searchParams).role;
  if(role && role!=="coach" && role!=="client")notFound();
  if(!/^[0-9a-f-]{36}$/i.test(memberId))notFound();
  const [{data:context,error},{data:owner}]=await Promise.all([supabase.rpc("member_removal_context",{target_user_id:memberId,...(role?{target_role:role}:{})}),supabase.from("profiles").select("full_name").eq("id",userId).single()]);
  if(error||!context)notFound(); const c=context as Context;
  return <DashboardShell compact gymName={c.gym} name={owner?.full_name??"Owner"} role="owner">
    <Link href="/owner/team">← Back to Team</Link><div className={styles.pageHeading}><div><h2>{c.role==="coach"?"Remove Coach":"Remove Client"}</h2><p>{c.name} · {c.gym}</p></div></div>
    <section className={styles.panel}><h3>Remove access to this gym</h3><p>The person keeps their own login. Historical intake, workouts, results and audit records stay intact. Memberships at other gyms are unchanged.</p>
    {c.status!=="active"?<p role="status">This member no longer has active access to this gym.</p>:<>
      <h3>Future or in-progress appointments ({c.bookings.length})</h3><p>Cancel each affected appointment explicitly, or use Schedule to resolve it, then return here.</p>
      {c.bookings.length?<ul className={styles.activityList}>{c.bookings.map(b=><li key={b.id}><div><strong>{b.coachName} with {b.clientName}</strong><small>{formatZonedDateTime(b.startsAt,b.timezone,{dateStyle:"medium",timeStyle:"short",timeZone:b.timezone})} · {b.sessionType}</small><Link href={`/owner/clients/${b.clientUserId}?tab=schedule`}>Open schedule</Link></div><MutationActionForm action={cancelRemovalAppointmentAction.bind(null,memberId,b.id,b.clientUserId)} label="Cancel appointment" pendingLabel="Cancelling…" confirmMessage={`Cancel the appointment for ${b.clientName} with ${b.coachName}? It will be cancelled across all schedules. This is separate from removing gym access.`}/></li>)}</ul>:<p>No appointments need resolution.</p>}
      <h3>Coach assignments affected ({c.assignments.length})</h3>{c.assignments.length?<ul className={styles.activityList}>{c.assignments.map(a=><li key={a.id}><span>{a.coach} → {a.client}</span><Link href={`/owner/clients/${a.clientId}`}>Review or reassign</Link></li>)}</ul>:<p>No active Coach assignments.</p>}
      <MemberRemovalForm memberId={memberId} name={c.name} role={c.role} assignmentIds={c.assignments.map(a=>a.id)} blocked={c.bookings.length>0}/>
    </>}
    </section>
  </DashboardShell>;
}
