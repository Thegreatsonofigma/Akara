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

export function Problem() {
  return (
    <section className="relative overflow-hidden py-20 sm:py-28">
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_45%_40%_at_85%_15%,rgba(255,45,85,0.07),transparent_70%)]"
      />
      <Container className="relative">
        <div className="grid gap-12 lg:grid-cols-[0.9fr_1.1fr] lg:gap-20">
          <div className="lg:sticky lg:top-28 lg:self-start">
            <Reveal>
              <p className="mb-5 inline-flex w-fit items-center gap-2 rounded-full border border-white/10 bg-white/[0.03] px-3.5 py-1.5 text-[11px] font-semibold uppercase tracking-[0.18em] text-white/70">
                <span
                  aria-hidden="true"
                  className="size-1.5 rounded-full bg-pink"
                />
                The problem
              </p>
              <h2 className="text-balance text-4xl font-black leading-[1.05] tracking-tight text-white sm:text-5xl md:text-6xl">
                Group chats weren&apos;t built{" "}
                <span className="text-pink">for money.</span>
              </h2>
              <p className="mt-6 max-w-sm text-pretty text-base leading-relaxed text-muted sm:text-lg">
                Right now, finding currency means strangers, screenshots, and
                hope.
              </p>
              <p className="mt-10 hidden items-center gap-2 text-sm font-semibold text-white/80 lg:flex">
                Here&apos;s how Akara fixes it
                <ArrowDown size={15} aria-hidden="true" className="text-brand" />
              </p>
            </Reveal>
          </div>

          <div>
            {PROBLEMS.map((problem, i) => (
              <Reveal key={problem.title} delay={i * 0.05}>
                <div className="group flex items-center gap-5 border-b border-white/[0.08] py-6 transition-colors first:border-t hover:border-pink/30">
                  <span className="flex size-12 shrink-0 items-center justify-center rounded-2xl border border-pink/25 bg-pink/[0.07] transition-colors group-hover:bg-pink/[0.12]">
                    <problem.icon
                      size={22}
                      weight="duotone"
                      className="text-pink"
                      aria-hidden="true"
                    />
                  </span>
                  <div className="flex flex-1 flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
                    <p className="text-lg font-bold text-white">
                      {problem.title}
                    </p>
                    <p className="text-sm text-faint">{problem.copy}</p>
                  </div>
                  <span
                    aria-hidden="true"
                    className="hidden font-numbers text-sm tracking-widest text-white/25 sm:block"
                  >
                    0{i + 1}
                  </span>
                </div>
              </Reveal>
            ))}
          </div>
        </div>
      </Container>
    </section>
  );
}
