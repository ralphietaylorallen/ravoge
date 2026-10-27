import Link from "next/link";
import { DashboardShell, dashboardStyles } from "./dashboard-shell";
import { GroupProgramming } from "./group-programming";
import { GroupPermissionForm } from "./group-permission-form";
import { requireRole } from "@/lib/auth";
import { groupMonday, groupWeek } from "@/lib/group-programming";
import styles from "./group-programming.module.css";

export async function GroupProgrammingPage({ role }: { role: "owner" | "coach" }) {
  const { membership, supabase, userId } = await requireRole(role);
  const [{ data: profile }, { data: org }, { data: allowed }] = await Promise.all([
    supabase.from("profiles").select("full_name").eq("id", userId).single(),
    supabase.from("organizations").select("name,timezone").eq("id", membership.organization_id).single(),
    supabase.rpc("can_manage_group_programming"),
  ]);
  const gym = org?.name ?? "Your gym";
  if (!allowed) return <DashboardShell compact role={role} name={profile?.full_name ?? role} gymName={gym}><section className={dashboardStyles.panel}><h2>Group Class Programming</h2><p>Your Owner must enable Group Class Programming access. No programming was loaded.</p><Link href={`/${role}`}>Back to your dashboard</Link></section></DashboardShell>;
  const today = new Intl.DateTimeFormat("en-CA", { timeZone: org?.timezone ?? "UTC", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
  const week = groupMonday(today);
  const [{ data: programs, error }, { data: permissions }, { data: members }] = await Promise.all([
    supabase.from("group_daily_programs").select("*").eq("organization_id", membership.organization_id).in("programming_date", groupWeek(week)),
    supabase.from("group_programming_permissions").select("coach_user_id").eq("organization_id", membership.organization_id),
    supabase.from("organization_memberships").select("user_id,role").eq("organization_id", membership.organization_id).eq("status", "active").in("role", ["owner", "coach"]),
  ]);
  const { data: profiles } = await supabase.from("profiles").select("id,full_name").in("id", (members ?? []).map(m => m.user_id));
  const names = Object.fromEntries((profiles ?? []).map(p => [p.id, p.full_name]));
  return <DashboardShell compact role={role} gymName={gym} name={profile?.full_name ?? role}>
    <div className={dashboardStyles.pageHeading}><div><h2>Group Class Programming</h2><p className={dashboardStyles.profileMeta}>Your gym’s weekly workout notepad. Monday–Saturday.</p></div>{role === "owner" && <Link className={dashboardStyles.textAction} href="/owner/mindbody">Mindbody Integration</Link>}</div>
    <GroupProgramming role={role} gym={gym} initialWeek={week} currentWeek={week} initialPrograms={programs ?? []} names={names} initialError={error ? "Programming could not load. Try reloading before editing." : undefined} />
    {role === "owner" && <section className={styles.panel}><h3>Coach access</h3><p className={styles.hint}>Only Owners and the Coaches you enable here can manage group programming. This grants no Owner controls.</p>{(members ?? []).filter(m => m.role === "coach").map(m => <GroupPermissionForm key={m.user_id} coachId={m.user_id} name={names[m.user_id] ?? "Coach"} allowed={Boolean(permissions?.some(p => p.coach_user_id === m.user_id))} />)}{!members?.some(m => m.role === "coach") && <p>No active Coaches yet.</p>}</section>}
  </DashboardShell>;
}
