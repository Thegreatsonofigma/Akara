import { Container } from "@/components/ui/Container";
import { SectionHeader } from "@/components/ui/SectionHeader";
import { VerificationPanel } from "@/components/product/VerificationPanel";
import { Reveal } from "@/components/motion/Reveal";

export function Verification() {
  return (
    <section
      id="verification"
      className="scroll-mt-20 border-t border-hairline py-20 sm:py-28"
    >
      <Container>
        <div className="grid items-center gap-12 lg:grid-cols-2">
          <SectionHeader
            align="left"
            className="mb-0"
            eyebrow="Verification"
            accent="electric"
            title="Everyone serious is verified."
            copy="Browse freely. But listing, trading, and payouts only happen between checked identities."
          />
          <Reveal y={28} delay={0.1}>
            <VerificationPanel />
          </Reveal>
        </div>
      </Container>
    </section>
  );
}
