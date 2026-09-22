"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";

import {
  EQUIPMENT_TYPES,
  type EquipmentScanCandidate,
  type EquipmentScanDecision,
  type EquipmentType,
} from "@/lib/equipment-scan/shared";

import styles from "./dashboard.module.css";

const MAX_IMAGE_BYTES = 1_000_000;
const MAX_EDGE = 1600;

type SelectedPhoto = { file: File; id: string; previewUrl: string };
type ReviewCandidate = EquipmentScanCandidate & EquipmentScanDecision;

const labels: Record<EquipmentType, string> = {
  bands: "Bands",
  barbell: "Barbell",
  bench: "Bench",
  cable_machine: "Cable machine",
  cardio_equipment: "Cardio equipment",
  dumbbells: "Dumbbells",
  kettlebells: "Kettlebells",
  medicine_balls: "Medicine balls",
  other: "Other",
  plates: "Plates",
  selectorized_machine: "Selectorized machine",
  sled: "Sled",
  specialty_equipment: "Specialty equipment",
  squat_rack: "Squat rack",
};

async function loadImage(file: File) {
  const url = URL.createObjectURL(file);
  try {
    const image = new Image();
    image.decoding = "async";
    image.src = url;
    await image.decode();
    return image;
  } finally {
    URL.revokeObjectURL(url);
  }
}

async function preprocessPhoto(file: File) {
  if (!new Set(["image/jpeg", "image/png", "image/webp"]).has(file.type)) {
    throw new Error("Use JPEG, PNG, or WebP photos.");
  }
  const image = await loadImage(file);
  const scale = Math.min(1, MAX_EDGE / Math.max(image.naturalWidth, image.naturalHeight));
  const width = Math.max(1, Math.round(image.naturalWidth * scale));
  const height = Math.max(1, Math.round(image.naturalHeight * scale));
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d", { alpha: false });
  if (!context) throw new Error("This browser could not prepare the photo.");
  context.fillStyle = "#050606";
  context.fillRect(0, 0, width, height);
  context.drawImage(image, 0, 0, width, height);

  let quality = 0.84;
  let blob: Blob | null = null;
  do {
    blob = await new Promise((resolve) => canvas.toBlob(resolve, "image/jpeg", quality));
    quality -= 0.1;
  } while (blob && blob.size > MAX_IMAGE_BYTES && quality >= 0.44);
  if (!blob || blob.size > MAX_IMAGE_BYTES) throw new Error("One photo could not be compressed below 1 MB.");
  return new File([blob], `${file.name.replace(/\.[^.]+$/, "") || "equipment"}.jpg`, {
    lastModified: Date.now(),
    type: "image/jpeg",
  });
}

function defaultAction(candidate: EquipmentScanCandidate): ReviewCandidate["action"] {
  return candidate.duplicateMatches.length || candidate.confidence < 0.78 || candidate.quantity === null
    ? "skip"
    : "add";
}

