"use client";

import { motion, useReducedMotion } from "motion/react";
import {
  PaperPlaneTilt,
  FileArrowUp,
  HourglassMedium,
  Flag,
  UserGear,
  CheckCircle,
} from "@phosphor-icons/react";

const STAGES = [
  { label: "Payment marked sent", icon: PaperPlaneTilt, tone: "green" },
  { label: "Receipt uploaded", icon: FileArrowUp, tone: "green" },
  { label: "Waiting for confirmation", icon: HourglassMedium, tone: "acid" },
  { label: "Dispute raised", icon: Flag, tone: "pink" },
  { label: "Admin review", icon: UserGear, tone: "blue" },
  { label: "Resolved", icon: CheckCircle, tone: "green" },
] as const;

const TONE_STYLES = {
  green: "border-brand/35 bg-brand/10 text-brand",
  acid: "border-acid/35 bg-acid/10 text-acid",
  pink: "border-pink/40 bg-pink/10 text-pink",
  blue: "border-electric/50 bg-electric/15 text-[#a9b4ff]",
} as const;

export function DisputeTimeline() {
  const reduced = useReducedMotion();

  return (
    <ol className="relative mx-auto flex max-w-3xl flex-col gap-0 sm:gap-1">
      {STAGES.map((stage, i) => (
        <motion.li
          key={stage.label}
          className="flex gap-4"
          initial={{ opacity: 0, x: reduced ? 0 : -16 }}
          whileInView={{ opacity: 1, x: 0 }}
          viewport={{ once: true, margin: "-40px" }}
          transition={{ duration: 0.5, delay: i * 0.1, ease: [0.21, 0.47, 0.32, 0.98] }}
        >
          <div className="flex flex-col items-center">
            <span
              className={`flex size-11 shrink-0 items-center justify-center rounded-full border ${TONE_STYLES[stage.tone]}`}
            >
              <stage.icon size={20} aria-hidden="true" />
            </span>
            {i < STAGES.length - 1 && (
              <span
                aria-hidden="true"
                className="my-1 h-8 w-px border-l border-dashed border-white/20"
              />
            )}
          </div>
          <div className="pt-2.5">
            <p className="text-sm font-medium text-white sm:text-base">
              {stage.label}
            </p>
          </div>
        </motion.li>
      ))}
    </ol>
  );
}
