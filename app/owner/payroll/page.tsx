import Link from "next/link";
import {DashboardShell,dashboardStyles as styles} from "@/components/dashboard-shell";
import {OwnerPayrollView} from "@/components/owner-payroll-view";
import {requireRole} from "@/lib/auth";
import {validPayrollDate,type PayrollReport} from "@/lib/payroll";
export default async function OwnerPayrollPage({searchParams}:{searchParams:Promise<{start?:string|string[];end?:string|string[]}>}) {
 const {membership,supabase,userId}=await requireRole("owner");
 const params=await searchParams;
 const invalid=(params.start!==undefined||params.end!==undefined)&&(!validPayrollDate(params.start)||!validPayrollDate(params.end)||params.end<params.start);
 const [{data:owner},{data:org},result]=await Promise.all([
  supabase.from("profiles").select("full_name").eq("id",userId).single(),
  supabase.from("organizations").select("name").eq("id",membership.organization_id).single(),
  invalid?Promise.resolve({data:null,error:{message:"dates"}}):supabase.rpc("get_owner_payroll_report",{range_start:params.start??null,range_end:params.end??null}),
 ]);
 return <DashboardShell compact role="owner" name={owner?.full_name??"Owner"} gymName={org?.name??"Ravoge gym"}>
  {result.error||!result.data?<section className={styles.operationCard}><h2>Payroll</h2><p role="alert">{invalid?"Choose valid start and end dates, with the end on or after the start.":"Payroll could not be loaded. No zero-dollar report has been substituted. Refresh or try again shortly."}</p><Link href="/owner/payroll">Open current pay period</Link></section>:<OwnerPayrollView key={`${result.data.startDate}-${result.data.endDate}-${result.data.settings.anchorDate}-${result.data.settings.cadenceDays}`} report={result.data as PayrollReport}/>}
 </DashboardShell>;
}
