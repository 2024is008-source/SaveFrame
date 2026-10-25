# SaveFrame admin implementation report

Date: 25 October 2026. Local implementation; not deployed.

Owner update: the only allowed admin email is `backbencherz2027@gmail.com`, configured server-side in ignored `.env.local`. Other emails and their sessions cannot access administration. Every new login requires the owner password and a one-time Gmail email code. Real Gmail delivery remains pending the owner's private Gmail App Password; the application fails closed until SMTP works. The public support email is unchanged.

## Delivered

Seven responsive authenticated sections: Overview, Download Analytics, Error Reports, SEO Manager, Verification Files, Settings and Audit Logs. Authentication is server enforced, including private data APIs. The administrator area is excluded from indexing through metadata and HTTP headers, disallowed in robots.txt and absent from the public sitemap. No production administrator or default password was created. Account setup and hosting requirements are in [ADMIN_SETUP.md](ADMIN_SETUP.md).

The public site's existing layout and downloader UI are preserved with default settings. Admin styles are scoped under `.sf-admin`. The dashboard follows the existing Inter / Plus Jakarta typography with a quiet violet accent, a light sidebar frame and a white content sheet. Taste direction: devtools / framed-sheet, seed 1969316341, recorded in `design-system/saveframe-admin/`. Charts render actual SQLite aggregates and honest empty states; no demonstration statistics are inserted.

## Main changes

| Area | Implementation |
| --- | --- |
| Storage | `src/admin/db.ts`, migration 001; private persistent SQLite, WAL, transactions, indexes, retention and private key |
| Authentication | `src/admin/auth.ts` and `email-login.ts`; owner-only allowlist, Argon2id, required single-use email OTP, opaque hashed server sessions, strict cookies, CSRF/Origin checks, rate limits, optional encrypted TOTP, replay protection and CLI recovery |
| Admin routes | `/admin/login`, `/admin/[[...section]]`, `/api/admin/[[...segments]]`; server authorization and private/no-store/noindex responses |
| Dashboard | `src/components/admin/`, scoped admin stylesheet; seven sections, filters, charts, paginated tables, empty/error/busy states, CSV |
| Tracking | `src/admin/analytics.ts` wired to existing resolve, preparation, queue and file-stream delivery lifecycle; deduplication, sanitization, retention and daily rollups |
| SEO | catalogue of 37 existing public pages; private drafts, publish, optimistic versioning, preview, history and restore-to-draft; request-time server-rendered metadata overrides |
| Verification | strict Google HTML / Bing XML / ads.txt content and filename allowlists; 16 KB cap; SQLite storage and root rewrite; public URL checks; Google DNS TXT instructions/check |
| Settings | narrow non-secret allowlist, public name/email/default tool/fallback metadata, retention and optional two-factor workflow |
| Operations | CLI setup/migrate/cleanup/status/password recovery/TOTP recovery, Node 24 requirement, environment example and setup guide |

Published SEO never changes application-owned canonicals, hreflang or sitemap rules. Editorial keyword targets never become meta keywords. Arbitrary markup, arbitrary image URLs and arbitrary route creation are rejected. No credentials, cookies or API secrets are exposed as admin settings. Verification files intentionally become public only at their approved verification endpoints; the dashboard and its configuration APIs stay private.

## Validation

- Production `next build`: passed compilation, type validation and route generation on Next.js 15.5.28.
- `test:admin`: passed hashing, authentication, expiry, authorization, CSRF/Origin, rate limits, TOTP/replay/encryption, event deduplication, aggregates, retention, CSV, SEO draft/publish/rollback, canonical preservation, verification rejection and audit privacy.
- `test:admin:live`: passed real HTTP authentication/logout, all seven protected sections, unauthorized API rejection, noindex/no-store headers, robots/sitemap exclusion, zero-traffic reports, CSV, draft isolation, immediate published SSR metadata, history restoration, public verification root URL/check/delete, invalid/oversized files and public contact setting updates. Uses only an isolated temporary database.
- Email login checks passed owner-only account/session restrictions, keyed code hashes, expiry, five-guess lockout, single-use/replay rejection, delivery failure, and required email verification before session creation. Live SMTP delivery was tested against a local SMTP sink, never the real Gmail account. Localized homepage and article metadata publication were also verified without rebuilding.
- `typecheck`, downloader, direct-story, 10-language and 15-article checks passed.
- Live SEO: 38 indexable pages passed unique metadata, canonical, H1, schema, social tags, links, 404, sitemap and API noindex checks. Live localization and all 15 blog routes also passed.
- Browser: authenticated desktop and 390 px mobile overview inspected. Mobile content fits the viewport; navigation and SEO page selection checked. Screenshots are in the task visualization folder. A page-selection state issue identified during QA was corrected by remounting the editor for the selected route.

## Operational limits

No historic download backfill is possible. Statistics describe requests received, files prepared and server-observable response handoffs, not confirmed device saves. Downloader access remains subject to Instagram availability and authorization; no paid provider or login bypass was introduced. Anonymous Instagram links and raw extractor logs are not stored in admin analytics.

This is a single-host persistent Node/SQLite implementation. HTTPS, trusted proxy headers, a protected persistent data directory, backups and owner-chosen credentials must be configured before production use. The public sign-in screen remains reachable; every private section and data API requires authentication. Existing indexed URLs cannot be removed instantly by changing local code.

Dependency audit reported five existing CSS-toolchain findings (one high, four moderate), involving PostCSS and selector-parser chains through Next/Tailwind. No untrusted CSS upload or source-map editing endpoint is added. Automatic audit repair suggests framework/toolchain major upgrades; those were not forced into this dashboard change. Review and patch that toolchain before deployment. This report does not claim a clean dependency audit or a deployment security certification.

No deployment, DNS modification, external message, Search Console registration or paid service was performed. See the setup guide for the exact production and first-account steps.
