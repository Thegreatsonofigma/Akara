import Image from "next/image";
import { SealCheck, Checks, Microphone } from "@phosphor-icons/react/dist/ssr";
import { cn } from "@/lib/cn";

function BotBubble({ children }: { children: React.ReactNode }) {
  return (
    <div className="max-w-[85%] rounded-2xl rounded-tl-md border border-white/[0.06] bg-surface-3 px-3.5 py-2.5 text-[13px] leading-relaxed text-white/85">
      {children}
    </div>
  );
}

function UserBubble({
  children,
  time,
}: {
  children: React.ReactNode;
  time: string;
}) {
  return (
    <div className="ml-auto max-w-[85%] rounded-2xl rounded-tr-md border border-brand/20 bg-brand/12 px-3.5 py-2.5 text-[13px] leading-relaxed text-white">
      {children}
      <span className="mt-1 flex items-center justify-end gap-1 text-[10px] text-white/50">
        {time}
        <Checks size={13} className="text-brand" aria-hidden="true" />
      </span>
    </div>
  );
}

export function WhatsAppChatMockup({
  className,
  framed = false,
}: {
  className?: string;
  framed?: boolean;
}) {
  return (
    <div
      className={cn(
        "flex w-full flex-col overflow-hidden bg-surface-2",
        framed
          ? "rounded-none border-0"
          : "rounded-3xl border border-hairline shadow-[0_32px_80px_rgba(0,0,0,0.6)]",
        className,
      )}
      role="img"
      aria-label="Preview of an Akara conversation on WhatsApp: a user asks to swap Nigerian naira for Rwandan francs and Akara replies with verified offers"
    >
      <div
        className={cn(
          "flex items-center gap-3 border-b border-hairline bg-black/60 px-4 py-3",
          framed && "pt-10",
        )}
      >
        <span className="flex size-9 items-center justify-center rounded-full bg-black ring-1 ring-brand/40">
          <Image src="/akara-logo-mark.png" alt="" width={20} height={20} />
        </span>
        <div className="flex flex-col">
          <span className="flex items-center gap-1.5 text-sm font-semibold text-white">
            Akara
            <SealCheck
              size={14}
              weight="fill"
              className="text-brand"
              aria-hidden="true"
            />
          </span>
          <span className="text-[11px] text-faint">online</span>
        </div>
        <span className="ml-auto rounded-full border border-white/12 bg-white/[0.04] px-2.5 py-1 text-[10px] text-white/70">
          WhatsApp
        </span>
      </div>

      <div className="flex flex-col gap-2.5 px-4 py-4">
        <BotBubble>
          Welcome back, Ada 👋 Post a rate, find a deal, or reserve one.
        </BotBubble>

        <UserBubble time="7:24 PM">
          I have 350,000 NGN and want RWF
        </UserBubble>

        <BotBubble>
          <span className="mb-1.5 flex items-center gap-1.5 font-semibold text-white">
            <span
              aria-hidden="true"
              className="size-1.5 rounded-full bg-brand"
            />
            3 verified offers found
          </span>
          Best match:{" "}
          <span className="font-numbers tracking-wider text-brand">
            350,000 NGN
          </span>{" "}
          ⇄{" "}
          <span className="font-numbers tracking-wider text-brand">
            412,500 RWF
          </span>
          <span className="mt-1.5 block rounded-lg border border-white/[0.08] bg-black/50 px-2.5 py-1.5 font-numbers text-[11px] tracking-widest text-white/70">
            open AKR-LIST-006
          </span>
        </BotBubble>

        <BotBubble>
          Open the trade to lock payout details, upload your receipt, and track
          every step. Akara never holds the money.
        </BotBubble>
      </div>

      <div className="flex items-center gap-2.5 border-t border-hairline bg-black/60 px-4 py-3">
        <span className="flex-1 rounded-full border border-white/[0.07] bg-white/[0.03] px-4 py-2 text-[12px] text-faint">
          Type a message
        </span>
        <span
          aria-hidden="true"
          className="flex size-9 items-center justify-center rounded-full bg-brand text-black"
        >
          <Microphone size={16} weight="fill" />
        </span>
      </div>
    </div>
  );
}
