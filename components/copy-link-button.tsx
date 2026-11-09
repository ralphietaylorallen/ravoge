"use client";

import { useState } from "react";

import styles from "./dashboard.module.css";

export function CopyLinkButton({ label = "Copy link", url }: { label?: string; url: string }) {
  const [failed, setFailed] = useState(false);
  const [copied, setCopied] = useState(false);

  async function copy() {
    try {
      await navigator.clipboard.writeText(url);
      setFailed(false);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1800);
    } catch { setFailed(true); }
  }

  return <><button className={styles.secondaryAction} onClick={copy} type="button">{copied ? "Copied" : label}</button>{failed && <p role="status">Copy this link: <a href={url}>{url}</a></p>}</>;
}
