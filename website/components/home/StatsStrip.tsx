import { Container } from "@/components/ui/Container";
import { Reveal } from "@/components/motion/Reveal";

const STATS = [
  { value: "5", label: "launch currencies", color: "text-brand" },
  { value: "0", label: "funds held by Akara, ever", color: "text-acid" },
  { value: "24h", label: "dispute window", color: "text-pink" },
  { value: "2", label: "sides confirm every trade", color: "text-[#8f9dff]" },
];

export function StatsStrip() {
  return (
    <section className="border-y border-hairline bg-surface">
      <Container>
        <dl className="grid grid-cols-2 divide-hairline sm:grid-cols-4 sm:divide-x">
          {STATS.map((stat, i) => (
            <Reveal key={stat.label} delay={i * 0.07}>
              <div className="flex flex-col items-center gap-1.5 px-4 py-9 text-center sm:py-11">
                <dd
                  className={`order-1 font-numbers text-5xl tracking-wide sm:text-6xl ${stat.color}`}
                >
                  {stat.value}
                </dd>
                <dt className="order-2 text-[13px] text-faint">{stat.label}</dt>
              </div>
            </Reveal>
          ))}
        </dl>
      </Container>
    </section>
  );
}
