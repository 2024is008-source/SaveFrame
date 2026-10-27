# SaveFrame country download analytics — 27 October 2026

Implemented and verified locally. No commit, push, VPS connection, production deployment, database reset or production service restart was performed. The existing GA4 lifecycle work already present in the working tree is preserved.

## Available functionality

New private admin page: `/admin/countries` (Country Analytics in the existing sidebar/mobile menu).

- Country name/code, original requests, preparations, server handoffs, failures and share of filtered requests.
- Date, media and country filters, daily country trends and media distribution.
- Reels, videos, photos, carousels, stories, profiles and ZIP archives; unknown media remains visible.
- Responsive cards, accessible table headers, keyboard-scrollable mobile table and the existing admin colors/typography.
- Country CSV export using Sri Lanka reporting dates.

The public downloader design and extraction behavior are unchanged. The existing privacy information page adds a factual internal-statistics disclosure. No new UI dependencies or persistent services were introduced.

## Request lifecycle and counting

The initial non-preview `/api/media/download` POST captures the country once, when `beginDownload` first records the operational request. Inspection requests also receive coarse country metadata for their existing operational events, but inspections do not become download-request totals.

`download_requests.country_code` owns attribution for the lifetime of that request. All later events look up the original stored country; job polling, response requests, queue processing, cancellation and recovery never infer it again. A later header or a supplied country argument cannot replace the original country. Resolution-only event groups similarly preserve their first recorded country. Country values in the public JSON request body and raw `CF-IPCountry` are ignored.

The existing correlation/event uniqueness constraint remains. Repeated lifecycle events, polling, refreshes, previews, seeks and byte ranges do not create additional original requests. A new intentional download POST is a new request, as before; no cross-visitor fingerprint or new POST idempotency system is added. A ZIP is one request regardless of its slide count. Its additive `is_zip` marker distinguishes it in country reports, including failures before a job is attached. Existing UTC media reporting retains its original parent-category classification.

Country metrics are attributed to the **original request date**:

| Metric | Meaning |
|---|---|
| Requests | Count of original download-request rows |
| Prepared | Request has a preparation timestamp |
| Delivered | Request has a server response-handoff timestamp |
| Failed | Preparation failed, or delivery failed without a later successful handoff |

Preparation and failure can overlap when a prepared file's delivery fails. A later successful handoff resolves the delivery-failure count. Visitor cancellations count as failed download outcomes here, while the existing **system failure** score continues excluding expected access restrictions/cancellations. Failure events before a download request exists remain in Error Reports, rather than inflating country download counts.

Handoff is the existing server-observable milestone, not proof of a browser save. Country reports do not claim that a device saved the file. SQLite remains the operational source of truth; optional GA4 is separate.

## Additive migration and retention

`src/admin/migrations/003-country-analytics.sql` adds:

- `download_requests.country_code`, default `XX`.
- `download_requests.is_zip`, default `0`.
- `download_requests.delivery_failed_at`, nullable, without changing existing status fields.
- `download_events.country_code`, default `XX`.
- An additive request country/time index.
- `daily_country_statistics`, keyed by Colombo date, country and media type.

Migrations 001 and 002 are untouched. Migration 003 runs in the existing `BEGIN IMMEDIATE`/WAL mechanism with a recheck inside the lock. Existing data, accounts, sessions, credentials, settings, SEO records, original indexes and original UTC aggregates remain intact. No database is recreated.

All historical request/event countries remain **XX**. Historical ZIP identity cannot be reconstructed from a discarded job, so original historical media categories are retained. Retained raw request timestamps permit an honest Colombo-date backfill of country aggregates with XX. Older UTC-only aggregates cannot be split into Colombo dates accurately and are **not** copied into this new series. They remain available in the existing reports.

Daily country aggregates are rebuilt within the same event transaction and retained for 730 reporting days, alongside existing aggregate retention. Detailed country-bearing requests/events use the existing configured raw retention (normally 30 days, adjustable from 7–180). No change is made to the meaning of legacy `daily_statistics` dates or totals.

## Reporting time zone

Raw timestamps remain UTC epoch milliseconds. Only the new country series groups by Asia/Colombo (UTC+05:30 for the current reporting era). A request at `18:29:59.999 UTC` belongs to that Sri Lanka day; one at `18:30:00.000 UTC` belongs to the next day. Date filters and CSV dates use that same boundary. Existing analytics and audit timestamps continue using UTC.

## Private APIs and CSV

Authenticated existing admin API router:

```text
GET /api/admin/reports/countries?from=2026-10-01&to=2026-10-27&type=photo&country=LK
GET /api/admin/reports/countries/export?from=2026-10-01&to=2026-10-27&type=photo&country=LK
```

