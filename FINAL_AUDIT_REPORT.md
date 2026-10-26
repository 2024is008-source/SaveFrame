# SaveFrame final engineering audit

Audit window: 25–26 October 2026, Asia/Colombo. Target origin: `https://saveframe.site`. Scope: this local Next.js project and isolated production previews. No deployment or remote host changes were performed.

## 1. Executive summary

**Verdict: NOT READY — BLOCKERS REMAIN.**

The application builds and its automated checks pass. Confirmed security, resource-control, caching and deployment-template problems were repaired. Public URLs, branding, layout, fifteen articles, private administrator data and working download paths were preserved. Thirteen confirmed unused tracked files were removed after reference/trace checks and clean-file checks.

The supplied story URL `/stories/dadgrapher/4015861202110466269/` still returns Instagram `403 LOGIN_REQUIRED` without an authenticated Instagram connection. That is an unresolved product requirement, not an internal server failure. The provided DP link resolved and downloaded a valid 4,250-byte JPEG. A repeat-fetch bug in photo/DP metadata caching was fixed, and unverified HD dimensions were removed.

Gmail TLS connectivity and the entire OTP flow through a local SMTP sink passed. Real Gmail credential authentication/inbox delivery was not tested, because the brief prohibits using production secrets or sending test email without authorization. An owner-controlled real-mail smoke check and Ubuntu/HTTPS validation are still required before release. If the owner accepts restricted, best-effort anonymous stories, that limitation must remain explicit; it must not be reported as a successful story download.

## 2. Initial project condition

- Next.js 15.5.28, React 19, TypeScript, Tailwind 3, yt-dlp, FFmpeg, native Argon2 and Node SQLite. One Next.js application owns the public routes and private administration.
- Ten localized homepages, six dedicated tool URLs, five information pages, blog index/pagination and fifteen articles. The sitemap has 37 canonical entries; blog page 2 is separately indexable.
- Seven admin sections, owner-only password/email-code login, optional TOTP, server sessions, CSRF, analytics, SEO drafts/history, verification files and non-secret settings already existed.
- Significant pre-existing uncommitted work was present. No agent commit, staging, push, branch rewrite or reset was performed.
- Read-only SQLite baseline: integrity `ok`, WAL, migrations 1/2, one administrator and one session. Before/after table counts match, including the four download requests and 35 existing events. The stable key, credentials and records were not deleted or rotated. See `reports/final-inventory.json` and `reports/final-inventory-after.json`; they contain counts/presence, not passwords, tokens or private record contents.
- Initial dependency audit: 1 high and 4 moderate findings. `lint` existed but lacked a usable non-interactive ESLint configuration.

## 3. Problems discovered

| Priority | Evidence | Result |
| --- | --- | --- |
| High | Image adapter trusted returned image URLs without host/DNS pinning. IPv6 reserved/mapped forms were incompletely classified. | HTTPS Instagram/CDN allowlist, connection-time DNS validation, expanded reserved-IP checks and test-only fixture exceptions. |
| High | Carousel ZIP creation buffered all source files and the final archive; size was checked after packaging. | Size preflight and bounded file streaming; archive name/order/CRC/STORE compatibility retained. |
| High | Queue and client rate-bucket maps could grow without fixed limits; metadata inspections could spawn concurrently without a global bound. | Waiting-job/history/rate-bucket caps; three concurrent metadata inspections and shared in-flight requests. |
| High | Active work could expire from the job map, cancelled adapters could later become completed, and failed parts could remain. | Active-job/delivery retention guards, cancellation checks after awaited work, cleanup limited to the finished job's own files. |
| Medium | Public request bodies were unbounded and unexpected errors/cancellation responses could reveal internal paths/job fields. | 16 KiB JSON-object limit, generic unexpected errors, restricted cancellation payload and redacted cached health. |
| Medium | Successful profile/photo adapter results bypassed metadata caching. | The same two-minute cache now covers these paths; DP download reuses resolved metadata. Cache cap is eight entries. |
| Medium | Profile and fallback photo metadata invented dimensions and an HD label. | Unknown dimensions now remain unknown; profile label translated across ten dictionaries. Existing format ID remains compatible. |
| Medium | Settings/SEO allowlists used inherited-property checks. | Own-property validation rejects `constructor`, `toString` and `__proto__`. |
| Medium | VPS installer added Redis and an age-based deletion cron; Nginx upstream used a Docker-style hostname. | No extra service/cron, app-owned cleanup, loopback Node upstream in both templates. |
| Medium | Lint was not configured; CLI needed a package classed as development-only. | Non-interactive ESLint configuration; TypeScript classified as a required runtime dependency. |
| Owner request | Failure chart counted Instagram login restrictions and visitor cancellations. | System failure count/chart use confirmed internal fault codes; other outcomes remain in “Recent issues.” |

