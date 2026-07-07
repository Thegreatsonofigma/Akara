import { PhoneFrame } from "@/components/product/PhoneFrame";
import { WhatsAppChatMockup } from "@/components/product/WhatsAppChatMockup";
import { ReceiptCard } from "@/components/product/ReceiptCard";

/**
 * Clean hero composition: the phone running the chat, one verified
 * receipt floating beside it, grounded by a soft glow.
 */
export function HeroVisual() {
  return (
    <div className="relative mx-auto w-fit pb-8 sm:pr-20">
      {/* glow behind the composition */}
      <div
        aria-hidden="true"
        className="absolute left-1/2 top-1/2 -z-10 size-[520px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-[radial-gradient(circle,rgba(157,255,30,0.15),rgba(157,255,30,0.04)_45%,transparent_70%)]"
      />

      <PhoneFrame className="float-a">
        <WhatsAppChatMockup framed />
      </PhoneFrame>

      <ReceiptCard className="float-b absolute -bottom-2 right-0 z-20 hidden w-[270px] rotate-[-2deg] shadow-[0_32px_80px_rgba(0,0,0,0.55)] sm:block sm:-right-8 lg:-right-14" />

      {/* floor shadow */}
      <div
        aria-hidden="true"
        className="absolute -bottom-6 left-1/2 -z-10 h-14 w-[400px] max-w-[85vw] -translate-x-1/2 rounded-[50%] bg-brand/15 blur-3xl"
      />
    </div>
  );
}