export function EquipmentPhotoScan() {
  const router = useRouter();
  const cameraInput = useRef<HTMLInputElement>(null);
  const libraryInput = useRef<HTMLInputElement>(null);
  const photoCleanup = useRef<SelectedPhoto[]>([]);
  const analysisController = useRef<AbortController | null>(null);
  const [open, setOpen] = useState(false);
  const [photos, setPhotos] = useState<SelectedPhoto[]>([]);
  const [candidates, setCandidates] = useState<ReviewCandidate[]>([]);
  const [scanRequestId, setScanRequestId] = useState<string | null>(null);
  const [status, setStatus] = useState<"idle" | "processing" | "review" | "saving" | "saved">("idle");
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    photoCleanup.current = photos;
  }, [photos]);
  useEffect(() => () => {
    analysisController.current?.abort();
    photoCleanup.current.forEach((photo) => URL.revokeObjectURL(photo.previewUrl));
  }, []);

  async function addPhotos(files: FileList | null) {
    if (!files?.length) return;
    setMessage(null);
    const remaining = 5 - photos.length;
    if (remaining < 1 || files.length > remaining) {
      setMessage("Choose no more than 5 photos total.");
      return;
    }
    try {
      const processed = await Promise.all(Array.from(files).map(preprocessPhoto));
      const additions = processed.map((file) => ({
        file,
        id: crypto.randomUUID(),
        previewUrl: URL.createObjectURL(file),
      }));
      const total = [...photos, ...additions].reduce((sum, photo) => sum + photo.file.size, 0);
      if (total > 5_000_000) {
        additions.forEach((photo) => URL.revokeObjectURL(photo.previewUrl));
        throw new Error("The processed photos must total 5 MB or less.");
      }
      setPhotos((current) => [...current, ...additions]);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "A photo could not be prepared.");
    } finally {
      if (cameraInput.current) cameraInput.current.value = "";
      if (libraryInput.current) libraryInput.current.value = "";
    }
  }

  function removePhoto(id: string) {
    setPhotos((current) => {
      const removed = current.find((photo) => photo.id === id);
      if (removed) URL.revokeObjectURL(removed.previewUrl);
      return current.filter((photo) => photo.id !== id);
    });
  }

  async function analyze() {
    if (photos.length < 1) return setMessage("Take or upload at least one equipment photo.");
    setStatus("processing");
    setMessage(null);
    const controller = new AbortController();
    analysisController.current = controller;
    const body = new FormData();
    photos.forEach((photo) => body.append("photos", photo.file));
    try {
      const response = await fetch("/api/equipment/scan", { body, method: "POST", signal: controller.signal });
      const payload = await response.json() as { candidates?: EquipmentScanCandidate[]; error?: string; scanRequestId?: string };
      if (!response.ok || !payload.candidates || !payload.scanRequestId) {
        throw new Error(payload.error ?? "Photo analysis could not be completed.");
      }
      setCandidates(payload.candidates.map((candidate) => ({
        ...candidate,
        action: defaultAction(candidate),
        equipmentType: candidate.equipmentType,
        name: candidate.name,
        notes: candidate.reviewNote,
        quantity: candidate.quantity,
        ...(candidate.duplicateMatches[0] ? { targetEquipmentId: candidate.duplicateMatches[0].id } : {}),
      })));
      setScanRequestId(payload.scanRequestId);
      setStatus("review");
      setMessage(payload.candidates.length
        ? "Review every result. Uncertain or possible duplicate items default to Skip."
        : "No equipment was identified. Try clearer photos or use manual entry.");
    } catch (error) {
      setStatus("idle");
      setMessage(error instanceof DOMException && error.name === "AbortError"
        ? "Photo analysis canceled. Your selected photos remain ready to retry."
        : error instanceof Error ? error.message : "Photo analysis is unavailable. Manual entry still works.");
    } finally {
      analysisController.current = null;
    }
  }

  function updateCandidate(id: string, update: Partial<ReviewCandidate>) {
    setCandidates((current) => current.map((candidate) => candidate.id === id ? { ...candidate, ...update } : candidate));
  }

  function addManualResult() {
    setCandidates((current) => [...current, {
      action: "add",
      confidence: 1,
      duplicateMatches: [],
      equipmentType: "other",
      evidence: "Added by Owner during scan review.",
      id: crypto.randomUUID(),
      name: "",
      notes: null,
      quantity: null,
      quantityIsEstimate: false,
      reviewNote: null,
    }]);
  }

  async function save() {
    if (!scanRequestId) return;
    setStatus("saving");
    setMessage(null);
    try {
      const decisions = candidates.map(({ action, equipmentType, name, notes, quantity, targetEquipmentId }) => ({
        action, equipmentType, name, notes, quantity, ...(targetEquipmentId ? { targetEquipmentId } : {}),
      }));
      const response = await fetch("/api/equipment/scan/save", {
        body: JSON.stringify({ decisions, scanRequestId }),
        headers: { "Content-Type": "application/json" },
        method: "POST",
      });
      const payload = await response.json() as { error?: string; result?: { addedCount?: number; skippedCount?: number; updatedCount?: number } };
      if (!response.ok) throw new Error(payload.error ?? "The equipment could not be saved.");
      const result = payload.result ?? {};
      setStatus("saved");
      setMessage(`${result.addedCount ?? 0} added, ${result.updatedCount ?? 0} updated, and ${result.skippedCount ?? 0} skipped. The inventory is ready.`);
      router.refresh();
    } catch (error) {
      setStatus("review");
      setMessage(error instanceof Error ? error.message : "Nothing was saved. Review the results and try again.");
    }
  }

  return (
    <section className={`${styles.panel} ${styles.scanPanel}`}>
      <div className={styles.scanHeading}>
        <div>
          <p className={styles.eyebrow}>AI-assisted inventory</p>
          <h2>Scan equipment with photos</h2>
          <p>Photograph the training floor, review every suggestion, then save the approved list in one step.</p>
        </div>
        <button className={styles.action} onClick={() => setOpen((value) => !value)} type="button">
          {open ? "Close scanner" : "Scan equipment with photos"}
        </button>
      </div>

      {open && (
        <div className={styles.scanWorkspace}>
          {status !== "review" && status !== "saving" && status !== "saved" ? (
            <>
              <ol className={styles.scanInstructions}>
                <li>For best results, use 3–5 bright, overlapping wide photos with equipment fully visible.</li>
                <li>Photograph overlapping areas so the same item can be recognized across views.</li>
                <li>Avoid people, screens, paperwork, and private information.</li>
              </ol>
              <div className={styles.scanActions}>
                <button className={styles.secondaryAction} disabled={status === "processing" || photos.length >= 5} onClick={() => cameraInput.current?.click()} type="button">Take photo</button>
                <button className={styles.secondaryAction} disabled={status === "processing" || photos.length >= 5} onClick={() => libraryInput.current?.click()} type="button">Choose photos</button>
                <input ref={cameraInput} accept="image/jpeg,image/png,image/webp" capture="environment" className={styles.visuallyHidden} onChange={(event) => void addPhotos(event.target.files)} type="file" />
                <input ref={libraryInput} accept="image/jpeg,image/png,image/webp" className={styles.visuallyHidden} multiple onChange={(event) => void addPhotos(event.target.files)} type="file" />
              </div>
              {photos.length > 0 && (
                <ul className={styles.photoGrid} aria-label="Selected equipment photos">
                  {photos.map((photo, index) => (
                    <li key={photo.id}>
                      {/* eslint-disable-next-line @next/next/no-img-element -- temporary in-memory object URL */}
                      <img alt={`Equipment photo ${index + 1}`} src={photo.previewUrl} />
                      <button aria-label={`Remove equipment photo ${index + 1}`} onClick={() => removePhoto(photo.id)} type="button">Remove</button>
                    </li>
                  ))}
                </ul>
              )}
              <p className={styles.scanPrivacy}>1–5 photos. Photos are resized, stripped of metadata, analyzed for this request, and are not saved by Ravoge.</p>
              <button className={styles.action} disabled={status === "processing" || photos.length < 1} onClick={() => void analyze()} type="button">
                {status === "processing" ? "Analyzing equipment…" : `Analyze ${photos.length || ""} photo${photos.length === 1 ? "" : "s"}`}
              </button>
              {status === "processing" && <button className={styles.secondaryAction} onClick={() => analysisController.current?.abort()} type="button">Cancel analysis</button>}
              {status === "processing" && <div className={styles.processingBar} aria-label="OpenAI is analyzing equipment photos" role="status"><span />OpenAI is building a review list. This can take up to a minute.</div>}
            </>
          ) : (
            <div className={styles.scanReview}>
              <div className={styles.exerciseHeader}>
                <h3>Review equipment</h3>
                <button className={styles.textAction} disabled={status !== "review"} onClick={addManualResult} type="button">+ Add result</button>
              </div>
              <div className={styles.scanResultList}>
                {candidates.map((candidate, index) => {
                  const uncertain = candidate.quantityIsEstimate || candidate.quantity === null || candidate.confidence < 0.78;
                  return (
                    <fieldset className={styles.scanResult} key={candidate.id} disabled={status !== "review"}>
                      <legend>Result {index + 1}</legend>
                      <div className={styles.scanResultHeader}>
                        <div>
                          <strong>{candidate.name || "New equipment"}</strong>
                          <span>{Math.round(candidate.confidence * 100)}% confidence</span>
                        </div>
                        <button className={styles.removeAction} onClick={() => setCandidates((current) => current.filter((item) => item.id !== candidate.id))} type="button">Remove</button>
                      </div>
                      {(uncertain || candidate.duplicateMatches.length > 0) && (
                        <div className={styles.reviewWarning}>
                          {uncertain && <span>Quantity or identification needs Owner review.</span>}
                          {candidate.duplicateMatches.length > 0 && <span>Possible duplicate: {candidate.duplicateMatches.map((match) => match.name).join(", ")}.</span>}
                        </div>
                      )}
                      <p className={styles.scanEvidence}>{candidate.evidence}</p>
                      <div className={styles.scanFields}>
                        <div className={styles.field}><label htmlFor={`scan-action-${candidate.id}`}>Decision</label><select id={`scan-action-${candidate.id}`} value={candidate.action} onChange={(event) => updateCandidate(candidate.id, { action: event.target.value as ReviewCandidate["action"] })}><option value="skip">Skip</option><option value="add">Add new</option><option value="update">Update existing</option></select></div>
                        <div className={styles.field}><label htmlFor={`scan-type-${candidate.id}`}>Type</label><select id={`scan-type-${candidate.id}`} value={candidate.equipmentType} onChange={(event) => updateCandidate(candidate.id, { equipmentType: event.target.value as EquipmentType })}>{EQUIPMENT_TYPES.map((type) => <option key={type} value={type}>{labels[type]}</option>)}</select></div>
                        <div className={styles.field}><label htmlFor={`scan-quantity-${candidate.id}`}>Quantity <span>{candidate.quantityIsEstimate ? "estimate" : ""}</span></label><input id={`scan-quantity-${candidate.id}`} min={1} max={10000} type="number" value={candidate.quantity ?? ""} onChange={(event) => updateCandidate(candidate.id, { quantity: event.target.value ? Number(event.target.value) : null })} /></div>
                        <div className={`${styles.field} ${styles.scanName}`}><label htmlFor={`scan-name-${candidate.id}`}>Name</label><input id={`scan-name-${candidate.id}`} maxLength={120} value={candidate.name} onChange={(event) => updateCandidate(candidate.id, { name: event.target.value })} /></div>
                        {candidate.action === "update" && (
                          <div className={`${styles.field} ${styles.scanTarget}`}><label htmlFor={`scan-target-${candidate.id}`}>Existing item to update</label><select id={`scan-target-${candidate.id}`} value={candidate.targetEquipmentId ?? ""} onChange={(event) => updateCandidate(candidate.id, { targetEquipmentId: event.target.value })}><option value="">Choose existing equipment</option>{candidate.duplicateMatches.map((match) => <option key={match.id} value={match.id}>{match.name}{match.quantity ? ` (${match.quantity})` : ""}</option>)}</select></div>
                        )}
                        <div className={`${styles.field} ${styles.scanNotes}`}><label htmlFor={`scan-notes-${candidate.id}`}>Review notes</label><textarea id={`scan-notes-${candidate.id}`} maxLength={1000} rows={2} value={candidate.notes ?? ""} onChange={(event) => updateCandidate(candidate.id, { notes: event.target.value || null })} /></div>
                      </div>
                    </fieldset>
                  );
                })}
              </div>
              <button className={styles.action} disabled={status !== "review" || candidates.length < 1} onClick={() => void save()} type="button">{status === "saving" ? "Saving atomically…" : "Save approved equipment"}</button>
              {status === "saved" && <button className={styles.secondaryAction} onClick={() => { photos.forEach((photo) => URL.revokeObjectURL(photo.previewUrl)); setCandidates([]); setPhotos([]); setScanRequestId(null); setStatus("idle"); setMessage(null); }} type="button">Start another scan</button>}
            </div>
          )}
          {message && <p className={`${styles.notice} ${status === "idle" ? styles.error : ""}`} role="status">{message}</p>}
        </div>
      )}
    </section>
  );
}
