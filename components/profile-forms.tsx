"use client";

import { useActionState } from "react";

import {
  addCertificationAction,
  saveClientProfileAction,
  saveCoachProfileAction,
  uploadClientPhotoAction,
  uploadCoachPhotoAction,
  type ProfileActionState,
} from "@/app/profile/actions";

import styles from "./dashboard.module.css";

const initial: ProfileActionState = { status: "idle" };

function Result({ state }: { state: ProfileActionState }) {
  return state.message ? <p className={`${styles.notice} ${state.status === "error" ? styles.error : ""}`} role="status">{state.message}</p> : null;
}

export function ProfilePhotoForm({ role }: { role: "coach" | "client" }) {
  const [state, action, pending] = useActionState(role === "coach" ? uploadCoachPhotoAction : uploadClientPhotoAction, initial);
  return <form action={action} className={styles.form}>
    <div className={styles.field}><label htmlFor="profile-photo">Profile photo <span>JPG, PNG, or WebP · 5 MB max</span></label><input accept="image/jpeg,image/png,image/webp" id="profile-photo" name="photo" required type="file" /></div>
    <button className={styles.secondaryAction} disabled={pending} type="submit">{pending ? "Uploading…" : "Replace photo"}</button><Result state={state} />
  </form>;
}

type ProfileDefaults = { bio?: string | null; full_name: string; preferred_name?: string | null; specialties?: string[]; years_coaching?: number | null };

export function ProfileDetailsForm({ defaults, role }: { defaults: ProfileDefaults; role: "coach" | "client" }) {
  const [state, action, pending] = useActionState(role === "coach" ? saveCoachProfileAction : saveClientProfileAction, initial);
  return <form action={action} className={styles.form}>
    {role === "coach" && <div className={styles.field}><label htmlFor="full-name">Full name</label><input defaultValue={defaults.full_name} id="full-name" maxLength={120} name="fullName" required /></div>}
    <div className={styles.field}><label htmlFor="preferred-name">Preferred name <span>Optional</span></label><input defaultValue={defaults.preferred_name ?? ""} id="preferred-name" maxLength={80} name="preferredName" /></div>
    <div className={styles.field}><label htmlFor="bio">{role === "coach" ? "Short bio" : "About me"} <span>Optional</span></label><textarea defaultValue={defaults.bio ?? ""} id="bio" maxLength={1200} name="bio" rows={5} /></div>
    {role === "coach" && <>
      <div className={styles.field}><label htmlFor="specialties">Specialties / focus areas <span>Comma separated</span></label><input defaultValue={defaults.specialties?.join(", ") ?? ""} id="specialties" maxLength={1700} name="specialties" /></div>
      <div className={styles.field}><label htmlFor="years-coaching">Years coaching <span>Optional</span></label><input defaultValue={defaults.years_coaching ?? ""} id="years-coaching" max={80} min={0} name="yearsCoaching" type="number" /></div>
    </>}
    <button className={styles.action} disabled={pending} type="submit">{pending ? "Saving…" : "Save profile"}</button><Result state={state} />
  </form>;
}

export function CertificationForm() {
  const [state, action, pending] = useActionState(addCertificationAction, initial);
  return <form action={action} className={styles.form}>
    <div className={styles.formColumns}><div className={styles.field}><label htmlFor="cert-name">Certification name</label><input id="cert-name" maxLength={160} name="certificationName" required /></div><div className={styles.field}><label htmlFor="issuer">Issuing organization</label><input id="issuer" maxLength={160} name="issuingOrganization" required /></div></div>
    <div className={styles.threeColumns}><div className={styles.field}><label htmlFor="credential">Credential number <span>Optional</span></label><input id="credential" maxLength={120} name="credentialNumber" /></div><div className={styles.field}><label htmlFor="issue-date">Issue date <span>Optional</span></label><input id="issue-date" name="issueDate" type="date" /></div><div className={styles.field}><label htmlFor="expiry-date">Expiration date <span>Optional</span></label><input id="expiry-date" name="expirationDate" type="date" /></div></div>
    <div className={styles.field}><label htmlFor="cert-notes">Notes <span>Optional</span></label><textarea id="cert-notes" maxLength={1000} name="notes" rows={3} /></div>
    <button className={styles.action} disabled={pending} type="submit">{pending ? "Saving…" : "Add certification"}</button><Result state={state} />
  </form>;
}
