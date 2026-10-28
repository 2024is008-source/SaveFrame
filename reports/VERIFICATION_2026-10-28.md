# TikSaveMP4 Next.js verification — October 28, 2026

## Scope and result

Verified **`D:\My Project\Tiksave`**, the existing Next.js application shown in
the owner's screenshot. Local `http://127.0.0.1:3000` is served by this project's
Next process. Its current white TikTok UI already exists and was not redesigned.
No Express results or test counts are used as evidence for this application.
No application source, environment configuration, package manifest, UI or routes
were changed by this verification. Only audit documentation and generated test
reports/logs were produced. No account was created in the active site's database.

**Result:** the documented TikTok MP4/photo/ZIP interface passes the current
core tests and browser checks. This is not an all-clear for every retained legacy
feature or a production deployment certification. Important feature limits and
stale test suites are listed below.

## Fresh completed checks

Environment: Node v24.18.0; locally detected yt-dlp 2026.10.26 and FFmpeg 7.1.

| Check | Result and limits |
| --- | --- |
| `npm run lint` | Pass |
| `npm run typecheck` | Pass |
| `npm test` | Pass: TikTok URL/host/IP validation, two photo schemas, restricted/unavailable posts, share links, cached MP4 preparation, individual images, ZIP ordering and invalid selection; 12 blog articles/filters/related links/TOC/optimized covers |
| `npm run build` in an isolated source copy | Pass: optimized Next production build and postbuild privacy scan of 21 tracing manifests; active site's `.next` was not rebuilt or replaced |
| `npm audit --json` | Zero known vulnerabilities, production and development dependencies |
| `npm run test:browser` | Pass: responsive layout, mobile navigation, FAQ, invalid input, photo slideshows, individual/ZIP and MP4 controls, dedicated tool/information pages, reduced motion, text scaling and sitemap; controlled media fixtures |
| `node scripts/check-tiktok-blog-browser.cjs` | Pass: all 12 articles, desktop/tablet/mobile, search, categories, pagination, TOC, related/tool links, BlogPosting schema and retired article responses |
| `node scripts/check-preview-back.cjs` | Pass: mobile preview Back/Close/Escape preserve document, URL, input and results; inert transport |
| `node scripts/check-result-focus.cjs` | Pass: photo/video results focused and visible at 390, 768, 1440 and 1464×547, normal/reduced motion, no page navigation; fixtures |
| `node scripts/check-seo-metadata.cjs` | Pass: all 22 sitemap URLs, unique reviewed titles/descriptions, social metadata, fixed domain canonicals and expected private/unknown 404s |
| `node scripts/check-country-analytics.cjs` | Pass: isolated country/retention/history migration, trusted-header/privacy, delivery-vs-preparation, time boundaries, filtering, CSV and authorization assertions; not actual visitor counts |
| `node scripts/check-runtime.cjs` | Pass: native tool readiness, offline MP4 encoding, video/AAC mux, M4A extraction and non-silent decoded audio; not a live TikTok MP4/MP3 download |
| Existing manual supplied-photo verifier | Pass: current public post returned 10 photos; first JPEG downloaded, 81,308 bytes, fully decoded at 1080×1092; own temporary output cleaned |
| Local HTTP checks | `/`, `/video-downloader`, `/photo-downloader`, `/api/health` return 200; private paths below return 404/no-store/noindex; `/.env` and `/.data/saveframe-admin.sqlite` return 404 |

The real photo source was the owner's previously supplied
`https://www.tiktok.com/@4kwallpaper026/photo/7692092340885851414`.
No login/cookies/restriction bypass was used. This proves one current photo
retrieval, not every post, a live selected ZIP, or production media availability.

Raw fresh logs and sanitized JSON are local and ignored under
`node_modules/.cache/tiksave-verification-20261028/`. The browser scripts also
regenerate their existing `reports/tiktok-browser/`, `reports/tiktok-blog/` and
`reports/seo/` evidence. Older report files are historical, not proof that a
currently failing suite passed today.

## Confirmed feature limits

1. **Private web admin is unreachable in the current Next application.**
   `src/middleware.ts` explicitly returns 404 for every `/admin` and `/api/admin`
   path. `/admin/login` and `/api/admin/settings` were independently confirmed
   404 with no-store/noindex. Authentication/dashboard code remains in the tree,
   but supplying credentials alone cannot bypass this middleware. This is an
   implemented restriction, not a missing CSS file. If a private dashboard is a
   requirement for this project, its restoration needs a separate reviewed change.
   No middleware/authentication restriction was altered during verification.

2. **Google Analytics collection is off.** `.env.production` has blank
   `NEXT_PUBLIC_GA_ID` and `GA4_ENABLED=0`; the local homepage contains no loaded
   Google tag. Server-side operational/country modules are separate. Their isolated
   tests do not establish actual visitor counts or country coverage. Actual Google
   property access/ingestion was not supplied or verified.