All filters are optional. Dates must be real ISO dates, ordered, with a maximum 730-day range; media and country values are allowlisted. Use `country=XX` for Unknown. Share uses total requests in the selected filter set. Trend counts follow the selected country/media filters. The response contains aggregates and server-generated country option labels, without jobs, source links or visitor identifiers.

CSV columns:

```csv
date,country_code,country_name,media_type,requests,prepared,delivered,failed
```

Dates are Colombo request dates. Rows group by date/country/media. CSV fields are quoted/escaped. The existing `/api/admin/reports` and `/api/admin/reports/export` contracts/formats remain unchanged. Country endpoints use the same session authorization and private/no-store/noindex headers; exports use existing administrative audit logging.

## Trusted proxy boundary

The application accepts only strict ISO 3166-1 alpha-2 codes from `X-SaveFrame-Country`, after explicit server-side trust enablement. Missing/invalid codes, `XX`, Tor `T1`, non-ISO aliases such as `UK` or `XK`, unapproved countries and privacy exclusions become XX. No client language, timezone, submitted country, IP lookup or user fingerprint is used.

**Confirmed template defect fixed:** both Nginx templates previously overwrote the country header only in the frontend `location /`. Dedicated `/api/media/resolve`, `/api/media/download`, `/api/media/jobs` and health locations had their own `proxy_set_header` directives and did not overwrite it. A page-only directive does not protect those sibling locations. Both templates now unconditionally set the trusted country header in every proxied location.

The existing `saveframe-analytics-region.conf` remains unchanged: it checks the original socket peer using `$realip_remote_addr` against Cloudflare ranges, then maps only verified peers' `CF-IPCountry` to the country header; untrusted peers map to XX. Nginx overwrites any client-supplied `X-SaveFrame-Country`. Maintain the Cloudflare network list and enable Cloudflare IP geolocation. VPNs/proxies and IP geolocation errors can affect apparent country; this is coarse operational attribution, not proof of residence.

The default `npm start` command now binds Next.js to `127.0.0.1`, matching the existing Nginx upstream. This prevents default startup from exposing the internal port. A custom systemd `ExecStart`, CLI host override or alternate proxy may differ and must be checked on the actual VPS.

**The actual Contabo socket bindings, firewall rules, Nginx syntax/configuration and Cloudflare settings were not remotely verified from this local Windows environment.** Do not enable header trust until the deployment checks below pass. A header alone cannot prove the source of a request if an externally accessible Next.js port bypasses Nginx.

