import { Container } from "@/components/ui/Container";
import { SectionHeader } from "@/components/ui/SectionHeader";
import { VerificationPanel } from "@/components/product/VerificationPanel";
import { Reveal } from "@/components/motion/Reveal";

export function Verification() {
  return (
    <section
      id="verification"
      className="relative scroll-mt-24 overflow-hidden border-t border-black/10 bg-[#F2F2ED] py-20 text-black sm:py-28"
    >
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_40%_40%_at_90%_60%,rgba(66,43,243,0.06),transparent_70%)]"
      />
      <Container className="relative">
        <div className="grid items-center gap-12 lg:grid-cols-2">
          <SectionHeader
            light
            align="left"
            className="mb-0"
            eyebrow="Verification"
            accent="electric"
            title="Everyone serious is verified."
            copy="Browse freely. But listing, trading, and payouts only happen between checked identities."
          />
          <Reveal y={28} delay={0.1}>
            <VerificationPanel className="shadow-[0_32px_80px_rgba(0,0,0,0.2)]" />
          </Reveal>
        </div>
      </Container>
    </section>
  );
}
