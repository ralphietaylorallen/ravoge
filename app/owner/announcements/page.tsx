import {requireRole} from "@/lib/auth";
import {DashboardShell,dashboardStyles as styles} from "@/components/dashboard-shell";
import {OwnerAnnouncements} from "@/components/owner-announcements";
import {AnnouncementPreferences} from "@/components/announcement-preferences";
import type {AnnouncementAudience,AnnouncementJob,AnnouncementRecipient} from "@/lib/announcement-types";
export default async function AnnouncementsPage(){
 const {supabase,membership,userId}=await requireRole("owner");
 const [{data:profile},{data:org},{data:audience,error:audienceError},{data:jobs,error:jobError}]=await Promise.all([supabase.from("profiles").select("full_name").eq("id",userId).single(),supabase.from("organizations").select("name").eq("id",membership.organization_id).single(),supabase.rpc("owner_announcement_audience"),supabase.from("announcements").select("id,subject,message,audience,status,created_at").eq("organization_id",membership.organization_id).order("created_at",{ascending:false}).limit(20)]);
 const {data:recipients,error:recipientError}=jobs?.length?await supabase.from("announcement_recipients").select("id,announcement_id,email,member_role,status,attempts,provider_id,accepted_at,delivered_at,provider_checked_at,retryable,error_code,first_attempt_at,next_attempt_at,lease_until").eq("organization_id",membership.organization_id).in("announcement_id",jobs.map(j=>j.id)):{data:[],error:null};
 const rows=(recipients??[]) as (AnnouncementRecipient&{announcement_id:string})[];
 return <DashboardShell compact gymName={org?.name??"Ravoge gym"} name={profile?.full_name??"Owner"} role="owner"><div className={styles.pageHeading}><h2>Announcements</h2><p>Optional gym news, sent privately to each person.</p></div>{audienceError||jobError||recipientError?<p className={styles.notice} role="alert">Announcements could not be loaded. Please refresh; no emails were sent.</p>:<OwnerAnnouncements audience={(audience??[]) as AnnouncementAudience[]} initialJobs={(jobs??[]).map(j=>({...j,recipients:rows.filter(r=>r.announcement_id===j.id)})) as AnnouncementJob[]}/>}<AnnouncementPreferences/></DashboardShell>;
}
