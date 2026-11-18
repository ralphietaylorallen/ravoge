import Link from "next/link";
import {payrollDateLabel,payrollMoney,PAYROLL_WEEKDAYS,type PayrollReport,type PayrollAmounts} from "@/lib/payroll";
import {shiftLocalDate} from "@/lib/timezone";
import {PayrollSettingsForm} from "./payroll-settings-form";
import {CoachCompensationForm} from "./revenue-forms";
import styles from "./dashboard.module.css";
import payrollStyles from "./payroll.module.css";
function Amounts({rows,field}:{rows:PayrollAmounts[];field:"revenueMinor"|"commissionMinor"|"hourlyMinor"|"totalMinor"}) {
 return <>{rows.length?rows.map(row=><span className={payrollStyles.amount} key={row.currency}>{payrollMoney(row[field],row.currency)}{rows.length>1&&` ${row.currency}`}</span>):payrollMoney("0")}</>;
}
function periodHref(start:string,end:string){return `/owner/payroll?start=${start}&end=${end}`;}
export function OwnerPayrollView({report}:{report:PayrollReport}) {
 const days=Math.round((Date.parse(report.endDate)-Date.parse(report.startDate))/86400000)+1;
 const previous=[shiftLocalDate(report.startDate,-days)!,shiftLocalDate(report.endDate,-days)!];
 const next=[shiftLocalDate(report.startDate,days)!,shiftLocalDate(report.endDate,days)!];
 return <>
  <div className={styles.pageHeading}><div><p className={styles.eyebrow}>Owner finances</p><h2>Payroll</h2></div><p>Coach revenue, commission and calculated gross pay for any dates.</p></div>
  <section className={styles.operationCard} aria-label="Select payroll dates">
   <div className={styles.sectionHeading}><h3>{payrollDateLabel(report.startDate)} – {payrollDateLabel(report.endDate)}</h3><span>{report.timezone}</span></div>
   <form method="get" action="/owner/payroll" className={styles.form}>
    <div className={styles.formColumns}><label className={styles.field}>Start date<input name="start" type="date" defaultValue={report.startDate} min="1900-01-01" max="2200-12-31" required/></label><label className={styles.field}>End date<input name="end" type="date" defaultValue={report.endDate} min="1900-01-01" max="2200-12-31" required/></label></div>
    <div className={styles.quickActions}><button className={styles.action}>View payroll</button><Link href="/owner/payroll">Current period</Link><Link href={periodHref(previous[0],previous[1])}>← Previous dates</Link><Link href={periodHref(next[0],next[1])}>Next dates →</Link></div>
   </form>
   <details className={payrollStyles.settings}><summary>Pay period settings · {report.settings.cadenceDays===7?"Weekly":"Every two weeks"} · starts {PAYROLL_WEEKDAYS[report.settings.startWeekday]}</summary><PayrollSettingsForm settings={report.settings} today={report.today}/></details>
  </section>
  <section className={styles.kpiGrid} aria-label="Payroll totals">
   <article className={styles.metricCard}><span>Recorded revenue</span><strong><Amounts rows={report.totals} field="revenueMinor"/></strong><small>Known completed session value, excluding refunds</small></article>
   <article className={styles.metricCard}><span>Commission total</span><strong><Amounts rows={report.totals} field="commissionMinor"/></strong><small>Saved session compensation</small></article>
   <article className={styles.metricCard}><span>Hourly pay</span><strong><Amounts rows={report.totals} field="hourlyMinor"/></strong><small>For hourly Coach agreements</small></article>
   <article className={styles.metricCard}><span>Calculated coach pay</span><strong><Amounts rows={report.totals} field="totalMinor"/></strong><small>{report.reviewSessions?"Subtotal · items need review":"Gross pay for this date range"}</small></article>
   <article className={styles.metricCard}><span>Completed sessions</span><strong>{report.completedSessions}</strong><small>{report.reviewSessions} need review</small></article>
  </section>
  {report.reviewSessions>0&&<p className={styles.notice} role="alert">{report.reviewSessions} completed {report.reviewSessions===1?"session needs":"sessions need"} review for missing pricing, missing compensation or a refund. Revenue and pay totals may be incomplete. Calculated pay excludes these items and is a subtotal.</p>}
  <section className={styles.workspaceSection}>
   <div className={styles.sectionHeading}><h3>All Coaches</h3><p>Saved session rates determine pay. The current rate below applies to new or rescheduled bookings.</p></div>
   <div className={styles.tableScroll} tabIndex={0} role="region" aria-label="Coach payroll table"><table className={`${styles.reportTable} ${payrollStyles.table}`}><thead><tr><th scope="col">Coach</th><th scope="col">Sessions</th><th scope="col">Revenue</th><th scope="col">Current rate</th><th scope="col">Commission</th><th scope="col">Calculated pay</th><th scope="col">Review</th></tr></thead><tbody>
    {report.coaches.map(coach=><tr key={coach.id}><th scope="row">{coach.status==="historical"?coach.name:<Link href={`/owner/coaches/${coach.id}`}>{coach.name}</Link>}{coach.status!=="active"&&<small className={payrollStyles.amount}>{coach.status}</small>}</th><td>{coach.completedSessions}</td><td><Amounts rows={coach.amounts} field="revenueMinor"/></td><td>{coach.model==="percentage"?`${(coach.commissionBasisPoints??0)/100}%`:coach.model==="hourly"?`${payrollMoney(coach.hourlyRateMinor??"0",coach.currency)}/hr`:"Not configured"}</td><td><Amounts rows={coach.amounts} field="commissionMinor"/></td><td><strong><Amounts rows={coach.amounts} field="totalMinor"/></strong></td><td>{coach.reviewSessions?`${coach.reviewSessions} sessions`:"—"}{coach.amounts.some(a=>a.refunded>0)&&<small className={payrollStyles.amount}>Includes refund review</small>}{coach.amounts.some(a=>a.unpriced>0)&&<small className={payrollStyles.amount}>Missing session value</small>}</td></tr>)}
   </tbody></table></div>
   {!report.coaches.length&&<p className={styles.empty}>No Coaches have been added to this gym yet.</p>}
   {!report.completedSessions&&<p className={styles.empty}>No completed appointments in these dates. Scheduled, cancelled and no-show appointments are excluded.</p>}
   <p className={styles.formHint}>Includes completed appointments by their session date in {report.timezone}. Session value is not proof of payment collection. Calculated pay does not send money or subtract payments made outside Ravoge.</p>
  </section>
  <details className={styles.operationCard}><summary>Coach commission and hourly settings</summary><div className={styles.compensationGrid}>{report.coaches.filter(c=>c.status==="active").map(coach=><article key={coach.id} className={styles.panel}><h3>{coach.name}</h3><CoachCompensationForm coachId={coach.id} compensation={{model:coach.model,commission_basis_points:coach.commissionBasisPoints,hourly_rate_minor:coach.hourlyRateMinor===null?null:Number(coach.hourlyRateMinor)}}/></article>)}</div><p className={styles.formHint}>Changes apply to future or rescheduled sessions. Historical session compensation stays as recorded.</p><Link href="/owner/revenue">Manage session pricing →</Link></details>
 </>;
}