## 4. Confirmed fixes completed

- Photo fetches reject unapproved hosts, embedded credentials, non-HTTPS production URLs, nonstandard ports, private DNS results and invalid JPEG/WebP MIME/signatures. Redirects are not followed into arbitrary hosts. Fixture loopback exceptions require test mode and an explicit fixture origin.
- Internal failures use a separate `INTERNAL_ERROR` code. Unexpected exceptions no longer expose filesystem details to public callers. A cancellation response omits URL, output path and analytics identifiers.
- Downloads admit at most 20 waiting jobs by default, keep at most 1,000 live job records and validate item/format input. Invalid selected items/formats no longer silently select the first file.
- Running jobs and active file deliveries are protected from retention expiry. Cancelling a photo or ZIP cannot later turn it into a completed job. Failed/cancelled cleanup touches only that finished job's generated files. No global filesystem sweep was run.
- ZIPs use chunked CRC/read/write operations, preserve ordering and filenames, reject oversized archives before packaging, and do not overwrite a pre-existing destination.
- Metadata requests for the same link share in-flight work, at most three inspections run together, and successful photo/profile results now use the bounded two-minute cache. An unused duplicate metadata-cache write was removed from the Next resolve route.
- Rate-limiter state is pruned/capped. Rejected rate-limited requests do not create individual SQLite analytics events, avoiding database amplification. Accepted resolution/download lifecycle events retain deduplication.
- Health probes share a 30-second snapshot, avoid repeated binary spawning and omit local binary/temp paths. HTTP responses remain no-store.
- System failure scoring is conservative: `INTERNAL_ERROR`, `YTDLP_NOT_INSTALLED`, `FFMPEG_ERROR`, `INSUFFICIENT_DISK_SPACE`, `PROCESS_RESTARTED`, and `DELIVERY_STREAM_ERROR`. Login/private/deleted/expired access failures, invalid input, rate/size limits, unknown upstream extraction failures/timeouts and visitor cancellation do not increase that score. All recorded issues remain in detail history. Preparation outcomes and CSV preparation-failure totals are separate lifecycle statistics, not a software-bug score. System scoring uses retained event history; it cannot reconstruct deleted old issue details.

## 5. Files modified

| Group | Files |
| --- | --- |
| Dependencies/tooling | `package.json`, `package-lock.json`, `.gitignore`, `eslint.config.mjs` |
| Validation/requests | `src/security/url-validator.ts`, new `src/api/request.ts`, `src/types/media.types.ts` |
| Media services | `src/services/download-manager.service.ts`, `yt-dlp.service.ts`, `instagram-adapters.service.ts`, `redis-store.service.ts` |
| Next APIs | resolve/download/job routes, streamed file route, health route and singleton comment cleanup |
| Administration | `src/admin/analytics.ts`, `auth.ts` (server helper rename for lint only), `db.ts`, `seo-service.ts`, `src/components/admin/AdminDashboard.tsx` |
| UI/content metadata | shared layout lint rationale, ten dictionary additions for “Profile Picture”; no article bodies or public route names changed |
| Tests/reports | admin assertions, new security/runtime/inventory scripts and final JSON reports |
| Deployment/docs | both Nginx examples, prerequisite installer, README, environment example, deployment checklist, current admin setup notes and this report |

The source layout/classes/colors/animations were not redesigned. Existing earlier admin CSS repairs and the fixed sidebar were preserved. Full details remain reviewable in the working tree; earlier reports are historical, not overwritten as if their findings never existed.

## 6. Files safely deleted and justification

Reference searches found no production entry-point use; 21 production build traces found no own `dist` references or candidate component references. Each candidate was verified Git tracked and free of staged/unstaged edits immediately before removal. Git history was preserved for recovery.

