import { Container } from "@/components/ui/Container";
import { SectionHeader } from "@/components/ui/SectionHeader";
import { CorridorBoard } from "@/components/product/CorridorBoard";

export function Currencies() {
  return (
    <section
      id="currencies"
      className="scroll-mt-20 border-t border-hairline py-20 sm:py-28"
    >
      <Container>
        <SectionHeader
          eyebrow="Supported currencies"
          title="Built for African currency corridors."
          copy="Built for Nigeria, Rwanda, Ghana, Kenya, Cameroon, and expandable to more African markets."
        />
        <CorridorBoard />
      </Container>
    </section>
  );
}
