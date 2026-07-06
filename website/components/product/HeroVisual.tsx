import { PhoneFrame } from "@/components/product/PhoneFrame";
import { WhatsAppChatMockup } from "@/components/product/WhatsAppChatMockup";
import { ListingCard } from "@/components/product/ListingCard";
import { ReceiptCard } from "@/components/product/ReceiptCard";

/**
 * Calm hero composition: the phone is the single hero object, with a
 * tidy, non-overlapping stack of product widgets beside it on wide
 * screens. No rotations, no content obscured.
 */
export function HeroVisual() {
  return (
    <div className="relative flex items-center justify-center gap-6 xl:gap-8">
      {/* glow behind the composition */}
      <div
        aria-hidden="true"
        className="absolute left-1/2 top-1/2 -z-10 size-[520px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-[radial-gradient(circle,rgba(157,255,30,0.14),rgba(157,255,30,0.04)_45%,transparent_70%)]"
      />

      <div className="relative">
        <PhoneFrame className="float-a">
          <WhatsAppChatMockup framed />
        </PhoneFrame>
        <div
          aria-hidden="true"
          className="absolute -bottom-10 left-1/2 -z-10 h-16 w-[380px] max-w-[85vw] -translate-x-1/2 rounded-[50%] bg-brand/15 blur-3xl"
        />
      </div>

      {/* side stack — wide screens only, never overlapping the phone */}
      <div className="hidden w-[270px] shrink-0 flex-col gap-5 xl:flex">
        <ListingCard
          className="float-b"
          have="NGN"
          haveAmount="350,000"
          need="RWF"
          needAmount="412,500"
          reference="AKR-LIST-006"
        />
        <ReceiptCard className="float-a" />
      </div>
    </div>
  );
}
