# Tool search title and description update

Date: 2026-10-30

## Confirmed issue

All five live tool pages still served the previous metadata when checked. The photo page's source title was `Instagram Photo Downloader – Preview & Save Images | SaveFrame`; Google rearranged that into the title visible in the supplied screenshot. Carousel and audio also still served the old copy. This was not merely an outdated Google screenshot: the live site's HTML still contained the old titles and descriptions.

The old values came from `src/content/search-titles.json` and `src/content/tools.json`. Published admin fields take precedence over source defaults, so an old saved default could also restore retired copy after a source update. The former protection applied only to the homepage.

## New titles

| Page | Search / Open Graph / Twitter title |
| --- | --- |
| `/reels-downloader` | Instagram Reels Downloader – Free HD MP4 \| SaveFrame |
| `/photo-downloader` | Instagram Photo Downloader – Free HD Images \| SaveFrame |
| `/carousel-downloader` | Instagram Carousel Downloader – Photos & ZIP \| SaveFrame |
| `/audio-downloader` | Instagram Audio Downloader – Reels to MP3 \| SaveFrame |
| `/video-downloader` | Instagram Video Downloader – Free HD MP4 \| SaveFrame |

The Reels, photo, carousel and audio descriptions match the supplied screenshots. The video screenshot supplied a title only; its matching description is:

> Download Instagram videos in HD MP4 for free. Paste a public video link, preview available quality and save it to your phone or PC. No login required.

The new descriptions also appear in the visible page introduction and existing page schema, while page headings retain the clear tool names. Existing body copy continues to explain source quality, available audio and public-access limits. No download behavior, UI structure, CSS, animation, consent logic or authentication behavior was changed.

## Override handling

Known retired defaults are ignored for the five affected routes in normal titles/descriptions, social titles/descriptions and content descriptions. The admin editor previews the corrected current defaults for those exact retired values. Deliberate custom admin titles and descriptions remain supported. Other routes are unaffected.

Rendering and editor reads do not rewrite stored overrides, revisions, audit records or migrations. Regression tests use a disposable SQLite database and verify that those records remain unchanged. The production database was not edited.

## Verification

- `npm test`: passed, including new tool metadata/override regressions and existing downloader/security/privacy/admin suites.
- `npm run lint`: passed.
- `npm run typecheck`: passed.
- `npm run build`: passed, including build privacy checks.
- Production HTML verification: all five routes have exactly one title and meta description, the requested title/description, matching Open Graph/Twitter values, one appropriate H1 and the existing canonical URL. This ran with stale published defaults seeded in an isolated test database and overrides enabled.
- `npm run test:seo` against the local production server: passed.

Evidence: `reports/tool-search-metadata-before.json` records the live production metadata before changes; `reports/tool-search-metadata-after.json` records the corrected local production HTML. Re-run `node scripts/check-tool-seo.cjs` for override regressions. With a production preview running, set `TEST_BASE_URL` and run `node scripts/check-tool-seo-live.cjs` to verify rendered metadata.

## Google results and deployment

These changes are local. No push, deployment or Search Console action was performed. The live site continues to serve its deployed version until the approved release is deployed. After deployment, inspect the canonical tool URLs in Search Console and request reindexing.

Google chooses result titles automatically and can use headings and other sources; it may rearrange or replace a supplied title. Updating source metadata cannot force the exact title text or an immediate search-result refresh. See [Google's title-link guidance](https://developers.google.com/search/docs/appearance/title-link). Google also generates query-dependent snippets and may use page content rather than the meta description; see [Google's snippet guidance](https://developers.google.com/search/docs/appearance/snippet). No guaranteed reindexing date or exact search-result wording is claimed.
