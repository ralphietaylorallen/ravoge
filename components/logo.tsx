import Link from "next/link";

export function Logo({ compact = false }: { compact?: boolean }) {
  return (
    <Link
      href="/"
      aria-label="Ravoge home"
      className="inline-flex items-center gap-3 rounded-sm text-[#F6F5F3] outline-none focus-visible:ring-2 focus-visible:ring-[#B4AC9B] focus-visible:ring-offset-4 focus-visible:ring-offset-[#050606]"
    >
      <svg aria-hidden="true" className="h-7 w-7" viewBox="0 0 32 32" fill="none">
        <path d="M5 25.5V6.5h10.2c5.4 0 8.8 2.8 8.8 7.2 0 3.1-1.8 5.4-4.9 6.5L26 25.5h-6.2l-6.1-4.9H10v4.9H5Z" fill="currentColor" />
        <path d="M10 11v5.2h4.7c2.5 0 3.8-.9 3.8-2.7 0-1.7-1.3-2.5-3.8-2.5H10Z" fill="#050606" />
      </svg>
      {!compact && <span className="font-display text-xl font-semibold tracking-[-0.04em]">ravoge</span>}
    </Link>
  );
}
