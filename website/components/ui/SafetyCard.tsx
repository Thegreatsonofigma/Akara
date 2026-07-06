import type { Icon } from "@phosphor-icons/react";
import { Reveal } from "@/components/motion/Reveal";

export function SafetyCard({
  icon: IconComponent,
  title,
  copy,
  delay = 0,
}: {
  icon: Icon;
  title: string;
  copy?: string;
  delay?: number;
}) {
  return (
    <Reveal delay={delay} className="h-full">
      <div className="flex h-full flex-col gap-3 rounded-2xl border border-hairline bg-surface-2 p-5 transition-all duration-300 hover:border-brand/35 hover:bg-surface-3">
        <span className="flex size-10 items-center justify-center rounded-xl border border-brand/20 bg-brand/[0.07]">
          <IconComponent size={20} className="text-brand" aria-hidden="true" />
        </span>
        <p className="text-sm font-semibold text-white">{title}</p>
        {copy && <p className="text-[13px] leading-relaxed text-faint">{copy}</p>}
      </div>
    </Reveal>
  );
}
