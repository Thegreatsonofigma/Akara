import { PhoneFrame } from "@/components/product/PhoneFrame";
import { WhatsAppChatMockup } from "@/components/product/WhatsAppChatMockup";
import { ListingCard } from "@/components/product/ListingCard";
import { ReceiptCard } from "@/components/product/ReceiptCard";
import { CorridorChip } from "@/components/product/CurrencyChip";

export function HeroVisual() {
  return (
    <div className="relative mx-auto w-fit">
      {/* glow behind the phone */}
      <div
        aria-hidden="true"
        className="absolute left-1/2 top-1/2 -z-10 size-[480px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-[radial-gradient(circle,rgba(157,255,30,0.16),rgba(157,255,30,0.04)_45%,transparent_70%)]"
      />

      <PhoneFrame className="float-a mx-auto">
        <WhatsAppChatMockup framed />
      </PhoneFrame>

      {/* floating product widgets — desktop composition */}
      <ListingCard
        className="float-b absolute -left-56 top-14 z-10 hidden w-[290px] -rotate-3 xl:block"
        have="NGN"
        haveAmount="350,000"
        need="RWF"
        needAmount="412,500"
        reference="AKR-LIST-006"
      />
      <ReceiptCard className="float-a absolute -right-48 bottom-16 z-10 hidden w-[280px] rotate-2 xl:block" />

      <div className="float-b absolute -right-28 top-10 hidden xl:block">
        <CorridorChip from="NGN" to="RWF" />
      </div>
      <div className="float-a absolute -left-36 bottom-10 hidden xl:flex items-center gap-2 rounded-full border border-white/15 bg-black/80 px-4 py-2 text-xs text-white backdrop-blur">
        <span aria-hidden="true" className="size-1.5 rounded-full bg-brand" />
        Akara never holds the money
      </div>

      {/* compact composition for smaller screens */}
      <div className="mt-6 w-[290px] sm:w-[330px] xl:hidden">
        <ListingCard
          have="NGN"
          haveAmount="350,000"
          need="RWF"
          needAmount="412,500"
          reference="AKR-LIST-006"
        />
      </div>
    </div>
  );
}
