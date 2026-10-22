import Link from "next/link";
import { requireRole } from "@/lib/auth";
import { DashboardShell, dashboardStyles as styles } from "@/components/dashboard-shell";
import { LoadRuleEditor, type LoadRule } from "@/components/load-rule-editor";

export default async function LoadRulesPage() {
  const { membership, supabase, userId } = await requireRole("owner");
  const [{ data: organization }, { data: profile }, { data: library }, { data: rules }] = await Promise.all([
    supabase.from("organizations").select("name").eq("id", membership.organization_id).single(),
    supabase.from("profiles").select("full_name").eq("id", userId).single(),
    supabase.from("exercise_library").select("id,name").eq("is_active", true).order("name"),
    supabase.from("exercise_load_rules").select("*").eq("active", true).order("version", { ascending: false }),
  ]);
  const current = new Map<string, LoadRule>();
  for (const rule of rules ?? []) {
    const previous = current.get(rule.exercise_id);
    if (!previous || !previous.organization_id && rule.organization_id) current.set(rule.exercise_id, rule as LoadRule);
  }
  return <DashboardShell gymName={organization?.name ?? "Ravoge gym"} name={profile?.full_name ?? "Owner"} role="owner">
    <Link href="/owner/training-library">← Training library</Link><div className={styles.pageHeading}><h2>Starting-load rules</h2></div>
    <p>Rounds down to confirmed equipment, never up. Each-hand dumbbell work requires a separately recorded matching pair at each usable size (quantity 2 or more). Unknown inventory is not proof of an available load.</p>
    {(library ?? []).map(e => current.has(e.id) && <LoadRuleEditor key={current.get(e.id)!.id} rule={current.get(e.id)!} name={e.name} library={library ?? []}/>)}
  </DashboardShell>;
}
