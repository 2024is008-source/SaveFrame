# SaveFrame MP3 Audio Downloader — 27 October 2026

Implemented locally: six public tools now include Audio in the former Story position. The public story page is retired with HTTP 410. No commit, pull, push, deployment, production restart, database reset or session-file change was performed. The existing Next.js configuration, proxy configuration and production port configuration were not changed; deployment instructions below preserve the supplied port **3001**.

## Result and interface

- New route `/audio-downloader`, H1 **Instagram Audio Downloader**.
- Existing desktop/mobile navigation, five widget tabs, footer and tool listings reuse the former Story slot with Audio labels and music icons.
- Existing Photo, Reels, Video, Carousel and Profile tools remain; M4A choices in the other tools are retained.
- Input placeholder: **Paste Instagram Reel or video URL here**. Primary action: **Download Audio**.
- Real MP3 output choices: Standard 128 kbps, High 192 kbps and Best available up to 320 kbps. Bitrate is an encoding choice and cannot restore quality missing from the source.
- Following the user's clarification, Audio results have a **56×56 source thumbnail**, rather than the large media preview, aspect/shortcode row or zoom control. Source details, quality selection and download action retain the existing visual system. Other tools keep their full previews.
- Audio labels, quality explanations and affected homepage descriptions are translated across all ten languages. Existing language routing remains unchanged; there are no untranslated localized audio-page clones.

## Backend workflow

1. The existing public URL allowlist validates Reel/video-post URLs. The Audio tool rejects profile/story inputs; photo-only or known video-only posts without an accessible audio stream are rejected.
2. Existing yt-dlp/fallback metadata is reused, including the bounded cache and in-flight request coalescing. The audio presentation is a derived result; it does not replace the original metadata cached for other tools.
3. An accessible audio track is preferred. A supported combined video/audio stream is used when necessary. Existing source downloading, cached-info reuse, rate limits, queue, private temporary directory and public-access restrictions remain in force.
4. The source is downloaded under a child job key. Existing M4A extraction/demux behavior is reused; FFmpeg then performs the MP3 conversion from a local file.
5. Local probing checks that an audio stream exists and determines its duration. FFmpeg maps only the audio track, removes embedded metadata and produces the requested MP3 bitrate. The helper can stream-copy an already suitable MP3 input instead of unnecessarily re-encoding it.
6. Output size, MP3 header/signature and an actual FFmpeg decode are checked before preparing a successful artifact. The returned MIME type is `audio/mpeg`, the safe filename ends in `.mp3`, and job status includes file size and duration when available.
7. The intermediate source is removed in `finally`. Failed/cancelled partial MP3 output is deleted; the existing job-prefix cleanup also removes job-specific leftovers. Successful MP3 files use the existing retention/active-delivery rules.

### Bounds and security

- Source duration: **up to 600 seconds**. Unknown/invalid or longer durations are rejected after local probing.
- Source size/time: existing configured download limits remain; default source limit is 150 MiB and download subprocess deadline is 120 seconds.
- MP3 output cap: the smaller of the existing configured file limit and **32 MiB**.
- Conversion deadline: **60 seconds**; local probing and decode checks each have a **10-second** deadline.
- Entire audio preparation has a **240-second** deadline, with parent/child cancellation. The client allows up to 300 seconds for preparation polling, subject to existing queue behavior.
- FFmpeg uses bounded thread counts, a 64 MiB **per-allocation** limit and a ten-minute media-duration/output-size guard. The allocation limit is not presented as an OS-wide RSS limit.
- FFmpeg receives local input paths only, with `file,pipe` protocol restrictions and a `mov,mp3` input demuxer allowlist during probing/conversion. No submitted URL is passed as an FFmpeg input.
- Processes use the existing `spawn(..., {shell:false})` wrapper. Bitrates are a fixed allowlist; public input does not become a shell command or arbitrary codec/process argument.
- Existing SSRF/DNS/redirect protections and anonymous source-access restrictions are preserved. Private/login-restricted content is not bypassed. No Instagram password, cookie/session file or paid service is used by the public audio tool.
- No new external API, production dependency, database table, migration or persistent service was added.

## Story retirement and dependency assessment

