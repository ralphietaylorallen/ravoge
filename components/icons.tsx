type IconProps = { className?: string };

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
