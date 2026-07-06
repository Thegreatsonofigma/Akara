import Link from "next/link";
import { ArrowRight } from "@phosphor-icons/react/dist/ssr";
import type { LegalDoc } from "@/lib/legal-content";
import { Reveal } from "@/components/motion/Reveal";

export function LegalIndexCard({
  doc,
  delay = 0,
}: {
  doc: LegalDoc;
  delay?: number;
}) {
  return (
    <Reveal delay={delay} className="h-full">
      <Link
        href={`/legal/${doc.slug}`}
        className="group flex h-full flex-col gap-3 rounded-2xl border border-hairline bg-surface-2 p-6 transition-all duration-300 hover:-translate-y-1 hover:border-brand/40 hover:shadow-[0_16px_48px_rgba(157,255,30,0.08)]"
      >
        <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-brand/80">
          {doc.category}
        </p>
        <p className="text-base font-semibold leading-snug text-white">
          {doc.shortTitle}
        </p>
        <p className="flex-1 text-[13px] leading-relaxed text-faint">
          {doc.description}
        </p>
        <span className="mt-1 inline-flex items-center gap-1.5 text-[13px] font-medium text-muted transition-colors group-hover:text-brand">
          Read policy
          <ArrowRight
            size={14}
            aria-hidden="true"
            className="transition-transform duration-300 group-hover:translate-x-1"
          />
        </span>
      </Link>
    </Reveal>
  );
}
