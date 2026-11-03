import {getVerifiedUser,getActiveMembership} from "@/lib/auth";
import {AnnouncementPreferenceForm} from "./announcement-preference-form";
import styles from "./dashboard.module.css";
export async function AnnouncementPreferences(){
 const {supabase,userId}=await getVerifiedUser();if(!userId)return null;const membership=await getActiveMembership(userId,supabase);if(!membership)return null;
 const [{data:preference,error},{data:{user}}]=await Promise.all([supabase.from("announcement_preferences").select("opted_in,email").eq("organization_id",membership.organization_id).eq("user_id",userId).maybeSingle(),supabase.auth.getUser()]);
 return <section className={styles.panel}><h2>Announcement email preferences</h2>{error?<p role="alert">Announcement preferences could not be loaded. Please refresh.</p>:<AnnouncementPreferenceForm optedIn={Boolean(preference?.opted_in&&preference.email===user?.email?.toLowerCase())}/>}</section>;
}
