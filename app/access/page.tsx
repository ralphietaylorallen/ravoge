import { redirect } from "next/navigation";
import { Logo } from "@/components/logo";
import { logoutAction } from "@/app/auth/actions";
import { getActiveMemberships, getVerifiedUser } from "@/lib/auth";
import { createMyClientProfileAction, switchViewAction } from "./actions";
import styles from "./page.module.css";

export default async function AccessPage({ searchParams }: { searchParams: Promise<{ status?: string }> }) {
  const { supabase, userId } = await getVerifiedUser();
  if (!userId) redirect("/login");
  const memberships = await getActiveMemberships(userId, supabase);
  if (!memberships.length) redirect("/signup/identity");
  const { status } = await searchParams;
  const gyms = [...new Set(memberships.map(m => m.organization_id))];
  return <main className={styles.page}><div className={styles.content}>
    <Logo /><h1>Choose your view</h1><p>Use your existing account. Each view uses your gym’s current permissions.</p>
    {status && <p role="alert">{status === "setup-failed" ? "Your Client profile could not be created. Please try again." : "That view is no longer available. Choose an active view below."}</p>}
    {gyms.map(id => {
      const gym = memberships.filter(m => m.organization_id === id);
      const coach = gym.some(m => m.role === "coach");
      const client = gym.some(m => m.role === "client");
      return <section key={id} className={styles.gym}><h2>{gym[0].organization_name}</h2>
        {gym.map(m => <form action={switchViewAction} key={m.role}><button name="view" value={`${id}:${m.role}`} className={styles.choice}>Open {m.role === "owner" ? "Owner" : m.role === "coach" ? "Coach" : "Client"} view <span aria-hidden>→</span></button></form>)}
        {!coach && client && <button disabled className={styles.choice}>Coach <small>Coach approval required</small></button>}
        {coach && !client && <form action={createMyClientProfileAction}><input type="hidden" name="organizationId" value={id}/><button className={styles.choice}>Create my Client profile <span aria-hidden>→</span></button><p className={styles.hint}>Keep your Coach access. Your gym can assign you a different Coach.</p></form>}
      </section>;
    })}
    <form action={logoutAction}><button className={styles.logout}>Log out</button></form>
  </div></main>;
}
