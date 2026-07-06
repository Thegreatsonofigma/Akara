import {
  UsersThree,
  CreditCard,
  FileX,
  HourglassLow,
  ClockCounterClockwise,
  Scales,
  ArrowDown,
} from "@phosphor-icons/react/dist/ssr";
import { Container } from "@/components/ui/Container";
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

/** The light act — a paper-white editorial break in the black page. */
export function Problem() {
  return (
    <section className="relative overflow-hidden bg-[#F2F2ED] py-20 text-black sm:py-28">
      <div aria-hidden="true" className="absolute inset-0 bg-grain" />
      <Container className="relative">
        <Reveal className="mb-14 flex flex-col items-center gap-5 text-center sm:mb-16">
          <p className="inline-flex w-fit items-center gap-2 rounded-full border border-black/15 bg-black/[0.03] px-3.5 py-1.5 text-[11px] font-semibold uppercase tracking-[0.18em] text-black/55">
            <span aria-hidden="true" className="size-1.5 rounded-full bg-pink" />
            The problem
          </p>
          <h2 className="max-w-2xl text-balance text-4xl font-black leading-[1.05] tracking-tight sm:text-5xl md:text-6xl">
            Group chats weren&apos;t built for money.
          </h2>
          <p className="max-w-md text-pretty text-base leading-relaxed text-black/55 sm:text-lg">
            Right now, finding currency means strangers, screenshots, and hope.
          </p>
        </Reveal>

        <div className="mx-auto grid max-w-4xl sm:grid-cols-2 sm:gap-x-16">
          {PROBLEMS.map((problem, i) => (
            <Reveal key={problem.title} delay={i * 0.05}>
              <div className="flex items-center gap-4 border-b border-black/10 py-5">
                <span className="flex size-11 shrink-0 items-center justify-center rounded-xl border border-pink/25 bg-pink/[0.07]">
                  <problem.icon
                    size={21}
                    className="text-pink"
                    aria-hidden="true"
                  />
                </span>
                <div className="flex flex-1 items-baseline justify-between gap-3">
                  <p className="text-[15px] font-bold">{problem.title}</p>
                  <p className="text-right text-[13px] text-black/50">
                    {problem.copy}
                  </p>
                </div>
              </div>
            </Reveal>
          ))}
        </div>

        <Reveal delay={0.2}>
          <p className="mt-14 flex items-center justify-center gap-2 text-sm font-semibold">
            Here&apos;s how Akara fixes it
            <ArrowDown size={15} aria-hidden="true" className="text-pink" />
          </p>
        </Reveal>
      </Container>
    </section>
  );
}