Official references: [Cloudflare IP geolocation and accuracy](https://developers.cloudflare.com/network/ip-geolocation/), [Cloudflare headers](https://developers.cloudflare.com/fundamentals/reference/http-headers/), [Cloudflare IP ranges](https://www.cloudflare.com/ips/).

## Privacy policy and configuration

Default configuration is fail closed: download operations still count, but country attribution remains XX until enabled with a reviewed policy.

```dotenv
SAVEFRAME_COUNTRY_ANALYTICS_ENABLED=1
SAVEFRAME_TRUST_COUNTRY_HEADER=1
SAVEFRAME_COUNTRY_ANALYTICS_COUNTRIES=LK,US,IN,GB
```

The country list above is an example requiring operator review, not a legal approval. `*` may be used only after approving the intended coverage. EEA/UK/Swiss countries remain consent-gated by the built-in conservative floor. The separate `SAVEFRAME_COUNTRY_CONSENT_REQUIRED_COUNTRIES` can add countries, or `*` can require consent everywhere. An approved country list does not override consent requirements.

A first-party `sf_analytics_preference` cookie mirrors the existing stored analytics choice (`granted`/`denied`) without an identifier; Secure, SameSite=Lax, Path=/, six-month lifetime. Unset preferences clear it rather than fabricating a grant. Stored opt-outs, DNT and GPC suppress country attribution. Required regions need an explicit granted preference. Duplicate/malformed preference cookies fail closed. A denied cookie is respected even when browser local storage cannot be read. The cookie expresses a preference, not authentication.

The existing GA component performs this small preference sync even if GA production enablement is off. Country attribution uses its own flags, country approval list and consent policy, rather than GA4 enablement/receipt or a Google request. No country value is added to Google event parameters. Country exclusion does not disable operational counts: they use XX. No new consent banner or decorative controls are introduced.

The new collection does not persist visitor IPs, Instagram usernames/links, session cookies, fingerprints or precise coordinates. Existing hosting/proxy logs are outside this SQLite change and should be reviewed separately. Coarse data combined with operational records is not claimed to be absolutely anonymous. A worldwide legal assessment was not supplied: the built-in region floor is a safeguard, not a complete legal database. Review purpose, lawful basis, transparency and retention before enabling attribution. See [ICO lawful basis guidance](https://ico.org.uk/for-organisations/uk-gdpr-guidance-and-resources/lawful-basis/legitimate-interests/) and [European Commission legal grounds](https://commission.europa.eu/law/law-topic/data-protection/information-business-and-organisations/legal-grounds-processing-data_en).

## Changed files for this request

| Files | Change |
|---|---|
| `src/admin/migrations/003-country-analytics.sql`, `src/admin/db.ts` | Additive migration and aggregate retention |
| `src/admin/analytics.ts` | Immutable original-country attribution, ZIP marker and transactional country aggregation |
| `src/admin/country-analytics.ts` | Colombo reports, filtering, country labels, trends and CSV |
| `src/admin/country-policy.ts`, `src/lib/country.ts` | Trusted-header/privacy policy and ISO country validation |
| `src/app/api/media/download/route.ts`, `src/app/api/media/resolve/route.ts` | Country capture at initial recording |
| `src/services/download-manager.service.ts` | Preserve ZIP classification through job association |
| `src/app/api/admin/[[...segments]]/route.ts` | Authenticated country report/export routes |
| `src/app/admin/[[...section]]/page.tsx`, `src/components/admin/AdminDashboard.tsx` | Country page routing/navigation |
| `src/components/admin/CountryAnalytics.tsx`, `src/app/admin/admin.css` | Responsive country dashboard; two new scoped table rules |
| `src/lib/analytics.ts` | Existing preference sync to a first-party preference cookie; prior GA lifecycle changes retained |
| `src/content/information.json` | Internal-statistics privacy disclosure |
| `nginx/saveframe.conf`, `nginx/saveframe-tls.conf.example` | Necessary header replacement in all upstream locations |
| `.env.example`, `package.json` | Disabled-by-default policy examples, country test script, loopback production binding |
| `scripts/check-country-analytics.cjs` | Country/migration/privacy/report/CSV/proxy regression tests |
| `scripts/check-admin.cjs`, `scripts/check-api-error-reporting.cjs`, `scripts/check-admin-live.cjs`, `scripts/check-analytics.cjs` | Schema version, original request attribution, real private routes/CSV, preference-cookie checks |
| `reports/country-analytics-browser.json`, desktop/mobile PNGs | Synthetic browser verification artifacts |
| `reports/seo-crawl.json` | Refreshed isolated HTTP regression evidence |
| `COUNTRY_ANALYTICS_REPORT.md` | This implementation/deployment report |

Other existing uncommitted GA lifecycle files/bundles remain from the preceding task. They have not been discarded or presented as new country-specific work. No private database, environment file or Instagram session is part of these deliverables.

## Validation results

- `npm run test:countries`: PASS. Real SQLite version-2 WAL upgrade; preserved old migrations/settings/rows/indexes; ISO/malformed/missing/spoofed headers; enabled/disabled/consent/privacy cases; original-country persistence; duplicate suppression; ZIP; preparation versus handoff and delivery failure/recovery; historical XX; Colombo midnight; filtering; CSV compatibility; authorization; aggregate retention; Nginx header replacement.
- `npm test`: PASS. Admin, API reporting, country, security, preview/paste, downloader, story, translation, blog and GA4 regressions.
- `npm run test:admin:live`: PASS against a disposable loopback production server and local SMTP sink, including owner-only login/OTP, all eight sections, unauthenticated country denial, authenticated country reports/CSV and unchanged private headers. No external mail.
- `npm run test:instagrapi`: PASS, including 15 Python security/session fixtures, without Instagram requests.
- `npm run test:runtime`: PASS, real local FFmpeg encoding/mux/audio extraction and binary readiness.
- `npm run test:styles`: PASS, actual HTTP CSS assets for admin login, public homepage and blog.
- `npm run test:performance`: PASS, fonts, minified assets, responsive images and favicon metadata.
- `npm run test:seo`: PASS, 37 canonical sitemap URLs, 110 reciprocal language annotations, 38 indexable pages and 52 internal destinations.
- `npm run typecheck`, `npm run lint`, `npm run build`: PASS. Final production build includes built-in type/lint validation and private trace sanitization.
- Headless Edge browser: PASS at 1365px desktop and 390px mobile; actual built components, six synthetic countries, country/media filter submission, CSV export and no runtime/hydration errors. Page width matched viewport; mobile table scrolling remained contained (314px viewport, 440px table content).

The browser check found and fixed a genuine hydration mismatch: different Node/browser ICU country labels. Labels/options now originate on the server and are serialized to the client, so both render identical strings. Screenshots contain synthetic counts and `preview@example.test`, not production users or records. Temporary preview processes were stopped and temporary databases removed.

## Safe Contabo deployment

No commands in this section were run on the VPS. Use only the existing SaveFrame service/site; do not restart or replace unrelated websites.

1. Review and release the changed files through your existing GitHub workflow. Build/test a clean Linux release checkout, not the folder currently served by `next start`. Keep the current built release available for rollback. Do not ship `.data`, `.runtime`, secrets, Windows `node_modules` or session files.
2. Verify the actual service and socket before enabling attribution:

   ```bash
   sudo systemctl show saveframe.service -p User -p WorkingDirectory -p ExecStart -p EnvironmentFiles
   sudo ss -ltnp '( sport = :3000 )'
   ```

   Expect the service account `saveframe`, the intended release, protected `/etc/saveframe/production.env` and loopback `127.0.0.1:3000`. `0.0.0.0:3000` or `[::]:3000` fails the trust check. If a custom ExecStart bypasses `npm start`, ensure it explicitly binds loopback before enabling trust. From a separate machine, confirm `http://YOUR_VPS_PUBLIC_IP:3000/api/health` cannot connect. Check the Contabo/host firewall as well; do not alter other sites' ports.
3. Inspect the existing SaveFrame Nginx locations. Apply only the added `proxy_set_header X-SaveFrame-Country $saveframe_analytics_country;` lines to the matching proxied locations. Keep the current certificates, other sites, upstream addresses and unrelated directives. Confirm the country map uses the original socket peer and current verified [Cloudflare networks](https://www.cloudflare.com/ips/), and Cloudflare IP geolocation is enabled. Validate before any reload:

   ```bash
   sudo nginx -t
   ```

   A direct non-Cloudflare request to the origin must map to XX even if it supplies `X-SaveFrame-Country: US` or `CF-IPCountry: US`. Verify this using a controlled operational request and the private admin report; no public geography debug endpoint is added. A legitimate proxied request should be attributed only if its policy permits it.
4. Before switching release, drain in-flight downloads, stop only SaveFrame, and take a private SQLite backup. This example uses the supplied `/var/lib/saveframe` location; verify `SAVEFRAME_ADMIN_DATA_DIR` first:

   ```bash
   sudo systemctl stop saveframe.service
   sudo -u saveframe python3 - <<'PY'
   import os, sqlite3
   from pathlib import Path
   from datetime import datetime, timezone
   os.umask(0o077)
   source = Path('/var/lib/saveframe/saveframe-admin.sqlite')
   if not source.is_file():
       raise SystemExit('Database not found; check SAVEFRAME_ADMIN_DATA_DIR')
   backup = source.with_name(source.name + '.pre-country-' + datetime.now(timezone.utc).strftime('%Y%m%dT%H%M%S%fZ'))
   with sqlite3.connect(source) as db, sqlite3.connect(backup) as copy:
       db.backup(copy)
   print('Backup:', backup)
   PY
   ```

   If backup/release validation fails, keep the previous release selected and start the same SaveFrame service again. Do not delete database/WAL files or run reset/cleanup commands as a migration step.
5. In the reviewed release, run `npm ci`, the regression checks and `npm run build` under an appropriate deployment account. Preserve the private data directory, session key, admin credentials and Instagram sessions. Add the reviewed country variables to the existing protected runtime environment. If proxy/privacy verification is incomplete, leave `SAVEFRAME_COUNTRY_ANALYTICS_ENABLED=0` and `SAVEFRAME_TRUST_COUNTRY_HEADER=0`.
6. Select the reviewed built release using the existing deployment mechanism. On first database use, migration 003 runs under the existing service account with its runtime configuration. No hand-edited database recreation is required. The owner may then run:

   ```bash
   sudo systemctl start saveframe.service
   sudo systemctl is-active saveframe.service
   sudo nginx -t && sudo systemctl reload nginx
   ```

   Reload Nginx only if the reviewed header changes were applied; a reload is needed for those changes. No daemon-reload is required unless you intentionally changed the service definition.
7. Sign in at `/admin/countries`. Check a genuine authorized download from a permitted location: one request, preparation and handoff as applicable, with matching country across events. Verify privacy exclusions become XX, CSV dates match Colombo and the existing UTC report remains intact. Historical rows must stay Unknown.

## Rollback preserving records

Disable country attribution in the protected environment, drain/stop only SaveFrame, select the previous complete built release and start that service. Restore the prior Nginx site fragment only if necessary, validate with `nginx -t`, then reload. Keep loopback binding and header replacement as security protections whenever practical.

**Do not drop the new columns/table, remove schema migration history, reset the database or restore an older database merely to roll back application code.** The additions are backward-compatible with the existing explicit-column inserts and preserve already collected records. Old code will stop updating the new country aggregate series; those reports can have a gap during rollback. Retain the backup securely and plan reconciliation from still-retained raw timestamps if returning to the feature later. Data restoration is a separate recovery action that could discard new activity and requires its own reason.

No production database, Instagram authentication session, unrelated service or hosted website was modified during this implementation.
