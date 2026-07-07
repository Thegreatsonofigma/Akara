"use client";

import { motion, useReducedMotion } from "motion/react";
import { CyclingCorridor } from "@/components/product/CyclingCorridor";

const EASE = [0.21, 0.47, 0.32, 0.98] as const;

function Word({
  children,
  index,
  reduced,
}: {
  children: React.ReactNode;
  index: number;
  reduced: boolean;
}) {
  return (
    <motion.span
      className="inline-block"
      initial={{ opacity: 0, y: reduced ? 0 : "0.35em" }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.55, ease: EASE, delay: 0.1 + index * 0.07 }}
    >
      {children}
    </motion.span>
  );
}

/** Word-by-word staggered hero headline with the live corridor chip. */
export function HeroHeadline() {
  const reduced = useReducedMotion();

  return (
    <h1 className="max-w-2xl text-[clamp(2.25rem,11.5vw,3rem)] font-black leading-[1.08] tracking-tight text-white sm:text-6xl sm:leading-[1.06] xl:text-7xl">
      <span className="block whitespace-nowrap">
        <Word index={0} reduced={!!reduced}>
          Swap
        </Word>{" "}
        <Word index={1} reduced={!!reduced}>
          <CyclingCorridor />
        </Word>
      </span>
      <span className="block">
        <Word index={2} reduced={!!reduced}>
          with
        </Word>{" "}
        <Word index={3} reduced={!!reduced}>
          people
        </Word>
      </span>
      <motion.span
        className="inline-block whitespace-nowrap rounded-[0.2em] bg-brand px-[0.12em] text-black"
        initial={{ opacity: 0, y: reduced ? 0 : "0.35em" }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.55, ease: EASE, delay: 0.4 }}
      >
        you can trust.
      </motion.span>
    </h1>
  );
}
