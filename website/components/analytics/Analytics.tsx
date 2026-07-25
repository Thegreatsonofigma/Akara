"use client";

import Script from "next/script";
import { usePathname } from "next/navigation";
import { useEffect, useRef } from "react";

type AnalyticsValue = string | number | boolean | null | undefined;
type AnalyticsProps = Record<string, AnalyticsValue>;
type CleanAnalyticsProps = Record<string, string | number | boolean>;
type PlausibleFunction = (
  eventName: string,
  options?: { props?: CleanAnalyticsProps; u?: string },
) => void;

const GA_ID = process.env.NEXT_PUBLIC_GA_MEASUREMENT_ID;
const PLAUSIBLE_DOMAIN = process.env.NEXT_PUBLIC_PLAUSIBLE_DOMAIN;
const PLAUSIBLE_SCRIPT_URL =
  process.env.NEXT_PUBLIC_PLAUSIBLE_SCRIPT_URL || "https://plausible.io/js/script.js";

declare global {
  interface Window {
    dataLayer?: unknown[];
    gtag?: (...args: unknown[]) => void;
    plausible?: PlausibleFunction & { q?: unknown[] };
  }
}

function cleanProps(props: AnalyticsProps = {}): CleanAnalyticsProps {
  return Object.fromEntries(
    Object.entries(props).filter(
      (entry): entry is [string, string | number | boolean] =>
        typeof entry[1] === "string" ||
        typeof entry[1] === "number" ||
        typeof entry[1] === "boolean",
    ),
  );
}

export function trackAkaraEvent(eventName: string, props: AnalyticsProps = {}) {
  if (typeof window === "undefined") return;

  const clean = cleanProps(props);
  window.gtag?.("event", eventName, clean);
  window.plausible?.(eventName, { props: clean });
}

export function Analytics() {
  const pathname = usePathname();
  const scrollDepths = useRef<Set<number>>(new Set());

  useEffect(() => {
    scrollDepths.current = new Set();
    const pagePath = pathname || "/";

    if (GA_ID) {
      window.gtag?.("config", GA_ID, {
        page_path: pagePath,
        page_location: window.location.href,
      });
    }

    if (PLAUSIBLE_DOMAIN) {
      window.plausible?.("pageview", { u: window.location.href });
    }

    trackAkaraEvent("akara_page_view", { path: pagePath });
  }, [pathname]);

  useEffect(() => {
    const handleClick = (event: MouseEvent) => {
      const target = event.target as Element | null;
      const anchor = target?.closest<HTMLAnchorElement>("a[href]");
      if (!anchor) return;

      const href = anchor.href;
      const label = anchor.textContent?.trim().slice(0, 80) || "unlabeled";
      const url = new URL(href, window.location.href);

      if (href.startsWith("mailto:")) {
        trackAkaraEvent("akara_email_click", { label, href: anchor.getAttribute("href") || href });
        return;
      }

      if (href.includes("wa.me") || href.toLowerCase().includes("whatsapp")) {
        trackAkaraEvent("akara_whatsapp_cta", { label, path: window.location.pathname });
        return;
      }

      if (url.origin !== window.location.origin) {
        trackAkaraEvent("akara_external_link_click", { label, href });
        return;
      }

      trackAkaraEvent("akara_internal_nav_click", { label, path: url.pathname });
    };

    const handleScroll = () => {
      const scrollableHeight = document.documentElement.scrollHeight - window.innerHeight;
      if (scrollableHeight <= 0) return;

      const currentDepth = Math.round((window.scrollY / scrollableHeight) * 100);
      for (const depth of [25, 50, 75, 90]) {
        if (currentDepth >= depth && !scrollDepths.current.has(depth)) {
          scrollDepths.current.add(depth);
          trackAkaraEvent("akara_scroll_depth", {
            depth,
            path: window.location.pathname,
          });
        }
      }
    };

    document.addEventListener("click", handleClick);
    window.addEventListener("scroll", handleScroll, { passive: true });

    const engagedTimer = window.setTimeout(() => {
      trackAkaraEvent("akara_engaged_session", { path: window.location.pathname, seconds: 30 });
    }, 30000);

    return () => {
      document.removeEventListener("click", handleClick);
      window.removeEventListener("scroll", handleScroll);
      window.clearTimeout(engagedTimer);
    };
  }, []);

  return (
    <>
      {GA_ID ? (
        <>
          <Script src={`https://www.googletagmanager.com/gtag/js?id=${GA_ID}`} strategy="afterInteractive" />
          <Script id="akara-ga" strategy="afterInteractive">
            {`
              window.dataLayer = window.dataLayer || [];
              function gtag(){dataLayer.push(arguments);}
              window.gtag = gtag;
              gtag('js', new Date());
              gtag('config', '${GA_ID}', { send_page_view: false });
            `}
          </Script>
        </>
      ) : null}

      {PLAUSIBLE_DOMAIN ? (
        <>
          <Script id="akara-plausible-init" strategy="afterInteractive">
            {`
              window.plausible = window.plausible || function(){(window.plausible.q = window.plausible.q || []).push(arguments)}
            `}
          </Script>
          <Script
            defer
            data-domain={PLAUSIBLE_DOMAIN}
            src={PLAUSIBLE_SCRIPT_URL}
            strategy="afterInteractive"
          />
        </>
      ) : null}
    </>
  );
}
