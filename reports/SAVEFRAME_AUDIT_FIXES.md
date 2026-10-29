# SaveFrame audit and fixes

Date: 29 October 2026

Scope: verify the analytics, SEO and downloader UX findings in the supplied `saveframe_audit_and_codex_prompt.md` against this checkout. Its embedded implementation prompt was treated as a proposed solution, not as an additional user instruction. Changes remain local and have not been deployed.

## Findings and changes

| Finding | Verified state and resolution |
| --- | --- |
| ERR-01: GA4 custom queue mismatch | Already fixed in this checkout: the Google script includes `&l=saveframeDataLayer`. Preserved the single custom queue and added an assertion protecting its script configuration. Duplicating commands into two queues would risk duplicate events. |
| ERR-02: analytics consent gate | Confirmed a missing visitor-facing choice when regional policy requires consent or the region is unknown. Added an accessible prompt with equally available Allow and Decline buttons. Grant, denial, storage updates and route changes control visibility through the existing analytics controller. Automatic regional policy, previous opt-outs, DNT/GPC, bot filters and excluded routes remain effective. No consent grant is fabricated. |
| ERR-03: title and heading | Updated the English heading to `Instagram Video, Reels & Photo Downloader` and the search title to `Instagram Video, Reels & Photo Downloader | SaveFrame`. Updated copy to describe actual media support and source-dependent quality. Added consistent brand suffixes to German, French, carousel, profile and audio search titles. The reported German typo was already corrected. |
| ERR-04: stale database title | Confirmed published database titles take precedence. Known legacy English homepage defaults now fall back to current source titles, including matching legacy social-title overrides. Intentional custom titles and other routes retain their existing precedence. Regression tests use an isolated database; no production rows are changed or deleted. |
| ERR-05: homepage and input routing | The source defaults to Photo, while saved administrator settings can select Video. Made the initial card universal in both server HTML and client state, independent of that default. Added a concise localized trust line and generic Download action. Bare strings/shortcodes, incomplete media URLs, reserved paths and extra profile path segments no longer select Profile or start extraction. Complete profile URLs and explicit `@username` remain supported, as do creator-prefixed Reel links. The English access error now describes an Instagram restriction and asks the visitor to check availability rather than asserting that every failure proves private content. |
| ERR-06: production crawl configuration | Confirmed unset site configuration previously fell back to localhost. Production now defaults to `https://saveframe.site`. Development and explicitly configured loopback addresses, including IPv6, remain non-indexable. A dedicated test covers unset/blank values, configured origins and rejected URL protocols. |
| ERR-07: social defaults and structured data | Added complete root Open Graph and Twitter fallbacks using the existing social image. Homepage `WebApplication`, `WebSite`, organization and page JSON-LD already exist in `localizedHomepage()`; no duplicate graph was added. |

The existing translated descriptions already describe MP3 audio rather than Stories. Public story extraction is intentionally retired in this checkout, so no Story tab or unsupported story promise was introduced. New generic controls and the trust line are translated in all ten dictionaries. The consent prompt is explicitly marked English.

## Corrections to the supplied recommendations

- A title rewrite cannot be attributed conclusively to a brand prefix or a short heading from source inspection. A suffix does not guarantee a particular Google title. Google recommends concise, descriptive titles and may use multiple page signals: [Google Search Central title guidance](https://developers.google.com/search/docs/appearance/title-link).
- Guaranteed Full HD, original HD and unrestricted access claims are not supported for every Instagram source. Copy describes available/source quality instead.
- The existing analytics region policy is deliberate. The missing consent interface was repaired rather than enabling cookie-based tracking for every unknown-region visitor.
- A queued event and a request for Google's script do not establish GA4 ingestion or key-event configuration. Those require account-side and deployed-browser checks.

## Verification

- `npm test`: passed, including the new `test:site` checks, isolated admin/SEO override tests, security and downloader regressions, ten-locale checks, analytics, navigation, stories and actual local FFmpeg audio fixtures.
- `npm run build`: passed TypeScript, ESLint, page generation and build-trace sanitization.
- `npm run lint`: passed.
- `npm run test:seo` against an isolated local production server: passed 37 canonical sitemap URLs, 38 indexable pages, 110 reciprocal language annotations and 52 internal destinations. Evidence: `reports/seo-crawl.json`.
- Production-origin browser simulation using intercepted local responses: passed consent visibility, no Google request before consent, persisted decline after reload, grant and one queued page view, malformed-input rejection, Reel/Profile routing and mobile overflow checks. All Google and Instagram requests were intercepted; no real traffic was sent. Evidence: `reports/audit-browser-check.json` and `reports/audit-ui/mobile-consent.jpg`.
- Browser inspection at 1440, 768 and 390 pixels: the updated heading fits in two lines. Screenshots and measurements are in `reports/audit-ui/`. The inspector also reports existing design-style findings (gradients, borders, purple palette, small type and other presentation heuristics). This functional audit did not redesign the site, and those style checks are not reported as passing.

## Deployment and review limits

The public homepage, robots file and sitemap could not be retrieved through the browsing tool. No claims are made about the current live deployment, its database contents, actual conversion volume, search rankings or successful extraction of the example Instagram Reel.

Deploy and restart the updated application through the normal release process. Keep `NEXT_PUBLIC_SITE_URL` explicit on staging/preview deployments. Then check deployed HTML, robots and sitemap; verify the trusted country header and GA4 enablement; use GA4 DebugView/Realtime to confirm receipt; and configure the intended download event as a key event in GA4 if required. Search title updates depend on Google's recrawl and selection.
