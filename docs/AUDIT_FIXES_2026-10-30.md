# SEO and GA4 audit fixes — October 30, 2026

The supplied audit was checked against the repository. Its embedded prompt was treated as proposed implementation guidance. Source-level defects were reproduced; its claims about Google's exact title-rewriting and indexing decisions could not be verified from source code. The live homepage and sitemap were unavailable through the web tool.

## Changes

- Enabled the audit's measurement ID `G-XP63QEZK1R` in production configuration. `GA_MEASUREMENT_ID` overrides `NEXT_PUBLIC_GA_ID`; `GA4_ENABLED=0` disables tracking. PM2 preserves environment overrides.
- Allowed analytics on the current production origin while retaining the legacy origin and rejecting mismatched origins. Events use the document title and include published legacy blog routes.
- Added an explicit analytics choice and persistent settings control. Kept unknown countries gated instead of adopting the audit's unknown-country automatic grant. With the supplied untrusted/empty proxy country configuration, visitors must allow analytics before Google loads. Trusted, approved regions retain the existing automatic policy. Opt-out, DNT, GPC, bot exclusion and event sanitization remain intact. Privacy copy now describes the behavior.
- Aligned homepage/tool search titles and social metadata; added WebSite alternate names; switched the homepage's server-rendered and client default to video.
- Gave video and photo tools separate steps, format specifications, limits, five FAQs and guide selections. FAQ JSON-LD matches the visible answers.
- Listed all 13 published/legacy guides on the first blog catalog page using a shared page size of 24. Removed the obsolete second-page title and sitemap URL; future pagination remains supported.
- Linked Responsible Use from the footer and information pages, normalized brand spelling and corrected grammar.
- Removed duplicate carousel navigation entries in favor of the photo destination, and made the retired control's client listener optional.
- Redirected locale home paths directly to `/` with 308, including paths with a trailing slash.
- Added meaningful static-page modification dates for this content release. Article dates remain their recorded editorial dates.

## Verification

Passed `npm run typecheck`, `npm run lint`, `npm test`, `npm run test:analytics`, and `npm run build` (including asset preparation and build-trace sanitization).

Against the built local production server, passed:

- `node scripts/check-seo-metadata.cjs http://127.0.0.1:3115`: 23 sitemap URLs, unique titles/descriptions, social metadata, canonicals, modification dates, catalog links, visible FAQ/schema agreement, locale redirects and excluded routes.
- `node scripts/check-analytics-production.cjs`: production SSR measurement ID, regional policy, cache isolation and public routes.
- `node scripts/check-audit-browser.cjs`: unknown-region consent gate, persistent decline, grant, withdrawal, actual document titles, tool accordions, navigation and mobile/desktop layout. This test maps the production hostname to the local server and mocks Google's loader; it sends no analytics to Google.
- `node scripts/check-tiktok-blog-browser.cjs`: article pages, blog filters, complete catalog, related links and responsive layout.
- `node scripts/check-tiktok-browser.cjs`: mobile navigation, accordions, input rejection, individual images, ordered ZIP and MP4 downloads using fixture responses, reduced motion and text scaling.

Browser scripts accept `TIKSAVE_PLAYWRIGHT_PATH` for an existing Playwright installation and `TEST_BASE_URL` for a local server. Screenshots are in `reports/audit-browser/`; reviewed metadata is in `reports/seo/metadata.json`.

## Deployment and live checks

These changes have not been deployed. On the VPS, build the updated checkout with its production environment, then select PM2's production environment explicitly:

```sh
npm ci
NEXT_PUBLIC_SITE_URL=https://tiksavemp4.online NEXT_PUBLIC_GA_ID=G-XP63QEZK1R GA4_ENABLED=1 npm run build
pm2 restart ecosystem.config.cjs --env production --update-env
```

Use the intended GA4 property if it differs from the ID supplied in the audit. Verify a real visit after allowing analytics in a normal browser, then confirm receipt in that property's Realtime report. Local tests do not establish Google receipt or property ownership.

Verify the live titles, canonical URLs, sitemap and redirects, then submit the sitemap and request recrawling of key pages in Search Console. Search-title rendering and indexing remain Google's decisions; adding lastmod, increasing page size or adding FAQ schema cannot guarantee indexing or rich results.
