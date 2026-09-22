import Link from "next/link";
import Image from "next/image";

export function Logo({ compact = false }: { compact?: boolean }) {
  return (
    <Link
      href="/"
      aria-label="Ravoge home"
      className="inline-flex items-center gap-3 rounded-sm text-[#F6F5F3] outline-none focus-visible:ring-2 focus-visible:ring-[#B4AC9B] focus-visible:ring-offset-4 focus-visible:ring-offset-[#050606]"
    >
      <Image
        alt=""
        aria-hidden="true"
        className="h-10 w-auto object-contain"
        height={1024}
        priority
        src="/brand/ravoge-wolf-transparent.png"
        width={811}
      />
      {!compact && <span className="font-display text-sm font-medium uppercase tracking-[0.28em]">Ravoge</span>}
    </Link>
  );
}
