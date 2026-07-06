const ITEMS = [
  { text: "NO CUSTODY", accent: false },
  { text: "NGN ⇄ RWF", accent: true },
  { text: "VERIFIED PEOPLE", accent: false },
  { text: "GHS ⇄ KES", accent: true },
  { text: "RECEIPTS ON RECORD", accent: false },
  { text: "XAF ⇄ NGN", accent: true },
  { text: "PAY EACH OTHER DIRECTLY", accent: false },
  { text: "RWF ⇄ NGN", accent: true },
  { text: "24H DISPUTE WINDOW", accent: false },
  { text: "KES ⇄ GHS", accent: true },
];

function Row() {
  return (
    <div className="flex shrink-0 items-center">
      {ITEMS.map((item) => (
        <span key={item.text} className="flex items-center">
          <span
            className={`whitespace-nowrap font-numbers text-[13px] uppercase tracking-[0.25em] ${
              item.accent ? "text-brand" : "text-white/55"
            }`}
          >
            {item.text}
          </span>
          <span aria-hidden="true" className="mx-6 text-[9px] text-brand/50">
            ✦
          </span>
        </span>
      ))}
    </div>
  );
}

/** Full-bleed, slightly tilted marquee band — the page's pulse line. */
export function TickerBand() {
  return (
    <section
      aria-label="Akara at a glance"
      className="overflow-hidden bg-[#F2F2ED] py-8"
    >
      <p className="sr-only">
        No custody. Verified people. Receipts on record. Users pay each other
        directly across NGN, RWF, GHS, KES, and XAF.
      </p>
      <div
        aria-hidden="true"
        className="relative -mx-[2%] w-[104%] -rotate-[1.2deg] bg-black py-4 shadow-[0_16px_48px_rgba(0,0,0,0.18)]"
      >
        <div className="marquee-track flex w-max">
          <Row />
          <Row />
        </div>
      </div>
    </section>
  );
}
