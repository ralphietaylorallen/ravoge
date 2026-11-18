import Link from 'next/link';
import {DashboardShell,dashboardStyles as styles} from '@/components/dashboard-shell';
import {requireRole} from '@/lib/auth';
import {TrainSessionForm} from '@/components/train-session-form';
import {localDateInTimeZone,DEFAULT_ORGANIZATION_TIMEZONE} from '@/lib/timezone';
export async function WorkoutNowPage({role,searchParams}:{role:'owner'|'coach';searchParams:Promise<{client?:string}>}){
 const {client:requested}=await searchParams;
 const {membership,supabase,userId}=await requireRole(role);
 const [{data:actor},{data:org},{data:members,error:memberError}]=await Promise.all([
  supabase.from('profiles').select('full_name').eq('id',userId).single(),
  supabase.from('organizations').select('name,timezone').eq('id',membership.organization_id).single(),
  role==='owner'?supabase.from('organization_member_roles').select('user_id').eq('organization_id',membership.organization_id).eq('role','client').eq('status','active'):supabase.from('coach_client_assignments').select('client_user_id').eq('organization_id',membership.organization_id).eq('coach_user_id',userId).eq('status','active'),
 ]);
 const ids=(members??[]).map((row:{user_id?:string;client_user_id?:string})=>row.user_id||row.client_user_id!);
 const {data:clients,error:clientError}=ids.length?await supabase.from('profiles').select('id,full_name,preferred_name').in('id',ids).eq('account_status','active').order('full_name'):{data:[],error:null};
 const client=clients?.find(row=>row.id===requested);
 const today=localDateInTimeZone(new Date(),org?.timezone||DEFAULT_ORGANIZATION_TIMEZONE);
 const [intake,readiness,plans]=client?await Promise.all([
  supabase.from('client_intakes').select('id').eq('organization_id',membership.organization_id).eq('client_user_id',client.id).order('version',{ascending:false}).limit(1).maybeSingle(),
  supabase.rpc('get_workout_generation_readiness',{target_client_user_id:client.id}),
  supabase.from('workout_assignments').select('title').eq('organization_id',membership.organization_id).eq('coach_user_id',userId).eq('client_user_id',client.id).eq('scheduled_date',today).in('status',['assigned','in_progress']).limit(1).maybeSingle(),
 ]):[null,null,null];
 const failed=memberError||clientError||intake?.error||readiness?.error||plans?.error;
 return <DashboardShell compact role={role} gymName={org?.name||'Ravoge gym'} name={actor?.full_name||role}>
  <div className={styles.quickActions}>
    <Link href={`/${role}`} className={styles.backLink}>← Dashboard</Link>
    {role === "coach" && <Link href={`/coach/plan-workouts${client ? `?client=${client.id}` : ""}`}>Plan Workouts →</Link>}
  </div>
  <div className={styles.pageHeading}><div><p className={styles.eyebrow}>Training studio</p><h2>Create workout</h2><p className={styles.profileMeta}>Choose a client, focus and duration. Generate and edit a workout, then start now or schedule it.</p></div></div>
  <section className={styles.operationCard}><form method="get" className={styles.form}><label className={styles.field}>Client<select name="client" required defaultValue={client?.id||''}><option value="" disabled>Select a Client</option>{clients?.map(row=><option key={row.id} value={row.id}>{row.preferred_name||row.full_name}</option>)}</select></label><button className={styles.action} disabled={!!memberError||!!clientError||!clients?.length}>Select Client</button></form>{!clients?.length&&!failed&&<p className={styles.empty}>{role==='coach'?'No active Clients are assigned to you yet.':'No active Clients are available yet.'}</p>}</section>
  {requested&&!client&&!failed&&<p role="alert" className={styles.notice}>This Client is not available in your current gym or assigned client list.</p>}
  {failed?<p role="alert" className={styles.notice}>Client training details could not be loaded. Refresh to try again.</p>:client&&<><h3>{client.preferred_name||client.full_name}</h3><TrainSessionForm key={client.id} clientId={client.id} role={role} workoutNow hasIntake={!!intake?.data} intakeReviewRequired={readiness?.data?.needsSafetyReview===true} plannedWorkoutTitle={plans?.data?.title}/>{!intake?.data&&<Link className={styles.secondaryAction} href={`/${role}/clients/${client.id}?tab=intake`}>Open Client intake</Link>}</>}
 </DashboardShell>;
}