`/story-downloader` and its trailing-slash form return **410 Gone**, with a clear retirement message and no redirect to Audio. Public resolve/download entry points reject direct story URLs and the old Story tool request. This includes the Next.js routes and the legacy HTTP adapter.

The old catalog entry, active navigation, widget controls, promotional supported-format row, public error/loading branches and tool-specific graph/sitemap entry are removed or replaced. The separate historical `story` analytics classification remains available so existing records are not lost or relabelled.

Story extraction/HTTP/session modules were audited rather than blindly deleted. They are still used by authorized owner-session CLI workflows and shared guarded transport/fallback code used by other media. They remain server-side and are not exposed through the retired public tool. Owner-session regression tests still pass.

The existing 15 articles, Markdown bodies and editorial modification dates are preserved. Story articles now show a retirement notice. Their obsolete tool CTA is removed, and old tool links render as preserved text instead of dead/undefined links. Generic editorial and privacy references to stories remain where appropriate.

Earlier live inspection showed the former route was publicly accessible, but Search Console traffic/backlink data was not available. No claim is made that it had zero traffic or backlinks. The route is genuinely retired at the user's request, so it returns 410 rather than an unrelated SEO redirect. Valuable historical guides remain available separately.

## SEO changes

`/audio-downloader` now has:

- SEO title: **Instagram Audio Downloader – Download Reels MP3**.
- Meta description: **Download audio from Instagram Reels and videos as MP3. Paste a public Instagram link, extract audio online, and save it for free. No signup required.**
- Self-canonical `https://saveframe.site/audio-downloader`.
- Open Graph and Twitter metadata using the existing metadata factory/social image.
- Existing WebPage/WebApplication/Organization/WebSite and breadcrumb graph pattern, with accurate audio page identity.
- Visible, accurate FAQs, instructions, duration/access limits and source-quality explanation.
- Crawlable links from navigation/footer and the existing cross-tool link section.

The sitemap still has **37 canonical URLs**: Audio replaces Story one-for-one. The ten homepages, five information pages, blog index and fifteen articles remain. The existing **110 reciprocal hreflang annotations**, including x-default, and editorial dates are preserved. Robots still references `https://saveframe.site/sitemap.xml`; the retired route is not blocked from crawling, allowing search engines to observe its 410 response.

Published admin SEO values remain higher priority. The new Audio catalog baseline uses the correct short SEO description while its visible page description stays separate. Existing retired-route override/history rows were not deleted or repurposed. Review any manually published homepage override that still advertises public story downloading; no admin data was silently rewritten.

After deployment, verify the Audio URL, selected canonical and sitemap in Search Console, and verify that Google can crawl the retired URL's 410. Indexing/ranking and sitelinks are not guaranteed by these changes.

## Analytics and preservation

The existing browser lifecycle remains `download_started`, `download_prepared`, `download_delivered`, `download_failed` and `media_resolved`. Audio adds **`audio_conversion_started`**, observed once when the MP3 conversion process is requested, rather than counting ordinary source extraction as MP3 conversion.

Classifications are `media_type=audio`, `download_format=mp3`, `download_method=single`, and the existing statuses plus `converting`. Existing custom dimensions can report these additional values; no new identifier dimension is required. Repeated polling/re-renders do not emit the same phase twice.

SQLite receives one original request and its conversion/preparation/handoff/failure transitions using the original country. The new conversion event does not create another request. Existing raw text columns support the new finite category/event values, so no migration is necessary. Country filtering/CSV accepts Audio; historical Story records and all other media categories remain unchanged.

The admin's Sri Lanka timestamp formatting is unchanged. Consent, regional gating, opt-out, GPC/DNT, public-route restrictions and private-admin exclusions remain intact. No Instagram link, uploader, private filename, cookies, job ID or raw errors are added to GA4. **A server handoff is not proof that a visitor saved a file.** GA4 receipt in the real property was not tested; local browser tests sent no Google requests.

## Test results

All required checks passed:

