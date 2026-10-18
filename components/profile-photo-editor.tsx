"use client";

import Image from "next/image";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import styles from "./dashboard.module.css";

const ACCEPT = "image/jpeg,image/png,image/webp,image/heic,image/heif,.heic,.heif";
const MAX_SOURCE = 20 * 1024 * 1024;

export function ProfilePhotoForm({ role, name = "Ravoge", imageUrl, targetUserId, organizationId, compact = false }: {
  role: "owner" | "coach" | "client"; name?: string; imageUrl?: string | null;
  targetUserId?: string; organizationId?: string; compact?: boolean;
}) {
  const router = useRouter();
  const chooseRef = useRef<HTMLInputElement>(null);
  const cameraRef = useRef<HTMLInputElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const dialogRef = useRef<HTMLDialogElement>(null);
  const lock = useRef(false);
  const [source, setSource] = useState<HTMLImageElement | null>(null);
  const [currentUrl, setCurrentUrl] = useState(imageUrl ?? null);
  const [previousUrl, setPreviousUrl] = useState(imageUrl);
  const [horizontal, setHorizontal] = useState(50);
  const [vertical, setVertical] = useState(50);
  const [zoom, setZoom] = useState(1);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState<number | null>(null);

  if (previousUrl !== imageUrl) { setPreviousUrl(imageUrl); setCurrentUrl(imageUrl ?? null); }
  useEffect(() => {
    if (!source) return;
    const canvas = canvasRef.current;
    const context = canvas?.getContext("2d");
    if (!context || !canvas) return;
    const side = Math.min(source.naturalWidth, source.naturalHeight) / zoom;
    context.clearRect(0, 0, 1024, 1024);
    context.drawImage(source, (source.naturalWidth - side) * horizontal / 100, (source.naturalHeight - side) * vertical / 100, side, side, 0, 0, 1024, 1024);
    if (!dialogRef.current?.open) dialogRef.current?.showModal();
  }, [source, horizontal, vertical, zoom]);

  async function selectFile(file?: File) {
    if (!file || lock.current) return;
    if (file.size > MAX_SOURCE || !file.size) { setMessage("Choose a photo no larger than 20 MB. Your previous photo is unchanged."); return; }
    const heic = /image\/(heic|heif)/i.test(file.type) || /\.(heic|heif)$/i.test(file.name);
    if (!heic && !["image/jpeg", "image/png", "image/webp"].includes(file.type)) { setMessage("Choose JPEG, PNG, WebP, HEIC or HEIF. Other file types are not supported."); return; }
    lock.current = true; setBusy(true); setMessage(heic ? "Preparing iPhone photo on this device…" : "Preparing photo…");
    async function decode(blob: Blob) {
      const url = URL.createObjectURL(blob);
      try { const image = new window.Image(); image.src = url; await image.decode(); return image; }
      finally { URL.revokeObjectURL(url); }
    }
    try {
      let image;
      try { image = await decode(file); }
      catch {
        if (!heic) throw new Error("decode");
        const { heicTo } = await import("heic-to/csp");
        image = await decode(await heicTo({ blob: file, type: "image/jpeg", quality: 0.92 }));
      }
      if (image.naturalWidth * image.naturalHeight > 50_000_000) throw new Error("dimensions");
      setHorizontal(50); setVertical(50); setZoom(1); setSource(image); setMessage("");
    } catch {
      setMessage("This photo could not be opened on this device. Try a smaller photo or export it as JPEG. Your previous photo is unchanged.");
    } finally { lock.current = false; setBusy(false); }
  }

  function cancel() { if (busy) return; dialogRef.current?.close(); setSource(null); setProgress(null); }

  async function submit(remove = false) {
    if (lock.current || (!remove && !source)) return;
    lock.current = true; setBusy(true); setProgress(0); setMessage("");
    try {
      const data = new FormData();
      if (targetUserId) data.set("targetUserId", targetUserId);
      if (organizationId) data.set("organizationId", organizationId);
      if (!remove) {
        const blob = await new Promise<Blob | null>(resolve => canvasRef.current?.toBlob(resolve, "image/webp", 0.85));
        if (!blob || !["image/webp", "image/jpeg", "image/png"].includes(blob.type)) throw new Error("This browser could not prepare the photo. Try another photo.");
        data.set("photo", new File([blob], "profile-image", { type: blob.type }));
      }
      const result = await new Promise<{ imageUrl: string | null; message: string }>((resolve, reject) => {
        const xhr = new XMLHttpRequest();
        xhr.open(remove ? "DELETE" : "POST", "/api/profile-photo");
        xhr.timeout = 60_000;
        xhr.upload.onprogress = event => { if (event.lengthComputable) setProgress(Math.min(95, Math.round(event.loaded / event.total * 95))); };
        xhr.onerror = xhr.ontimeout = () => reject(new Error("The connection was interrupted. Refresh this profile to check whether the photo saved, then retry."));
        xhr.onload = () => {
          let body;
          try { body = JSON.parse(xhr.responseText); } catch { reject(new Error("The upload could not finish. Refresh this profile and retry.")); return; }
          if (xhr.status >= 200 && xhr.status < 300) resolve(body);
          else reject(new Error(body.message || "The upload failed. Your previous photo is unchanged. Retry."));
        };
        xhr.send(data);
      });
      setProgress(100); setCurrentUrl(result.imageUrl); setMessage(result.message);
      dialogRef.current?.close(); setSource(null); router.refresh();
    } catch (error) { setMessage(error instanceof Error ? error.message : "The photo could not be saved. Retry."); }
    finally { lock.current = false; setBusy(false); }
  }

  return <div className={`${styles.photoEditor} ${compact ? styles.photoEditorCompact : ""}`} data-profile-photo-editor={targetUserId ?? role}>
    <button aria-label={targetUserId ? `Change ${name} profile photo` : "Change profile photo"} aria-busy={busy} className={styles.photoPicker} disabled={busy} onClick={() => chooseRef.current?.click()} type="button">
      {currentUrl ? <Image alt={`${name} profile photo`} height={112} src={currentUrl} unoptimized width={112} /> : <span aria-hidden="true">{name.trim().charAt(0).toUpperCase() || "R"}</span>}
      <small>{busy ? "Preparing…" : currentUrl ? "Change photo" : "Add photo"}</small>
    </button>
    <input accept={ACCEPT} aria-label="Choose a profile photo" hidden onChange={event => { void selectFile(event.target.files?.[0]); event.target.value = ""; }} ref={chooseRef} type="file" />
    <input accept={ACCEPT} aria-label="Take a profile photo" capture="user" hidden onChange={event => { void selectFile(event.target.files?.[0]); event.target.value = ""; }} ref={cameraRef} type="file" />
    {!compact && <div className={styles.photoChoices}><button className={styles.secondaryAction} disabled={busy} onClick={() => cameraRef.current?.click()} type="button">Take photo</button><button className={styles.secondaryAction} disabled={busy} onClick={() => chooseRef.current?.click()} type="button">Choose photo</button></div>}
    {currentUrl && <button className={styles.textAction} disabled={busy} onClick={() => { if (window.confirm(`Remove ${name}’s profile photo?`)) void submit(true); }} type="button">Remove photo</button>}
    <dialog aria-label={`Edit ${name} photo`} className={styles.photoDialog} onCancel={event => { if (busy) event.preventDefault(); else setSource(null); }} ref={dialogRef}>
      {source && <div className={styles.photoCrop}>
        <h3>{currentUrl ? "Replace photo" : "Add photo"}</h3><p>Crop and reposition. Only the optimized photo is uploaded.</p>
        <canvas aria-label="Cropped profile photo preview" height={1024} ref={canvasRef} role="img" width={1024} />
        <label className={styles.field}>Move left / right<input disabled={busy} max={100} min={0} onChange={event => setHorizontal(Number(event.target.value))} type="range" value={horizontal} /></label>
        <label className={styles.field}>Move up / down<input disabled={busy} max={100} min={0} onChange={event => setVertical(Number(event.target.value))} type="range" value={vertical} /></label>
        <label className={styles.field}>Zoom<input disabled={busy} max={2} min={1} onChange={event => setZoom(Number(event.target.value))} step={0.05} type="range" value={zoom} /></label>
        <div className={styles.photoChoices}><button className={styles.secondaryAction} disabled={busy} onClick={cancel} type="button">Cancel</button><button className={styles.action} disabled={busy} onClick={() => void submit()} type="button">{busy ? "Saving…" : currentUrl ? "Replace photo" : "Save photo"}</button></div>
        {busy && <div><progress aria-label="Photo upload progress" max={100} value={progress ?? 0} /><p role="status">{progress === 95 ? "Upload received. Validating and saving…" : `Uploading photo… ${progress ?? 0}%`}</p></div>}
        {message && <p className={styles.notice} role="status">{message}</p>}
      </div>}
    </dialog>
    {message && !source && <p className={styles.notice} role="status">{message}</p>}
  </div>;
}
