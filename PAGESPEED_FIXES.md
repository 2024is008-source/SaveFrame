# SaveFrame PageSpeed fixes — 26 October 2026

Reviewed the supplied [mobile report](https://pagespeed.web.dev/analysis/https-saveframe-site/15w0j8n5wu?form_factor=mobile) and [desktop report](https://pagespeed.web.dev/analysis/https-saveframe-site/15w0j8n5wu?form_factor=desktop), captured at 9:07 AM on 26 October 2026. These are **before-change measurements of the deployed site**, not scores for the local changes.

| Metric | Mobile | Desktop |
|---|---:|---:|
| Performance | 90 | 98 |
| Accessibility | 89 | 91 |
| Best practices | 100 | 100 |
| SEO | 100 | 100 |
| FCP / LCP | 2.9s / 2.9s | 0.7s / 0.7s |
| Total blocking time | 30ms | 0ms |
| Layout shift | 0.02 | 0.006 |

Neither report has sufficient real-user field data. Lab scores do not establish a Core Web Vitals field pass.

## Implemented

- **Render-blocking fonts:** removed the external Google Fonts stylesheet (reported 750ms on mobile). Inter 400–600 and Plus Jakarta Sans 600–700 now use local variable WOFF2 files, explicit font preloads, metric-adjusted Arial fallbacks and `font-display: swap`. The existing families and colors remain. Unsupported scripts retain their existing system fallbacks. Both OFL licenses are included. Builds use checked-in files and need no font-provider connection. Explicit preload links also avoid the empty font preload manifest observed in this Windows Next.js build.
- **Image delivery:** homepage cards now offer 360, 480, 640, 720 and 960px WebP variants, accurate `sizes` values, dimensions and lazy loading. The intermediate sizes cover the approximately 662px image resource identified by the mobile report; the 360px rendition fits the approximately 355px desktop card. Quality is 78, generated from the retained 1200px sources. Existing original images and article covers remain intact.
- **Asset caching:** generated thumbnails, fonts and script have content hashes in their filenames and `public, max-age=31536000, immutable`. Updates produce new URLs. HTML, media APIs and admin responses retain their existing freshness/security behavior.
- **JavaScript minification:** the public client script is minified during `prebuild`/`predev` with the existing Next.js Terser dependency. Raw size falls from 53,879 to 35,549 bytes, about 34%. The readable source remains `public/saveframe.js`; no new UI dependency was added.
- **Contrast:** pink and orange step-label text uses darker shades on the same light backgrounds, exceeding WCAG AA normal-text contrast. The rest of the brand palette remains.
- **Definition lists:** each feature group now directly contains its `dt` and `dd`; decorative icons live inside `dt`. This addresses both definition-list failures and the associated agentic accessibility-tree warning, without changing the row layout.
- **Mobile targets:** footer links have a 44px minimum touch height below 768px.
- **Guide links:** image, heading and read-guide links now have the same specific accessible article name for each destination.
- **Favicon on every HTML route:** root metadata defines the SaveFrame brand SVG, 16/32px PNG icons, multi-size ICO shortcut, 180px Apple Touch icon and manifest with 192/512px icons. Public pages, translations, articles and admin pages inherit this metadata. This does not make private admin routes indexable. API/file responses are not HTML pages and need no favicon tags.

## Verification

- Production build, TypeScript and ESLint pass.
- `npm test` passes admin/security/downloader/story/localization/blog checks. Media access fixtures do not prove every Instagram URL is downloadable.
- `npm run test:performance` checks actual HTTP responses: local font preloads/WOFF2 signatures, immutable asset cache headers, all 15 responsive images, minified script syntax, semantic feature groups and favicon metadata on 39 public/login URLs.
- Authenticated browser checks confirm the shared favicon and fixed desktop sidebar on all seven admin sections.
- Production browser checks at 320, 375, 390, 430, 768, 1024 and 1440px cover home, blog and admin login: 21 checks, no recorded horizontal overflow, broken loaded images or missing H1/favicon. Invalid-domain validation and FAQ expansion work with the minified script; mobile footer links measure 44px.
- Public SEO, styles, localization and blog HTTP checks pass. An initial health check briefly reported degraded; the subsequent health response and repeated localization suite passed. No health error was suppressed.
- Original report text and responsive results are in `reports/pagespeed-*-original.txt` and `reports/pagespeed-responsive.json`.

## Remaining report items and deployment retest

Next.js/React account for the reported approximately 43KiB of unused JavaScript and approximately 12KiB of first-party compatibility transforms. They support the current application framework; removing them would require a broader architecture or framework-version change. No dependency internals or browser compatibility shims were patched. The small render-blocking application CSS remains necessary to render the design correctly.

Cloudflare's injected beacon accounts for its own cache/compatibility warnings. Its delivery policy is outside this repository; no Cloudflare settings were changed. The reported forced reflow was unattributed, and the two long tasks were already accompanied by 30ms/0ms TBT. This audit does not claim to have eliminated those findings without a fresh trace.

The unscored CSP, Trusted Types, COOP and HSTS suggestions are deployment-policy work, not failures of the reports' 100 best-practices score. A strict policy must be designed against actual Next.js hydration, media and HTTPS hosting; arbitrary blocking policies were not added.

**Changes are local, not deployed.** After releasing the updated build, rerun both PageSpeed modes on `https://saveframe.site/` and compare equivalent cold loads. No new live score or guaranteed 100 score is claimed. See `FINAL_AUDIT_REPORT.md` for the wider backend/security audit and unresolved story/provider/hosting checks.
