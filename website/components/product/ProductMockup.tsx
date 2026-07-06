import { ArrowRight } from "@phosphor-icons/react/dist/ssr";
import { WhatsAppChatMockup } from "@/components/product/WhatsAppChatMockup";
import { ListingCard } from "@/components/product/ListingCard";
import { TradeTracker } from "@/components/product/TradeTracker";
import { ReceiptCard } from "@/components/product/ReceiptCard";
import { CorridorChip } from "@/components/product/CurrencyChip";

const CORRIDORS = [
  { from: "NGN", to: "RWF" },
  { from: "GHS", to: "KES" },
  { from: "XAF", to: "NGN" },
];

export function ProductMockup() {
  return (
    <div className="relative mx-auto w-full max-w-5xl">
      <div className="grid items-start gap-5 lg:grid-cols-[minmax(0,1.05fr)_minmax(0,1fr)] lg:gap-8">
        <WhatsAppChatMockup className="mx-auto max-w-md lg:mx-0" />

        <div className="flex flex-col gap-5 lg:pt-6">
          <ListingCard
            className="float-a"
            have="NGN"
            haveAmount="350,000"
            need="RWF"
            needAmount="412,500"
            reference="AKR-LIST-006"
          />
          <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-1 xl:grid-cols-2">
            <TradeTracker className="float-b" />
            <ReceiptCard className="float-a sm:mt-6 lg:mt-0 xl:mt-6" />
          </div>
        </div>
      </div>

      <div className="mt-8 flex flex-col items-center gap-4">
        <p className="flex flex-wrap items-center justify-center gap-x-2 gap-y-1 rounded-full border border-white/12 bg-white/[0.03] px-4 py-2 text-center text-xs text-white/75">
          <span className="font-medium text-white">User A</span>
          <ArrowRight size={13} className="text-brand" aria-hidden="true" />
          <span>pays</span>
          <span className="font-medium text-white">User B</span>
          <span>directly</span>
          <span aria-hidden="true" className="mx-1 hidden text-white/25 sm:inline">
            |
          </span>
          <span className="text-brand">Akara coordinates — never holds funds</span>
        </p>

        <ul className="flex flex-wrap items-center justify-center gap-3" aria-label="Example currency corridors">
          {CORRIDORS.map((c) => (
            <li key={`${c.from}-${c.to}`}>
              <CorridorChip from={c.from} to={c.to} />
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
