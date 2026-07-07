import Link from "next/link";
import { ArrowRight } from "@phosphor-icons/react/dist/ssr";
import type { LegalDoc, LegalCategory } from "@/lib/legal-content";
import { Reveal } from "@/components/motion/Reveal";

const CATEGORY_TONES: Record<LegalCategory, string> = {
  "Core Terms": "bg-brand text-black",
  "Risk & Safety": "bg-pink text-white",
  "Privacy & Data": "bg-electric text-white",
  Support: "bg-acid text-black",
};

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
        className="group flex h-full flex-col gap-3 rounded-2xl border border-hairline bg-surface-2 p-6 transition-all duration-300 hover:-translate-y-1 hover:border-white/20 hover:shadow-[0_20px_48px_rgba(0,0,0,0.5)]"
      >
        <p
          className={`inline-flex w-fit rounded-full px-2.5 py-1 text-[9px] font-bold uppercase tracking-[0.16em] ${CATEGORY_TONES[doc.category]}`}
        >
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
