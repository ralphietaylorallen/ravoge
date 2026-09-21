"use client";

import { useRef } from "react";
import { QRCodeCanvas } from "qrcode.react";

import styles from "./dashboard.module.css";

export function QrCode({ label, url }: { label: string; url: string }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  function downloadQrCode() {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const link = document.createElement("a");
    link.download = `${label.toLowerCase().replaceAll(/[^a-z0-9]+/g, "-")}.png`;
    link.href = canvas.toDataURL("image/png");
    link.click();
  }

  return (
    <div className={styles.qrBlock} data-qr-value={url}>
      <div className={styles.qrCanvas}>
        <QRCodeCanvas bgColor="#ffffff" fgColor="#171918" includeMargin level="M" ref={canvasRef} size={168} title={label} value={url} />
      </div>
      <div>
        <strong>Scan</strong>
        <p>Open this exact app link on an iPad or phone.</p>
        <button className={styles.secondaryAction} onClick={downloadQrCode} type="button">Download QR</button>
      </div>
    </div>
  );
}