- `dist/api/media-router.js`
- `dist/lib/downloader-client.js`
- `dist/security/url-validator.js`
- `dist/server.js`
- `dist/services/download-manager.service.js`
- `dist/services/instagram-adapters.service.js`
- `dist/services/redis-store.service.js`
- `dist/services/yt-dlp.service.js`
- `dist/tests/backend.test.js`
- `dist/types/media.types.js`
- `src/components/FaqAccordion.tsx`
- `src/components/MediaTabs.tsx`
- `src/lib/downloader-client.ts`

The ten `dist` files were stale output from the replaced standalone server. The three source files were an unreferenced component/SDK island; the active public interface uses `SaveFrameReference`, the JSON reference and `public/saveframe.js`. A post-cleanup build and tests validate removal. `dist/` is now ignored.

## 7. Files intentionally preserved

| Classification | Candidates | Decision |
| --- | --- | --- |
| Must preserve | `.env*`, SQLite/WAL/SHM, stable key, admin account/session, migrations | No removal, reset or rotation. Read-only integrity/count checks only on the real database. |
| Must preserve | yt-dlp/FFmpeg/runtime, active downloads, approved images, articles, verification storage, sitemap/robots, Nginx configuration and Git history | Kept. Only deployment template text was corrected; no running configuration changed. |
| Must preserve | `SiteChrome.tsx` | Confirmed used by `BlogShell`; not an unused component. |
| Further verification | Legacy `src/tests/backend.test.ts` and standalone HTTP handler helpers | Kept as fixture/reference code. They are not the deployed Next API entry points and are not silently claimed as another passing npm test target. Do not mount the legacy server in production. |
| Further verification | Historical reports, design notes, generated `.next`/`.next-dev`, `.runtime` artifacts and the audit's old dependency recovery backup | Retained/ignored rather than deleted by name. No broad recursive project cleanup was run. |

Only disposable test directories created by the audit were removed by the test scripts. Existing temporary downloads were not scanned/deleted during this audit.

## 8. Dependency changes

- Next remains 15.5.28; React and Tailwind were not given major upgrades.
- Next's vulnerable nested PostCSS 8.4.31 is replaced by the compatible patched 8.5.31 through an explicit override and lockfile resolution. `npm ls postcss --all` confirms deduplication.
- Final full-tree audit: **3 moderate, 0 high, 0 critical**. The remaining findings are selector-parser/PostCSS-nested/Tailwind build-time dependencies. No untrusted CSS compilation/upload endpoint exists. They were not “fixed” by forcing a Tailwind 4 migration.
- Runtime-only `npm audit --omit=dev`: **0 reported vulnerabilities** at the recorded check. This is a point-in-time package advisory result, not a security guarantee.
- ESLint 9, matching Next 15 ESLint configuration, and flat-config compatibility tooling were added as development tools. npm reports ESLint 9 as out of support; it remains the supported peer range for this pinned Next lint configuration. Plan a separately tested tooling/framework upgrade rather than hiding the warning or forcing incompatible peers.
- TypeScript is a runtime dependency because the private CLI transpiles server TypeScript. Native Argon2, SQLite and real binary smoke checks pass locally.

