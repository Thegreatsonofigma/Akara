import { Container } from "@/components/ui/Container";
import { SectionHeader } from "@/components/ui/SectionHeader";
import { NoCustodyDiagram } from "@/components/product/NoCustodyDiagram";
import { Reveal } from "@/components/motion/Reveal";

export function Solution() {
  return (
    <section className="relative border-t border-hairline py-20 sm:py-28">
      <Container>
        <SectionHeader
          eyebrow="The solution"
          title="Akara adds structure without touching the money."
          copy="Akara sits above the direct payment as a coordination layer: verification, listings, matching, payout details, receipts, confirmations, and a dispute record — while the money moves directly between users."
        />
        <Reveal y={32}>
          <NoCustodyDiagram />
        </Reveal>
      </Container>
    </section>
  );
}
