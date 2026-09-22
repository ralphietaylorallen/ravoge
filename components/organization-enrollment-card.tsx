"use client";

import Link from "next/link";

import {
  disableEnrollmentQrAction,
  rotateEnrollmentQrAction,
} from "@/app/owner/apps/actions";
import { CopyLinkButton } from "@/components/copy-link-button";
import { QrCode } from "@/components/qr-code";
import type { OrganizationEnrollmentCredential } from "@/lib/organization-enrollment";

import styles from "./dashboard.module.css";

export function OrganizationEnrollmentCard({ credential }: {
  credential: OrganizationEnrollmentCredential;
}) {
  const label = credential.role === "coach" ? "Coach" : "Client";
  const active = credential.status === "active";

  return (
    <article className={styles.accessCard} data-enrollment-card={credential.role}>
      <div>
        <div className={styles.accessCardMeta}>
          <p className={styles.eyebrow}>{label} enrollment</p>
          <span className={active ? styles.statusPill : styles.mutedPill}>{credential.status}</span>
        </div>
        <h2>{credential.organizationName} {label} App</h2>
        <p>
          {credential.role === "coach"
            ? "Staff only. Anyone with this QR can create or connect a Coach account for this gym."
            : "Display or share this QR so clients can install Ravoge, create their account, and securely join this gym."}
        </p>
      </div>

      {active ? (
        <>
          <div className={styles.accessActions}>
            <Link className={styles.action} href={credential.url}>Open</Link>
            <CopyLinkButton label="Copy link" url={credential.url} />
          </div>
          <QrCode label={`${credential.organizationName} ${label} enrollment`} url={credential.url} />
        </>
      ) : (
        <div className={styles.disabledEnrollment} role="status">
          New {label.toLowerCase()} enrollment is disabled. Existing members keep their access. Rotate the QR to issue a new active credential.
        </div>
      )}

      <div className={styles.enrollmentControls}>
        <form action={rotateEnrollmentQrAction}>
          <input name="role" type="hidden" value={credential.role} />
          <button className={styles.secondaryAction} type="submit">{active ? "Rotate QR" : "Create new QR"}</button>
        </form>
        {active ? (
          <form action={disableEnrollmentQrAction}>
            <input name="role" type="hidden" value={credential.role} />
            <button className={styles.dangerAction} type="submit">Disable</button>
          </form>
        ) : null}
      </div>
      <p className={styles.formHint}>
        Rotation immediately invalidates the previous QR. Disabling affects new enrollments only and never removes existing members.
      </p>
    </article>
  );
}
