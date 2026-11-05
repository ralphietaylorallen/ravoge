import Link from "next/link";
import { QrCode } from "@/components/qr-code";
import dashboard from "./dashboard.module.css";
import styles from "./client-install-card.module.css";

export function ClientInstallCard() {
  return <aside aria-label="Get the Client app" className={styles.card}>
    <QrCode compact label="Ravoge Client app installation" url="https://ravoge.com/client/install" />
    <div>
      <h3>Get the Client app</h3>
      <p>Scan to get the Client app. Sign in with your invited email.</p>
      <Link className={dashboard.secondaryAction} href="/client/install">Open installation page</Link>
    </div>
  </aside>;
}
