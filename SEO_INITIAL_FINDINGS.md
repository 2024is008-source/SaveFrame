# Initial SEO findings — 24 October 2026

Scope: existing local SaveFrame source and production-mode preview. No live VPS changes are authorized. The public domain could not be fetched with the web tool; production verification and Search Console data are unavailable.

| Priority | Evidence | Impact | Planned implementation |
|---|---|---|---|
| High | Tool configuration names five dedicated paths, but routing accepts only language codes; six intended tool URLs have no pages. Navigation is primarily buttons. | Search engines cannot discover dedicated feature pages. | Add six distinct tool pages with working shared downloader, original task-specific guidance and crawlable links. Preserve existing locale, blog and query URLs. |
| High | Legal/support content is available only in client dialogs; contact copy includes saveframe.app addresses and an unverified one-business-day response promise. | No crawlable trust pages; inaccurate claims. | Add factual About/Contact/Privacy/Terms/Copyright pages; do not invent contacts or policies. Retain compatibility for old dialogs. |
| High | API exclusion currently relies on robots disallow alone. | Robots restrictions do not independently guarantee removal of known download/job URLs. | Add X-Robots-Tag noindex to API responses and keep APIs out of sitemaps. |
| Medium | Homepage metadata has no social image; site/home JSON-LD is absent in the inspected source. | Incomplete social and entity metadata. | Add original brand social card and factual WebSite/Organization/WebPage/WebApplication graphs. Verify rendered DOM. |
| Medium | Blog pagination canonicalizes every page to /blog; page 2 has a different article set. | Canonical conflates distinct pagination content. | Give unfiltered pagination its own canonical and title; keep search/filter variations noindex. |
| Medium | Homepage table and FAQ state fixed maximum image sizes; actual tested images can exceed those sizes. | Capability claims disagree with observed downloader behavior. | Clarify that the source determines available size; retain existing visual structure. |
| Medium | Nginx example uses saveframe.app and HTTP only. | Deployment example disagrees with configured canonical origin. | Prepare an explicit saveframe.site TLS/non-www template; no deployment or server changes. |
| Low | Existing 15 articles are substantial, but some blog calls to action use generic labels and tool query links. | Less descriptive discovery/context. | Improve link targets and accessible labels while preserving article URLs and avoiding overlapping new posts. |

Preserve the existing ten translated homepages and reciprocal hreflang. Do not add translated tool or legal pages. Do not generate fake ratings, keyword volumes, traffic projections, author credentials or Google indexing claims. Raw baseline crawl evidence is in `.runtime/seo-initial-crawl.json`.
