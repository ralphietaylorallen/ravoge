import Link from "next/link";
import styles from "./dashboard.module.css";

export function OperationsTabs({ basePath, active, tabs }: { basePath: string; active: string; tabs: { id: string; label: string }[] }) {
  return <nav aria-label="Client sections" className={styles.tabs}>{tabs.map((tab) => <Link aria-current={active === tab.id ? "page" : undefined} href={`${basePath}?tab=${tab.id}`} key={tab.id}>{tab.label}</Link>)}</nav>;
}
