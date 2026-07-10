"use client";

import { useEffect, useState } from "react";
import { motion, AnimatePresence, useReducedMotion } from "motion/react";
import { ArrowsLeftRight } from "@phosphor-icons/react";

const PAIRS = [
  ["NGN", "RWF"],
  ["GHS", "KES"],
  ["XAF", "NGN"],
  ["RWF", "NGN"],
  ["KES", "GHS"],
] as const;

/**
 * Inline headline chip that rolls through live corridor pairs:
 * gradient hairline ring, glass-dark interior, and a blur-roll
 * transition inside a measured window so glyphs never clip.
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
    <span className="mx-[0.12em] inline-block translate-y-[-0.1em] rounded-full bg-gradient-to-r from-brand/70 via-acid/40 to-brand/70 p-[2px] align-middle text-[0.5em] shadow-[0_0_28px_rgba(157,255,30,0.18)]">
      <span className="flex items-center rounded-full bg-[#090909] px-[0.75em] py-[0.3em] shadow-[inset_0_1px_0_rgba(255,255,255,0.07)]">
        <span className="relative flex h-[1.2em] items-center overflow-hidden">
          <AnimatePresence mode="wait" initial={false}>
            <motion.span
              key={`${from}-${to}`}
              className="flex items-center gap-[0.38em] whitespace-nowrap font-black leading-none tracking-[0.04em] text-brand"
              initial={
                reduced
                  ? { opacity: 0 }
                  : { y: "1.1em", opacity: 0, filter: "blur(5px)" }
              }
              animate={{ y: 0, opacity: 1, filter: "blur(0px)" }}
              exit={
                reduced
                  ? { opacity: 0 }
                  : { y: "-1.1em", opacity: 0, filter: "blur(5px)" }
              }
              transition={{ duration: 0.45, ease: [0.32, 0.72, 0, 1] }}
            >
              {from}
              <ArrowsLeftRight
                size="0.7em"
                weight="bold"
                className="text-white/60"
                aria-hidden="true"
              />
              {to}
            </motion.span>
          </AnimatePresence>
        </span>
      </span>
    </span>
  );
}
