# SaveFrame GA4 integration — 26 October 2026

This initial implementation report is superseded by `GA4_AUTOMATIC_REPORT.md`, which documents the regional automatic policy, safe attribution and current deployment requirements.

## Implemented

Production measurement ID: `G-0EYTT0CW4Z`, supplied through `NEXT_PUBLIC_GA_ID`. Tracking is enabled only for a production build on `https://saveframe.site`, on known public routes, after explicit analytics consent. Local previews, development, admin pages, API routes and unknown paths are excluded.

Inspection found no existing Google Analytics or Google Tag Manager integration, and no existing consent manager. `@next/third-parties` 15.5.28 was already installed; no dependency was added. Its installed `GoogleAnalytics` component sends an automatic config/page view and exposes no configuration parameters for sanitizing location/referrer or disabling that initial view. This integration therefore uses Next.js `next/script` with a dedicated consent-gated configuration, rather than adding a second tracker or modifying the dependency.

The root layout mounts one invisible client component. It does not change metadata, fonts, CSS, navigation, forms, admin components or downloader behavior. Privacy disclosure copy was updated within the existing information-page template.

## Modified files

| File | Change |
|---|---|
| `src/app/layout.tsx` | Mount the invisible tracker with production environment configuration |
| `src/components/Analytics.tsx` | Next.js client lifecycle and consent-gated `afterInteractive` script |
| `src/lib/analytics.ts` | Public route allowlist, consent controller, sanitized event allowlists and route deduplication |
| `public/saveframe.js` | Emit category-only downloader events at the actual action/result/error boundaries |
| `.env.production` | Add the public production measurement ID |
| `.env.example` | Document the public ID and consent requirement |
| `src/content/information.json` | Update privacy disclosures; no design changes |
| `scripts/check-analytics.cjs` | Deterministic privacy, consent, route and event tests |
| `package.json` | Add `test:analytics` and include it in `npm test` |
| `src/ui/client-asset.json`, `public/assets/saveframe.e951ca06c4be937d.js` | Rebuilt, content-hashed public client asset |
| `GA4_IMPLEMENTATION_REPORT.md` | Implementation and deployment instructions |

The simultaneous story work also adds build-trace privacy exclusions in `next.config.ts` and `scripts/sanitize-build-traces.cjs` with a `postbuild` hook. That protects runtime private state from packaging; it does not alter authentication or the database. Other existing working-tree changes are from earlier requested tasks and are not GA changes.

## Page views and events

`send_page_view:false` prevents the initial automatic page view. The client sends one manual `page_view` per public pathname transition; repeated renders and query/hash-only changes do not add views. All ten homepage languages, six tools, fifteen published articles, the blog index and information pages are allowlisted from the existing content configuration. A return visit to a different pathname is a new view.

Every event carries an allowlisted `https://saveframe.site` page location without query strings or fragments, an empty referrer and the fixed title `SaveFrame`. Page-specific titles are intentionally not collected, avoiding account/caption text introduced by future client code. Advertising storage, advertising user data and personalization remain denied; Google signals and ad personalization signals are disabled.

| Event | Trigger | Custom fields |
|---|---|---|
| `media_resolved` | Valid media metadata returned and accepted by the UI | `media_type` |
| `download_started` | A new non-duplicate download action starts preparation | `media_type` |
| `download_failed` | Inspection or download preparation fails | `media_type`, `failure_stage`, allowlisted `error_code` or `UNKNOWN` |

`download_started` is an attempt, not proof of a saved file. Preview preparation/playback does not count as a download action. Polling does not generate repeated events. Cancelled inspection does not generate a failure event. The separate private SQLite operational analytics remains unchanged by GA.

No Instagram URL, shortcode, username, caption, filename, cookie, token, job ID, raw exception or free-text value is copied into GA parameters. Arbitrary event names/fields are rejected. Google still receives normal technical connection data when a consenting visitor loads its tag; this is not a claim of anonymous or zero-data third-party processing.

## Consent integration — required before collecting visits

Default consent is **denied**. No Google script is requested before permission. Do Not Track `1` and Global Privacy Control override a stored grant. The exact preference is stored under `saveframe.analytics.consent` in local storage, and changes propagate across tabs. Withdrawal disables future events, denies analytics consent and expires accessible first-party `_ga` cookies.

There was no existing consent banner, and adding one would change the requested UI. Consequently new visitors remain untracked until a consent manager is connected. Wire the site's consent manager to either interface after the root component has initialized:

```js
// Call only in response to the visitor's explicit analytics choice.
window.SaveFrameAnalytics?.setConsent('granted');
window.SaveFrameAnalytics?.setConsent('denied');

// Alternative event integration:
window.dispatchEvent(new CustomEvent('saveframe:analytics-consent', {
  detail: { analytics: 'granted' } // use 'denied' when withdrawn
}));
```

Do not automatically grant consent or prefill the storage key for visitors. Provide a persistent way to withdraw permission through your chosen consent manager. A consent update may notify an already loaded Google tag; no new application page/event tracking is queued after denial. Already transmitted events cannot be recalled.

## Verification

Passed: `npm run typecheck`, `npm run lint`, `npm test` (admin, security, preview, downloader, stories, i18n, blog and analytics), `npm run test:runtime` (real FFmpeg video/mux/M4A and decoded audio), and `npm run build`.

Analytics fixtures cover default denial, explicit grant/withdrawal, cross-tab withdrawal, DNT/GPC, development/local/admin suppression, every configured public route, duplicate view suppression, unknown field removal, query/referrer exclusion and safe failure codes. No test events were sent to the live Google property. The production build compiles the SSR/client boundary successfully. Receipt in Google Realtime/DebugView has not been verified because production deployment and account administration were not authorized.

## Deployment steps

1. In GA4 Admin → Data streams → SaveFrame web stream, **disable Enhanced Measurement**, including automatic history page views, outbound clicks, file downloads, site search, form and video events. This application sends its own sanitized views/events; automatic measurement could duplicate views or collect sensitive URLs. Also leave user-provided data collection and advertising integrations off. Do not add another GA/GTM snippet in the host, CDN or consent manager.
2. Connect an appropriate consent manager to the interface above, including withdrawal. Until this is done, default-denied visitors produce no analytics.
3. Set `NEXT_PUBLIC_GA_ID=G-0EYTT0CW4Z` and `NEXT_PUBLIC_SITE_URL=https://saveframe.site` in the release's **build-time** environment. The committed `.env.production` includes these public values; check for host or `.env.local` overrides. Never place credentials in `NEXT_PUBLIC_*` variables.
4. Build in a separate release directory with `npm ci`, `npm run typecheck`, `npm run lint`, `npm test` and `npm run build`. Deploy through your normal reviewed process; preserve private data/keys and exclude `.data`/session files from release packaging.
5. On production, verify no Google network request before consent; grant analytics through the consent manager and confirm exactly one sanitized `page_view` in Realtime/DebugView. Navigate between a language homepage, tool, article and information page, then test the three downloader outcomes. Inspect requests for `dl`/`dr` and event fields: no source URL or account data should appear. Withdrawal, DNT/GPC and admin visits must stop tracking. Ad blockers may prevent collection normally.

No push, deployment or existing service restart was performed.

References: [Next.js third-party libraries](https://nextjs.org/docs/15/app/guides/third-party-libraries), [Google manual page views](https://developers.google.com/analytics/devguides/collection/ga4/views?technology=websites), [Google consent mode](https://developers.google.com/tag-platform/security/guides/consent).
