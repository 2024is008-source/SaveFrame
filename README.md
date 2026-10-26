# SaveFrame

## SEO and public pages

Dedicated English tools are available at `/reels-downloader`, `/video-downloader`, `/photo-downloader`, `/carousel-downloader`, `/story-downloader` and `/profile-viewer`. They share the existing downloader and have distinct server-rendered instructions and FAQs. `/about`, `/contact`, `/privacy`, `/terms` and `/copyright` provide crawlable information pages. Existing homepage query links and ten language URLs still work.

`npm run test:seo` crawls the running production preview, checks metadata, headings, canonical URLs, structured data and internal links, and writes `reports/seo-crawl.json`. The sitemap includes 37 canonical URLs; unfiltered blog page two is separately indexable with its own canonical. API responses carry noindex headers and are excluded from the sitemap.

Support and copyright contact addresses are configured with `SAVEFRAME_SUPPORT_EMAIL` and `SAVEFRAME_COPYRIGHT_EMAIL`; the approved public address is `backbencherz@gmail.com`. See `SEO_IMPLEMENTATION_REPORT.md` for the complete audit, changes, tests and deployment requirements. The Nginx TLS file is a deployment example, not a change to a running server.

## Homepage languages

The shared homepage supports English `/`, Spanish `/es/`, Brazilian Portuguese `/pt-br/`, German `/de/`, French `/fr/`, Japanese `/ja/`, Indonesian `/id/`, Turkish `/tr/`, Hindi `/hi/`, and Arabic `/ar/`. Localized pages render on the server with their own metadata, canonical URLs, language alternatives and sitemap entries. Arabic uses RTL. Blog and legal content stays English.

Translations are maintained in `src/i18n/dictionaries/*.json`. Keep all ten files in sync with the English key set and preserve named interpolation placeholders. Only the active dictionary is sent to the browser. The language selector navigates to the selected language URL and retains the active tool when applicable. No automatic locale redirect is used.

Run `npm run test:i18n`, then build and start the application. With the server running, `node scripts/check-i18n-live.cjs` checks all ten routes and international SEO. See `design-system/insta-save/MULTILINGUAL-DELIVERY.md` for the complete implementation and validation report.

Instagram media downloader built with Next.js. The interface preserves the supplied SaveFrame design and displays media returned by the backend. No sample results or developer controls are shown.

## Run locally

```powershell
npm install
python -m venv .runtime
.\.runtime\Scripts\python.exe -m pip install yt-dlp imageio-ffmpeg
npm run dev
```

Open http://localhost:3000. On Windows, the server automatically finds yt-dlp and FFmpeg in the project’s `.runtime` directory. Alternatively, set `YTDLP_BINARY_PATH` and `FFMPEG_BINARY_PATH` in `.env.local` to existing executable paths. Other platforms can install the tools on their PATH or use those variables.

