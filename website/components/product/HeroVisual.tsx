import Image from "next/image";
import { PhoneFrame } from "@/components/product/PhoneFrame";
import { WhatsAppChatMockup } from "@/components/product/WhatsAppChatMockup";
import { ReceiptCard } from "@/components/product/ReceiptCard";
import { IMAGES } from "@/lib/images";

/**
 * Humanized hero collage: a real person behind the product. Portrait
 * photo card at the back, phone running the chat in front, verified
 * receipt floating beside it.
 */
export function HeroVisual() {
  return (
    <div className="relative mx-auto w-fit pb-10 pr-0 sm:pr-24 lg:pb-14">
      {/* portrait photo card, tucked behind the phone */}
      <div className="absolute -right-4 top-8 hidden h-[420px] w-[320px] rotate-[4deg] overflow-hidden rounded-[2rem] shadow-[0_32px_80px_rgba(0,0,0,0.28)] sm:block">
        <Image
          src={IMAGES.heroPortrait.src}
          alt={IMAGES.heroPortrait.alt}
          fill
          priority
          sizes="320px"
          className="object-cover"
        />
        <div
          aria-hidden="true"
          className="absolute inset-0 bg-gradient-to-t from-black/35 via-transparent to-transparent"
        />
        <p className="absolute bottom-4 left-4 rounded-full bg-black/70 px-3.5 py-1.5 text-xs font-medium text-white backdrop-blur">
          Verified · Kigali 🇷🇼
        </p>
      </div>

      <PhoneFrame className="float-a relative z-10">
        <WhatsAppChatMockup framed />
      </PhoneFrame>

      <ReceiptCard className="float-b absolute -bottom-2 -right-2 z-20 hidden w-[270px] rotate-[-2deg] shadow-[0_32px_80px_rgba(0,0,0,0.3)] sm:block lg:-right-10" />

      {/* floor shadow */}
      <div
        aria-hidden="true"
        className="absolute -bottom-8 left-1/2 -z-10 h-16 w-[440px] max-w-[90vw] -translate-x-1/2 rounded-[50%] bg-black/20 blur-3xl"
      />
    </div>
  );
}
