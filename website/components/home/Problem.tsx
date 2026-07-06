import {
  UsersThree,
  CreditCard,
  FileX,
  HourglassLow,
  ClockCounterClockwise,
  Scales,
} from "@phosphor-icons/react/dist/ssr";
import { Container } from "@/components/ui/Container";
import { SectionHeader } from "@/components/ui/SectionHeader";
import { Reveal } from "@/components/motion/Reveal";

const PROBLEMS = [
  {
    icon: UsersThree,
    title: "Unverified strangers",
    copy: "Anyone can claim anything.",
  },
  {
    icon: CreditCard,
    title: "Wrong payout details",
    copy: "One typo, money gone.",
  },
  {
    icon: FileX,
    title: "Fake receipts",
    copy: "Edited screenshots look real.",
  },
  {
    icon: HourglassLow,
    title: "Ghosted trades",
    copy: "Deals die halfway through.",
  },
  {
    icon: ClockCounterClockwise,
    title: "No records",
    copy: "Your history is a scroll-back.",
  },
  {
    icon: Scales,
    title: "No referee",
    copy: "Disputes go nowhere.",
  },
];

export function Problem() {
  return (
    <section className="border-t border-hairline py-20 sm:py-28">
      <Container>
        <SectionHeader
          eyebrow="The problem"
          accent="pink"
          title="Group chats weren't built for money."
          copy="Right now, finding currency means strangers, screenshots, and hope."
        />
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {PROBLEMS.map((problem, i) => (
            <Reveal key={problem.title} delay={i * 0.06} className="h-full">
              <div className="flex h-full items-center gap-4 rounded-2xl border border-hairline bg-surface-2 p-5 transition-colors duration-300 hover:border-pink/30">
                <span className="flex size-11 shrink-0 items-center justify-center rounded-xl border border-pink/20 bg-pink/[0.06]">
                  <problem.icon
                    size={21}
                    className="text-pink"
                    aria-hidden="true"
                  />
                </span>
                <div>
                  <p className="text-[15px] font-semibold text-white">
                    {problem.title}
                  </p>
                  <p className="mt-0.5 text-[13px] text-faint">{problem.copy}</p>
                </div>
              </div>
            </Reveal>
          ))}
        </div>
      </Container>
    </section>
  );
}
