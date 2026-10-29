# SaveFrame unsupported-feature removal

Completed locally on 29 October 2026. Nothing was pushed or deployed.

The attached audit was used as reference material. The user's request to remove Story-related functionality determined the scope; the embedded Codex prompt was not treated as a separate instruction.

## Removed

- Story downloader/viewer wording from all ten locale dictionaries, including obsolete translation keys, metadata lookups, instructions, limitations, FAQ and guide copy.
- Both Story guides and their source articles, search titles, cover images, category and sitemap entries. The homepage now features the existing PC video guide alongside Photos and Reels, retaining the three-card design.
- Story references in the current information pages, tool copy, retained articles and active setup documentation.
- Story artwork and outdated generated browser bundles that contained removed feature code. The social SVG and PNG now list MP3 Audio instead.
- The dedicated extraction pipeline, owner-only download entry points and CLI commands, worker branches, Story-specific configuration fields, media types, error codes, analytics categories, filters and success tests.

The bounded HTTP media transport remains available for supported photo/video downloads and the optional fallback extractor. Its names and messages now describe media generally. Anonymous extraction restrictions, SSRF controls, byte limits, cancellation, signature checks and GA4 consent/privacy behavior remain covered by tests.

## Old URLs and compatibility

Six retired tool/viewer/article URLs, including trailing-slash variants, return HTTP 410 with `noindex, follow` and a generic page-removal message. They do not redirect to unrelated content or publish a Story guide.

Both public APIs and underlying validation reject `/stories/` and `/highlights/` inputs with HTTP 400 `UNSUPPORTED_MEDIA_TYPE` before extraction. Browser validation rejects them without making an extraction request. Unsupported tool selectors are also rejected.

The only remaining Story references in active application source are explicit rejected/removed URL checks and compatibility matchers for old published SEO defaults. Those matchers prevent old database titles and descriptions from reappearing. Historical database records, previous audit evidence and protective exclusions for old temporary session directories were preserved; they do not provide a feature or advertise it.

## Rendered homepage metadata

- Title: `Instagram Video, Reels & Photo Downloader | SaveFrame`
- Description: `Download public Instagram Reels, videos, photos, carousels, and MP3 audio with a simple link. Fast, clean, mobile-friendly web utility.`
- The description translation key now uses that same Audio wording. Open Graph and Twitter descriptions use the supported-feature copy as well.
- Sitemap: 35 canonical URLs, including 13 retained guides. All 110 reciprocal language annotations remain intact.

## Verification

Passed:

- `npm test`, including the new retired-media regression checks, all ten locales, backend security, downloader, MP3 conversion, admin, blog and GA4 privacy/event checks.
- `npm run lint`, `npm run typecheck` and `npm run build`.
- `npm run test:instagrapi`, including nine offline Python worker/security tests and bounded subprocess/direct-download tests.
- Local production `npm run test:seo`: 35 canonical sitemap URLs, 13 preserved editorial dates, 36 indexable pages, 48 internal destinations, language annotations, canonical/social metadata, robots and link checks.
- Local production blog, internationalization and performance checks: retained articles, search/category/pagination, responsive images, hashed assets and localized homepages.
- Browser checks at 1440, 768 and 390 pixels: five supported tabs, no Story copy, no horizontal overflow or JavaScript exceptions, loaded replacement guide images, and unsupported-input feedback without extraction.
- Actual local HTTP checks: all six removed URLs return 410/noindex; both media endpoints return 400 with `UNSUPPORTED_MEDIA_TYPE` for Story URLs.

Browser evidence: `reports/story-removal-browser.json`. Screenshots: `reports/story-removal-ui/`. SEO crawl: `reports/seo-crawl.json`.

Browser external requests were blocked. No live Instagram extraction or real GA4 receipt is claimed. Previously passing build/design checks were not represented as a complete visual redesign.
