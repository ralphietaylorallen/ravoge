"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import styles from "./dashboard.module.css";
export function DashboardNavigation({ role, items }: { role: string; items: { href: string; label: string }[] }) {
  const pathname = usePathname();
  return <nav aria-label={`${role} navigation`}>{items.map((item, index) => <Link aria-current={(index === 0 ? pathname === item.href : pathname.startsWith(item.href)) ? "page" : undefined} href={item.href} key={item.href}><span aria-hidden="true" className={styles.navGlyph}>{["⌂", "♙", "▦", "◇", "▤", "◈", "▧", "▣", "↗"][index]}</span>{item.label}</Link>)}</nav>;
}
