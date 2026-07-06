import { Container } from "@/components/ui/Container";
import { SectionHeader } from "@/components/ui/SectionHeader";
import { NoCustodyDiagram } from "@/components/product/NoCustodyDiagram";
import { Reveal } from "@/components/motion/Reveal";

export function Solution() {
  return (
    <section className="relative border-t border-hairline py-20 sm:py-28">
      <Container>
        <SectionHeader
          eyebrow="The fix"
          title="All the structure. None of the custody."
          copy="Akara coordinates the swap. The money moves once — straight from them to you."
        />
        <Reveal y={32}>
          <NoCustodyDiagram />
        </Reveal>
      </Container>
    </section>
  );
}
