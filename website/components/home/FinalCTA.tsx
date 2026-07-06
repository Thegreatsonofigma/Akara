import { WhatsappLogo, FileText } from "@phosphor-icons/react/dist/ssr";
import { Container } from "@/components/ui/Container";
import { Button } from "@/components/ui/Button";
import { GradientBackground } from "@/components/ui/GradientBackground";
import { SpectrumBar } from "@/components/ui/SpectrumBar";
import { Reveal } from "@/components/motion/Reveal";
import { SITE } from "@/lib/site";

export function FinalCTA() {
  return (
    <section className="relative overflow-hidden">
      <SpectrumBar />
      <GradientBackground position="bottom" grid={false} />
      <Container className="relative py-24 sm:py-32">
        <Reveal>
          <div className="flex flex-col items-center gap-8 text-center">
            <h2 className="max-w-3xl text-balance text-4xl font-black leading-[1.05] tracking-tight sm:text-6xl">
              Ready to swap{" "}
              <span className="text-brand">the right way?</span>
            </h2>
            <p className="max-w-md text-pretty text-base text-muted">
              A verified partner, a clear trail, and money that only ever
              moves between the two of you.
            </p>
            <div className="flex flex-col items-center gap-4 sm:flex-row">
              <Button href={SITE.whatsappHref} external size="lg">
                <WhatsappLogo size={20} weight="fill" aria-hidden="true" />
                Start on WhatsApp
              </Button>
              <Button
                href="/legal/no-custody-risk-disclosure"
                variant="secondary"
                size="lg"
              >
                <FileText size={18} aria-hidden="true" />
                Read the No-Custody Disclosure
              </Button>
            </div>
            <p className="text-sm text-faint">
              Akara coordinates trades. Users pay each other directly.
            </p>
          </div>
        </Reveal>
      </Container>
    </section>
  );
}
