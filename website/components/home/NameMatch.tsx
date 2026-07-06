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
            eyebrow="Name match"
            title="The account must match the person."
            copy="Payout names are checked against verified identities, so impersonation gets nowhere."
          />
        </div>
      </Container>
    </section>
  );
}
