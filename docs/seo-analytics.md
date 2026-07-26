# Akara SEO And Analytics Setup

## What This Adds
- Privacy-aware site analytics hooks for GA4 and Plausible.
- Event tracking for WhatsApp CTA clicks, email clicks, internal nav, external links, scroll depth, and engaged sessions.
- Google and Bing verification meta tags from environment variables.
- Stronger JSON-LD for organization, service, website, and support contact.
- Expanded keyword coverage for corridors, WhatsApp conversion, students, freelancers, expats, and African mobile money exchange.

## Vercel Environment Variables
NEXT_PUBLIC_GA_MEASUREMENT_ID=
NEXT_PUBLIC_PLAUSIBLE_DOMAIN=tryakara.com
NEXT_PUBLIC_PLAUSIBLE_SCRIPT_URL=https://plausible.io/js/script.js
NEXT_PUBLIC_GOOGLE_SITE_VERIFICATION=
NEXT_PUBLIC_BING_SITE_VERIFICATION=

Use either GA4, Plausible, or both. If a value is blank, that integration stays off.

## Search Console
1. Add `tryakara.com` as a domain property in Google Search Console.
2. Verify with DNS TXT, or paste the Google HTML meta token into `NEXT_PUBLIC_GOOGLE_SITE_VERIFICATION`.
3. Submit `https://tryakara.com/sitemap.xml`.
4. Repeat in Bing Webmaster Tools with `NEXT_PUBLIC_BING_SITE_VERIFICATION`.

## Events To Watch
- `akara_page_view`
- `akara_whatsapp_cta`
- `akara_email_click`
- `akara_internal_nav_click`
- `akara_external_link_click`
- `akara_scroll_depth`
- `akara_engaged_session`

## Dashboards
- Acquisition by source and country.
- WhatsApp CTA conversion by page.
- Corridor page traffic.
- Legal and safety page assisted conversions.
- Support clicks and complaint email clicks.

## Keyword Clusters
- Corridor intent: NGN to RWF, RWF to NGN, GHS to RWF, XAF to NGN, KES to RWF.
- WhatsApp intent: WhatsApp currency exchange, exchange money on WhatsApp, WhatsApp currency conversion.
- User intent: exchange for African students, freelancers, expats, travellers.
- Trust intent: verified peer-to-peer exchange, mobile money receipt tracking, payout name verification.

## Weekly SEO Loop
1. Check Google Search Console queries and pages.
2. Add one corridor/help page for high-impression low-click queries.
3. Improve titles and descriptions where CTR is weak.
4. Review WhatsApp CTA clicks against traffic.
5. Fix pages with poor engagement or high exits.
6. Keep Core Web Vitals green.

## Privacy Note
Analytics events must never include phone numbers, names, payout details, receipts, KYC IDs, or trade identifiers. Use page and CTA metadata only.

## Honest Caveat
No technical setup can guarantee first page or number-one ranking. This gives Akara the crawl signals, measurement, structured data, and operating loop needed to compete properly.
