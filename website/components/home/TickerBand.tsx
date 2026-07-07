const ITEMS = [
  { text: "NO CUSTODY", strong: true },
  { text: "NGN ⇄ RWF", strong: false },
  { text: "VERIFIED PEOPLE", strong: true },
  { text: "GHS ⇄ KES", strong: false },
  { text: "RECEIPTS ON RECORD", strong: true },
  { text: "XAF ⇄ NGN", strong: false },
  { text: "PAY EACH OTHER DIRECTLY", strong: true },
  { text: "RWF ⇄ NGN", strong: false },
  { text: "24H DISPUTE WINDOW", strong: true },
  { text: "KES ⇄ GHS", strong: false },
];

function Row() {
  return (
    <div className="flex shrink-0 items-center">
      {ITEMS.map((item) => (
        <span key={item.text} className="flex items-center">
          <span
            className={`whitespace-nowrap font-numbers text-[13px] uppercase tracking-[0.25em] ${
              item.strong ? "text-black" : "text-black/55"
            }`}
          >
            {item.text}
          </span>
          <span aria-hidden="true" className="mx-6 text-[9px] text-black/40">
            ✦
          </span>
        </span>
      ))}
    </div>
  );
}

/** Full-bleed tilted brand-green ribbon — the page's pulse line. */
export function TickerBand() {
  return (
    <section aria-label="Akara at a glance" className="overflow-hidden py-8">
      <p className="sr-only">
        No custody. Verified people. Receipts on record. Users pay each other
        directly across NGN, RWF, GHS, KES, and XAF.
      </p>
      <div
        aria-hidden="true"
        className="relative -mx-[2%] w-[104%] -rotate-[1.2deg] bg-brand py-4 shadow-[0_16px_64px_rgba(157,255,30,0.25)]"
      >
        <div className="marquee-track flex w-max">
          <Row />
          <Row />
        </div>
      </div>
    </section>
  );
}
