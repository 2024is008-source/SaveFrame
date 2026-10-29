# TikSaveMP4 analytics implementation — October 30, 2026

Branch: `nextjs-tiksave-release`. Public origin: `https://tiksavemp4.online`. Measurement ID: `G-XP63QEZK1R`.

The analytics popup, Allow/Decline buttons, settings overlay, popup styles and permission-grant event/API have been removed. No deployment was performed. Existing databases and `.env.production.local` were not deleted or overwritten. Legacy saved consent/opt-out preferences remain readable for compatibility; the site does not fabricate consent or present a new consent prompt.

## Root causes

The original implementation disabled GA4 in production, compared against the old domain and sent a hardcoded title. Those defects were corrected in the earlier audit changes. The remaining collection gap was the combination of an empty proxy country header, disabled header trust and a consent gate: new visitors were always unknown, and therefore required a choice. Adding the popup made collection possible but interrupted the downloader.

PM2's hardcoded analytics environment could also shadow Next's production-local configuration or leave stale process values active. The ecosystem now resolves Next's production configuration first and explicitly refreshes a whitelist of public analytics flags; it does not print the full environment or inline private admin credentials. Intentional shell environment values still have precedence over dotenv files.

The existing middleware also returned 404 for all admin paths, bypassing the real login handlers. That restriction is removed. The existing session checks, password verification, email OTP, optional TOTP, CSRF/origin checks and private response headers remain in place.

## Automatic Google Analytics

- The server passes regional eligibility to the client. Automatic collection requires a trusted, recognized country approved by `GA4_AUTOMATIC_COUNTRIES`, outside the built-in consent-required floor and any additional configured restrictions. Unknown countries never imply permission.
- A previously saved explicit grant remains readable. Existing opt-outs, DNT, GPC and bot exclusions take precedence. No new permission prompt or grant interface is present.
- GA4 loads only on an eligible public page, in production with a valid measurement ID and a matching configured HTTPS origin. There is no hardcoded `saveframe.site` domain restriction.
- Manual page views use sanitized public routes, current titles and stripped referrers. Only approved UTM labels are forwarded. Submitted media URLs, account names, job identifiers and arbitrary query strings are excluded from application event payloads.
- The route controller deduplicates views across React remounts and repeat calls, while allowing back/forward navigation to count as a new view. Next navigation waits one animation frame for updated metadata. Download operation objects deduplicate replayed event submissions.
- The privacy page's existing opt-out link remains available. Google Consent Mode signals remain part of tag initialization; these are tag protocol settings, not a user permission UI.

Google Analytics is not guaranteed to cover every visitor. Restricted/unknown visitors without an existing grant do not contact Google. Browser blockers and unavailable Google endpoints can also prevent collection. This implementation does not use cookieless Google pings to bypass the regional gate.

## Worldwide internal page counters

The additive migration `004-traffic-analytics.sql` creates `daily_page_statistics` in the existing SQLite database. It does not replace tables, reset users or rotate the session key.

Initial HTML page loads are counted after the server response, including when JavaScript is disabled. Middleware overwrites request markers and excludes redirects, assets, admin routes, RSC requests, prefetches and HEAD requests. Client navigation sends one small same-origin POST per committed public route. It does not resend the initial server-counted view. The endpoint validates origin, payload size and dimensions and has a process-wide write cap; the Nginx example adds a per-client request limit and disables access logging for that endpoint.

Only aggregate rows are stored: date in Asia/Colombo, allowlisted page route, trusted country code or `XX`, coarse device type, a fixed referral-source category, approved source/medium labels, regional GA4 eligibility and view count. There are no visitor rows, raw IP addresses, submitted TikTok URLs, full referrer URLs, cookies, client IDs, session IDs or persistent cross-site identifiers in this table. The reporting retention is 730 days. General hosting/access logs remain a separate deployment concern.

These are **page views**, not unique people or sessions. Refreshes count again. Automated traffic filtering is best effort. Unknown geography is shown as Unknown; it is not guessed from language or timezone. DNT, GPC and server-visible analytics opt-outs exclude optional page counters. Initial server requests can only honor preferences transmitted with that request.

`/admin/traffic` and `/api/admin/reports/traffic` expose this report only after existing admin authentication. They explicitly distinguish internal counts from Google Analytics. Regional eligibility is not labeled as proof of Google receipt. Existing operational download analytics and country-download reporting remain separate and unchanged.

## Verification results

Passed:

