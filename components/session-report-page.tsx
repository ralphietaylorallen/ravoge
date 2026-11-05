import { notFound } from "next/navigation";
import Link from "next/link";
import { requireRole } from "@/lib/auth";
import { LOG_UUID } from "@/lib/client-logs";
import { loadSessionReport, type SessionReportData } from "@/lib/session-report-data";
import { DashboardShell,dashboardStyles } from "./dashboard-shell";
import { SessionReport } from "./session-report";

export async function SessionReportPage({role,workoutId,clientId}:{role:"client"|"coach"|"owner";workoutId:string;clientId?:string}) {
 const {membership,supabase,userId}=await requireRole(role),target=role==="client"?userId:clientId;
 if(!target||!LOG_UUID.test(target)||!LOG_UUID.test(workoutId))notFound();
 const [{data:actor},{data:org}]=await Promise.all([supabase.from("profiles").select("full_name").eq("id",userId).single(),supabase.from("organizations").select("name").eq("id",membership.organization_id).single()]);
 let data:SessionReportData|null=null,issue="";
 try{data=await loadSessionReport(supabase,membership.organization_id,target,workoutId);}catch(e){issue=e instanceof Error?e.message:"Report unavailable. Your workout results are saved.";}
 if(!data&&!issue)notFound();
 const back=role==="client"?"/client/profile":`/${role}/clients/${target}?tab=progress`;
 return <DashboardShell compact role={role} gymName={org?.name??"Ravoge gym"} name={actor?.full_name??role}>
  {issue?<section className={dashboardStyles.operationCard}><h1>Session report unavailable</h1><p role="alert">{issue}</p><Link href={back}>Return to profile</Link></section>:<SessionReport data={data!} role={role}/>}
 </DashboardShell>;
}
