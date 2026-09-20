import Link from "next/link";

export function Logo({ compact = false }: { compact?: boolean }) {
  return (
    <Link
      href="/"
      aria-label="Ravoge home"
      className="inline-flex items-center gap-3 rounded-sm text-[#F6F5F3] outline-none focus-visible:ring-2 focus-visible:ring-[#B4AC9B] focus-visible:ring-offset-4 focus-visible:ring-offset-[#050606]"
    >
      <svg aria-hidden="true" className="h-8 w-8" viewBox="0 0 40 40" fill="none">
        <path d="M3 2.5 13.2 9 20 6.8 26.8 9 37 2.5l-3.6 23.2-6.2 8L20 39l-7.2-5.3-6.2-8L3 2.5Z" fill="currentColor" />
        <path d="m3 2.5 12.2 13L6.6 25.7 3 2.5Zm34 0-12.2 13 8.6 10.2L37 2.5Z" fill="#8A8171" />
        <path d="m13.2 9 6.8 12.2L9.2 19l4-10Zm13.6 0L20 21.2 30.8 19l-4-10Z" fill="#24312E" />
        <path d="m9.2 19 10.8 2.2-7.2 12.5-6.2-8L9.2 19Zm21.6 0L20 21.2l7.2 12.5 6.2-8-2.6-6.7Z" fill="#53544D" />
        <path d="m20 21.2 7.2 12.5L20 39l-7.2-5.3L20 21.2Z" fill="#B4AC9B" />
        <path d="m11.2 20.2 5.7 2.1-4.8 2.1-.9-4.2Zm17.6 0-5.7 2.1 4.8 2.1.9-4.2Z" fill="#050606" />
        <path d="m16.7 31.8 3.3-2 3.3 2-3.3 2.4-3.3-2.4Z" fill="#050606" />
      </svg>
      {!compact && <span className="font-display text-sm font-medium uppercase tracking-[0.28em]">Ravoge</span>}
    </Link>
  );
}
