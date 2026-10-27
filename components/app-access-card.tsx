"use client";

import Link from "next/link";

import { CopyLinkButton } from "@/components/copy-link-button";
import { QrCode } from "@/components/qr-code";

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
  const url = `https://ravoge.com${installPath}`;

  return (
    <article className={styles.accessCard} data-app-access-card={role.toLowerCase()}>
      <div>
        <p className={styles.eyebrow}>{role} App</p>
        <h2>{role === "Coach" ? "Install Coach App" : "Install Client App"}</h2>
        <p>{description}</p>
      </div>
      <div className={styles.accessActions}>
        <Link className={styles.action} href={installPath}>Open {role} App</Link>
        <CopyLinkButton label={`Copy ${role} App link`} url={url} />
      </div>
      <QrCode label={`Ravoge ${role} App QR`} url={url} />
    </article>
  );
}
