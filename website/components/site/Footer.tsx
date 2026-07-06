import Link from "next/link";
import Image from "next/image";
import { SITE, BUSINESS, MANDATORY_WORDING } from "@/lib/site";

const PRODUCT_LINKS = [
  { label: "How it works", href: "/#how-it-works" },
  { label: "Supported currencies", href: "/#currencies" },
  { label: "Safety", href: "/#safety" },
  { label: "Trust", href: "/trust" },
  { label: "Support", href: "/support" },
];

const LEGAL_LINKS = [
  { label: "Privacy Policy", href: "/legal/privacy-policy" },
  { label: "Terms of Service", href: "/legal/terms-of-service" },
  { label: "No-Custody Risk Disclosure", href: "/legal/no-custody-risk-disclosure" },
  { label: "KYC Consent", href: "/legal/kyc-and-identity-verification-consent" },
  { label: "Payout Name-Match Policy", href: "/legal/payout-details-and-account-name-match-policy" },
  { label: "AML and Fraud Prevention", href: "/legal/aml-and-fraud-prevention-policy" },
  { label: "Acceptable Use", href: "/legal/acceptable-use-policy" },
  { label: "Prohibited Transactions", href: "/legal/prohibited-transactions-policy" },
  { label: "Data Deletion", href: "/legal/data-deletion-policy" },
  { label: "All policies", href: "/legal" },
];

export function Footer() {
  return (
    <footer className="border-t border-hairline bg-surface">
      <div className="mx-auto w-full max-w-6xl px-5 py-16 sm:px-8">
        <div className="grid gap-12 md:grid-cols-[1.4fr_1fr_1fr_1.2fr]">
          <div className="flex flex-col gap-4">
            <Link href="/" className="flex items-center gap-2.5" aria-label="Akara home">
              <Image src="/akara-logo-mark.png" alt="" width={28} height={29} />
              <span className="text-lg font-bold tracking-[0.18em] text-brand">
                AKARA
              </span>
            </Link>
            <p className="max-w-xs text-sm leading-relaxed text-faint">
              Peer-to-peer currency exchange, coordinated on WhatsApp. Verified
              users, receipt-backed trades, and a clear record of every step.
            </p>
            <div className="mt-2 inline-flex w-fit items-center gap-2 rounded-full border border-white/15 bg-white/[0.04] px-3 py-1.5 text-xs text-white">
              <span aria-hidden="true" className="size-1.5 rounded-full bg-brand" />
              No custody — users pay each other directly
            </div>
          </div>

          <nav aria-label="Product links">
            <h2 className="mb-4 text-sm font-semibold text-white">Product</h2>
            <ul className="flex flex-col gap-2.5">
              {PRODUCT_LINKS.map((link) => (
                <li key={link.href}>
                  <Link
                    href={link.href}
                    className="text-sm text-muted transition-colors hover:text-brand"
                  >
                    {link.label}
                  </Link>
                </li>
              ))}
            </ul>
          </nav>

          <nav aria-label="Legal links">
            <h2 className="mb-4 text-sm font-semibold text-white">Legal</h2>
            <ul className="flex flex-col gap-2.5">
              {LEGAL_LINKS.map((link) => (
                <li key={link.href}>
                  <Link
                    href={link.href}
                    className="text-sm text-muted transition-colors hover:text-brand"
                  >
                    {link.label}
                  </Link>
                </li>
              ))}
            </ul>
          </nav>

          <div>
            <h2 className="mb-4 text-sm font-semibold text-white">Company</h2>
            <ul className="flex flex-col gap-2.5 text-sm text-muted">
              <li>{BUSINESS.legalName}</li>
              <li>{BUSINESS.registrationNumber}</li>
              <li>{BUSINESS.country}</li>
              <li>
                <a
                  href={`mailto:${SITE.supportEmail}`}
                  className="transition-colors hover:text-brand"
                >
                  {SITE.supportEmail}
                </a>
              </li>
              <li>
                <a
                  href={`mailto:${SITE.fallbackEmail}`}
                  className="transition-colors hover:text-brand"
                >
                  {SITE.fallbackEmail}
                </a>
                <span className="text-faint"> (fallback)</span>
              </li>
              <li>
                <a
                  href={SITE.url}
                  className="transition-colors hover:text-brand"
                >
                  tryakara.com
                </a>
              </li>
            </ul>
          </div>
        </div>

        <div className="mt-14 flex flex-col gap-4 border-t border-hairline pt-8">
          <p className="text-xs leading-relaxed text-faint">
            {MANDATORY_WORDING}
          </p>
          <p className="text-xs leading-relaxed text-faint">
            Akara does not hold, receive, escrow, custody, remit, convert, or
            move user funds. Users send money directly to each other through
            their own bank or mobile money accounts. Always confirm payout
            details before sending money.
          </p>
          <p className="text-xs text-faint">
            © {new Date().getFullYear()} {BUSINESS.legalName}. All rights
            reserved.
          </p>
        </div>
      </div>
    </footer>
  );
}
