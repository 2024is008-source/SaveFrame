# SaveFrame hybrid story report — 26 October 2026

## 1. Existing architecture

Next.js routes validate input and use `YtDlpService`, its bounded metadata cache, the existing download manager/queue, private temporary files and signed delivery job IDs. yt-dlp/FFmpeg handle established video/audio paths; the existing Instagram adapter handles public photo/profile responses. Reusing these boundaries avoids a second downloader service or browser process.

## 2. Extraction strategy

Exact story link → yt-dlp → canonical-page HTTP parser on recoverable failure → optional gallery-dl on recoverable failure → approved-CDN signature probe → existing download queue. Images and progressive videos are supported; explicitly confirmed audio can be extracted as M4A with the existing FFmpeg binary. Exact 64-bit story identifiers are preserved without numeric rounding. A thumbnail is not accepted as a story image.

Login/access denial, explicit expiry/not-found, unsafe URLs and invalid media stop extraction. There is no fallback intended to bypass access restrictions. The optional authorized command uses a requester/account allowlist, external private files, disposable filtered sessions and isolated results. No public visitor can invoke another person's Instagram session.

## 3. Files created and modified

Created: `src/services/instagram-http.service.ts`, `src/services/story-extraction.service.ts`, `scripts/check-hybrid-stories.cjs`, `scripts/check-story-live.cjs`, `scripts/story-authorized.cjs`, `scripts/sanitize-build-traces.cjs`, `docs/HYBRID_STORIES.md`, `reports/hybrid-story-live.json`, this report.

Modified for hybrid integration: `src/services/yt-dlp.service.ts`, `src/types/media.types.ts`, `src/security/url-validator.ts`, `src/app/api/media/resolve/route.ts`, `src/services/download-manager.service.ts`, `src/app/api/media/download/route.ts`, `public/saveframe.js`, `src/content/tools.json`, `scripts/check-stories.cjs`, `scripts/check-preview.cjs`, `package.json`, `next.config.ts`, `README.md`, `src/ui/client-asset.json` and its generated hashed public client file. `check-preview.cjs` was created during the preceding media-preview work and extended here to verify preview accounting isolation.

Other earlier UI/preview/DP changes and the subsequent GA integration remain separate working-tree changes; this report does not claim they were all introduced by the hybrid extractor.

## 4. Dependencies and reference review

No npm dependency or global tool was added. Existing yt-dlp and FFmpeg are reused. gallery-dl is an optional external executable, disabled by default; no real gallery binary was installed. Its command contract was tested with an explicit local executable fixture.

Reviewed [Jodu555's reference project](https://github.com/Jodu555/Instagram-Story-Downloader), its [package declaration](https://github.com/Jodu555/Instagram-Story-Downloader/blob/master/package.json) (ISC declared), and [Downloader.js](https://github.com/Jodu555/Instagram-Story-Downloader/blob/master/src/Downloader.js). No source was copied. Its old authenticated endpoints, shared global session, bulk loops and HTTPS-to-HTTP rewriting were unsuitable for this public application. Also reviewed official [yt-dlp Instagram extraction](https://github.com/yt-dlp/yt-dlp/blob/master/yt_dlp/extractor/instagram.py), [gallery-dl Instagram extraction](https://github.com/mikf/gallery-dl/blob/master/gallery_dl/extractor/instagram.py) and [gallery configuration](https://github.com/mikf/gallery-dl/blob/master/docs/configuration.rst). No GPL gallery source was embedded.

## 5. Actual verification results

Passed: typecheck, ESLint, the full `npm test` regression chain, story provider/transport fixtures, admin/security/downloader/preview tests and production build. The real runtime check passed video encoding, AAC muxing, M4A extraction and non-silent decoded audio on Node 24.18.0, yt-dlp 2026.10.21 and FFmpeg 7.1.

Fixtures exercise images/videos/audio, exact-ID matching, provider ordering, terminal errors, unknown dimensions, DNS pinning/private-IP rejection, redirects, MIME/signatures, size/time/output bounds, cancellation, subprocess termination, shared metadata requests, failure caching, exclusive file ownership, cleanup, authorized-session scope and public-cache isolation. They are not evidence of live Instagram extraction success.

Production tracing originally enumerated private runtime state on Windows. Session operations now use runtime-only Node builtins, and build packaging excludes private-state entries. The postbuild guard normalizes Windows paths and removes only manifest references; original databases, session keys and environment files remain untouched.

## 6. Live story URL genuinely tested

`https://www.instagram.com/stories/sula_dewmini/4016120619302180887/`

The disposable production server returned **HTTP 403, LOGIN_REQUIRED**, in **3,225 ms**, with anonymous access and no paid provider. `liveDownloadSucceeded` is **false**. See `reports/hybrid-story-live.json`. No other active story was supplied; no accessible live story image/video success is claimed. Earlier metadata inspection also found no playable story source on the public canonical page.

## 7. Authentication

The supplied story requires login from this environment. Public requests stay anonymous. Optional operator-only authorized extraction is implemented and fixture-tested, but real authorized access was not tested because no private session was configured. It does not make authenticated access available to public visitors.

## 8. Remaining Instagram restrictions

Expired/deleted/private/login-gated/rate-limited media can remain unavailable. A signed-in browser playing a public account's story does not guarantee anonymous server access. Current response parsing cannot predict future Instagram schema changes. No CAPTCHA/challenge handling, credential harvesting, private-account bypass, profile-wide stories, highlights or bulk stories were implemented.

## 9. VPS resources

No browser automation, Redis or persistent auxiliary service. Default provider deadline is 45 seconds, including termination grace; metadata responses/stdout are capped at 2 MiB. Existing three-operation metadata cap, three-download default queue concurrency, twenty queued jobs, eight-entry caches and private-file retention remain in force. Transfers stream with backpressure and the existing default 150 MiB file limit. FFmpeg audio work uses local input and should be budgeted with other queued jobs. Run private operator commands serially on a small VPS.

## 10. Deployment

Review `docs/HYBRID_STORIES.md` and the existing deployment checklist. Build/test a separate release using Node 24+ and Linux-compatible yt-dlp/FFmpeg. Leave gallery/auth disabled unless deliberately configured. Optional gallery installation uses a project-local Python environment; optional authorization uses external private files with restricted permissions and account scope. Preserve production `.env`, private SQLite records, admin credentials, session keys, verification files and Nginx. Never copy Windows binaries or private working data into a release.

No commit, push, deployment or existing service restart was performed. The later GA request adds only the explicitly authorized public measurement variable to production environment configuration; no private story/session credentials were edited.