| Check | Result |
|---|---|
| `npm run typecheck` | PASS |
| `npm run lint` | PASS |
| `npm test` | PASS, including admin, security, existing downloader/preview, owner-story infrastructure, localization, blog, analytics, sitelinks and new audio tests |
| `npm run test:audio` | PASS: real FFmpeg MP3 generation at all three bitrates from authorized synthetic Reel/video fixtures, actual decode/non-silent signal, MIME/signature/headers, limits, private/photo/invalid rejection, cleanup, real subprocess cancellation and safe analytics |
| `npm run test:instagrapi` | PASS, including 15 Python fixtures; no Instagram requests in this offline suite |
| `npm run test:runtime` | PASS: actual binary readiness, muxing, M4A extraction and decoded audio |
| `npm run test:admin:live` | PASS against a disposable production instance/local SMTP sink; no external email |
| `npm run test:seo` | PASS: 37 URLs, 15 preserved dates, 110 language annotations, 38 indexable pages including blog pagination; Audio included and retired route excluded/410 |
| `npm run test:styles` / `test:performance` | PASS: real CSS/assets and existing performance/favicons regression checks |
| `npm run build` | PASS: Next.js 15.5.28 production compile, type/lint validation, page generation and privacy trace sanitization |
| `npm run test:sitelinks:browser` | PASS: desktop/mobile/native/no-JS navigation and all ten language homepages |
| `npm run test:audio:browser` | PASS: all ten translated audio widgets; desktop/mobile real MP3 downloads; three qualities; 56×56 thumbnail/no large audio preview; no overflow/runtime errors; no Google requests |

### Real public-media result, distinct from offline tests

The earlier user-supplied Reel `https://www.instagram.com/reel/Dejz50Ngpv8/` was accessible anonymously during testing:

| Quality | Observed result |
|---|---|
| 128 kbps | HTTP 200, `audio/mpeg`, `.mp3`, ID3 signature, 203,589 bytes; FFmpeg decoded actual audio; source duration 12.66 seconds |
| 192 kbps | Actual desktop browser MP3 download, 305,362 bytes |
| 320 kbps | Actual mobile viewport browser MP3 download, 508,908 bytes |

No login/cookies were used. These tests contacted the real source through the **isolated local implementation**, not a deployed production release. Access to one Reel does not guarantee all public media will remain available or behave identically from the VPS. Public `/p/` video handling was verified with offline fixtures; no separate live video-post result is claimed. Private/login-restricted/photo-only/error scenarios were verified through controlled fixtures. A headless browser accepting test bytes is not a new human-save acknowledgment in production analytics.

Evidence: `reports/audio-tests.json`, `reports/audio-live-check.json`, `reports/audio-live-download.json`, `reports/audio-browser.json`, `reports/seo-crawl.json`, and desktop/mobile screenshots. Test media bytes were temporary; no public fixture download endpoint or simulated-success production path was introduced.

## Created, changed and removed files

Created source/tests:

- `src/services/audio.ts` — MP3 presentation, quality presets, bounded local conversion/probe/signature/decode validation.
- `scripts/check-audio.cjs` — offline integration with real FFmpeg, queue, headers, cancellation and safe analytics.
- `scripts/check-audio-browser.cjs` — optional Playwright QA requiring an explicitly authorized `SAVEFRAME_AUDIO_TEST_URL` and loopback test server.

Changed backend:

- `src/services/yt-dlp.service.ts`, `src/services/download-manager.service.ts`, `src/types/media.types.ts` — source reuse, MP3 lifecycle, typed format/category/duration/conversion status.
- `src/security/url-validator.ts`, `src/api/media-router.ts` — audio input constraints and public story retirement guards.
- `src/app/api/media/resolve/route.ts`, `src/app/api/media/download/route.ts`, `src/app/api/media/jobs/[jobId]/route.ts`, `src/app/api/media/download/[jobId]/route.ts` — public guard, conversion status/duration projection and MP3 delivery extension.

Changed UI/SEO/localization:

- `public/saveframe.js`, `src/ui/saveframe.json`, `src/lib/navigation.ts` — Audio UI, parsing, music icons, lifecycle client events, compact thumbnail and crawlable links.
- All ten `src/i18n/dictionaries/*.json` files — accurate audio labels/quality/affected descriptions.
- `src/content/tools.json`, `src/content/search-titles.json`, `src/app/[locale]/page.tsx`, `src/app/layout.tsx`, `src/admin/catalog.ts` — tool replacement and metadata/catalog baselines.
- `src/middleware.ts` — retired route 410, without redirect.
- `src/app/blog/[slug]/page.tsx`, `src/components/blog/Markdown.tsx` — preserve story article bodies with retirement notice and remove obsolete tool CTAs/links.
- `src/content/information.json` — contact guidance no longer promotes active-story requests.

