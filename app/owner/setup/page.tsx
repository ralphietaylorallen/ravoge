import Link from "next/link";

import { DashboardShell, dashboardStyles as styles } from "@/components/dashboard-shell";
import { requireRole } from "@/lib/auth";

export default async function OwnerSetupPage() {
  const { membership, supabase, userId } = await requireRole("owner");
  const organizationId = membership.organization_id;
  const [
    { data: owner },
    { data: organization },
    { count: ownerCount },
    { count: coachCount },
    { count: inviteCount },
    { count: equipmentCount },
    { count: hourCount },
    { count: settingsCount },
  ] = await Promise.all([
    supabase.from("profiles").select("full_name").eq("id", userId).single(),
    supabase.from("organizations").select("name,timezone").eq("id", organizationId).single(),
    supabase.from("organization_memberships").select("user_id", { count: "exact", head: true }).eq("organization_id", organizationId).eq("role", "owner").eq("status", "active"),
    supabase.from("organization_memberships").select("user_id", { count: "exact", head: true }).eq("organization_id", organizationId).eq("role", "coach").eq("status", "active"),
    supabase.from("organization_invitations").select("id", { count: "exact", head: true }).eq("organization_id", organizationId).eq("role", "coach").is("accepted_at", null).is("revoked_at", null).gt("expires_at", new Date().toISOString()),
    supabase.from("organization_equipment").select("id", { count: "exact", head: true }).eq("organization_id", organizationId).eq("is_available", true),
    supabase.from("organization_hours").select("day_of_week", { count: "exact", head: true }).eq("organization_id", organizationId),
    supabase.from("organization_session_settings").select("organization_id", { count: "exact", head: true }).eq("organization_id", organizationId),
  ]);

  const schedulingReady = hourCount === 7 && settingsCount === 1;
  const steps = [
    { href: "/owner", label: "Gym", status: organization?.name && organization?.timezone ? "Configured" : "Needs attention" },
    { href: "/owner/team", label: "Team", status: `${ownerCount ?? 0} owner${ownerCount === 1 ? "" : "s"}` },
    { href: "/owner/equipment", label: "Equipment", status: equipmentCount ? `${equipmentCount} available` : "Add equipment" },
    { href: "/owner/schedule", label: "Scheduling", status: schedulingReady ? "Configured" : "Set hours & rules" },
    { href: "/owner/training-library", label: "Training history", status: "Not loaded" },
    { href: "/owner/apps", label: "Apps & access", status: "Ready to share" },
  ];

  return (
    <DashboardShell gymName={organization?.name ?? "Ravoge gym"} name={owner?.full_name ?? "Owner"} role="owner">
      <div className={styles.pageHeading}>
        <div><p className={styles.eyebrow}>First-time setup</p><h2>Prepare your gym</h2></div>
        <p>Complete the operational foundation in order. Coach availability is added after each Coach accepts an invitation.</p>
      </div>
      <ol className={styles.setupList}>
        {steps.map((step, index) => (
          <li key={step.label}>
            <span>{String(index + 1).padStart(2, "0")}</span>
            <div><strong>{step.label}</strong><small>{step.status}</small></div>
            <Link href={step.href}>Open →</Link>
          </li>
        ))}
        <li><span>07</span><div><strong>Ready</strong><small>{schedulingReady && (coachCount || inviteCount) ? "Core setup is ready" : "Finish the steps above"}</small></div></li>
      </ol>
      <section className={styles.securityNote}>
        <strong>Ready for a Client?</strong>
        <p>Invite the first Client from Team. Their account, role, organization, and assigned Coach remain server-controlled.</p>
        <Link className={styles.inlineAction} href="/owner/team">Add first Client →</Link>
      </section>
    </DashboardShell>
  );
}
