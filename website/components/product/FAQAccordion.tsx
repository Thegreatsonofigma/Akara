"use client";

import { useId, useState } from "react";
import { motion, AnimatePresence, useReducedMotion } from "motion/react";
import { CaretDown } from "@phosphor-icons/react";

export type FAQItem = {
  question: string;
  answer: string;
};

function AccordionItem({
  item,
  open,
  onToggle,
  light,
}: {
  item: FAQItem;
  open: boolean;
  onToggle: () => void;
  light: boolean;
}) {
  const id = useId();
  const reduced = useReducedMotion();

  return (
    <div
      className={
        light
          ? `overflow-hidden rounded-2xl border bg-white shadow-[0_1px_3px_rgba(0,0,0,0.05)] transition-colors ${
              open ? "border-black/25" : "border-black/[0.08]"
            }`
          : `overflow-hidden rounded-2xl border bg-surface-2 transition-colors ${
              open ? "border-brand/30" : "border-hairline"
            }`
      }
    >
      <h3>
        <button
          type="button"
          className={`flex w-full items-center justify-between gap-4 px-5 py-4 text-left text-[15px] font-semibold transition-colors sm:px-6 sm:py-5 ${
            light ? "text-black" : "text-white hover:text-brand"
          }`}
          aria-expanded={open}
          aria-controls={`${id}-panel`}
          id={`${id}-button`}
          onClick={onToggle}
        >
          {item.question}
          <motion.span
            animate={{ rotate: open ? 180 : 0 }}
            transition={{ duration: reduced ? 0 : 0.25 }}
            className={
              light
                ? open
                  ? "text-black"
                  : "text-black/40"
                : open
                  ? "text-brand"
                  : "text-white/50"
            }
          >
            <CaretDown size={18} aria-hidden="true" />
          </motion.span>
        </button>
      </h3>
      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            id={`${id}-panel`}
            role="region"
            aria-labelledby={`${id}-button`}
            initial={reduced ? { opacity: 0 } : { height: 0, opacity: 0 }}
            animate={reduced ? { opacity: 1 } : { height: "auto", opacity: 1 }}
            exit={reduced ? { opacity: 0 } : { height: 0, opacity: 0 }}
            transition={{ duration: 0.3, ease: [0.4, 0, 0.2, 1] }}
          >
            <p
              className={`px-5 pb-5 text-sm leading-relaxed sm:px-6 sm:pb-6 ${
                light ? "text-black/60" : "text-muted"
              }`}
            >
              {item.answer}
            </p>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

export function FAQAccordion({
  items,
  light = false,
}: {
  items: FAQItem[];
  light?: boolean;
}) {
  const [openIndex, setOpenIndex] = useState<number | null>(0);

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-3">
      {items.map((item, i) => (
        <AccordionItem
          key={item.question}
          item={item}
          open={openIndex === i}
          onToggle={() => setOpenIndex(openIndex === i ? null : i)}
          light={light}
        />
      ))}
    </div>
  );
}
