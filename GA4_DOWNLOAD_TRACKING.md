# SaveFrame GA4 download lifecycle — 27 October 2026

Implemented locally for the existing `G-0EYTT0CW4Z` tracker. This extends the downloader event section of `GA4_AUTOMATIC_REPORT.md`; that report's regional policy and attribution rules remain in effect. No production deployment or actual receipt in GA4 is claimed.

## Event contract

| Event | Verified application trigger | `download_status` |
|---|---|---|
| `download_started` | A user download click passes the existing pending-request guard, before the preparation POST | `requested` |
| `download_prepared` | The existing job-status endpoint reports `completed`, meaning the file is prepared | `prepared` |
| `download_delivered` | After activating the existing attachment link, polling observes the server's `delivery_completed` milestone | `handed_off` |
| `download_failed` | Inspection/preparation workflow fails, a job is failed/cancelled, or the server reports a failed response stream | `failed` or `cancelled` |
| `media_previewed` | A requested photo preview loads successfully, or video actually fires `playing` | `viewed` |

The existing `media_resolved` event remains: metadata accepted by the UI, with `media_type` only. It is not a download.

**Preparation, handoff and browser save are different.** `completed` on a job is preparation only. `delivery_completed` means the server has finished reading the file into the existing response stream. It does not prove that every byte reached the device, that the browser accepted the attachment, or that the user saved it to disk. There is no confirmed browser-save event, and this change does not invent one. A connection can fail beyond the application's response stream.

`download_failed` with `failure_stage=resolve` includes inspection failures before any download starts. Preparation request/polling errors describe a failed client workflow; they are not proof that no server job was prepared. Use `failure_stage` when comparing funnel counts. A lost **handoff** status response, expired job, navigation or monitoring timeout produces no fabricated failure or success.

## Parameters and classification

All five lifecycle events use these allowlisted parameters:

| Parameter | Values |
|---|---|
| `media_type` | `reel`, `video`, `photo`, `story`, `zip`; `profile` and `unknown` retained for existing supported/fallback cases |
| `download_format` | `mp4`, `m4a`, `jpg`, `png`, `webp`, `zip`, or `unknown`; `jpeg` normalizes to `jpg` |
| `download_method` | `single`, `bulk`, `preview` |
| `download_status` | `requested`, `prepared`, `handed_off`, `failed`, `cancelled`, `viewed` |
| `source_page` | Allowlisted public pathname captured when the action starts; otherwise `unknown` |

Failures also retain the existing `failure_stage` (`resolve`, `download`, `handoff`) and standardized `error_code` allowlist. Raw messages are discarded. Event status is derived from the event name and known cancellation codes, never trusted from arbitrary input.

A carousel's individual photo is `photo`, its individual video is `video`, and its bulk archive is `zip`/`bulk`. The parent carousel is still identified by `media_resolved.media_type=carousel`. Reels and stories retain their category even for an audio/photo selection. ZIP format overrides underlying slides. Selected formats come from the exact item/format used by the existing download request.

## Architecture and deduplication

The existing invisible `Analytics` component and Google tag are reused. Root layout, GA initialization, page-view logic, regional policy, attribution, UI, CSS, extraction, admin authentication and SQLite schema are unchanged.

The existing job object gains optional in-memory delivery status/error fields. The attachment route updates them at the same boundaries as existing SQLite delivery events. The existing `/api/media/jobs/[jobId]` response exposes only the small status and standardized delivery code in addition to its existing fields. No second download or tracking endpoint is added.

The browser correlates through the existing job capability URL. It checks once per second for up to three minutes after link activation, with a ten-second deadline per status request. Navigation to a different pathname stops monitoring. Very slow transfers, tab closure, browser suspension, lost connectivity, process restarts and expired jobs can cause missing GA handoff events; SQLite remains authoritative for server operations.

The existing request-key map suppresses simultaneous duplicate clicks and keeps the action pending through handoff monitoring. A lifecycle object emits each transition once, permits handoff only after preparation and stops after handoff/failure. A private in-memory object identity also suppresses replay across analytics-controller remounts. Object identities/job IDs are never serialized to Google. Retrying a failed workflow with a new intentional click is a new attempt. Reloading/navigation does not replay old lifecycle events.

