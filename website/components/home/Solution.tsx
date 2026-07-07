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
          <div className="relative overflow-hidden rounded-[2rem] border border-hairline-strong/50 bg-black p-6 sm:p-12">
            <div aria-hidden="true" className="absolute inset-0 bg-grid" />
            <div
              aria-hidden="true"
              className="absolute inset-0 bg-[radial-gradient(ellipse_50%_40%_at_50%_0%,rgba(157,255,30,0.08),transparent_70%)]"
            />
            <div className="relative">
              <NoCustodyDiagram />
            </div>
          </div>
        </Reveal>
      </Container>
    </section>
  );
}
