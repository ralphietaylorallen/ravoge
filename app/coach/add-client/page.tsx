import Link from "next/link";
import { revokeInvitationAction } from "@/app/auth/actions";
import { DashboardShell, dashboardStyles as styles } from "@/components/dashboard-shell";
import { ClientInstallCard } from "@/components/client-install-card";
import { InviteForm } from "@/components/invite-form";
import { MutationActionForm } from "@/components/mutation-action-form";
import { ClientSignupTools } from "@/components/client-signup-tools";
import { requireRole } from "@/lib/auth";
import { getCoachClientEnrollmentCredential } from "@/lib/organization-enrollment";

type PendingInvitation = { accepted_at: string | null; delivery_status: string; email: string; expires_at: string; id: string; revoked_at: string | null };
export default async function AddClientPage() {
  const { membership, supabase, userId } = await requireRole("coach");
  const [profile, organization, invitations] = await Promise.all([
    supabase.from("profiles").select("full_name,preferred_name").eq("id", userId).single(),
    supabase.from("organizations").select("name").eq("id", membership.organization_id).single(),
    supabase.from("organization_invitations").select("id,email,expires_at,delivery_status,accepted_at,revoked_at").eq("organization_id", membership.organization_id).eq("invited_by", userId).eq("role", "client").order("created_at", { ascending: false }),
  ]);
  let signupUrl: string | null = null;
  let signupError = false;
  try { signupUrl = (await getCoachClientEnrollmentCredential(supabase, membership.organization_id))?.url ?? null; } catch { signupError = true; }
  const pendingInvitations = (invitations.data ?? []) as PendingInvitation[];
  const nowIso = new Date().toISOString();
  return <DashboardShell compact gymName={organization.data?.name ?? "Ravoge gym"} name={profile.data?.preferred_name || profile.data?.full_name || "Coach"} role="coach">
    <div className={styles.pageHeading}><div><p className={styles.eyebrow}>Coach tools</p><h2>Add Client</h2></div><p>Invite a Client, share their signup link, or let them scan the QR on your device.</p></div>
    <div className={styles.overviewCards}>
      <section className={styles.panel}><h2>Client signup</h2>{signupError ? <p role="alert">The gym signup QR could not be loaded. Reload or send an email invitation below.</p> : signupUrl ? <ClientSignupTools url={signupUrl} /> : <><ClientSignupTools url="https://ravoge.com/signup/client" /><p className={styles.empty}>Your gym’s shared signup QR is not active. Send an email invitation below to give your Client secure gym access. An Owner can enable the shared QR in Apps &amp; access.</p></>}</section>
        <section className={styles.panel}>
          <h2>Invite a client</h2>
          <InviteForm role="client" />
          <ClientInstallCard />

          {invitations.error ? <p role="alert">Invitation history could not be loaded. Reload to try again.</p> : pendingInvitations.length ? (
            <>
              <h3 className={styles.subheading}>Invitation history</h3>
              <ul className={styles.activityList}>
                {pendingInvitations.map((invitation) => {
                  const status = invitation.accepted_at ? "accepted" : invitation.revoked_at ? "revoked" : invitation.expires_at <= nowIso ? "expired" : "pending";
                  return <li key={invitation.id}>
                    <div><strong>{invitation.email}</strong><small>{status} · Email: {invitation.delivery_status.replaceAll("_", " ")}</small></div>
                    {status === "pending" ? <MutationActionForm action={revokeInvitationAction.bind(null, invitation.id)} confirmMessage={`Revoke the invitation for ${invitation.email}?`} label="Revoke" /> : <span>Expires<time dateTime={invitation.expires_at}>{new Date(invitation.expires_at).toLocaleDateString("en-US")}</time></span>}
                  </li>;
                })}
              </ul>
            </>
          ) : null}
        </section>
    </div><Link className={styles.inlineAction} href="/coach">Back to dashboard →</Link>
  </DashboardShell>;
}