- TypeScript: `npm run typecheck`.
- ESLint: `npm run lint`.
- Downloader/blog tests: `npm test`.
- GA4 and download event tests: `npm run test:analytics`.
- Aggregate migration, privacy, endpoint validation, spoof/prefetch rejection and document/SPA deduplication: `npm run test:traffic`.
- Authentication, migration/history preservation, operational download analytics, CSRF, TOTP, policy and country reporting: `npm run test:admin`.
- Real local production login: `npm run test:admin:live`, including password/email OTP, protected API responses, all nine dashboard sections, SEO publishing, settings, verification files and logout. Only isolated test data and a local SMTP fixture were used.
- Production build, asset preparation and build-trace sanitization: `npm run build`.
- Rendered SEO checks: all 23 sitemap URLs, titles, descriptions, social tags, canonicals, FAQs, redirects, accessible login and protected admin API.
- Existing downloader browser checks: individual images, ZIP, MP4, mobile navigation, FAQ, text scaling and reduced motion, using explicit media fixtures.
- Existing blog browser checks: articles, filters, complete catalog, related links and mobile/desktop layout.
- New analytics browser checks: popup absence, automatic allowed-region collection, no Google load for restricted/unknown/opt-out/DNT/GPC cases, identity-free counters, JavaScript-disabled visits, Next navigation, event deduplication, mobile overflow and console errors.

### Actual Google network verification

`node scripts/check-audit-browser.cjs --live-ga` ran a built local production server with an isolated SQLite directory and a simulated trusted allowed-region header. Application requests were mapped locally under the canonical browser origin. Google's script and collection requests used the real network, not mocked responses.

Observed Google's loader returning HTTP 200 and collection responses returning **HTTP 204** for:

- Homepage `page_view`, with the actual title, sanitized Google referrer and `newsletter / email` campaign attribution.
- Blog `page_view`.
- A Next.js client-navigation article `page_view`, exactly once in the tested transition.
- `download_started`, once despite dispatching the same operation twice.

Sanitized evidence: `reports/analytics-browser/live-network.json`. It omits client IDs and full collection URLs. No Google requests were sent in the restricted/unknown cases. The permission header simulation applies only to the isolated test server; it is not a deployed geo bypass.

Successful HTTP responses establish network delivery. Access to the property's Realtime/DebugView reports was unavailable, so ingestion into reports, filters and property ownership were **not** independently verified. The public site was also unavailable through the web reader; these results concern the local built release, not a deployed change.

### CSP and duplicate-pageview control

The repository's public pages do not set a CSP that blocks Google; the strict admin CSP is preserved, and analytics excludes admin routes. Real network collection passed under the built release. If the VPS or CDN adds a CSP, retain the site's Next.js nonce/hash setup and allow the required Google script and collection hosts in `script-src`/`connect-src`, including regional `*.google-analytics.com` hosts. Do not disable the whole CSP.

The tested property produced one page view per tested client transition. Still, keep **Enhanced Measurement → Page views → Page changes based on browser history events** disabled when using this manual router tracker. Google documents that this property setting can send extra views even when `send_page_view` is false. Also review automatic form/outbound/download measurement before enabling it, since the site's manually sanitized downloader events do not control every property-level automatic feature.

## Safe Contabo VPS deployment (not executed)

1. Use the existing service account and checkout. Record the current release and confirm the branch is `nextjs-tiksave-release`. Preserve uncommitted work; do not use `git reset --hard`. Do not replace `.env.production.local`, SMTP settings, admin secrets or credentials.
2. Confirm PM2's actual private data directory and stable session key. Back up the live SQLite database using SQLite's online backup API/`.backup`, or stop the service after active transfers drain and copy the complete data directory including WAL/SHM and `session.key`. Do not copy only a live main SQLite file. Use new protected backup paths; do not remove or overwrite the live database. Keep the preceding release available.
3. Install the approved checkout's locked dependencies and verify configuration. From that checkout:

   ```sh
   npm ci
   npm run analytics:config
   npm run typecheck
   npm run lint
   npm test
   npm run test:analytics
   npm run test:traffic
   ```

   `analytics:config` prints only the public origin/measurement ID, booleans and configuration filenames. It must show `https://tiksavemp4.online`, the intended measurement ID and `pm2AnalyticsMatches: true`. Never print the complete environment. Review intentional exported shell values because they override dotenv files.

4. Establish trustworthy geography before enabling header trust. The supplied `saveframe-analytics-region.conf` verifies the original socket peer against Cloudflare's published networks; only then can `CF-IPCountry` become `X-SaveFrame-Country`. Include that map **once in the Nginx http context**, install the updated proxy snippet and merge the new analytics endpoint rate-limit location into the existing TLS vhost. Preserve the actual TLS/Certbot configuration; do not replace it with the HTTP bootstrap example. Keep Next bound to loopback and do not cache personalized policy HTML/RSC across regions. Run `sudo nginx -t` before any reload. Nginx is not available in this Windows workspace, so the VPS syntax check remains required.

   If the site does not use Cloudflare, this map intentionally returns Unknown. A trusted local GeoIP database at the proxy is an alternative; use its validated country result, never the visitor-supplied header. Do not switch unknown requests to an invented country. Internal counts work while trusted geography is unavailable.

