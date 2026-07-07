import type { Metadata } from "next";
import { ShieldCheck } from "@phosphor-icons/react/dist/ssr";
import { Container } from "@/components/ui/Container";
import { GradientBackground } from "@/components/ui/GradientBackground";
import { LegalIndexCard } from "@/components/legal/LegalIndexCard";
import { Reveal } from "@/components/motion/Reveal";
import { LEGAL_DOCS, LEGAL_CATEGORIES } from "@/lib/legal-content";
import { SHARED_LEGAL_NOTICE } from "@/lib/site";

export const metadata: Metadata = {
  title: "Legal, Trust, and Safety Center",
  description:
    "Clear policies for how Akara coordinates peer-to-peer exchange activity, handles verification, manages records, and protects users without holding or moving funds.",
  alternates: { canonical: "/legal" },
  openGraph: {
    title: "Akara Legal, Trust, and Safety Center",
    description:
      "Clear policies for how Akara coordinates peer-to-peer exchange activity, handles verification, manages records, and protects users without holding or moving funds.",
    url: "/legal",
  },
};

export default function LegalIndexPage() {
  return (
    <div>
      <div className="relative overflow-hidden border-b border-hairline">
        <GradientBackground />
        <Container className="relative py-16 text-center sm:py-24">
          <Reveal>
            <p className="mb-4 text-xs font-semibold uppercase tracking-[0.22em] text-brand">
              Legal center
            </p>
            <h1 className="mx-auto max-w-3xl text-balance text-4xl font-black leading-tight tracking-tight sm:text-6xl">
              Legal, Trust, and{" "}
              <span className="rounded-[0.2em] bg-brand box-decoration-clone px-[0.12em] text-black">
                Safety Center.
              </span>
            </h1>
            <p className="mx-auto mt-5 max-w-2xl text-pretty text-base leading-relaxed text-muted sm:text-lg">
              Clear policies for how Akara coordinates peer-to-peer exchange
              activity, handles verification, manages records, and protects
              users without holding or moving funds.
            </p>
          </Reveal>
        </Container>
      </div>

      <Container className="py-14 sm:py-20">
        <div
          role="note"
          className="mb-14 flex items-start gap-3.5 rounded-2xl border border-hairline-strong/60 bg-brand/[0.05] p-5 sm:p-6"
        >
          <ShieldCheck
            size={22}
            className="mt-0.5 shrink-0 text-brand"
            aria-hidden="true"
          />
          <p className="text-sm leading-relaxed text-white/85">
            {SHARED_LEGAL_NOTICE}
          </p>
        </div>

        <div className="flex flex-col gap-14">
          {LEGAL_CATEGORIES.map((category) => {
            const docs = LEGAL_DOCS.filter((d) => d.category === category);
            if (docs.length === 0) return null;
            return (
              <section key={category} aria-label={category}>
                <h2 className="mb-6 text-lg font-bold text-white">
                  {category}
                </h2>
                <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                  {docs.map((doc, i) => (
                    <LegalIndexCard key={doc.slug} doc={doc} delay={i * 0.05} />
                  ))}
                </div>
              </section>
            );
          })}
        </div>

        <p className="mt-14 text-center font-numbers text-xs tracking-widest text-faint">
          ALL POLICIES EFFECTIVE JULY 5, 2026
        </p>
      </Container>
    </div>
  );
}