Advisory references: [PostCSS source-map disclosure](https://github.com/advisories/GHSA-r28c-9q8g-f849), [selector-parser complexity advisory](https://github.com/advisories/GHSA-rj75-hqrm-r3gf). No source code or credentials were uploaded to an analysis service.

## 9. Frontend verification

The browser visited 40 public/login/404 routes at **320, 375, 390, 430, 768, 1024 and 1440 px**: 280 route/width checks. Each had one H1, no page-level horizontal overflow and no broken visible image in the captured viewport. Public routes include every localized homepage, every tool/information page, blog listing/page 2 and all fifteen articles. Admin sections have another 49 checks (section 11). Evidence: `reports/final-responsive.json` and `reports/final-admin-responsive.json`.

CSS asset tests verify HTTP 200, text/css and expected public/admin selectors in production. The browser console check showed no errors/warnings during the route matrix. Existing navigation, forms, responsive tables, fonts, and approved layout were retained. Static image/content checks cover all optimized covers; visible-image checks do not pretend every lazy image below the fold was decoded in every screenshot.

No Lighthouse scores or field Core Web Vitals were measured or invented. Real browser interactions and the existing live blog/localization checks supplement the route checks; the audit is not a claim that every device/browser/accessibility assistive technology was tested.

## 10. Backend verification

| Feature | Evidence | Result/limit |
| --- | --- | --- |
| Reel/video | Deterministic extraction/cache, quality/audio, merge/filename and response-body fixtures | Pass; not a new live Instagram Reel/video download in this audit. |
| Photos | Real local WebP HTTP transfer plus adapter metadata, MIME/signature and SSRF fixtures | Pass; public OG fallback keeps unknown dimensions honest. |
| Carousel | Actual ZIP creation, subset ordering, filenames/content, size rejection, failure/cancellation cleanup | Pass with deterministic media. No full-archive buffering. |
| Story | Single-item fixtures, profile/bulk rejection, correct error classification; actual supplied direct URL | Fixtures pass; **live supplied story is blocked by Instagram login**. |
| DP/profile | Profile fixture, restricted-profile rejection, metadata reuse and actual supplied public profile | **Live 200 JPEG, 4,250 bytes**, creator-based filename. Availability remains source-dependent. |
| Audio | Real FFmpeg tone/video mux, M4A extraction and decoded volume | Pass: combined file 11,728 bytes; M4A 9,969 bytes; mean volume -21.2 dB. Local generated media, not a live Instagram audio claim. |
| Queue/status/delivery | Controlled concurrency/capacity, retained active jobs/files, cancellation, real streamed route fixtures | Pass. Server handoff does not prove a device save. |

Installed locally: Node v24.18.0, yt-dlp 2026.10.21 and FFmpeg 7.1 essentials build. Exact smoke-test evidence is in `reports/final-runtime.json`. Ubuntu binaries, patch/backport status and process-tree termination under actual VPS load require host verification; no runtime binary was deleted or replaced.

## 11. Admin dashboard verification

All seven sections passed production HTTP authorization and linked CSS checks. The browser checked each section at all seven requested widths (49 checks), retaining white content sheets and the existing responsive/fixed-sidebar behavior. Analytics use SQLite queries and fixtures assert event deduplication, UTC aggregates, durations, retention, filters and CSV. No fake production statistics were inserted.

The new system-only score and reason chart exclude `LOGIN_REQUIRED` and `DELIVERY_CANCELLED`, including historical retained records. Recent issue history still contains them. Tests also verify a genuine internal FFmpeg fault still counts. Raw data was not deleted or rewritten to lower the score.

SEO drafts remain private, publishing affects server-rendered metadata, optimistic version checks prevent overwrites, and restoration stages a draft. Canonical/hreflang/sitemap protections remain. Verification tests cover valid Google/Bing/ads files, root URLs, replacement/version checking, delete/check/audit, traversal, arbitrary filenames, scripts, XML entities and size rejection.

## 12. Authentication and Gmail OTP verification

Argon2id, owner-only account/session enforcement, absolute/idle expiry, logout, strict secure production cookies, Origin/CSRF protection, login limits, email-code hashing/expiry/five-guess limit/replay rejection, optional encrypted TOTP and replay checks pass. CLI password reset and TOTP recovery were exercised only on disposable test accounts.

The real private database/key/account/session were preserved; before/after counts and integrity match. Current private configuration has non-empty mail credentials, reported only as presence. Gmail's verified TLS connection passed without AUTH or a message. The local SMTP fixture exercised code delivery and login gating without an external email. Real Gmail SMTP authentication, inbox/spam placement and production HTTPS cookie behavior remain owner-controlled deployment checks; they were not claimed as tested.

## 13. SEO audit results

The local production crawl passes 38 indexable pages: unique titles/descriptions, one H1, canonicals, social tags, factual JSON-LD, 51 internal destinations, useful 404s and API noindex. Live localization checks pass ten homepages with 11 alternatives each (including x-default), language/direction, trailing-slash behavior and English blog isolation. Fifteen article routes, filters, search, pagination, related links, structured data and optimized covers pass.

The sitemap stays at 37 canonical public URLs. Admin, APIs, job/download URLs, filters and private endpoints are excluded appropriately; the admin additionally requires authentication. Robots restrictions are not an access-control substitute or a guarantee against URL-only listings. This follows [Google's robots guidance](https://developers.google.com/search/docs/crawling-indexing/robots/intro); localized relationships were checked against [Google's hreflang guidance](https://developers.google.com/search/docs/specialty/international/localized-versions).

The existing intent mapping distinguishes the general downloader, six tools and specific how-to guides. No new articles/pages, keyword volumes, rankings, indexing results or Search Console claims were invented. Real-domain certificates, Google/Bing provider confirmation and production Search Console data were not accessed. Local schema parsing is not a hosted Rich Results certification.

## 14. Security audit results

Configured secret-value matching and private-key marker checks found no matches in the current Git-tracked files. Git filename history checks found no tracked `.env.local`, SQLite or key files. This is a targeted scan, not a claim to detect every unknown historic secret. No secret value was printed, rotated, uploaded or added to a public configuration.

Prepared SQL statements, own-property allowlists, plain-text SEO validation, React escaping, JSON-LD escaping, safe filename generation, shell:false subprocess arguments, private DB/key handling, input/host/DNS limits, upload restrictions and authentication boundaries were reviewed. New tests exercise the repaired cases. Public health and cancellation payloads no longer expose local paths. Nginx examples overwrite forwarded addresses and use a private loopback upstream. No private-account bypass was added.

This is an engineering review with targeted tests, not an external penetration-test certificate. Do not expose the Node port directly or enable test flags on a public host.

## 15. Performance findings

The largest confirmed issue was full-carousel buffering; it is now streamed in 64 KiB reads with bounded writes. Size checking occurs before archive construction, and downloaded-part byte accounting is linear. Queue/history/cache/rate-bucket sizes are bounded; duplicate metadata inspections coalesce. Health binary spawning is cached and rate-rejected traffic no longer amplifies SQLite event storage. No extra production service was introduced.

SQLite has date/type/status, event, session, revision and audit indexes; integrity/WAL checks pass. Raw details retain the configured period (default 30 days), daily totals up to 730 days, audit entries 180 days. Admin JS remains route split: approximately 9.59 kB page code/116 kB first-load JS; public first-load JS is approximately 105–112 kB in the build report.

No before/after VPS RSS, load capacity, throughput or CPU-saving benchmark was measured. Architectural bounds and removed whole-file buffering are evidence; invented percentage savings are not. The operator should test slow clients, disk pressure, large mixed carousels and subprocess descendants on the real Linux service.

## 16. Exact commands executed

Commands were run from the workspace, with loopback/network permissions where required. No command contained a real password or App Password.

```text
git status --short
git ls-files
git log --all --format= --name-only -- .env.local *.sqlite* *.key
node scripts/audit-inventory.cjs
node scripts/audit-inventory.cjs reports/final-inventory-after.json
npm run typecheck
npm run lint
npm test
npm run test:admin
npm run test:security
npm run test:downloader
npm run test:stories
npm run test:i18n
npm run test:blog
npm run test:runtime
npm run build
npm run test:admin:live -- --keep
TEST_BASE_URL=http://127.0.0.1:3107 npm run test:styles
TEST_BASE_URL=http://127.0.0.1:3107 npm run test:seo
TEST_BASE_URL=http://127.0.0.1:3107 node scripts/check-i18n-live.cjs
TEST_BASE_URL=http://127.0.0.1:3107 node scripts/check-blog-live.cjs
npm audit --json
npm audit --omit=dev --json
npm ls postcss --all
npm view postcss version
npm view postcss-selector-parser@6 version
npm view eslint-config-next@15.5.28 peerDependencies --json
npm install --save-dev eslint@^9 eslint-config-next@15.5.28 @eslint/eslintrc@^3
npm install --ignore-scripts
npm update postcss --ignore-scripts
npm dedupe --ignore-scripts
npm install --package-lock-only --ignore-scripts
git diff --check
```

The TEST_BASE_URL prefix above uses shell-neutral notation; PowerShell calls set `$env:TEST_BASE_URL` before execution. Additional reviewed one-shot commands inspected source/traces, performed a credential-free Gmail TLS handshake, tested the supplied anonymous DP/story URLs and removed the exact 13-file clean tracked allowlist. PostCSS's stale nested installed package was moved into an ignored recovery backup, its stale lock entry removed, and the normal installer reapplied the already-declared compatible override. No `audit fix --force` was used.

## 17. Actual test results

| Check | Result |
| --- | --- |
| TypeScript and configured ESLint | Pass; no errors/warnings in the final lint run. Initial lint configuration failure was fixed. |
| Admin unit/security tests | Pass, including strict system-score classification and prototype-key rejection. |
| Live admin and CSS | Pass on isolated production preview; no real owner account used. |
| New security/recovery fixtures | Pass, including HTTP/DNS rejection, bounded maps/queue, active delivery retention, ZIP streaming and private CLI recovery. |
| Downloader/stories fixtures | Pass; live story success is not implied. |
| Dictionaries/articles | Pass: ten dictionaries with 245 keys and fifteen full articles, 16,819 words. |
| Runtime binaries/local mux/audio | Pass; actual locally generated media, non-silent decoded AAC. |
| Live SEO/localization/blog | Pass, as detailed above. |
| Production build | Pass compilation, type/lint validation, route generation and tracing after cleanup. |
| Public/admin responsive matrix | 280 + 49 route/width checks; no recorded overflow/broken-visible-image/style failures. |
| Actual supplied DP | Pass, HTTP 200 JPEG, 4,250 bytes. |
| Actual supplied story | **Not downloadable anonymously: HTTP 403 LOGIN_REQUIRED.** |
| Real Gmail AUTH/inbox, VPS Nginx/SSL/Linux load | Not run; not claimed. |

An initial local-security run was blocked by sandbox loopback access; it passed when rerun with permission. A ZIP fixture exposed a cleanup race during implementation; it was corrected and the affected tests passed. Early incompatible/stale dependency resolution attempts are not presented as successful repairs; the final tree/audit results above are the verified state.

## 18. Unresolved issues

1. The owner-supplied story is gated by Instagram login. An authorized access strategy or explicit acceptance of the anonymous-only limitation is needed. No free credential-less bypass can be inferred from a public-looking URL. The failure remains visible in issue history but is not counted as a system fault.
2. Real Gmail credential authentication/inbox delivery and the final HTTPS cookie path need an owner-authorized smoke check. No production login secret was used for this audit's network tests.
3. Ubuntu Nginx syntax, actual certificate paths, security-maintained media binaries, service permissions, backups, process supervision, slow transfers, subprocess-tree cancellation and resource limits require real-host validation. No VPS connection was made.
4. Three moderate development-toolchain advisories and ESLint 9 support status remain documented. Runtime audit is clean at the recorded check; that does not remove future patch obligations.
5. Live Reel/video/photo/carousel access on the deployed server's IP is not proven by deterministic fixtures. Repeat with authorized accessible links before launch. Instagram can restrict requests by account, content, region, time or server IP.

## 19. Deployment checklist

Use `DEPLOYMENT_CHECKLIST.md` for the concrete release/backup/rollback procedure. Keep one unprivileged Node service, private stable SQLite/key storage outside releases, a private temp directory, HTTPS, trusted forwarded headers and no public Node port. Install platform-correct dependencies and binaries; build in a new release directory; preserve the preceding release and private data before switching. Do not overwrite `.data` or copy local HTTP/test settings to production. Finish smoke checks and owner-controlled provider verification before enabling traffic.

## 20. Final production readiness verdict

Additional owner requests were completed after the initial audit: the supplied mobile/desktop PageSpeed reports were reviewed, local fonts/preloads, responsive cached thumbnails, script minification, semantic/contrast/mobile-target corrections and shared favicons were implemented. See `PAGESPEED_FIXES.md` for before-change scores, verification and remaining framework/Cloudflare items. These changes have not been deployed; no improved live PageSpeed score is claimed.

**NOT READY — BLOCKERS REMAIN.**

The audited code and local checks pass, the DP path has a verified live result, and the system-failure score now matches the owner's classification requirement. The requested story still cannot be downloaded in the current anonymous model, and real-mail/host validation is incomplete. Marking all features “working” or declaring unconditional production readiness would be inaccurate. No deployment, DNS/SSL operation, Nginx reload, remote branch change or push was performed.
