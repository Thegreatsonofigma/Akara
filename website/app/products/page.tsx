import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Products by Akara",
  description:
    "Explore the products built by Akara, including peer-to-peer exchange coordination and Dooowring home services.",
  alternates: { canonical: "/products" },
};

const qualities = [
  "Made for everyday life in Africa",
  "Clear, human-first experiences",
  "Built around trust and useful outcomes",
];

export default function ProductsPage() {
  return (
    <main id="main-content" className="min-h-screen overflow-hidden bg-[#050505] pt-28 sm:pt-32">
      <section className="relative px-4 pb-14 sm:px-6 sm:pb-20">
        <div className="pointer-events-none absolute inset-0 aurora" aria-hidden="true" />
        <div className="pointer-events-none absolute inset-0 bg-grid" aria-hidden="true" />

        <div className="relative mx-auto max-w-6xl">
          <div className="max-w-4xl">
            <p className="mb-6 text-xs font-bold tracking-[0.24em] text-brand sm:text-sm">
              THE AKARA PRODUCT HUB
            </p>
            <h1 className="max-w-4xl text-5xl font-semibold leading-[0.94] tracking-[-0.055em] text-white sm:text-7xl lg:text-8xl">
              Useful products. One home.
            </h1>
            <p className="mt-7 max-w-2xl text-lg leading-relaxed text-muted sm:text-xl">
              Akara is where our products live—different ideas, built with the
              same care for clarity, trust, and the way people actually live.
            </p>
          </div>
        </div>
      </section>

      <section className="px-4 pb-20 sm:px-6 sm:pb-28">
        <div className="mx-auto grid max-w-6xl gap-5 lg:grid-cols-2">
          <Link
            href="/"
            className="group relative flex min-h-[31rem] flex-col overflow-hidden rounded-[2rem] border border-white/10 bg-[#101010] p-7 transition duration-300 hover:-translate-y-1 hover:border-brand/40 sm:p-9"
          >
            <div className="absolute inset-0 bg-[radial-gradient(circle_at_90%_10%,rgba(157,255,30,0.18),transparent_34%)]" />
            <div className="relative flex items-center justify-between">
              <span className="rounded-full border border-brand/25 bg-brand/10 px-3 py-1.5 text-xs font-bold tracking-[0.16em] text-brand">
                AKARA EXCHANGE
              </span>
              <span className="flex size-12 items-center justify-center rounded-full bg-brand text-xl text-black transition-transform duration-300 group-hover:rotate-45">
                ↗
              </span>
            </div>

            <div className="relative mt-auto">
              <div className="mb-8 flex items-end gap-2" aria-hidden="true">
                <span className="h-28 w-16 rounded-full bg-brand" />
                <span className="h-20 w-20 rounded-full border-[18px] border-electric" />
                <span className="h-14 w-32 rounded-full bg-white/10" />
              </div>
              <h2 className="text-4xl font-semibold leading-none tracking-[-0.045em] text-white sm:text-5xl">
                Exchange, coordinated on WhatsApp.
              </h2>
              <p className="mt-5 max-w-lg text-base leading-relaxed text-muted sm:text-lg">
                Discover verified people, agree on a rate, and coordinate a
                direct peer-to-peer currency exchange without giving Akara
                custody of your funds.
              </p>
            </div>
          </Link>

          <Link
            href="/dooowring"
            className="group relative flex min-h-[31rem] flex-col overflow-hidden rounded-[2rem] border border-white/10 bg-[#0060D6] transition duration-300 hover:-translate-y-1 hover:border-white/40"
          >
            <Image
              src="/products/dooowring-social-card.png"
              alt="A Dooowring laundry agent carrying freshly folded clothes"
              fill
              sizes="(min-width: 1024px) 50vw, 100vw"
              className="object-cover transition-transform duration-700 group-hover:scale-[1.025]"
            />
            <div className="absolute inset-0 bg-gradient-to-t from-[#10253F] via-[#10253F]/25 to-transparent" />
            <div className="relative flex items-center justify-between p-7 sm:p-9">
              <span className="rounded-full bg-[#F04F78] px-3 py-1.5 text-xs font-bold tracking-[0.16em] text-white">
                DOOOWRING
              </span>
              <span className="flex size-12 items-center justify-center rounded-full bg-white text-xl text-[#10253F] transition-transform duration-300 group-hover:rotate-45">
                ↗
              </span>
            </div>
            <div className="relative mt-auto p-7 sm:p-9">
              <p className="text-sm font-bold tracking-[0.16em] text-[#6BC5F2]">
                HOME SERVICES · KIGALI
              </p>
              <h2 className="mt-3 max-w-lg text-4xl font-semibold leading-none tracking-[-0.045em] text-white sm:text-5xl">
                Chores go in. Your time comes back.
              </h2>
            </div>
          </Link>
        </div>
      </section>

      <section className="border-t border-white/8 bg-[#0b0b0b] px-4 py-16 sm:px-6 sm:py-20">
        <div className="mx-auto max-w-6xl">
          <p className="max-w-2xl text-2xl font-medium leading-tight tracking-[-0.025em] text-white sm:text-3xl">
            One standard across every product: make something people are glad
            exists.
          </p>
          <ul className="mt-10 grid gap-3 md:grid-cols-3">
            {qualities.map((quality, index) => (
              <li
                key={quality}
                className="rounded-2xl border border-white/8 bg-white/[0.035] p-5 text-sm text-muted"
              >
                <span className="mb-5 block font-numbers text-brand">
                  0{index + 1}
                </span>
                {quality}
              </li>
            ))}
          </ul>
        </div>
      </section>
    </main>
  );
}