Changed operational classification/tests/docs:

- `src/admin/analytics.ts`, `src/admin/country-analytics.ts`, `src/lib/analytics.ts`, `src/components/admin/AdminDashboard.tsx`, `src/components/admin/CountryAnalytics.tsx`, `src/admin/seo-service.ts` — Audio category/event/filter/default-tool options, preserving history and preferences.
- `scripts/check-api-error-reporting.cjs`, `scripts/check-country-analytics.cjs`, `scripts/check-download-analytics.cjs`, `scripts/check-i18n.cjs`, `scripts/check-seo.cjs`, `package.json` — new feature/retirement/regression coverage.
- `src/ui/client-asset.json`, generated `public/assets/saveframe.*.js` — rebuilt content-hashed client; final manifest selects the current bundle. Earlier immutable assets may remain for cached pages.
- `README.md`, this report, and generated verification reports/screenshots.

**Removed source files: none.** The public feature/catalog entry is retired; shared/operator-dependent services and historical editorial sources were deliberately retained. No Markdown article body, SQLite file/migration, Instagram session/config file, Next.js production configuration, Cloudflare/Nginx file or port setting was modified.

## Contabo Ubuntu deployment commands — owner-run only

Nothing below was executed on the VPS. Review the release and use the existing deployment mechanism; no automatic Git pull/push or service restart has been performed.

1. Verify the current service, its protected environment and **port 3001**:

   ```bash
   sudo systemctl show saveframe.service -p User -p WorkingDirectory -p ExecStart -p EnvironmentFiles
   sudo ss -ltnp '( sport = :3001 )'
   ffmpeg -hide_banner -encoders 2>/dev/null | grep -F libmp3lame
   ```

   Use the existing configured FFmpeg path if it is not on PATH. Keep the current `PORT=3001` environment/ExecStart behavior. Do not launch a second process on that port, replace Nginx, or restart other sites.
2. Place the reviewed source in a separate release checkout through your approved workflow. Build on Linux rather than copying Windows `node_modules`. In that release directory run:

   ```bash
   npm ci
   npm run typecheck
   npm run lint
   npm test
   npm run test:runtime
   npm run build
   ```

   Keep the production data directory, admin key/database and Instagram sessions outside the release and preserve their existing protected configuration. No database migration/reset or new environment variable is required for MP3 support. Do not build over a directory currently served by `next start`.
3. Retain the previous complete built release. After explicit deployment approval, drain active downloads and select the reviewed release using the existing mechanism. Then restart only the existing SaveFrame service:

   ```bash
   sudo systemctl restart saveframe.service
   sudo systemctl is-active saveframe.service
   curl -sS -o /dev/null -w '%{http_code}\n' http://127.0.0.1:3001/audio-downloader
   curl -sS -o /dev/null -w '%{http_code}\n' http://127.0.0.1:3001/story-downloader
   ```

   Expect 200 for Audio and 410 for the retired Story page. Do not change the existing proxy upstream or port. No Nginx reload is needed for this application change.
4. Against the deployed server, run the public SEO check and test an authorized accessible source:

   ```bash
   TEST_BASE_URL=http://127.0.0.1:3001 npm run test:seo
   ```

   Verify an actual MP3 download, its duration/playback, local Audio request/conversion/preparation/handoff counts, country behavior and Sri Lanka timestamp display. Independently verify consent-eligible GA4 receipt in Realtime/DebugView if authorized. Do not treat local event fixtures as Google receipt.

For optional browser QA, supply an external Playwright installation through `SAVEFRAME_PLAYWRIGHT_PATH`, a loopback `TEST_BASE_URL`, an appropriate browser channel and an explicitly authorized `SAVEFRAME_AUDIO_TEST_URL`, then run `npm run test:audio:browser`. This is a test dependency only, not a production UI package.

Rollback by selecting the previous complete built release, including its matching client manifest/assets, and restarting only SaveFrame after draining work. No database restoration or record deletion is needed. Audio classifications already recorded should remain as historical data. Rolling back to an older release can restore its old Story behavior; do so only intentionally rather than adding a misleading Story-to-Audio redirect.
