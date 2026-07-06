"use client";

import { useEffect, useState } from "react";
import { motion, AnimatePresence, useReducedMotion } from "motion/react";

const PAIRS = [
  ["NGN", "RWF"],
  ["GHS", "KES"],
  ["XAF", "NGN"],
  ["RWF", "NGN"],
  ["KES", "GHS"],
] as const;

/**
 * Inline headline chip that rolls through live corridor pairs.
 * Sized in em units so it scales with the surrounding heading.
 */
export function CyclingCorridor() {
  const [index, setIndex] = useState(0);
  const reduced = useReducedMotion();

  useEffect(() => {
    if (reduced) return;
    const id = setInterval(
      () => setIndex((i) => (i + 1) % PAIRS.length),
      2400,
    );
    return () => clearInterval(id);
  }, [reduced]);

  const [from, to] = PAIRS[index];

  return (
    <span className="relative mx-[0.08em] inline-flex translate-y-[-0.05em] items-center overflow-hidden rounded-[0.6em] border border-brand/35 bg-brand/[0.08] px-[0.3em] py-[0.05em] align-middle">
      <AnimatePresence mode="popLayout" initial={false}>
        <motion.span
          key={`${from}-${to}`}
          className="inline-flex items-center gap-[0.22em] whitespace-nowrap font-numbers text-[0.62em] leading-none tracking-wide text-brand"
          initial={reduced ? { opacity: 0 } : { y: "0.9em", opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          exit={reduced ? { opacity: 0 } : { y: "-0.9em", opacity: 0 }}
          transition={{ duration: 0.4, ease: [0.21, 0.47, 0.32, 0.98] }}
        >
          {from}
          <span aria-hidden="true" className="text-[0.75em]">
            ⇄
          </span>
          {to}
        </motion.span>
      </AnimatePresence>
    </span>
  );
}
