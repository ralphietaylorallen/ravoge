import Link from "next/link";

import { DashboardShell, dashboardStyles as styles } from "@/components/dashboard-shell";
import { InviteForm } from "@/components/invite-form";
import { ProfilePhoto } from "@/components/profile-photo";
import { requireRole } from "@/lib/auth";
import { getProfileImageUrl } from "@/lib/profile-images";

type MemberRow = {
  is_primary_owner: boolean;
  role: "owner" | "coach" | "client";
  status: "active" | "inactive";
  user_id: string;
};

type InvitationRow = {
  created_at: string;
  email: string;
  expires_at: string;
  id: string;
  role: "owner" | "coach" | "client";
};

export default async function OwnerTeamPage() {
  const { membership, supabase, userId } = await requireRole("owner");
  const organizationId = membership.organization_id;
  const [
    { data: profile },
    { data: organization },
    { data: memberships },
    { data: invitations },
  ] = await Promise.all([
    supabase.from("profiles").select("full_name").eq("id", userId).single(),
    supabase.from("organizations").select("name").eq("id", organizationId).single(),
    supabase
      .from("organization_memberships")
      .select("user_id, role, status, is_primary_owner")
      .eq("organization_id", organizationId)
      .order("created_at"),
    supabase
      .from("organization_invitations")
      .select("id, email, role, expires_at, created_at")
      .eq("organization_id", organizationId)
      .is("accepted_at", null)
      .is("revoked_at", null)
      .gt("expires_at", new Date().toISOString())
      .order("created_at", { ascending: false }),
  ]);

  const memberRows = (memberships ?? []) as MemberRow[];
  const { data: profiles } = memberRows.length
    ? await supabase
        .from("profiles")
        .select("id, full_name, preferred_name, avatar_path")
        .in("id", memberRows.map((row) => row.user_id))
    : { data: [] };
  const names = new Map(
    (profiles ?? []).map((row: { id: string; full_name: string; preferred_name: string | null }) => [
      row.id,
      row.preferred_name || row.full_name,
    ]),
  );
  const photos = new Map(
    await Promise.all(
      (profiles ?? []).map(async (row: { avatar_path: string | null; id: string }) => [
        row.id,
        await getProfileImageUrl(supabase, row.avatar_path),
      ] as const),
    ),
  );

  return (
    <DashboardShell
      gymName={organization?.name ?? "Ravoge gym"}
      name={profile?.full_name ?? "Owner"}
      role="owner"
    >
      <div className={styles.pageHeading}>
        <div>
          <p className={styles.eyebrow}>Organization access</p>
          <h2>Team</h2>
        </div>
        <p>Every person signs in with their own account. Memberships—not shared credentials—control access.</p>
      </div>

      <div className={styles.grid}>
        {(["owner", "coach", "client"] as const).map((role) => (
          <section className={styles.panel} key={role}>
            <h2>{role}s</h2>
            {memberRows.some((row) => row.role === role) ? (
              <ul className={styles.list}>
                {memberRows
                  .filter((row) => row.role === role)
                  .map((row) => {
                    const name = names.get(row.user_id) ?? (role === "owner" ? "Owner" : role === "coach" ? "Coach" : "Client");
                    return (
                    <li key={row.user_id}>
                      <span className={styles.memberIdentity}>
                        <ProfilePhoto name={name} size="small" url={photos.get(row.user_id)} />
                        <span>
                        {role === "coach" ? (
                          <Link href={`/owner/coaches/${row.user_id}`}>{name}</Link>
                        ) : role === "client" ? (
                          <Link href={`/owner/clients/${row.user_id}`}>{name}</Link>
                        ) : name}
                        {row.is_primary_owner && (
                          <small className={styles.primaryBadge}>Primary owner</small>
                        )}
                        </span>
                      </span>
                      <small>{row.status}</small>
                    </li>
                    );
                  })}
              </ul>
            ) : (
              <p className={styles.empty}>No {role} memberships yet.</p>
            )}
          </section>
        ))}

        <section className={styles.panel}>
          <h2>Invite owner</h2>
          <p className={styles.empty}>Adds an operational owner. The primary owner remains the owner of record.</p>
          <InviteForm role="owner" />
        </section>
        <section className={styles.panel}>
          <h2>Invite coach</h2>
          <p className={styles.empty}>The recipient must use the exact invited email with their own Ravoge account.</p>
          <InviteForm role="coach" />
        </section>
        <section className={styles.panel}>
          <h2>Invite client</h2>
          <p className={styles.empty}>Creates a secure, email-bound invitation for an individual client account.</p>
          <InviteForm role="client" />
        </section>
        <section className={styles.panel}>
          <h2>Pending invitations</h2>
          {(invitations ?? []).length ? (
            <ul className={styles.list}>
              {((invitations ?? []) as InvitationRow[]).map((invitation) => (
                <li key={invitation.id}>
                  <span>{invitation.email}</span>
                  <small>{invitation.role} · expires {new Date(invitation.expires_at).toLocaleDateString("en-US")}</small>
                </li>
              ))}
            </ul>
          ) : (
            <p className={styles.empty}>No pending invitations.</p>
          )}
        </section>
      </div>
    </DashboardShell>
  );
}
