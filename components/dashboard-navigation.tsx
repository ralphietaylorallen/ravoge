"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect } from "react";
import { NavigationIcon } from "./icons";
import styles from "./dashboard.module.css";
export function DashboardNavigation({ role, items }: { role: string; items: { href: string; label: string }[] }) {
  const pathname = usePathname();
  useEffect(() => {
    if (role !== "owner") return;
    const frame = document.querySelector('[data-account-role="owner"]');
    if (!frame) return;
    // Native disclosures keep forms mounted. Reveal validation and hash targets,
    // including a server-action response received while its section is closed.
    const reveal = (element: Element | null) => {
      let details = element?.closest<HTMLDetailsElement>("details[data-owner-disclosure]");
      while (details) {
        details.open = true;
        details = details.parentElement?.closest<HTMLDetailsElement>("details[data-owner-disclosure]") ?? null;
      }
    };
    const revealHash = () => {
      try { reveal(document.getElementById(decodeURIComponent(location.hash.slice(1)))); } catch { /* Invalid hash has no target. */ }
    };
    const invalid = (event: Event) => reveal(event.target instanceof Element ? event.target : null);
    const toggle = (event: Event) => {
      const details = event.target;
      if (details instanceof HTMLDetailsElement && !details.open && details.matches("[data-owner-disclosure]") &&
        details.querySelector('[aria-busy="true"], [role="alert"], [aria-invalid="true"], :user-invalid')) reveal(details);
    };
    const observer = new MutationObserver((mutations) => {
      for (const mutation of mutations) {
        const element = mutation.target instanceof Element ? mutation.target : mutation.target.parentElement;
        if (!element) continue;
        const notice = element.closest('[role="alert"], [role="status"]');
        if (notice?.textContent?.trim()) reveal(notice);
        for (const node of mutation.addedNodes) if (node instanceof Element) {
          if (node.matches('[role="alert"], [role="status"]') && node.textContent?.trim()) reveal(node);
          for (const status of node.querySelectorAll('[role="alert"], [role="status"]')) if (status.textContent?.trim()) reveal(status);
        }
      }
    });
    frame.addEventListener("invalid", invalid, true);
    frame.addEventListener("toggle", toggle, true);
    window.addEventListener("hashchange", revealHash);
    observer.observe(frame, { childList: true, characterData: true, subtree: true });
    revealHash();
    return () => {
      observer.disconnect();
      frame.removeEventListener("invalid", invalid, true);
      frame.removeEventListener("toggle", toggle, true);
      window.removeEventListener("hashchange", revealHash);
    };
  }, [pathname, role]);
  return <nav aria-label={`${role} navigation`} tabIndex={0}>{items.map((item, index) => <Link aria-current={(index === 0 ? pathname === item.href : pathname.startsWith(item.href)) ? "page" : undefined} href={item.href} key={item.href}><NavigationIcon className={styles.navGlyph} href={item.href} />{item.label}</Link>)}</nav>;
}
