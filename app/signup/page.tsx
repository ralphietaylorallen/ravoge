import type { Metadata } from "next";
import Link from "next/link";

import { AuthEntryShell } from "@/components/auth-entry-shell";

import styles from "@/components/auth-entry.module.css";

const accountTypes = [
  {
    number: "01",
    title: "Gym Owner",
    description:
      "For operators managing coaches, clients, and private training.",
    href: "/signup/owner",
  },
  {
    number: "02",
    title: "Coach",
    description: "For trainers programming and managing their clients.",
    href: "/signup/coach",
  },
  {
    number: "03",
    title: "Client",
    description: "For members training with a Ravoge coach.",
    href: "/signup/client",
  },
] as const;

export const metadata: Metadata = {
  title: "Choose Account Type | Ravoge",
  description: "Choose how you will use Ravoge.",
};

export default function SignupPage() {
  return (
    <AuthEntryShell wide>
      <p className={styles.eyebrow}>Create your path</p>
      <h1 className={styles.heading}>Build what’s next</h1>
      <p className={styles.lede}>Choose your account type.</p>

      <nav aria-label="Choose your account type" className={styles.roleGrid}>
        {accountTypes.map((accountType) => (
          <Link
            className={styles.roleOption}
            href={accountType.href}
            key={accountType.href}
          >
            <span className={styles.roleNumber}>{accountType.number}</span>
            <h2>{accountType.title}</h2>
            <p>{accountType.description}</p>
            <span className={styles.roleContinue}>
              Continue <span aria-hidden="true">→</span>
            </span>
          </Link>
        ))}
      </nav>

      <p className={styles.intentNote}>
        Account type selection is setup intent only. Authorization will be
        verified securely when account creation is connected.
      </p>
    </AuthEntryShell>
  );
}
