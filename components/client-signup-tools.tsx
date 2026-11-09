"use client";
import { useState } from "react";
import { CopyLinkButton } from "./copy-link-button";
import { QrCode } from "./qr-code";
import styles from "./dashboard.module.css";
export function ClientSignupTools({ url }: { url: string }) {
  const [message, setMessage] = useState("");
  async function share() {
    try {
      if (navigator.share) await navigator.share({ title: "Join Ravoge as a Client", url });
      else { await navigator.clipboard.writeText(url); setMessage("Signup link copied."); }
    } catch { setMessage("Sharing was cancelled or unavailable. Use Copy signup link."); }
  }
  return <div className={styles.form} data-client-signup-tools>
    <p className={styles.formHint}>Scan to start Client signup. Use your invited email for gym access.</p>
    <QrCode label="Ravoge Client signup" url={url} />
    <div className={styles.accessActions}><CopyLinkButton label="Copy signup link" url={url} /><button className={styles.secondaryAction} onClick={share} type="button">Share signup link</button></div>
    <a className={styles.inlineAction} href={url}>Open Client signup →</a>
    {message && <p role="status">{message}</p>}
  </div>;
}
