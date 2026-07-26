"use client";

import { FormEvent, useState } from "react";
import Link from "next/link";
import {
  ArrowRight,
  CheckCircle,
  CircleNotch,
  EnvelopeSimple,
  Phone,
} from "@phosphor-icons/react";
import { trackAkaraEvent } from "@/components/analytics/Analytics";

type FormState = "idle" | "submitting" | "success" | "error";

type WaitlistFormProps = {
  source?: string;
};

export function WaitlistForm({ source = "website" }: WaitlistFormProps) {
  const [state, setState] = useState<FormState>("idle");
  const [message, setMessage] = useState("");

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    const email = String(data.get("email") || "").trim();
    const phone = String(data.get("phone") || "").trim();

    if (!email && !phone) {
      setState("error");
      setMessage("Add an email address, a phone number, or both.");
      return;
    }

    setState("submitting");
    setMessage("");

    try {
      const response = await fetch("/api/waitlist", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          email,
          phone,
          source,
          consent: data.get("consent") === "on",
          website: data.get("website"),
        }),
      });
      const result = (await response.json()) as {
        message?: string;
        alreadyJoined?: boolean;
      };

      if (!response.ok) {
        throw new Error(result.message || "We could not save your details.");
      }

      form.reset();
      setState("success");
      setMessage(
        result.alreadyJoined
          ? "You are already on the list. We will keep you posted."
          : "You are on the list. We will tell you when Akara opens.",
      );
      trackAkaraEvent("akara_waitlist_joined", {
        source,
        contact: email && phone ? "email_and_phone" : email ? "email" : "phone",
        returning: Boolean(result.alreadyJoined),
      });
    } catch (error) {
      setState("error");
      setMessage(
        error instanceof Error
          ? error.message
          : "Something went wrong. Please try again.",
      );
      trackAkaraEvent("akara_waitlist_error", { source });
    }
  }

  if (state === "success") {
    return (
      <div
        className="flex min-h-28 w-full max-w-3xl items-center justify-center gap-3 rounded-2xl bg-black px-6 py-5 text-left text-white"
        role="status"
      >
        <CheckCircle
          size={28}
          weight="fill"
          className="shrink-0 text-brand"
          aria-hidden="true"
        />
        <p className="text-base font-semibold">{message}</p>
      </div>
    );
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="w-full max-w-3xl"
      aria-label="Join the Akara waitlist"
    >
      <div className="grid gap-3 md:grid-cols-[1fr_1fr_auto]">
        <label className="group relative">
          <span className="sr-only">Email address</span>
          <EnvelopeSimple
            size={19}
            className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-black/50"
            aria-hidden="true"
          />
          <input
            type="email"
            name="email"
            autoComplete="email"
            inputMode="email"
            placeholder="Email address"
            className="h-14 w-full rounded-2xl border border-black/15 bg-white pl-12 pr-4 text-base font-medium text-black outline-none transition focus:border-black focus:ring-2 focus:ring-black/10"
          />
        </label>

        <label className="group relative">
          <span className="sr-only">Phone number</span>
          <Phone
            size={19}
            className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-black/50"
            aria-hidden="true"
          />
          <input
            type="tel"
            name="phone"
            autoComplete="tel"
            inputMode="tel"
            placeholder="Phone number"
            className="h-14 w-full rounded-2xl border border-black/15 bg-white pl-12 pr-4 text-base font-medium text-black outline-none transition focus:border-black focus:ring-2 focus:ring-black/10"
          />
        </label>

        <button
          type="submit"
          disabled={state === "submitting"}
          className="inline-flex h-14 min-w-40 items-center justify-center gap-2 rounded-2xl bg-black px-6 text-base font-semibold text-white transition hover:bg-black/85 disabled:cursor-wait disabled:opacity-70"
        >
          {state === "submitting" ? (
            <CircleNotch
              size={20}
              className="animate-spin"
              aria-hidden="true"
            />
          ) : (
            <>
              Join waitlist
              <ArrowRight size={18} aria-hidden="true" />
            </>
          )}
        </button>
      </div>

      <label className="mt-4 flex items-start justify-center gap-2 text-left text-xs leading-relaxed text-black/60">
        <input
          type="checkbox"
          name="consent"
          required
          className="mt-0.5 size-4 shrink-0 accent-black"
        />
        <span>
          I agree to receive Akara launch updates. I can opt out at any time.{" "}
          <Link
            href="/legal/privacy-policy"
            className="font-semibold text-black underline underline-offset-2"
          >
            Privacy notice
          </Link>
        </span>
      </label>

      <label className="sr-only" aria-hidden="true">
        Website
        <input
          type="text"
          name="website"
          tabIndex={-1}
          autoComplete="off"
        />
      </label>

      {message ? (
        <p
          className={`mt-3 text-center text-sm font-semibold ${
            state === "error" ? "text-[#9B1027]" : "text-black/70"
          }`}
          role={state === "error" ? "alert" : "status"}
        >
          {message}
        </p>
      ) : null}
    </form>
  );
}