Response cancellation followed by an asynchronous stream error records one terminal transition per response. A successful handoff remains visible even if a later duplicate attachment request fails. SQLite retains its existing event uniqueness rules. Preview/seek/range and HEAD requests do not advance download handoff state. Preview events are deduplicated per item in the current resolved result and never create download starts/preparations/handoffs.

No additional persistent service, database table or migration is required. Existing temporary-file retention and cleanup continue to apply.

## Privacy and consent

The existing controller still requires production enablement, exact `https://saveframe.site` origin, a public allowlisted route and existing consent/regional eligibility. Admin routes, localhost, automated browsers and staging remain excluded. GPC, DNT and saved opt-outs override eligibility. Consent-required and unknown regions remain gated. No denied events are queued for later replay or sent through Measurement Protocol.

GA fields contain no Instagram URL, username, caption, shortcode, job ID, cookie/session, private filename, raw error or custom IP parameter. `source_page` passes the existing public route allowlist. The five custom fields use finite vocabularies; unknown input is rejected or normalized. Existing sanitized page location/referrer/campaign fields continue to be used.

Google still receives technical connection information when an eligible browser contacts its service; this is not zero-data processing. Blockers, denied consent, offline clients or an unloaded tag can prevent GA receipt. SQLite records server operations independently. A queued GA command is not evidence that Google received it.

Keep **Enhanced Measurement disabled** in the GA4 web stream, as required by the existing implementation. In particular, automatic history page views can duplicate manual views, while automatic file/form/link tracking may collect identifiers this application excludes. Do not add another tag through GTM, Nginx, Cloudflare or a consent manager.

## GA4 reporting setup

In GA4 **Admin → Data display → Custom definitions → Create custom dimension**, create **Event** scoped dimensions with these exact event-parameter names:

1. `media_type`
2. `download_format`
3. `download_method`
4. `download_status`
5. `source_page`

Optional failure diagnostics: register `failure_stage` and `error_code` with Event scope too. Do not register any operational identifier. Custom definitions may take 24–48 hours to become available in ordinary reporting.

Use event count filtered by event name for starts/prepared/handoffs/failures. Break down by the dimensions above. Add GA's built-in country, device category and session source/medium dimensions where available. No custom country/device collection is added. A session-scoped funnel can illustrate progression; because job IDs are deliberately absent, GA cannot reconstruct an exact per-job ledger. For exact operational counts, use SaveFrame admin data.

