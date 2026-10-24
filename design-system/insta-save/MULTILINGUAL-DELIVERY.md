# SaveFrame homepage localization — 24 October 2026

The homepage now supports ten languages through one shared UI template. Translated HTML is rendered on the server; search engines do not depend on a browser-only language toggle. The downloader backend, APIs, yt-dlp and FFmpeg code are unchanged. Existing articles, blog pages and legal content remain English.

## Routes

| Language | Local preview | Production canonical |
|---|---|---|
| English | http://localhost:3000/ | https://saveframe.site/ |
| Spanish | http://localhost:3000/es/ | https://saveframe.site/es/ |
| Brazilian Portuguese | http://localhost:3000/pt-br/ | https://saveframe.site/pt-br/ |
| German | http://localhost:3000/de/ | https://saveframe.site/de/ |
| French | http://localhost:3000/fr/ | https://saveframe.site/fr/ |
| Japanese | http://localhost:3000/ja/ | https://saveframe.site/ja/ |
| Indonesian | http://localhost:3000/id/ | https://saveframe.site/id/ |
| Turkish | http://localhost:3000/tr/ | https://saveframe.site/tr/ |
| Hindi | http://localhost:3000/hi/ | https://saveframe.site/hi/ |
| Arabic | http://localhost:3000/ar/ | https://saveframe.site/ar/ |

These production addresses describe configuration, not deployment. English has no `/en/` alternative. Unsupported locales and localized non-homepage paths such as `/es/blog` return 404. A locale URL without its final slash redirects to the slash form. Existing non-homepage pages retain their no-trailing-slash convention. Middleware excludes API and asset paths.

## Files created

- `src/i18n/config.ts`: supported locale types, paths, language labels, BCP 47 tags and Open Graph locale identifiers.
- `src/i18n/dictionaries/{en,es,pt-br,de,fr,ja,id,tr,hi,ar}.json`: ten dictionaries, each containing 233 keys.
- `src/i18n/server.ts`: dictionary loading and English fallback, typed translation keys, interpolation, homepage metadata and language alternatives.
- `src/i18n/homepage.ts`: localization of the existing template, HTML text and accessibility attributes, selected dropdown option, English editorial copy isolation and selected-language client payload.
- `src/app/[locale]/page.tsx`: shared localized homepage route with unsupported locale checks.
- `src/middleware.ts`: exact homepage locale detection, canonical slash handling and a trusted locale request header for the root document.
- `next.config.ts`: allows the middleware to manage homepage-specific slash rules.
- `scripts/check-i18n.cjs`, `scripts/check-i18n-live.cjs`: dictionary, runtime and HTTP checks.
- This delivery document.

## Files modified

- `src/app/page.tsx`: English uses the same shared renderer and localized metadata helper.
- `src/app/layout.tsx`: server-rendered HTML language and direction from the validated request locale.
- `src/app/sitemap.ts`: adds all localized homepages and language alternatives while retaining all existing blog entries.
- `src/app/globals.css`: scoped RTL rules, script-appropriate font fallbacks and layout accommodations for longer translations.
- `src/components/SaveFrameReference.tsx`: scoped homepage wrapper class; existing Script initialization retained.
- `public/saveframe.js`: removes the partial translation toggle; localizes tool configuration, validation, format labels, result controls, clipboard feedback, loading, download progress, completion and error codes. API requests and download processing retain their existing behavior.
- `package.json`: adds `test:i18n`.
- `scripts/check-blog-live.cjs`: expects 26 sitemap entries rather than 17.
- `README.md`: localization editing and verification instructions.

The original `src/ui/saveframe.json` template and all blog Markdown files were left unchanged.

## Translation management

The English dictionary defines the shared key set. Most keys are the original English phrase; contextual navigation keys use `nav.downloader` and `nav.viewer`. Keep the same keys in all ten JSON files. Values are plain text, escaped before insertion into HTML. `TranslationKey` derives from the English JSON type. Interpolated values use named placeholders such as `{progress}`, `{index}`, `{count}` and `{label}`. Their names must match across languages.

Only the active dictionary is serialized into the homepage, rather than all ten. Unexpected missing values fall back to English, and tests enforce full dictionary coverage before release. New visible template text or new runtime messages should be added to every dictionary. Run `npm run test:i18n` after editing. Deploy `src/i18n/dictionaries/` with the application; the server loads these files locally and caches them per process. Restart after dictionary changes in production.

