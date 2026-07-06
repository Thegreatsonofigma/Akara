import { Container } from "@/components/ui/Container";
import { SectionHeader } from "@/components/ui/SectionHeader";
import { CorridorBoard } from "@/components/product/CorridorBoard";

export function Currencies() {
  return (
    <section
      id="currencies"
      className="scroll-mt-24 border-t border-black/10 bg-[#F7F6F1] py-20 text-black sm:py-28"
    >
      <Container>
        <SectionHeader
          light
          eyebrow="Currencies"
          accent="acid"
          title="Five currencies. One network."
          copy="Nigeria, Rwanda, Ghana, Kenya, Cameroon — with more markets to come."
        />
        <CorridorBoard />
      </Container>
    </section>
  );
}
