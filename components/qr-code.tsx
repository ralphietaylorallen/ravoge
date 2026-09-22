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

  function printQrCode() {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const printWindow = window.open("", "_blank", "width=640,height=720");
    if (!printWindow) return;
    printWindow.opener = null;
    const image = canvas.toDataURL("image/png");
    printWindow.document.title = label;
    const style = printWindow.document.createElement("style");
    style.textContent = "body{display:grid;min-height:90vh;place-items:center;margin:0;font-family:Arial,sans-serif;text-align:center}img{width:320px;height:320px}p{max-width:34rem;overflow-wrap:anywhere}";
    const main = printWindow.document.createElement("main");
    const heading = printWindow.document.createElement("h1");
    const qrImage = printWindow.document.createElement("img");
    const address = printWindow.document.createElement("p");
    heading.textContent = label;
    qrImage.alt = label;
    qrImage.src = image;
    address.textContent = url;
    main.append(heading, qrImage, address);
    printWindow.document.head.append(style);
    printWindow.document.body.append(main);
    qrImage.addEventListener("load", () => printWindow.print(), { once: true });
  }

  return (
    <div className={styles.qrBlock} data-qr-value={url}>
      <div className={styles.qrCanvas}>
        <QRCodeCanvas bgColor="#ffffff" fgColor="#171918" includeMargin level="M" ref={canvasRef} size={168} title={label} value={url} />
      </div>
      <div>
        <strong>Scan</strong>
        <p>Open this exact app link on an iPad or phone.</p>
        <div className={styles.accessActions}>
          <button className={styles.secondaryAction} onClick={downloadQrCode} type="button">Download QR</button>
          <button className={styles.secondaryAction} onClick={printQrCode} type="button">Print QR</button>
        </div>
      </div>
    </div>
  );
}
