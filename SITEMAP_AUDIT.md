# SaveFrame sitemap audit — 26 October 2026

Final sitemap: **37 unique canonical URLs**.

| Group | URLs |
|---|---:|
| Localized homepages | 10 |
| Downloader tools | 6 |
| Information pages | 5 |
| Blog index | 1 |
| Published articles | 15 |

## Changes

Removed every `changeFrequency` and `priority` property from `src/app/sitemap.ts`. Google documents that it ignores these values; see [Google's sitemap guidance](https://developers.google.com/search/docs/crawling-indexing/sitemaps/build-sitemap).

Preserved the exact existing URL set, canonical formatting, published-only article selection and homepage language relationships. Retained `lastModified` only for the fifteen articles, using the existing editorial `updatedAt` records. Those records remain **2026-10-24**; no article or article date was edited. The existing +05:30 date interpretation is unchanged, so the serialized UTC instant can appear on the preceding UTC calendar day. No build-time/current-date timestamps were added to the other twenty-two pages.

`robots.txt` already references `https://saveframe.site/sitemap.xml` and required no change. The existing language-alternate helper was also correct and unchanged.

## Validation

- `npm run test:seo`: **passed** against a fresh isolated local production server. The existing development process returned an empty sitemap; it was left running and its configuration was not changed.
- `npm run typecheck`: **passed**.
- `npm run build`: **passed**, including production tracing checks.
- All **37** local production sitemap entries returned HTTP 200, matched their public HTTPS canonicals and were indexable under HTML/HTTP robots directives.
- All ten homepage entries have the same eleven XML alternatives: ten languages plus `x-default`, including self references and reciprocal targets. All **110** annotations agree with normalized HTML hreflang URLs. Next's slashless HTML root origin is URL-equivalent to the sitemap's root slash; other canonical path formatting is preserved.
- Exactly **15** article last-modification timestamps match the unchanged editorial records. No dates on undated static pages; no `changefreq` or `priority` tags remain.
- No admin, API, download, private, unpublished, duplicate or query URLs are in the sitemap. The existing SEO suite separately checks `/blog?page=2`; it was not added to the sitemap.
- The public deployment's existing sitemap and robots file returned HTTP 200. A read-only crawl verified all **37 public URLs** as HTTP 200, indexable and canonically equivalent. One transient network fetch failure passed on a targeted retry, recorded in the evidence.
- The broader existing SEO suite also passed metadata/schema, 52 internal destinations and 404 checks.

These checks establish accessibility and indexability, not actual inclusion in Google's index. The public deployment was checked independently; the cleaned local sitemap has **not** been deployed.

## Modified files

- `src/app/sitemap.ts` — remove unused metadata, retain reliable dates and language annotations.
- `scripts/check-seo.cjs` — assert the exact 37-URL set, exclusions, date provenance, XML/HTML reciprocal hreflang and HTTP indexability.
- `reports/seo-crawl.json` — regenerated detailed crawl evidence.
- `reports/sitemap-validation.json` — isolated production summary.
- `reports/sitemap-public-check.json` — public deployment crawl, including the targeted retry.
- `SITEMAP_AUDIT.md` — this report.

Temporary validation helpers were created under ignored `.runtime` and removed after use. No design, blog content, translations, downloader code, private data, deployment or Git remote was changed by this task. No push or deployment was performed.