3. **Public MP3/audio-tool access is disabled in the current TikTok interface.**
   `validateMediaInput` in `src/security/url-validator.ts` accepts only video,
   photo and carousel tool intents; `tool: 'audio'` is rejected with 400
   `UNSUPPORTED_OPERATION`. Audio conversion helpers and old MP3 evidence still
   exist, but they do not prove an accessible current TikTok-to-MP3 workflow.
   MP4 with its source audio is a separate supported function.

4. **Monetag integration is absent from this Next checkout.** No Monetag loader
   or environment-based orchestration was found. No advertising was activated,
   no publisher IDs/tags were invented, and no ad CSP origins were added. This
   project must not be described as containing the separate Express integration.

These limits do not invalidate the tested public MP4/photo interface. They do
prevent claiming that all features discussed across earlier projects are present
and enabled here. README statements about retained private administration do not
override the actual middleware behavior.

## Failing older checks — not silently weakened

| Command/script | Observed failure and reason |
| --- | --- |
| `npm run test:admin` | `check-admin.cjs` expects the old default photo-page title `TikTok Photo Downloader`, while current reviewed SEO defaults use `Download TikTok Photos & Slideshows`; the later chained checks are not executed by this failed command |
| `npm run test:security` | Legacy security fixture creates an Instagram download job; current TikTok validation rejects it with `UNSUPPORTED_DOMAIN` before later assertions |
| `node scripts/check-audit-regressions.cjs` | Retained Instagram fixture is rejected by the TikTok-only input boundary |
| `npm run test:analytics` | Asserts the removed old site's Google measurement ID exists in production configuration; current configuration deliberately disables GA4 |
| `node scripts/check-download-analytics.cjs` | Uses retired Instagram route/event fixtures; expected events are absent for those unsupported paths |
| `npm run test:audio` | Uses an audio tool intent currently rejected by public TikTok validation |
| `node scripts/check-api-error-reporting.cjs` | Expects a mocked Instagram restriction to reach an extractor and return 403; current boundary correctly rejects that domain first with 400 |
| `npm run test:styles` | Expects `/admin/login` to return 200; current middleware returns 404 before that page's CSS can be tested |

The current TikTok-specific suites pass, but the legacy security/analytics/admin
commands are not green. Do not mark the entire package script set as passing.
Update maintained tests to supported TikTok inputs and explicit current feature
policies, preserving their security/authorization assertions, before using them
as release gates. Retired-feature suites should remain clearly labelled historical.

## Security and production limits

The redacting scanner's six repository-source leads (after excluding third-party
`.runtime`/dependency/build code) were reviewed: environment-variable references,
interactive password input and explicitly generated test credentials. No confirmed
hardcoded real secret was found in that source review. This is not exhaustive Git
history certification or proof about arbitrary ignored private files.

Current TikTok checks cover URL/domain/private-IP boundaries, queue/download and
ZIP fixture behavior; actual private endpoints and private-file responses were
checked. Because the older comprehensive security scripts still use unsupported
fixtures, this verification is not a full production security approval.

The supplied direct-Nginx template overwrites forwarding headers; actual installed
Nginx/TLS, origin port exposure, process-tree egress containment, PM2, Linux resource
limits, backups/restoration and live production artifact identity were not accessed
or changed. The owner confirms Cloudflare is not connected, so Cloudflare setup is
not a requirement. No VPS pull, Nginx edit, PM2 restart, push or deployment ran.

Fresh full HTTP MP4/MP3/live selected-ZIP delivery through an isolated built server
remains unverified. Browser media responses are fixtures; the successful real photo
check called the actual backend service directly. Do not combine those into a
claim that every live HTTP lifecycle passed.

## Build isolation and environment notes

To preserve the running local app, the build ran against a source copy with
private test data and no copied `.env` or real database. Initial audit-harness
attempts failed because a cross-drive dependency junction confused module paths,
an isolated dependency install exhausted C: space, and building inside
`node_modules` bypassed TS transformation. Those were harness/environment failures.
The final source copy under ignored `.runtime/verification-build-*` on D: built
successfully using the existing installed dependencies and sanitized private state.
The active application build was not replaced. C: still has only about 340 MiB free;
temporary-space availability should be addressed before further heavy local work.
The audit's isolated build copies were removed after checks, detaching their
dependency junctions first. Build logs remain; the original dependencies and both
existing local listeners on ports 3000 and 3103 were preserved.

Automatic approval review rejected launching an additional isolated preview;
the stated reason was **"blocked by policy"**, with no more specific explanation.
No isolated server was started and no running site was restarted. Live HTTP media
acceptance therefore remains a stated limitation rather than a claimed pass.