The shared template retains its IDs, classes, section hierarchy, colors, spacing and interactions. Short contextual navigation translations prevent long labels wrapping in the header. Localized layouts use the existing mobile menu between 768px and 1100px when desktop navigation would crowd the header. At phone widths, the closed language control and brand subtitle have bounded widths; all native dropdown options retain their full labels. This preserves the existing controls and design while accommodating translated text.

## Language switching

The existing selector has all ten requested native-language labels. Selecting one performs a normal navigation to its exact homepage URL. The selected option comes from that URL, and the active tool is carried in `?tool=` when applicable. Browser back and forward restore the language. There are no IP-based redirects, automatic language guessing or preference cookies. Feature links continue operating on the current localized homepage. Blog links lead to the existing English `/blog` routes.

## RTL and editorial boundaries

Arabic has server-rendered `lang="ar"` and `dir="rtl"`. Other languages use LTR; Portuguese uses `lang="pt-BR"`. URL input remains LTR, technical strings are isolated, dropdowns anchor to the correct side, and keyboard tab navigation accounts for RTL. Arabic, Japanese and Hindi have appropriate font fallback stacks. Blog-preview headings, dates, reading labels and navigation translate; article titles and descriptions remain English with English/LTR attributes and an English-article tooltip. Legal dialogs remain English, explicitly marked English/LTR.

## International SEO

Each homepage has a localized title and description, self-canonical URL, Open Graph title/description/URL/locale and Twitter metadata. Each references all ten language versions plus `x-default` pointing to English. URLs derive from `NEXT_PUBLIC_SITE_URL`, configured as `https://saveframe.site` in `.env.production`. Next.js may serialize the English root canonical without a final `/`; it represents the same root URL. Other language canonicals preserve their final slash.

The sitemap has 26 entries: ten homepages, the blog index and fifteen articles. Homepage entries include reciprocal language alternatives. Existing robots behavior is preserved. Homepage-specific alternatives do not leak into blog metadata. Middleware overwrites any client-supplied locale header and keeps non-homepage pages in English.

## Validation and limits

- `npm run test:i18n`: passed, ten complete 233-key dictionaries, interpolation parity, shared markup IDs, selected client payload, English editorial content, metadata, selected switcher option, runtime tool labels, format labels, progress and error-code translations.
- `node scripts/check-i18n-live.cjs`: passed for all canonical homepage URLs, translated server HTML, metadata, language/direction, eleven alternate links per homepage, slash redirects, unsupported locale 404s, English blog isolation, API/assets and sitemap entries.
- `npm run test:blog` and `npm run test:downloader`: passed.
- `node scripts/check-blog-live.cjs`: passed after sitemap expectation update.
- `npm run build`: passed.
- `npx tsc --noEmit`: still fails on the pre-existing `src/tests/backend.test.ts:15` import of missing `../server`. No new localization type errors were reported.
- `npm run lint`: does not complete because the existing project has no ESLint configuration; `next lint` opens the setup prompt. No clean lint result is claimed.
- Browser: verified Arabic RTL, Japanese and Hindi typography, localized tabs, Spanish validation/clipboard/clear controls, Japanese FAQ, mobile navigation, language selection and browser history. All ten languages were checked at 360px with no horizontal overflow.
- Real media: the Spanish UI resolved `https://www.instagram.com/p/DeXQz1kgYE0/` into nineteen carousel images and completed a photo download with translated preparation and completion messages. Backend regression checks cover cached extraction, photo carousels and video/audio merging; no claim is made that every media type was downloaded separately in every language.

Deployment/DNS and search-engine indexing are not performed by this local implementation. Instagram access restrictions continue to apply. Human native-language editorial review can refine regional wording, but the required dictionaries are complete. During browser testing, an earlier cached local redirect required fresh query URLs for some layout checks; clean HTTP requests to every canonical route pass.

## Reference

Implementation follows the Next.js 15 [middleware request-header and URL handling](https://nextjs.org/docs/15/app/api-reference/file-conventions/middleware) and Metadata APIs. No localization package or additional dependency was installed.
