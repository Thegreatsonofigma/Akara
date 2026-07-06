import type { Icon } from "@phosphor-icons/react";
import { Reveal } from "@/components/motion/Reveal";

export function SupportCard({
  icon: IconComponent,
  title,
  children,
  delay = 0,
}: {
  icon: Icon;
  title: string;
  children: React.ReactNode;
  delay?: number;
}) {
  return (
    <Reveal delay={delay} className="h-full">
      <div className="flex h-full flex-col gap-4 rounded-2xl border border-hairline bg-surface-2 p-6 transition-all duration-300 hover:border-brand/35">
        <span className="flex size-11 items-center justify-center rounded-xl border border-brand/20 bg-brand/[0.07]">
          <IconComponent size={22} className="text-brand" aria-hidden="true" />
        </span>
        <p className="text-base font-semibold text-white">{title}</p>
        <div className="text-sm leading-relaxed text-muted">{children}</div>
      </div>
    </Reveal>
  );
}
