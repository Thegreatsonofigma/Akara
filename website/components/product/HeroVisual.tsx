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

      {/* floor glow grounding the phone */}
      <div
        aria-hidden="true"
        className="absolute -bottom-12 left-1/2 -z-10 h-20 w-[420px] max-w-[90vw] -translate-x-1/2 rounded-[50%] bg-brand/15 blur-3xl"
      />

      {/* floating product widgets — desktop composition */}
      <ListingCard
        className="float-b absolute -bottom-8 -left-44 z-10 hidden w-[290px] -rotate-3 xl:block"
        have="NGN"
        haveAmount="350,000"
        need="RWF"
        needAmount="412,500"
        reference="AKR-LIST-006"
      />
      <ReceiptCard className="float-a absolute -right-48 bottom-24 z-10 hidden w-[280px] rotate-2 xl:block" />

      <div className="float-b absolute -right-28 top-10 hidden xl:block">
        <CorridorChip from="NGN" to="RWF" />
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