Google references: [custom dimensions](https://support.google.com/analytics/answer/14239696?hl=en), [availability of custom definitions](https://support.google.com/analytics/answer/14240153?hl=en-EN), [Enhanced Measurement settings](https://developers.google.com/analytics/devguides/config/admin/v1/rest/v1alpha/EnhancedMeasurementSettings), [DebugView](https://support.google.com/analytics/answer/7201382).

## Changed files

| File | Purpose |
|---|---|
| `public/saveframe.js` | Selected-format classification, lifecycle state, preview confirmation and bounded handoff polling |
| `src/lib/analytics.ts` | New event/parameter allowlists and private operation replay suppression |
| `src/lib/download-delivery.ts` | Stable, nonpersistent server handoff snapshot |
| `src/types/media.types.ts` | Optional typed delivery status/error fields |
| `src/app/api/media/download/[jobId]/route.ts` | Correlate existing stream milestones, missing files and cancellations |
| `src/app/api/media/jobs/[jobId]/route.ts` | Expose the safe delivery snapshot through the existing endpoint |
| `scripts/check-analytics.cjs` | Extend existing safe-parameter assertions |
| `scripts/check-download-analytics.cjs` | Actual click-handler, lifecycle, consent, classification and response-stream regression tests |
| `package.json` | Include lifecycle regressions in `test:analytics` |
| `src/ui/client-asset.json`, `public/assets/saveframe.ea1be5cc1d3b34c6.js` | Generated hashed client bundle and manifest |
| `GA4_DOWNLOAD_TRACKING.md` | Event contract, verification, deployment and rollback |

## Verification

Automated checks run locally:

- `npm run test:analytics`: PASS, including real local attachment-response consumption/cancellation, synthetic stream failure, missing file, status projection, double clicks, automatic link activation, all classifications, preview load/play, navigation, remount/replay deduplication, denial/grant and sensitive-field rejection.
- `npm run test:downloader` and `npm run test:security`: PASS through the full `npm test` run.
- `npm test`: PASS, including admin/API error reporting, security, preview/paste, downloader, stories, translations, blog and analytics checks.
- `npm run typecheck`: PASS.
- `npm run lint`: PASS.
- `npm run build`: PASS (Next.js 15.5.28; compilation, built-in lint/type validation, page generation and privacy trace sanitization completed).

Tests use disposable local fixtures and mocked Google command delivery. No real Instagram login, session access, real visitor traffic or Google Analytics network events were used as test evidence.

## Deployment and rollback

These are owner-run steps; nothing has been pushed, deployed or restarted.

1. Review the diff and commit the changed source, tests, report, generated client and manifest to a reviewed release. Do not include `.env*`, private SQLite/key files, Instagram sessions, downloads or `.runtime` helpers. Test a clean checkout of that release and push/merge through your normal GitHub workflow.
2. On the VPS, verify the existing unit before selecting the release:

   ```bash
   sudo systemctl show saveframe.service -p User -p WorkingDirectory -p EnvironmentFiles
   ```

3. In a separate checkout of the reviewed release on the VPS, run `npm ci`, `npm run typecheck`, `npm run lint`, `npm test`, then `npm run build`. Use Linux dependencies, not Windows `node_modules`. Ensure the build receives `NEXT_PUBLIC_GA_ID=G-0EYTT0CW4Z` through your existing protected build configuration. Keep the existing runtime `GA4_ENABLED` and reviewed country/consent configuration in `/etc/saveframe/production.env`; no new environment variables are required. Staging must keep GA disabled.
4. Keep the previous built release intact, drain active downloads, then select the new release through your existing deployment mechanism. Preserve `/var/lib/saveframe`, the admin key/database and Instagram session files. After selecting the release, the owner can run:

   ```bash
   sudo systemctl restart saveframe.service
   sudo systemctl is-active saveframe.service
   ```

5. Verify public pages, a genuine download and the existing admin operational record. No Nginx changes or database migration are necessary for this feature.

Rollback: select the previous complete built release, including its client-asset manifest and corresponding hashed asset, then restart the same service. Preserve current SQLite data and sessions; no data rollback is required. If GA behavior is wrong, disable `GA4_ENABLED` in the protected runtime environment and restart using the existing deployment procedure while investigating.

## Live Realtime/DebugView acceptance procedure

After deployment, use a real browser on `https://saveframe.site` and an authorized GA4 account. Use an actually consent-eligible session; do not bypass region policy or privacy signals. Enable the official Google Analytics Debugger extension if DebugView is needed. Do not enable debug mode for all visitors.

1. Verify one initial `page_view` and one per actual public route change, with no second tag.
2. Preview a photo and play a video: confirm `media_previewed`, no download lifecycle events from preview playback/seeks.
3. Start a genuine authorized download: confirm one `download_started`, then `download_prepared`, then `download_delivered` only after server handoff. Repeat with a Reel, photo, story where accessible, individual carousel slide and bulk ZIP.
4. Double-click and repeatedly poll: confirm no duplicate phase events. Test a legitimate cancelled/failed job and confirm its standardized status/code. Do not attack third-party services to create failures.
5. Inspect Google collection requests for only the allowed custom fields; no filename, private media URL, account or job ID. Confirm the event appears in GA4 Realtime/DebugView; a local dataLayer entry alone is insufficient.
6. Repeat with denied consent, GPC/DNT, an unconsented required region, localhost/staging and admin routes: confirm no GA collection. Server-side admin statistics should still record genuine operations.

**Live receipt remains unverified until these production browser checks succeed in the actual GA4 property.**
