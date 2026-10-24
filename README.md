# SaveFrame

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

Stop the development server before building, since Next.js uses the same `.next` output directory for both modes.

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

Deploy the content files along with the application. There is no database or CMS dependency.

The production origin is configured as `https://saveframe.site` in `.env.production`. Change `NEXT_PUBLIC_SITE_URL` before building if the deployment domain changes. Development without an override uses localhost and disables indexing. With a public origin, published guides are crawlable, `/api/` is excluded from robots, and article metadata, Open Graph/Twitter images, BlogPosting/BreadcrumbList structured data, and sitemap URLs use that origin. Filtered/paginated listing URLs canonicalize to `/blog` and are marked noindex.

The blog has 15 articles dated 24 October 2026. The author is attributed to SaveFrame; no personal qualifications or testimonials are invented. Cover images are generated editorial illustrations in the supplied warm photographic style, not documentary photos or Instagram screenshots. Image prompts and asset notes are in `design-system/insta-save/IMAGE-NOTES.md`.
