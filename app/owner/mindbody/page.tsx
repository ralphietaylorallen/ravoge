import Link from "next/link";
import { requireRole } from "@/lib/auth";
import { DashboardShell, dashboardStyles as styles } from "@/components/dashboard-shell";
import { MINDBODY_BLOCKER } from "@/lib/group-programming";

export default async function MindbodyPage() {
  const { membership, supabase, userId } = await requireRole("owner");
  const [{ data: profile }, { data: org }] = await Promise.all([
    supabase.from("profiles").select("full_name").eq("id", userId).single(),
    supabase.from("organizations").select("name").eq("id", membership.organization_id).single(),
  ]);
  return <DashboardShell compact role="owner" name={profile?.full_name ?? "Owner"} gymName={org?.name ?? "Your gym"}>
    <Link className={styles.backLink} href="/owner/group-programming">← Group Class Programming</Link>
    <div className={styles.pageHeading}><h2>Mindbody Integration</h2></div>
    <section className={styles.panel}><h3>Not connected · API capability needs verification</h3><p>{MINDBODY_BLOCKER}</p>
      <p>Mindbody’s documented class-note update changes every future occurrence of a class schedule. It cannot safely send a different workout for each date. The occurrence-specific update currently exposes a theme name, not workout text.</p>
      <p>Site ID: not connected. Last successful connection test: none. Last successful synchronization: none.</p>
      <p>Credential entry, Connect and Test, class mapping, rotation and Disconnect will become available only after a supported date-specific destination and its display in your branded app pass the pilot test. No API key or staff password is requested or stored in this release.</p>
      <p>Your gym can save and publish programming inside Ravoge now. Nothing is sent to Mindbody, and no classes, bookings or scheduling are changed.</p>
      <a className={styles.textAction} href="https://api.mindbodyonline.com/public/v6/swagger/doc" target="_blank" rel="noreferrer">Official Mindbody API definition ↗</a>
    </section>
  </DashboardShell>;
}
