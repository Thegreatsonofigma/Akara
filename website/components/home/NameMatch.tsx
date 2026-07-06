import { Container } from "@/components/ui/Container";
import { SectionHeader } from "@/components/ui/SectionHeader";
import { PayoutNameMatchPanel } from "@/components/product/PayoutNameMatchPanel";
import { Reveal } from "@/components/motion/Reveal";

export function NameMatch() {
  return (
    <section className="border-t border-hairline py-20 sm:py-28">
      <Container>
        <div className="grid items-center gap-12 lg:grid-cols-2">
          <Reveal y={28} delay={0.1} className="order-2 lg:order-1">
            <PayoutNameMatchPanel />
          </Reveal>
          <SectionHeader
            align="left"
            className="order-1 mb-0 lg:order-2"
            eyebrow="Payout name match"
            title="Payout details must match the verified person."
            copy="Akara checks payout names to reduce impersonation and unsafe trades. Minor spelling differences may go to admin review. Someone else's payout account is not allowed at launch."
          />
        </div>
      </Container>
    </section>
  );
}
