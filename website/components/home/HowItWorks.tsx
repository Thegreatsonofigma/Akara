import { Container } from "@/components/ui/Container";
import { SectionHeader } from "@/components/ui/SectionHeader";
import { StepCard } from "@/components/ui/StepCard";

const STEPS = [
  {
    number: "01",
    title: "Verify your identity",
    copy: "Share your legal name, ID document, and a quick selfie so every serious trade action happens between verified people.",
  },
  {
    number: "02",
    title: "Create or find a listing",
    copy: "Post what you have and what you need, or browse verified offers across supported corridors.",
  },
  {
    number: "03",
    title: "Open a trade",
    copy: "Match with a verified user and lock the trade with a reference code. Open trades expire after 15 minutes if not progressed.",
  },
  {
    number: "04",
    title: "Confirm payout details",
    copy: "Akara shares name-matched payout details inside the trade so both sides can check before anything moves.",
    warning: "Always confirm payout details before sending money.",
  },
  {
    number: "05",
    title: "Pay directly through bank or mobile money",
    copy: "Send from your own account to the other user's account. The money never passes through Akara.",
  },
  {
    number: "06",
    title: "Upload receipt and confirm received value",
    copy: "Attach proof of payment, confirm what you received, and keep the full record in your history.",
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
          title="How Akara works"
          copy="Six clear steps from finding an offer to a confirmed, receipt-backed exchange."
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