5. Only after verifying the proxy boundary, edit the relevant analytics flags in the existing protected configuration in place:

   ```dotenv
   GA_MEASUREMENT_ID=G-XP63QEZK1R
   GA4_ENABLED=1
   GA4_TRUST_REGION_HEADER=1
   INTERNAL_TRAFFIC_ENABLED=1
   ```

   Keep an operator-reviewed `GA4_AUTOMATIC_COUNTRIES` list and any additional consent restrictions. `*` remains supported but does not remove the built-in consent-required floor. This code is a configurable policy mechanism, not a universal determination of every country's legal requirements. Without a verified country source, leave trust at `0`: no new automatic GA4 collection for unknown visitors, but internal aggregate counts continue. Do not overwrite unrelated environment entries.

6. Recheck configuration, apply the additive migration against the **existing** database and build. The following uses the ecosystem's default data directory; change it only if the current service already uses another directory:

   ```sh
   task_data_dir=/var/lib/tiksave/admin
   test -f "$task_data_dir/saveframe-admin.sqlite" || exit 1
   npm run analytics:config
   NODE_ENV=production SAVEFRAME_ADMIN_DATA_DIR="$task_data_dir" npm run admin:migrate
   NODE_ENV=production SAVEFRAME_ADMIN_DATA_DIR="$task_data_dir" npm run build
   pm2 restart ecosystem.config.cjs --env production --update-env
   ```

   Drain active media transfers before restarting the single in-memory job worker. Do not recreate the administrator or rotate `session.key`. A preceding release can ignore the additive table if an application rollback is needed; do not delete the database to roll back.

7. Verify HTTPS, `/admin/login`, an authenticated `/admin/traffic`, an unauthenticated admin API returning 401, the sitemap/canonicals/locale redirects and a real download. Confirm the homepage has no popup at mobile and desktop widths. In a normal eligible browser, inspect `gtag/js` and `g/collect` responses, then check GA4 Realtime. Verify a restricted/unknown visitor sends no Google requests while internal counts increase, and verify DNT/GPC/opt-out behavior. Check any CDN/WAF rules, caching and CSP on the deployed responses. Keep Google totals and internal page views labeled separately.

## Primary references

- [Google: manual page views and Enhanced Measurement history setting](https://developers.google.com/analytics/devguides/collection/ga4/views?technology=websites).
- [Google: verify collection requests and troubleshoot GA4](https://developers.google.com/analytics/devguides/collection/ga4/troubleshoot).
- [Google: consent mode implementation](https://developers.google.com/tag-platform/security/guides/consent).
- [Cloudflare IPv4 ranges](https://www.cloudflare.com/ips-v4) and [IPv6 ranges](https://www.cloudflare.com/ips-v6), checked against the supplied trust map on October 30, 2026.

## Exact changed and added files

See the inventory below, generated from the working tree for this implementation. Test evidence images/JSON are included; no production database is part of the changes.

- `.env.example`
- `.env.production`
- `docs/ANALYTICS_PRODUCTION_REPORT.md`
- `ecosystem.config.cjs`
- `nginx/saveframe-analytics-region.conf`
- `nginx/tiksavemp4-proxy.conf`
- `nginx/tiksavemp4.conf`
- `package.json`
- `reports/analytics-browser/home-no-popup-390.png`
- `reports/analytics-browser/live-network.json`
- `reports/analytics-browser/offline.json`
- `scripts/check-admin-live.cjs`
- `scripts/check-admin.cjs`
- `scripts/check-analytics-config.cjs`
- `scripts/check-analytics-production.cjs`
- `scripts/check-analytics.cjs`
- `scripts/check-api-error-reporting.cjs`
- `scripts/check-audit-browser.cjs`
- `scripts/check-country-analytics.cjs`
- `scripts/check-seo-metadata.cjs`
- `scripts/check-traffic.cjs`
- `src/admin/auth.ts`
- `src/admin/db.ts`
- `src/admin/migrations/004-traffic-analytics.sql`
- `src/admin/traffic-analytics.ts`
- `src/app/admin/[[...section]]/page.tsx`
- `src/app/api/admin/[[...segments]]/route.ts`
- `src/app/api/analytics/page-view/route.ts`
- `src/app/layout.tsx`
- `src/app/tiktok-theme.css`
- `src/components/Analytics.tsx`
- `src/components/admin/AdminDashboard.tsx`
- `src/components/admin/TrafficAnalytics.tsx`
- `src/content/information.json`
- `src/lib/analytics-policy.ts`
- `src/lib/analytics.ts`
- `src/lib/traffic-client.ts`
- `src/middleware.ts`
