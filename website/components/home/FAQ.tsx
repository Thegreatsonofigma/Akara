import { Container } from "@/components/ui/Container";
import { SectionHeader } from "@/components/ui/SectionHeader";
import { FAQAccordion, type FAQItem } from "@/components/product/FAQAccordion";

const FAQ_ITEMS: FAQItem[] = [
  {
    question: "Does Akara hold my money?",
    answer:
      "No. Akara does not hold, receive, escrow, custody, remit, convert, or move user funds. Users send money directly to each other through their own bank or mobile money accounts.",
  },
  {
    question: "Is Akara a wallet or escrow service?",
    answer:
      "No. Akara is not a wallet, escrow provider, bank, remittance company, or payment processor. Akara provides software tools that help verified users coordinate and track peer-to-peer exchange arrangements.",
  },
  {
    question: "Who sends the money?",
    answer:
      "The users do. Each user pays the other directly from their own bank or mobile money account. Akara coordinates the trade and keeps the record, but never touches the payment.",
  },
  {
    question: "Why do I need to verify my identity?",
    answer:
      "Verification reduces impersonation and fraud. You can browse basic information without it, but you must be verified before creating listings, opening trades, adding payout accounts, or completing exchanges.",
  },
  {
    question: "What happens if I send money to the wrong account?",
    answer:
      "Because Akara does not hold funds, Akara cannot stop or reverse a payment. Contact your bank or mobile money provider immediately, and raise a dispute so the trade record is preserved. Always confirm payout details before sending money.",
  },
  {
    question: "Can I cancel after marking payment as sent?",
    answer:
      "No. Once you mark payment as sent, you cannot cancel the trade. If something goes wrong after that point, raise a dispute so it can be reviewed with the trade evidence.",
  },
  {
    question: "What if the other user does not confirm?",
    answer:
      "Raise a dispute within 24 hours. Akara can pause the trade, request evidence from both sides, and assign an admin reviewer. A trade may be closed without both confirmations only after admin review and clear evidence.",
  },
  {
    question: "What currencies does Akara support?",
    answer:
      "Akara launches with NGN, RWF, GHS, KES, and XAF — covering Nigeria, Rwanda, Ghana, Kenya, and Cameroon — with room to expand to more African markets.",
  },
  {
    question: "Is Akara free?",
    answer:
      "Yes, Akara is free during launch. If fees apply later, they will be shown clearly before you open a trade.",
  },
  {
    question: "Can businesses use Akara?",
    answer:
      "Not yet. Only individual users are supported at launch. Business accounts may come later.",
  },
  {
    question: "Can users outside Africa use Akara?",
    answer:
      "Yes, but only if they are verified and transacting within supported currency corridors.",
  },
];

export function FAQ() {
  return (
    <section className="border-t border-hairline py-20 sm:py-28">
      <Container>
        <SectionHeader
          eyebrow="FAQ"
          title="Questions people actually ask."
          copy="Short answers, no fine-print surprises. The full detail lives in the legal center."
        />
        <FAQAccordion items={FAQ_ITEMS} />
      </Container>
    </section>
  );
}
