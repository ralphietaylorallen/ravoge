import Link from "next/link";
import { getActiveMembership, getVerifiedUser } from "@/lib/auth";
import styles from "./auth-entry.module.css";

export async function InvitationRecovery() {
  const { supabase, userId } = await getVerifiedUser();
  const membership = userId ? await getActiveMembership(userId, supabase) : null;
  const staffPath = membership?.role === "owner" ? "/owner/team" : membership?.role === "coach" ? "/coach" : null;
  return <div className={styles.formNotice}>
    {staffPath ? <><p>Open your gym’s invitations and choose Resend invitation. The recipient, role and gym are checked again by the server.</p><Link href={staffPath}>Send another invitation</Link></>
      : <><p>Ask your gym for a fresh secure invitation. This opens an email draft; enter your gym’s contact address. Nothing is sent automatically.</p><a href="mailto:?subject=New%20Ravoge%20invitation&body=Please%20send%20me%20a%20new%20secure%20Ravoge%20invitation.%20My%20previous%20link%20is%20unavailable.">Send another invitation</a><p><Link href="/login">Gym staff access</Link> lets authorized staff sign in and resend through their workspace.</p></>}
  </div>;
}
