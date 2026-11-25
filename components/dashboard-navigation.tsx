"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef } from "react";
import { NavigationIcon } from "./icons";
import styles from "./dashboard.module.css";
import workspace from "./coach-workspace.module.css";
export function DashboardNavigation({ role, items }: { role: string; items: { href: string; label: string }[] }) {
  const pathname = usePathname();
  const toolsMenu = useRef<HTMLDetailsElement>(null);
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
  const coachPrimaryPaths = ["/coach", "/coach/schedule", "/coach/clients", "/coach/plan-workouts"];
  const primaryItems = role === "coach" ? items.filter(item => coachPrimaryPaths.includes(item.href)) : items;
  const tools = role === "coach" ? items.filter(item => !coachPrimaryPaths.includes(item.href)) : [];
  const isActive = (href: string) => href === `/${role}` ? pathname === href || (role === "client" && pathname.startsWith("/client/workouts/"))
    : pathname === href || pathname.startsWith(`${href}/`);

  return <nav aria-label={`${role} navigation`} className={role === "coach" ? workspace.navigation : undefined} tabIndex={role === "coach" ? undefined : 0}
    onKeyDown={event => {
      if (event.key === "Escape" && toolsMenu.current?.open) {
        toolsMenu.current.open = false;
        toolsMenu.current.querySelector("summary")?.focus();
      }
    }}>
    {primaryItems.map(item => <Link aria-current={isActive(item.href) ? "page" : undefined} href={item.href} key={item.href}>
      <NavigationIcon className={styles.navGlyph} href={item.href} />
      {role === "coach" && item.href === "/coach/plan-workouts"
        ? <><span className={workspace.longLabel}>{item.label}</span><span className={workspace.shortLabel}>Plan</span></>
        : <span>{item.label}</span>}
    </Link>)}
    {tools.length > 0 && <details ref={toolsMenu} className={workspace.tools} data-active={tools.some(item => isActive(item.href)) || undefined}>
      <summary><NavigationIcon className={styles.navGlyph} href="/coach/more" /> <span>More</span></summary>
      <div className={workspace.toolsLinks}>{tools.map(item => <Link aria-current={isActive(item.href) ? "page" : undefined} href={item.href} key={item.href}
        onClick={() => { if (toolsMenu.current) toolsMenu.current.open = false; }}>
        <NavigationIcon className={styles.navGlyph} href={item.href} />{item.label}
      </Link>)}</div>
    </details>}
  </nav>;
}
