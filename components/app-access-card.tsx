"use client";

import Link from "next/link";
import { useId, useMemo, useState } from "react";

import { CopyLinkButton } from "@/components/copy-link-button";

import styles from "./dashboard.module.css";

export function AppAccessCard({
  description,
  installPath,
  role,
}: {
  description: string;
  installPath: "/coach/install" | "/client/install";
  role: "Coach" | "Client";
}) {
  const emailId = useId();
  const [email, setEmail] = useState("");
  const url = `https://ravoge.com${installPath}`;
  const emailHref = useMemo(() => {
    const subject = `Your Ravoge ${role} access`;
    const body = `Open Ravoge ${role} on your device:\n\n${url}\n\nThis access link does not grant a role. If you are joining a gym, use the secure invitation sent by your gym.`;
    return `mailto:${encodeURIComponent(email.trim())}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
  }, [email, role, url]);

  return (
    <article className={styles.accessCard}>
      <div>
        <p className={styles.eyebrow}>{role} App</p>
        <h2>{role === "Coach" ? "Send Ravoge to Coach" : "Send Ravoge to Client"}</h2>
        <p>{description}</p>
      </div>
      <div className={styles.accessActions}>
        <Link className={styles.action} href={installPath}>Open {role} App</Link>
        <CopyLinkButton label={`Copy ${role} App link`} url={url} />
      </div>
      <div className={styles.field}>
        <label htmlFor={emailId}>Recipient email</label>
        <input autoComplete="email" id={emailId} onChange={(event) => setEmail(event.target.value)} placeholder={`${role.toLowerCase()}@example.com`} type="email" value={email} />
      </div>
      <a aria-disabled={!email.trim()} className={`${styles.secondaryAction} ${!email.trim() ? styles.disabledAction : ""}`} href={email.trim() ? emailHref : undefined}>Email {role} App link</a>
      <p className={styles.formHint}>This opens your mail app with the intended role-specific link. It never sends a password or grants organization access.</p>
    </article>
  );
}
