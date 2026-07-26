"use client";

import { useEffect, useId, useRef } from "react";
import type { MouseEvent, ReactNode } from "react";
import { X } from "@phosphor-icons/react";
import { WaitlistForm } from "@/components/waitlist/WaitlistForm";

type WaitlistDialogProps = {
  children: ReactNode;
  className?: string;
  source?: string;
  onOpen?: () => void;
};

export function WaitlistDialog({
  children,
  className,
  source = "website_popup",
  onOpen,
}: WaitlistDialogProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const titleId = useId();

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;

    const handleClose = () => {
      document.documentElement.style.overflow = "";
    };

    dialog.addEventListener("close", handleClose);
    return () => {
      dialog.removeEventListener("close", handleClose);
      document.documentElement.style.overflow = "";
    };
  }, []);

  function openDialog() {
    onOpen?.();
    document.documentElement.style.overflow = "hidden";
    dialogRef.current?.showModal();
  }

  function closeDialog() {
    dialogRef.current?.close();
  }

  function handleBackdropClick(event: MouseEvent<HTMLDialogElement>) {
    if (event.target === event.currentTarget) closeDialog();
  }

  return (
    <>
      <button type="button" onClick={openDialog} className={className}>
        {children}
      </button>

      <dialog
        ref={dialogRef}
        aria-labelledby={titleId}
        onClick={handleBackdropClick}
        className="m-auto w-[calc(100%_-_2rem)] max-w-3xl overflow-visible bg-transparent p-0 text-white backdrop:bg-black/80 backdrop:backdrop-blur-md"
      >
        <div className="relative overflow-hidden rounded-3xl border border-white/10 bg-[#0D0D0D] px-5 py-8 shadow-[0_24px_90px_rgba(0,0,0,0.58)] sm:px-9 sm:py-10">
          <button
            type="button"
            onClick={closeDialog}
            className="absolute right-4 top-4 inline-flex size-10 items-center justify-center rounded-full border border-white/10 bg-white/[0.04] text-white/65 transition hover:bg-white/[0.1] hover:text-white"
            aria-label="Close waitlist"
          >
            <X size={19} aria-hidden="true" />
          </button>

          <div className="mb-7 pr-12">
            <p className="mb-3 text-xs font-bold uppercase tracking-[0.18em] text-brand">
              Akara private launch
            </p>
            <h2
              id={titleId}
              className="max-w-xl text-balance text-3xl font-black leading-tight text-white sm:text-4xl"
            >
              Get the message when Akara opens.
            </h2>
            <p className="mt-3 max-w-xl text-sm leading-relaxed text-white/55 sm:text-base">
              Leave an email, phone number, or both. We will only use them for
              launch access and important Akara updates.
            </p>
          </div>

          <WaitlistForm source={source} tone="dark" />
        </div>
      </dialog>
    </>
  );
}
