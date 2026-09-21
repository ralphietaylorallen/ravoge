/* eslint-disable @next/next/no-img-element -- private signed Storage URLs are already access-controlled and short-lived. */

import styles from "./dashboard.module.css";

export function ProfilePhoto({ name, size = "large", url }: { name: string; size?: "small" | "large"; url?: string | null }) {
  const initials = name.split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0]?.toUpperCase()).join("") || "R";
  return (
    <span aria-label={url ? `${name} profile photo` : `${name} initials`} className={`${styles.profilePhoto} ${size === "small" ? styles.profilePhotoSmall : ""}`}>
      {url ? <img alt="" src={url} /> : <span aria-hidden="true">{initials}</span>}
    </span>
  );
}
