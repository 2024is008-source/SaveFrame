# SaveFrame sitelinks eligibility — 27 October 2026

Implemented locally and verified against the existing public site and an isolated production build. No commit, push, deployment or production restart was performed. Google generates sitelinks automatically; these changes improve discoverability and cannot guarantee which links Google displays, their order or when they appear. [Google's sitelinks guidance](https://developers.google.com/search/docs/appearance/sitelinks).

## What was already implemented

- `src/ui/saveframe.json` holds the shared interface template. `localizedHomepage` translates it and `crawlableNavigation` converts route buttons into real anchors **before** Next.js renders it. The source template's buttons were therefore not evidence of missing crawlable links on the live site.
- Header/mobile/footer links already existed for photos, Reels, videos, stories and profiles. A carousel anchor existed in the desktop viewer dropdown.
- Six real English tool routes are handled by `src/app/[locale]/page.tsx` using the tool catalog, with server-rendered content, one relevant H1, useful instructions, FAQs and related guides.
- Each tool already linked naturally to the other tools in its existing access-limits section. No additional keyword block or duplicated navigation section was needed.
- Titles and meta descriptions are unique; Open Graph/Twitter metadata and self-canonicals are already present. Published admin overrides remain higher priority through the existing `applySeo` path.
- Every inspected home/tool page has one SaveFrame `WebSite` node with `https://saveframe.site/`, the same stable `#website` ID and an Organization publisher reference. No conflicting website node, fabricated rating or sitelinks search-box action was found.
- The sitemap already contains the six tools and all 37 canonical URLs. Robots allows public pages, excludes admin/API content and references `https://saveframe.site/sitemap.xml`.
- Ten homepages have reciprocal, self-inclusive hreflang, including `x-default`. Tool content intentionally remains English on its existing English routes.

## Weaknesses found and changes applied

**Carousel discovery on mobile:** the only homepage carousel anchor was in the desktop-only viewer dropdown. Mobile visitors had no direct carousel link in their drawer, and the footer listed only five tools. This was a useful-navigation gap, even though search engines could discover the desktop link and existing cross-tool links.

Added exactly two anchors to the shared template:

```html
<a href="/carousel-downloader" data-route-tab="carousel" class="...existing mobile classes...">
  <span>Instagram Carousel Downloader</span><span>Open tool →</span>
</a>

<li><a href="/carousel-downloader" data-route-tab="carousel" class="...existing footer classes...">
  Instagram Carousel Downloader
</a></li>
```

The new mobile link sits beside the existing profile/viewer links. The footer link sits in the existing Downloader Tools list. Their real classes reuse the existing design; no CSS, grid, animation or new navigation block was introduced. Both render as native HTML anchors even with JavaScript disabled. The existing client recognizes anchors and preserves native navigation.

**Navigation semantics:** desktop dropdown containers advertised `role="menu"` without the application-menu item/keyboard model. They are now labelled disclosure groups (`role="group"`, labelled by the existing trigger). This preserves native anchor/Tab behavior and the existing dropdown interaction without implying an unimplemented ARIA menu contract. Trigger IDs, expanded state, controls, styling and event handlers remain unchanged.

Added one translated carousel-link label in each of the ten existing dictionaries. No existing translation or language route was changed. No `/es/carousel-downloader` or other untranslated localized tool clone was created.

The five media switches inside the downloader remain keyboard-operable **buttons** with tab semantics. They operate a widget; the surrounding actual route anchors provide page navigation. Replacing those controls merely to add more links would change the downloader interaction unnecessarily.

## Metadata, schema and internal links preserved

No edits were necessary in the title catalog, metadata factories, root layout, canonical handling, sitemap, robots, structured-data factory or published admin override implementation. Existing titles/descriptions and all five other tool destinations remain unchanged.

Existing cross-tool links and related article links remain intact. The only new link destination is the already-existing carousel canonical route, repeated in two appropriate existing navigation locations across the shared homepage/tool template. No `SiteNavigationElement`, `SearchAction`, fabricated rating or new WebSite node was added as a supposed sitelinks switch.

## Live technical indexing audit

Live requests to the ten homepages and six tool pages returned HTTP 200 without redirects. All had index/follow HTML directives, no restricting X-Robots-Tag header, populated social metadata and one WebSite node. Tool titles/descriptions were unique and each tool had one relevant H1. Canonical values normalize to the intended absolute HTTPS destinations.

| Tool | Live status | Canonical destination | Technically indexable |
|---|---|---|---|
| Instagram Reels Downloader | 200 | `https://saveframe.site/reels-downloader` | Yes |
| Instagram Video Downloader | 200 | `https://saveframe.site/video-downloader` | Yes |
| Instagram Photo Downloader | 200 | `https://saveframe.site/photo-downloader` | Yes |
| Instagram Story Downloader | 200 | `https://saveframe.site/story-downloader` | Yes |
| Instagram Carousel Downloader | 200 | `https://saveframe.site/carousel-downloader` | Yes |
| Instagram Profile Picture Viewer | 200 | `https://saveframe.site/profile-viewer` | Yes |

The live English homepage canonical serializes as `https://saveframe.site`; normalizing it as a URL gives `https://saveframe.site/`. This is the same root destination, so it was not changed gratuitously.

The live audit is evidence of the current deployment **before the new navigation additions are deployed**. The new links were verified separately in the local production build. Technical indexability does not prove that Google has indexed a URL, chosen the declared canonical or granted sitelinks.

Evidence: `reports/sitelinks-live-audit.json`, `reports/seo-crawl.json`, `reports/sitelinks-browser.json`.

## Modified files for this request

| File | Change |
|---|---|
| `src/ui/saveframe.json` | One carousel anchor in the existing mobile drawer and one in the footer |
| `src/lib/navigation.ts` | Label desktop dropdowns as navigation disclosure groups |
| `src/i18n/dictionaries/en.json` | English carousel navigation label |
| `src/i18n/dictionaries/es.json`, `pt-br.json`, `de.json`, `fr.json` | Translated carousel label |
| `src/i18n/dictionaries/ja.json`, `id.json`, `tr.json`, `hi.json`, `ar.json` | Translated carousel label |
| `scripts/check-sitelinks.cjs` | Template/metadata/schema/navigation/accessibility/localization regression checks |
| `scripts/check-seo.cjs` | HTTP checks for all-six mobile/footer links, full social metadata and single WebSite identity |
| `scripts/check-sitelinks-browser.cjs` | Optional browser navigation/keyboard/mobile/no-JS regression test |
| `package.json` | Sitelinks tests; deterministic test included in `npm test` |
| `reports/sitelinks-live-audit.json` | Observed live home/tool HTTP, metadata, schema, links, robots and sitemap evidence |
| `reports/sitelinks-browser.json`, `reports/sitelinks-mobile-menu.png`, `reports/sitelinks-home-desktop.png` | Local production browser results/screenshots |
| `reports/seo-crawl.json` | Refreshed isolated production SEO crawl |
| `SITELINKS_OPTIMIZATION_REPORT.md` | This report |

Existing uncommitted GA4/country-analytics work from earlier requests was preserved and is not part of this sitelinks change. This request did not edit the admin implementation/database, analytics implementation, downloader, blog articles, Instagram sessions, authentication, Cloudflare or Nginx configuration.

## Tests and actual results

- `npm run typecheck`: PASS.
- `npm run lint`: PASS.
- `npm test`: PASS, including existing admin/security/downloader/stories/preview/i18n/blog/GA4 tests and the new sitelinks tests.
- `npm run build`: PASS. Actual production build completed compilation, type/lint validation, page generation and privacy trace sanitization. The build used a disposable admin-data directory, protecting the user's existing database.
- `npm run test:sitelinks`: PASS. Actual generated templates for ten homepages and six tools; real native anchors in mobile/footer; six canonical destinations; accessible text; five unchanged widget tabs; named disclosure groups; cross-tool/guide links; unique metadata; sitemap/robots; exactly one valid-shaped WebSite per page. This test disables overrides and does not open the admin database.
- `npm run test:seo` on the isolated production server: PASS. 37 sitemap URLs, 15 preserved editorial dates, 110 reciprocal XML/HTML language annotations including x-default, 38 indexable pages including blog pagination and 52 internal destinations. New HTTP navigation/schema/social assertions passed.
- `npm run test:sitelinks:browser` using headless Edge/Playwright against the isolated local server: PASS. Native desktop and mobile keyboard links; existing in-place tab switching and arrow navigation; tool-to-tool switching; all ten mobile languages with six visible, named tool links; footer navigation without JavaScript; no horizontal page overflow; no runtime/hydration errors; no extraction requests. A nonexistent untranslated localized tool route returned 404.

Browser QA requires an optional external Playwright installation; no production dependency was added. To repeat against an isolated local build, set `TEST_BASE_URL`, optionally `SAVEFRAME_PLAYWRIGHT_PATH` to that installation, and `SAVEFRAME_BROWSER_CHANNEL` (for example `msedge`), then run `npm run test:sitelinks:browser`. The browser script rejects non-loopback targets and blocks external requests. It does not generate production analytics or download Instagram media.

Production build and browser/HTTP verification used temporary data directories with analytics disabled. Existing regression tests used their disposable fixtures. Temporary test servers/data were cleaned up; the user's normal server was not restarted.

## Search Console checks after a reviewed deployment

Search Console access was not used, so Google indexing, crawl history, selected canonicals and current search appearance remain unverified.

1. In the verified `saveframe.site` property, confirm `/sitemap.xml` is fetched successfully and includes the existing 37 canonical URLs.
2. Use URL Inspection for the homepage and all six target tools. Check Google's indexed status, last crawl, indexing permission and Google-selected canonical against the intended canonical.
3. Run a live inspection after deployment and inspect the rendered page/HTML for the six tool links, complete metadata, the correct language annotations and one SaveFrame WebSite node. Confirm the newly added mobile/footer carousel anchors are deployed.
4. If an important changed page has not been recrawled, request indexing through the existing URL Inspection workflow. A successful live test or indexing request is not a guarantee of inclusion or sitelinks.
5. Review Page Indexing exclusions and any Manual Actions/Security Issues. Investigate actual reported issues rather than repeatedly rewriting valid metadata.
6. Monitor branded SaveFrame queries and the target pages in the Performance report over time. Google chooses sitelinks according to its systems and query relevance; there is no manual setting that selects these six organic sitelinks or guarantees their ordering.

## Remaining limitations and deployment scope

The structure was already substantially crawlable. These changes close a specific mobile/footer discovery gap rather than replace the existing SEO system. Google also evaluates site/query relevance and can rewrite titles, choose different links or show no sitelinks. Structured data alone does not force the feature. Translated homepage navigation still leads to the existing English tool pages; full localized tool content is a separate editorial project and was not invented here.

Review the exact changed files and deploy through the existing release process only when intended. No environment, database migration, proxy change or service reconfiguration is required **for this sitelinks change**. Earlier pending country/GA4 work has its own deployment requirements; do not assume every working-tree change belongs to this task. Keep the previous built release for rollback; reverting these template/navigation/dictionary changes requires no database restoration.

References: [Google sitelinks best practices](https://developers.google.com/search/docs/appearance/sitelinks), [Google crawlable-link guidance](https://developers.google.com/search/docs/crawling-indexing/links-crawlable).
