type IconProps = { className?: string };

export function NavigationIcon({ href, className }: IconProps & { href: string }) {
  const section = href.split("/").at(-1);
  const paths: Record<string, React.ReactNode> = {
    team: <><circle cx="9" cy="8" r="3"/><path d="M3 21v-3a6 6 0 0 1 12 0v3m2-16a3 3 0 0 1 0 6m1 3a5 5 0 0 1 3 4v3"/></>,
    clients: <><circle cx="12" cy="7" r="3"/><path d="M5 21v-3a7 7 0 0 1 14 0v3M3 6v5m-2-2h4"/></>,
    schedule: <><rect x="3" y="5" width="18" height="16" rx="2"/><path d="M7 2v6m10-6v6M3 11h18m-12 4h3m-3 3h6"/></>,
    availability: <><circle cx="12" cy="12" r="9"/><path d="M12 6v6l4 2"/></>,
    book: <><rect x="3" y="5" width="18" height="16" rx="2"/><path d="M7 2v6m10-6v6M3 11h18m-5 5h-8m4-4v8"/></>,
    profile: <><circle cx="12" cy="7" r="4"/><path d="M4 22v-3a8 8 0 0 1 16 0v3Z"/></>,
    equipment: <><path d="M8 12h8M3 8v8m4-11v14M17 5v14m4-11v8"/></>,
    "training-library": <><path d="M3 4h7a3 3 0 0 1 2 1 3 3 0 0 1 2-1h7v16h-7a3 3 0 0 0-2 1 3 3 0 0 0-2-1H3Zm9 1v16"/></>,
    reports: <><path d="M4 21V11h4v10m2 0V4h4v17m2 0V8h4v13"/></>,
    revenue: <><circle cx="12" cy="12" r="9"/><path d="M15 7H10a2.5 2.5 0 0 0 0 5h4a2.5 2.5 0 0 1 0 5H9m3-13v16"/></>,
    apps: <><rect x="6" y="2" width="12" height="20" rx="2"/><path d="M10 5h4m-3 14h2"/></>,
  };
  return <svg aria-hidden="true" className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">{paths[section ?? ""] ?? <><path d="m2 11 10-9 10 9M5 9v13h14V9M9 22v-8h6v8"/></>}</svg>;
}

export function ArrowUpRight({ className = "h-4 w-4" }: IconProps) {
  return <svg aria-hidden="true" className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M7 17 17 7M8 7h9v9" /></svg>;
}

export function ArrowRight({ className = "h-4 w-4" }: IconProps) {
  return <svg aria-hidden="true" className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M5 12h14m-5-5 5 5-5 5" /></svg>;
}

export function Trend({ className = "h-5 w-5" }: IconProps) {
  return <svg aria-hidden="true" className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6"><path d="m4 17 5-5 4 3 7-8"/><path d="M15 7h5v5"/></svg>;
}

export function Calendar({ className = "h-5 w-5" }: IconProps) {
  return <svg aria-hidden="true" className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6"><rect x="3.5" y="5.5" width="17" height="15"/><path d="M8 3v5m8-5v5M3.5 10h17"/></svg>;
}

export function Users({ className = "h-5 w-5" }: IconProps) {
  return <svg aria-hidden="true" className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6"><circle cx="9" cy="8" r="3"/><path d="M3.5 19c.4-4 2.2-6 5.5-6s5.1 2 5.5 6M16 6.5a2.5 2.5 0 0 1 0 5M16 13c2.8.2 4.3 2.2 4.5 5"/></svg>;
}

export function Spark({ className = "h-5 w-5" }: IconProps) {
  return <svg aria-hidden="true" className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6"><path d="M12 2.5c.6 5.2 3.2 7.8 8.5 8.5-5.3.7-7.9 3.3-8.5 8.5-.7-5.2-3.3-7.8-8.5-8.5 5.2-.7 7.8-3.3 8.5-8.5Z"/></svg>;
}
