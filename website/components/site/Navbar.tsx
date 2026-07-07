"use client";

import { useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { usePathname } from "next/navigation";
import { motion, AnimatePresence, useReducedMotion } from "motion/react";
import { List, X, WhatsappLogo } from "@phosphor-icons/react";
import { SITE } from "@/lib/site";
import { cn } from "@/lib/cn";

const NAV_LINKS = [
  { label: "How it works", href: "/#how-it-works" },
  { label: "Safety", href: "/#safety" },
  { label: "Currencies", href: "/#currencies" },
  { label: "Legal", href: "/legal" },
  { label: "Support", href: "/support" },
];

export function Navbar() {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();
  const reduced = useReducedMotion();

  return (
    <header className="fixed inset-x-0 top-3 z-50 px-3 sm:top-4 sm:px-6">
      <div className="mx-auto max-w-5xl">
        <nav
          aria-label="Main navigation"
          className="flex h-14 items-center justify-between rounded-full border border-white/10 bg-black/70 pl-5 pr-2 shadow-[0_12px_48px_rgba(0,0,0,0.55)] backdrop-blur-xl"
        >
          <Link
            href="/"
            className="flex items-center gap-2.5"
            aria-label="Akara home"
            onClick={() => setOpen(false)}
          >
            <Image
              src="/akara-logo-mark.webp"
              alt=""
              width={26}
              height={27}
              priority
            />
            <span className="text-base font-bold tracking-[0.18em] text-brand">
              AKARA
            </span>
          </Link>

          <ul className="hidden items-center gap-1 md:flex">
            {NAV_LINKS.map((link) => {
              const active =
                !link.href.startsWith("/#") && pathname.startsWith(link.href);
              return (
                <li key={link.href}>
                  <Link
                    href={link.href}
                    className={cn(
                      "rounded-full px-4 py-2 text-sm transition-colors",
                      active
                        ? "bg-white/[0.06] text-brand"
                        : "text-white/70 hover:text-white",
                    )}
                  >
                    {link.label}
                  </Link>
                </li>
              );
            })}
          </ul>

          <div className="flex items-center gap-2">
            <a
              href={SITE.whatsappHref}
              target="_blank"
              rel="noopener noreferrer"
              className="hidden items-center gap-2 rounded-full bg-brand px-5 py-2.5 text-sm font-semibold text-black transition-all duration-300 hover:-translate-y-0.5 hover:shadow-[0_8px_32px_rgba(157,255,30,0.35)] md:inline-flex"
            >
              <WhatsappLogo size={18} weight="fill" aria-hidden="true" />
              Try Akara now
            </a>

            <button
              type="button"
              className="inline-flex size-10 items-center justify-center rounded-full border border-white/10 text-white md:hidden"
              aria-expanded={open}
              aria-controls="mobile-menu"
              aria-label={open ? "Close menu" : "Open menu"}
              onClick={() => setOpen((v) => !v)}
            >
              {open ? (
                <X size={20} aria-hidden="true" />
              ) : (
                <List size={20} aria-hidden="true" />
              )}
            </button>
          </div>
        </nav>

        <AnimatePresence>
          {open && (
            <motion.div
              id="mobile-menu"
              className="mt-2 overflow-hidden rounded-3xl border border-white/10 bg-black/90 shadow-[0_24px_64px_rgba(0,0,0,0.6)] backdrop-blur-xl md:hidden"
              initial={reduced ? { opacity: 0 } : { height: 0, opacity: 0 }}
              animate={
                reduced ? { opacity: 1 } : { height: "auto", opacity: 1 }
              }
              exit={reduced ? { opacity: 0 } : { height: 0, opacity: 0 }}
              transition={{ duration: 0.3, ease: [0.4, 0, 0.2, 1] }}
            >
              <ul className="flex flex-col gap-1 p-3">
                {NAV_LINKS.map((link) => (
                  <li key={link.href}>
                    <Link
                      href={link.href}
                      className="block rounded-2xl px-4 py-3 text-base text-white/85 transition-colors hover:bg-white/5 hover:text-white"
                      onClick={() => setOpen(false)}
                    >
                      {link.label}
                    </Link>
                  </li>
                ))}
                <li className="mt-1">
                  <a
                    href={SITE.whatsappHref}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center justify-center gap-2 rounded-full bg-brand px-5 py-3 text-base font-semibold text-black"
                    onClick={() => setOpen(false)}
                  >
                    <WhatsappLogo size={20} weight="fill" aria-hidden="true" />
                    Try Akara now
                  </a>
                </li>
              </ul>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </header>
  );
}
