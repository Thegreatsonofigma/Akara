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
    title: "Unverified group offers",
    copy: "Strangers in group chats with no identity checks behind the offer.",
  },
  {
    icon: CreditCard,
    title: "Wrong payout details",
    copy: "One mistyped account number and the money is gone.",
  },
  {
    icon: FileX,
    title: "Fake receipts",
    copy: "Edited screenshots that look real until it is too late.",
  },
  {
    icon: HourglassLow,
    title: "Abandoned trades",
    copy: "Deals that stall halfway with no way to close them out.",
  },
  {
    icon: ClockCounterClockwise,
    title: "No clear history",
    copy: "Scattered screenshots instead of a record you can rely on.",
  },
  {
    icon: Scales,
    title: "Hard-to-resolve disputes",
    copy: "No evidence trail, no reviewer, no structured way forward.",
  },
];

export function Problem() {
  return (
    <section className="border-t border-hairline py-20 sm:py-28">
      <Container>
        <SectionHeader
          eyebrow="The problem"
          title="Currency help still runs on scattered chats."
          copy="Students, expats, freelancers, and travelers often rely on friends, groups, screenshots, and guesswork to find currency. Akara brings the coordination into one safer flow."
        />
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {PROBLEMS.map((problem, i) => (
            <Reveal key={problem.title} delay={i * 0.06} className="h-full">
              <div className="flex h-full flex-col gap-3 rounded-2xl border border-hairline bg-surface-2 p-6 transition-colors duration-300 hover:border-pink/30">
                <span className="flex size-10 items-center justify-center rounded-xl border border-pink/20 bg-pink/[0.06]">
                  <problem.icon
                    size={20}
                    className="text-pink"
                    aria-hidden="true"
                  />
                </span>
                <p className="text-base font-semibold text-white">
                  {problem.title}
                </p>
                <p className="text-sm leading-relaxed text-faint">
                  {problem.copy}
                </p>
              </div>
            </Reveal>
          ))}
        </div>
      </Container>
    </section>
  );
}
