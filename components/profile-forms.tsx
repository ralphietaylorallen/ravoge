"use client";

import { useActionState, useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";

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

export function ProfilePhotoForm({ role, name = "Ravoge", imageUrl }: { role: "coach" | "client"; name?: string; imageUrl?: string | null }) {
  const router = useRouter();
  const chooseRef = useRef<HTMLInputElement>(null);
  const cameraRef = useRef<HTMLInputElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const imageRef = useRef<HTMLImageElement | null>(null);
  const [sourceUrl, setSourceUrl] = useState<string | null>(null);
  const [currentUrl, setCurrentUrl] = useState(imageUrl ?? null);
  const [horizontal, setHorizontal] = useState(50);
  const [vertical, setVertical] = useState(50);
  const [zoom, setZoom] = useState(1);
  const [message, setMessage] = useState("");
  const [pending, startTransition] = useTransition();

  useEffect(() => {
    if (!sourceUrl) return;
    const image = new window.Image();
    image.onload = () => { imageRef.current = image; paint(); };
    image.src = sourceUrl;
    return () => { imageRef.current = null; URL.revokeObjectURL(sourceUrl); };
    // paint is deliberately called again by the position/zoom effect below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sourceUrl]);

  function paint() {
    const image = imageRef.current;
    const canvas = canvasRef.current;
    const context = canvas?.getContext("2d");
    if (!image || !canvas || !context) return;
    const side = Math.min(image.naturalWidth, image.naturalHeight) / zoom;
    const left = (image.naturalWidth - side) * horizontal / 100;
    const top = (image.naturalHeight - side) * vertical / 100;
    context.clearRect(0, 0, 512, 512);
    context.drawImage(image, left, top, side, side, 0, 0, 512, 512);
  }

  useEffect(() => { paint(); });

  function selectFile(file?: File) {
    if (!file) return;
    if (!["image/jpeg", "image/png", "image/webp"].includes(file.type) || file.size > 20 * 1024 * 1024) {
      setMessage("Choose a JPG, PNG, or WebP image no larger than 20 MB before cropping.");
      return;
    }
    setMessage("");
    setHorizontal(50); setVertical(50); setZoom(1);
    setSourceUrl(URL.createObjectURL(file));
  }

  function save() {
    const canvas = canvasRef.current;
    if (!canvas) return;
    startTransition(async () => {
      const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/webp", 0.88));
      if (!blob || blob.type !== "image/webp") { setMessage("This browser could not prepare the cropped WebP image."); return; }
      const data = new FormData();
      data.set("photo", new File([blob], "profile.webp", { type: "image/webp" }));
      const action = role === "coach" ? uploadCoachPhotoAction : uploadClientPhotoAction;
      const result = await action({ status: "idle" }, data);
      setMessage(result.message ?? "");
      if (result.status === "success") {
        setCurrentUrl(canvas.toDataURL("image/webp", 0.88));
        setSourceUrl(null);
        router.refresh();
      }
    });
  }

  return <div className={styles.form}>
    <button aria-label="Change profile photo" className={styles.photoPicker} onClick={() => chooseRef.current?.click()} type="button">
      {currentUrl ? <Image alt="" height={112} src={currentUrl} unoptimized width={112} /> : <span>{name.trim().charAt(0).toUpperCase() || "R"}</span>}
      <small>Tap photo to change</small>
    </button>
    <input accept="image/jpeg,image/png,image/webp" aria-label="Choose a profile photo" hidden onChange={(event) => selectFile(event.target.files?.[0])} ref={chooseRef} type="file" />
    <input accept="image/jpeg,image/png,image/webp" aria-label="Take a profile photo" capture="user" hidden onChange={(event) => selectFile(event.target.files?.[0])} ref={cameraRef} type="file" />
    <div className={styles.photoChoices}><button className={styles.secondaryAction} onClick={() => cameraRef.current?.click()} type="button">Take photo</button><button className={styles.secondaryAction} onClick={() => chooseRef.current?.click()} type="button">Choose photo</button></div>
    {sourceUrl && <div className={styles.photoCrop}><p className={styles.eyebrow}>Crop and reposition</p><canvas aria-label="Cropped profile photo preview" height={512} ref={canvasRef} role="img" width={512} /><label className={styles.field}>Move left / right<input max={100} min={0} onChange={(event) => setHorizontal(Number(event.target.value))} type="range" value={horizontal} /></label><label className={styles.field}>Move up / down<input max={100} min={0} onChange={(event) => setVertical(Number(event.target.value))} type="range" value={vertical} /></label><label className={styles.field}>Zoom<input max={2} min={1} onChange={(event) => setZoom(Number(event.target.value))} step={0.05} type="range" value={zoom} /></label><button className={styles.action} disabled={pending} onClick={save} type="button">{pending ? "Saving…" : "Save photo"}</button></div>}
    {message && <p className={styles.notice} role="status">{message}</p>}
  </div>;
}

type ProfileDefaults = { bio?: string | null; full_name: string; preferred_name?: string | null; specialties?: string[]; years_coaching?: number | null };

export function ProfileDetailsForm({ defaults, role }: { defaults: ProfileDefaults; role: "coach" | "client" }) {
  const [state, action, pending] = useActionState(role === "coach" ? saveCoachProfileAction : saveClientProfileAction, initial);
  return <form action={action} className={styles.form}>
    <div className={styles.field}><label htmlFor="full-name">Full name</label><input defaultValue={defaults.full_name} id="full-name" maxLength={120} name="fullName" required /></div>
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