The local runtime packages are installed from the [yt-dlp](https://github.com/yt-dlp/yt-dlp/wiki/Installation) and [imageio-ffmpeg](https://github.com/imageio/imageio-ffmpeg) projects.

## Production

Development writes to `.next-dev`; production builds and `npm start` use `.next`. This prevents a development server from overwriting the production CSS and JavaScript assets. Run `npm run build` before `npm start`, and restart the production process after rebuilding. Do not rebuild `.next` while a production process is serving it.

```powershell
npm run build
npm start
```

## Supported access

Paste a public Instagram photo, Reel, video, active story, or profile URL. The app resolves available metadata and formats, then prepares the selected download through a background job. Private, deleted, expired, login-restricted, and rate-limited content returns an error instead of a fabricated result. Instagram may restrict access even to links viewable in a signed-in browser.

`GET /api/health` checks yt-dlp, FFmpeg, temporary storage, and the job store. Redis is optional; the local server uses its in-memory store when Redis is not configured.

## Blog and images

The homepage's guide cards link to real articles at `/blog/[slug]`. `/blog` supports search, category filters, and pagination through ordinary GET links and forms, so the catalog does not require a client-side search bundle.

Published article records live in `src/content/blog/posts.json`; each body is a Markdown file named after its slug in the same directory. To add an article:

1. Write an original Markdown body using paragraphs, `##`/`###` headings, lists, links, bold text, and inline code. Raw HTML is not supported.
2. Add its metadata record with a unique slug, accurate description, category, keyword, author, actual publication/modification dates, cover basename and alt text, and matching downloader `tool`.
3. Use `published: false` while drafting. Drafts are excluded from the listing, article lookup, related posts, static article routes, and sitemap.
4. Put optimized WebP covers in `public/images/blog/` at 480, 960, and 1200 pixels wide. Use a unique cover for each article; checks reject repeated cover names and identical files.
5. Run `npm run test:blog`, then stop the running app and run `npm run build`. Content is generated statically, so publication changes require a new build.

Deploy the content files along with the application. Blog articles remain file-based; private administration now uses a persistent SQLite database outside the public directory.

The production origin is configured as `https://saveframe.site` in `.env.production`. Change `NEXT_PUBLIC_SITE_URL` before building if the deployment domain changes. Development without an override uses localhost and disables indexing. With a public origin, published guides are crawlable, `/api/` is excluded from robots, and article metadata, Open Graph/Twitter images, BlogPosting/BreadcrumbList structured data, and sitemap URLs use that origin. Filtered/paginated listing URLs canonicalize to `/blog` and are marked noindex.

The blog has 15 articles dated 24 October 2026. The author is attributed to SaveFrame; no personal qualifications or testimonials are invented. Cover images are generated editorial illustrations in the supplied warm photographic style, not documentary photos or Instagram screenshots. Image prompts and asset notes are in `design-system/insta-save/IMAGE-NOTES.md`.
## Direct story images and videos

The Story tool accepts one active story image or video URL containing `/stories/username/story-id/`. It tries yt-dlp, then a bounded canonical-page HTTP fallback on recoverable errors, then optional gallery-dl when explicitly enabled. Profile links, whole-account stories and bulk story downloads are rejected. Public requests remain anonymous; no paid provider or shared account is configured. Instagram login restrictions remain explicit failures. See [hybrid story architecture and configuration](docs/HYBRID_STORIES.md) for deadlines, security checks, optional operator-only authorization and deployment steps.

Run `npm run test:stories` for offline provider, image/video/audio, transport, cancellation, authorization and error fixtures. Add `-- --live-url=https://www.instagram.com/stories/username/story-id/` for an explicitly requested live test on a disposable local production server after building.

## Media previews and public avatars

Desktop media previews preserve source proportions. Mobile keeps compact 4:3 cards; tap the main photo or video to open an accessible dialog showing the full media. Videos have a centred transparent play control and native playback controls. Preparation is on demand, uses the existing bounded queue, supports byte-range seeking and does not increase download or delivery totals. Closing by button, backdrop or Escape preserves the current result and scroll position. `npm run test:preview` checks partial responses, attachment compatibility and error recognition across route-module reloads.

The profile tool can save an avatar already exposed by Instagram's unauthenticated public response, including an avatar belonging to a private account. It does not access private posts or restricted pictures, infer unavailable dimensions or promise HD. The supplied `@ama_shaa_` profile downloaded a valid 2,579-byte JPEG on 26 October 2026. The supplied `sula_dewmini/4016120619302180887` story returned `403 LOGIN_REQUIRED` on the fresh production preview. See `reports/media-live-2026-10-26.json` for the results.

## Private administration

Use Node.js 24+, run `npm run admin:setup` to choose your administrator password privately, then open `/admin/login`. There are no default credentials. The dashboard and its APIs require server-side authentication, and admin URLs are excluded from indexing and the sitemap. Local admin setup email is configured in ignored `.env.local`; it does not change the public support email.

Read [ADMIN_SETUP.md](ADMIN_SETUP.md) for local preview, HTTPS hosting, persistent data, backups, optional two-factor authentication and recovery. [ADMIN_IMPLEMENTATION_REPORT.md](ADMIN_IMPLEMENTATION_REPORT.md) records the implementation, checks and limitations.

## Final audit and hosting

Read `FINAL_AUDIT_REPORT.md` and `DEPLOYMENT_CHECKLIST.md` before deployment. The final audit supersedes earlier readiness statements; historical reports are preserved.

`npm run lint` runs ESLint without interactive setup. `npm test` includes security, queue/cleanup, local photo/profile fixtures and CLI recovery checks. `npm run test:runtime` verifies the installed binaries and creates only disposable local media for real FFmpeg mux/audio checks. Instagram network access is a separate test: a valid story URL can still return `LOGIN_REQUIRED`. No authenticated Instagram connection or paid provider is configured.

The system-failure score and chart count confirmed internal errors only: INTERNAL_ERROR, YTDLP_NOT_INSTALLED, FFMPEG_ERROR, INSUFFICIENT_DISK_SPACE, PROCESS_RESTARTED and DELIVERY_STREAM_ERROR. Instagram access restrictions, ambiguous upstream extraction failures/timeouts, invalid input, configured size/rate limits and visitor cancellations remain in recent issue history and are excluded from that score. Preparation totals remain separate lifecycle metrics. Requests rejected by the rate limiter are not written as individual analytics events.

Metadata work is coalesced per link with at most three simultaneous inspections. Successful metadata, including public photos and profile pictures, is retained for two minutes in an eight-entry memory cache. Downloads default to three active jobs, with a maximum of twenty waiting jobs; use `MAX_CONCURRENT_DOWNLOADS=1` or `2` for a small VPS and measure actual load. ZIPs stream in bounded chunks and are size checked before packaging. No external cleanup cron is required, and active jobs are not removed by the retention sweep.
