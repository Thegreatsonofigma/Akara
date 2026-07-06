import { Container } from "@/components/ui/Container";
import { SectionHeader } from "@/components/ui/SectionHeader";
import { StepCard } from "@/components/ui/StepCard";

const STEPS = [
  {
    number: "01",
    title: "Verify yourself",
    copy: "Real name, real ID, quick selfie.",
  },
  {
    number: "02",
    title: "List or browse",
    copy: "Say what you have and what you need.",
  },
  {
    number: "03",
    title: "Open a trade",
    copy: "Lock it in with a reference code.",
  },
  {
    number: "04",
    title: "Check payout details",
    copy: "Name-matched and shared inside the trade.",
    warning: "Always confirm payout details before sending money.",
  },
  {
    number: "05",
    title: "Pay each other directly",
    copy: "Bank or mobile money, account to account.",
  },
  {
    number: "06",
    title: "Confirm with proof",
    copy: "Upload the receipt. Both sides confirm. Done.",
  },
];

export function HowItWorks() {
  return (
    <section
      id="how-it-works"
      className="scroll-mt-20 border-t border-hairline py-20 sm:py-28"
    >
      <Container>
        <SectionHeader
          eyebrow="How it works"
          title="From hello to swapped, in six steps."
        />
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {STEPS.map((step, i) => (
            <StepCard key={step.number} {...step} delay={i * 0.06} />
          ))}
        </div>
      </Container>
    </section>
  );
}
