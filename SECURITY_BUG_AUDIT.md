# SaveFrame bug and security audit

Date: **26 October 2026**. Scope: the existing Next.js 15.5.28 / React 19 / Node 24.18.0 working tree, including earlier uncommitted SaveFrame changes.

**Security decision: Pass after fixes for the locally verified scope; production approval remains conditional.**

**Residual risk: Medium.** This is an evidence-based application review, not a certification that the application is fully secure. No critical vulnerability, remote authentication bypass or exposed live credential was confirmed. One configuration-dependent High finding, seven Medium bugs and two Low prevention/header gaps were fixed. See the remaining risks before release.

## Methods and preservation

Installed and read the requested [Tartiner security skill](https://github.com/tartinerlabs/skills/tree/main/plugins/security/skills/security) and [Codex security audit skill](https://github.com/Kappaemme-git/codex-security-audit-skill) using the Codex Skill Installer. They are installed as `security` and `codex-security-audit` under the user's Codex skills directory and are available on the next turn. Their repository/dependency/secret/auth/input/data-protection checklists informed this audit. Codex Security was not returned as an available connected tool/plugin by discovery; no Codex Security scan is claimed.

Every application reproduction used loopback fixtures or an isolated local production preview. No vulnerability testing targeted Instagram, Google, Gmail or another third-party system. GitHub and npm were used for ordinary skill/advisory/package metadata retrieval. Story/Reel/photo/profile/carousel tests used controlled extraction/transport responses; runtime FFmpeg checks used locally generated media.

No public UI styles, layout, branding, fonts or translations were changed. No production account was created/reset, no private environment value was edited, and no production service was restarted. No commit, push or deployment was performed. Tests created and removed only their own disposable data. The existing database was inspected read-only: `quick_check=ok`, the administrator count remained one, and all table counts were unchanged before/after. The session key remained present; it was not rotated or printed. Existing download request/event counts remained **13 / 141**. See `reports/security-inventory*.json` and `reports/security-preservation.json`.

## Confirmed findings and fixes

The initial eight targeted regression cases all failed against the pre-fix implementation. A separate invalid-configuration reproduction also failed. The final regression file contains ten passing cases; live HTTP and Git checks provide additional evidence for the caching/ignore fixes. Evidence is in `reports/security-regressions-before.json`, `reports/security-regressions-config-before.json` and `reports/security-regressions-after.json`.

| ID | Severity | Confirmed issue and evidence | Smallest applied fix |
|---|---|---|---|
| F01 | **High, configuration-dependent** | `src/services/download-manager.service.ts:179`: setting `DOWNLOAD_TEMP_DIR` beneath Next's `public` directory was accepted. Prepared downloads could then be exposed through static serving, bypassing job delivery/expiry controls. The fixture demonstrated acceptance of a dedicated path under `public`. There is **no evidence the current production directory was misconfigured**. | Reject public/admin directory overlaps in either direction, reject symbolic-link storage roots, check the resolved path, and require a private directory on Unix. Do not chmod or delete existing data. |
| F02 | **Medium** | `src/services/instagram-adapters.service.ts:80`: a response interrupted after headers/body bytes had no response `error`/`aborted` rejection path. The isolated fixture child did not settle within five seconds and had to be terminated. This is a verified request hang, not a claimed production crash. | Handle response errors and premature aborts, returning a sanitized extraction failure. The same child fixture now exits successfully after receiving the expected rejection. |
| F03 | **Medium** | `src/services/instagram-adapters.service.ts:50`: socket inactivity timeout did not bound total response time. A server sending bytes every 10 ms completed after about 350 ms despite a 60 ms timeout configuration. Continued dripping could occupy a worker. | Apply a wall-clock abort signal to the entire metadata/photo HTTP operation, including body transfer, while retaining size and DNS restrictions. The fixture now rejects with `DOWNLOAD_TIMEOUT`. |
| F04 | **Medium** | `src/services/yt-dlp.service.ts:528`, image adapter signal parameters: cancelling a non-story job during metadata lookup did not stop a later transfer, and photo HTTP ignored cancellation. Both controlled cases reproduced. | Register a job controller before metadata, propagate it through shared metadata waiters, profile/photo fallback requests, image transfers and video subprocess execution, and check cancellation before starting delivery. Release the controller in `finally`. Shared metadata remains alive for other uncancelled callers. |
| F05 | **Medium, filesystem safety** | `src/services/instagram-adapters.service.ts:430`: default `writeFile` replaced an existing destination. The fixture's `preserve-me` file was overwritten. This is not a claim that a remote visitor can choose an arbitrary filesystem path. | Reserve photo output exclusively with `wx`, mode 0600; preserve existing files and remove only the newly owned partial output on write failure. |
| F06 | **Medium, functional/privacy preference reliability** | `src/lib/analytics.ts:59`: withdrawal assigned a new data-layer array. A local simulation of Google's patched `push` showed that later grants disconnected event forwarding from the installed queue. | Clear the existing array in place. Keep its identity and patched method; retain default denial, DNT/GPC, sanitized fields and advertising denial. No real Google events were sent during tests. |
| F07 | **Medium** | `nginx/saveframe.conf:38`, `nginx/saveframe-tls.conf.example:56`: resolution proxy timeout was 30 seconds while default extraction could take 45 seconds plus photo fallback. Valid application work could outlive the proxy. | Raise resolution timeout to 75 seconds in both reviewed templates. This covers default budgets; custom increases require a matching proxy review. Templates were not deployed. |
| F08 | **Medium, configuration reliability** | `src/services/yt-dlp.service.ts:130`: non-finite timeout/file-size settings were retained. A fixture using Infinity failed the finite-bound assertions; comparisons against an invalid size can disable the intended cap. | Normalize invalid timeouts, stdout limits and file-size limits to finite defaults; reject oversized limits by falling back to the established bound. Normalize adapter timeout/size settings too. |
| F09 | **Low** | `next.config.ts:12`: the initial production HTTP check found an empty Cache-Control header on an unknown job-status response. Successful job responses use the same headerless route. An incorrectly configured shared cache could retain capability-related metadata. No actual cross-user cache disclosure was demonstrated. | Add `private, no-store, max-age=0`, `nosniff` and `no-referrer` across API routes. The rebuilt server's job/admin responses now pass the real HTTP assertions. |
| F10 | **Low, repository prevention** | `.gitignore`: `git check-ignore --no-index .env .env.staging .env.local` initially listed only `.env.local`. Plain/staging environments could accidentally be staged. No committed credential was found. | Ignore `.env` and `.env.*`, retaining explicit exceptions for the reviewed public `.env.production` and `.env.example`. A regression verifies all three private variants and both exceptions. Production public configuration must never contain secrets. |

## Exact files changed in this audit

Application/configuration files:

- `.gitignore`
- `next.config.ts`
- `nginx/saveframe.conf`
- `nginx/saveframe-tls.conf.example`
- `src/services/instagram-adapters.service.ts`
- `src/services/yt-dlp.service.ts`
- `src/services/download-manager.service.ts`
- `src/lib/analytics.ts`
- `package.json` — include the audit regressions in `test:security`; no dependency change.
- `DEPLOYMENT_CHECKLIST.md` — document new storage checks and proxy/Cloudflare precautions.

Created:

- `scripts/check-audit-regressions.cjs`
- `scripts/check-audit-live.cjs`
- `scripts/check-secret-history.cjs`
- `SECURITY_BUG_AUDIT.md`
- `reports/security-*.json` and `reports/security-audit-mobile.png` — redacted evidence, inventories, dependency results and browser proof.

`reports/seo-crawl.json` was regenerated by the existing SEO test. The normal build re-ran asset preparation; the public client asset remains the same content hash. Other existing modified/untracked files, including the hybrid story/GA implementation and earlier styling work, predate this audit and were preserved. `package-lock.json` already had changes on entry; this audit did not install or upgrade application dependencies. Installed security skills are outside the application checkout.

## Coverage and verification results

| Check | Actual result |
|---|---|
| `npm run typecheck` | Pass |
| `npm run lint` | Pass |
| `npm run test:security` | Pass: existing protections plus ten new audit regressions |
| `npm run test:admin` | Pass, included in `npm test` |
| `npm run test:downloader` | Pass: merging/audio, creator filenames, carousel order/subsets, ZIP and metadata reuse |
| `npm run test:stories` | Pass: exact IDs, image/video providers, terminal restrictions, signatures, cancellation, limits and scoped sessions |
| `npm run test:runtime` | Pass with real yt-dlp 2026.10.21 / FFmpeg 7.1; video encoding, mux, M4A and non-silent decoded audio |
| `npm test` | Pass: admin, security, preview, downloader, stories, i18n, blog and analytics |
| `npm run build` | Pass; 24 generated pages; postbuild checked 21 tracing manifests. Independent verification found zero private-state references. |
| `npm run test:admin:live` | Pass against isolated DB and local SMTP; no real Gmail message/account access |
| `node scripts/check-audit-live.cjs` | Pass against a disposable production server: private APIs, no-store, private-file 404s, CSS, SEO, languages, blog and performance assets |
| `npm audit` | Exit 1: three moderate development findings; no High/Critical findings |
| `npm audit --omit=dev` | Exit 0: zero production findings |
| `node scripts/check-secret-history.cjs` | Pass within stated coverage: five reachable commits, 306 text blobs, zero configured-secret matches/private-file leads |

The production HTTP wrapper ran the existing styles, SEO, live localization, live blog and performance scripts: **38 indexable pages**, 37 sitemap entries, unique titles/descriptions, canonicals, H1/schema/social tags, 51 internal destinations, ten homepage languages, fifteen articles and favicons on 39 routes passed. The signed-out private routes and all seven authenticated admin sections passed their separate test. CSS assets returned HTTP 200 with the expected content type and admin/public selectors.

Browser inspection at 1440×900 and 390×844 found no console errors/warnings and no horizontal document overflow. Fonts remained Inter; no Google tag was loaded on local development. See `reports/security-browser.json` and `reports/security-audit-mobile.png`. This is not exhaustive coverage of every browser, assistive technology or mobile device.

Reviewed server/API paths for prepared SQL, session/CSRF/origin checks, cookie flags, owner-only login, Argon2id verification concurrency, single-use bounded email/TOTP challenges, safe verification-file allowlists and output escaping. Existing fixtures verify private/mixed DNS answers, actual connection DNS checks in Node HTTP adapters, redirect rejection, URL suffix/credential/port validation, MIME/signatures, body limits, queue/rate/cache bounds, partial cleanup, retained delivery files and byte-range playback. The ZIP builder creates bounded STORE archives from owned files; it does not extract user-supplied archives, so incoming ZIP-bomb expansion is not an application path.

## Dependencies and secrets

`npm audit` reports `postcss-selector-parser` below 7.1.6 through Tailwind 3.4.19 / postcss-nested 6.2.0. These are three affected dependency entries for one advisory: [GHSA-rj75-hqrm-r3gf / CVE-2026-104844](https://github.com/advisories/GHSA-rj75-hqrm-r3gf). The official advisory concerns quadratic parsing of attacker-supplied CSS selectors. In this application, the parser processes trusted styles during builds; no public request-to-selector-parser path was found. This does **not** establish a remotely exploitable SaveFrame vulnerability.

The npm-proposed complete upgrade moves Tailwind to major version 4. No force fix, framework major upgrade or out-of-range parser override was applied. Retain the development advisory until a separately tested stylesheet/toolchain migration. `npm outdated` results are saved; a newer major version alone is not a vulnerability. Production-only npm audit returned zero at audit time; advisory databases and upstream binaries can change.

The installed skill's working-tree scanner was run with private/runtime/build output excluded and without printing matched values. Its five leads were environment-variable access or generated local test credentials, not confirmed hardcoded live secrets. The independent inventory compared configured private values against tracked files and found zero matches. The history check examined reachable eligible text blobs up to 2 MiB and found no matches. Gitleaks/TruffleHog were not installed; this limited scanner is not equivalent to exhaustive secret detection, provider validation, binary scanning, unreachable-object scanning or a remote hosting secret scan. No automatic pre-commit secret scanner is currently configured; adding one remains a prevention improvement, not a confirmed exploit.

## Remaining unverified risks and deployment precautions

1. **Extractor egress:** Node story/photo HTTP connections enforce DNS and host checks. yt-dlp/FFmpeg remain external programs. The preliminary Instagram DNS check is not an OS-level egress sandbox, and it does not prove every redirect/secondary request inside those binaries is pinned. No practical remote SSRF exploit against an allowed Instagram input was demonstrated. Restrict the unprivileged worker's private/metadata-network egress on the VPS and test required public extraction/merge paths there. Do not claim DNS-rebinding protection for every subprocess request solely from the Node preflight.
2. **Trusted proxy boundary:** application rate buckets use forwarded client identity. The supplied Nginx templates overwrite visitor X-Forwarded-For, and Node must bind to 127.0.0.1. If the Node port is public or another proxy preserves spoofed headers, those limits cannot be trusted. Behind Cloudflare, restore real IPs only from trusted Cloudflare networks and restrict origin ingress; otherwise users may share an edge IP and be throttled together. No live Cloudflare settings were inspected or changed.
3. **VPS/TLS/supervision:** no systemd unit or Cloudflare deployment template exists in this checkout. Nginx executable/TLS certificates were unavailable on this Windows host, so `nginx -t`, actual HTTPS/HSTS, Linux permissions, process supervision/restart behavior and firewall rules were not verified. Review/install them separately; do not load both Nginx templates. The HTTP template is an internal proxy example, not a secure public-admin deployment.
4. **Private storage and capacity:** prepare a dedicated service-owned 0700 directory outside `public`, admin data and release assets. The new checks can intentionally reject an unsafe existing path; fix ownership/configuration before release rather than weakening the checks. On Windows review ACLs manually. Existing hard-crash orphan cleanup, disk quotas and sufficient space for parallel downloads/merge intermediates remain operational requirements; no destructive cleanup or private-data migration was performed.
5. **GA consent:** default-denied tracking, DNT/GPC, route exclusion and parameter allowlists passed local tests. A consent manager is still required for real visitor grants/withdrawal. Disable GA4 Enhanced Measurement and other automatic/user-provided-data collection as documented in `GA4_IMPLEMENTATION_REPORT.md`. Google property settings, real consent UX and receipt in Realtime/DebugView were not accessed. Do not silently enable consent or collect Instagram links.
6. **Instagram/Gmail availability:** `LOGIN_REQUIRED`, private/expired media and upstream rate limits remain access restrictions, not software defects or reasons to bypass authentication. No new live Instagram access was tested in this audit. Real Gmail SMTP authentication/inbox delivery still needs an owner-controlled release check; local OTP fixtures do not establish it. Optional real authorized story/gallery capabilities were not exercised with private accounts.
7. **Capability URLs and deployments:** downloads use random bearer job IDs rather than user accounts; possession grants access until expiry. Keep job URLs out of logs, caches and sharing. Run a single persistent application process as designed; multiple independent workers need shared job/queue state and were not validated. Keep a stable private SQLite/session directory across releases.

Before deployment: review the diff with prior uncommitted work, back up private SQLite/WAL/SHM/key data using the documented stopped-service procedure, build a separate Linux-compatible release, rerun the full checks, configure private storage/proxy/consent controls, and let the owner perform deployment. Do not copy `.env.local`, `.data`, session files or Windows binaries to a public release. `DEPLOYMENT_CHECKLIST.md` contains the full preservation/rollback steps.

Finding counts: **Critical 0; High 1 fixed (configuration-dependent); Medium 7 fixed; Low 2 fixed.** Dependency advisory entries still present: **3 development-only moderate; 0 production**. Unverified operational boundaries above remain outside the local pass decision.
