"use client";

import { useState } from "react";

import styles from "./dashboard.module.css";

export function CopyLinkButton({ label = "Copy link", url }: { label?: string; url: string }) {
  const [copied, setCopied] = useState(false);

  async function copy() {
    await navigator.clipboard.writeText(url);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1800);
  }

  return <button className={styles.secondaryAction} onClick={copy} type="button">{copied ? "Copied" : label}</button>;
}
