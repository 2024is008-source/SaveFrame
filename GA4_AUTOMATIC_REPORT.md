# SaveFrame automatic GA4 — 26 October 2026

## Outcome and current status

Updated the existing single tracker for **G-0EYTT0CW4Z**. Eligible visitors can be measured automatically without a banner, while previous opt-outs, GPC/DNT, consent-required regions, unknown geography, admin routes, automated browsers, staging and localhost remain excluded or gated. Attribution now preserves safe referring domains and approved campaign labels instead of blanking all referrals.

**This is implemented and verified locally, not deployed. No live GA4 receipt or real visitor count is claimed. It cannot measure every visitor.** Regional policy/proxy setup and Google property settings must be reviewed before production activation.

## Files changed

| File | Purpose |
|---|---|
| `src/components/Analytics.tsx` | One consent/policy-gated Next Script; pathname/search navigation hooks |
| `src/lib/analytics.ts` | Automatic eligibility, preference handling, safe attribution, pagination and remount deduplication |
| `src/lib/analytics-policy.ts` | New server-only usage of trusted region and operator country/campaign policy |
| `src/app/layout.tsx` | Pass server policy under Suspense; preserve all existing metadata/classes/fonts |
| `.env.production` | Preserve ID; enable the production regional policy configuration |
| `.env.example` | Document staging disable, region and approved campaign settings |
| `src/components/InformationPage.tsx` | One functional opt-out link on the existing Privacy page |
| `src/content/information.json` | Update privacy notice; no design changes |
| `nginx/saveframe-analytics-region.conf` | New Cloudflare peer-validated country mapping |
| `nginx/saveframe.conf`, `nginx/saveframe-tls.conf.example` | Include the mapping and overwrite the frontend country header |
| `scripts/check-analytics.cjs` | Extend deterministic coverage and write redacted evidence |
| `scripts/check-analytics-production.cjs` | New disposable production SSR test |
| `GA4_IMPLEMENTATION_REPORT.md` | Mark the earlier all-consent-gated report as superseded |
| `GA4_AUTOMATIC_REPORT.md`, `reports/analytics-automatic-tests.json`, `reports/analytics-production-check.json` | Current report/evidence |

`public/saveframe.js` was inspected: its existing three event hooks already use verified action/result/error boundaries. They were preserved without changes in this request. No new runtime package or persistent service was introduced. Downloader, database, authentication, translations, styles, animations and SEO metadata were not changed by this request. The Privacy notice/link is the only visible change, providing an actual opt-out rather than decorative settings.

## Tracking architecture

The root layout reads server headers and environment policy. The browser receives an eligibility boolean and approved campaign vocabulary, not the visitor's IP or a custom country parameter. Tracking additionally requires production mode, `GA4_ENABLED=1`, the exact `https://saveframe.site` browser origin, a known public route and no exclusion/preference signal.

The single `saveframe-ga4` script loads after hydration. Automatic page views from config remain disabled with `send_page_view:false`; the application sends its own sanitized views. A document-scoped runtime preserves initialization and the last public view across controller/React remounts. Google’s data-layer array identity remains stable. Repeated renders and identical URLs do not add views; a genuine public route change or return visit does. Safe blog page numbers distinguish pagination. Query changes containing Instagram links, arbitrary search text or tracking tokens do not create distinct recorded URLs.

GA's normal permitted visitor/session processing supplies active users, sessions, first visits, engagement, country/region and device/browser/OS reporting. SaveFrame does not synthesize user IDs or geography. Advertising storage, ad user data, personalization and Google signals remain disabled. First-party analytics cookies expire after 180 days without rolling updates. No advanced-consent cookieless pings are used to measure visitors before required permission.

## Automatic coverage and consent

The committed production configuration contains:

```dotenv
NEXT_PUBLIC_SITE_URL=https://saveframe.site
NEXT_PUBLIC_GA_ID=G-0EYTT0CW4Z
GA4_ENABLED=1
GA4_TRUST_REGION_HEADER=1
GA4_AUTOMATIC_COUNTRIES=*
```

`*` is the owner's requested broad **operator policy**, not a legal conclusion or a fabricated saved visitor consent. It means all recognized countries except the mandatory consent floor/additional restricted countries. The floor includes the EEA, UK and Switzerland; it cannot be removed with the allowlist. Unknown/invalid country codes, Cloudflare `XX`/Tor responses, untrusted country sources and missing configuration never qualify automatically. Add stricter countries with `GA4_CONSENT_REQUIRED_COUNTRIES`, or set it to `*` to require consent globally. Use a narrower `GA4_AUTOMATIC_COUNTRIES=US,AU,...` list when appropriate.

**Business jurisdiction and a reviewed worldwide legal matrix were not provided.** The built-in floor is an engineering safeguard, not a complete or continuously updated database of privacy law. A country outside it is not certified to permit this implementation. Before enabling production automatic collection, review the actual business/visitor obligations, narrow the allowlist or add required countries accordingly. Keep `GA4_ENABLED=0` or consent required globally until that review is complete if applicability is uncertain. Cookie-free measurement is not assumed to be consent-free. The [CNIL audience-measurement guidance](https://cnil.fr/en/sheet-ndeg16-use-analytics-your-websites-and-applications) and [ICO exceptions guidance](https://ico.org.uk/for-organisations/direct-marketing-and-privacy-and-electronic-communications/guidance-on-the-use-of-storage-and-access-technologies/what-are-the-exceptions/) describe conditional exemptions rather than blanket permission for all analytics.

Previous `denied` preferences override automatic eligibility; DNT/GPC override even stored grants. Automatic collection does not write `granted` to the saved preference. An existing valid explicit grant can enable analytics in a gated region. No consent banner was added: visitors requiring consent remain untracked unless a valid consent manager is integrated. This deliberately limits coverage rather than treating absence of consent as acceptance.

The existing API remains available for a real consent manager responding to a visitor choice:

```js
window.SaveFrameAnalytics?.setConsent('granted'); // only after valid explicit consent
window.SaveFrameAnalytics?.setConsent('denied');
```

The Privacy page now offers `/privacy?analytics=off`; following it stops further application tracking, stores the opt-out in this browser and removes accessible first-party `_ga` cookies. It works on initial load and client navigation. Clearing site storage clears the stored preference. This is a browser-specific opt-out, not an account-wide deletion request; already transmitted data is not recalled. Regional applicability and consent validity still require an appropriate operator process.

## Attribution and downloader events

External `page_referrer` values retain the HTTP(S) origin only: Google/Bing search origins, social domains and referring websites remain available for GA channel classification. Paths, searches, fragments, credentials, local/IP-only hosts and private admin references are removed. Later public views use a sanitized previous public page as the internal referrer. Direct traffic stays direct; the app does not label unknown traffic as Google organic.

Only approved UTM labels are passed through GA's campaign fields, outside the recorded page URL. Common source/medium vocabulary is built in. Configure additional non-personal identifiers through `GA4_CAMPAIGN_SOURCES`, `GA4_CAMPAIGN_MEDIUMS`, `GA4_CAMPAIGN_NAMES`, `GA4_CAMPAIGN_CONTENT` and `GA4_CAMPAIGN_TERMS` (comma-separated). Both source and medium must be approved; duplicate/incomplete or unapproved campaign values are dropped, preserving a safe referral when available. Example: approve `launch` as a campaign name before using `?utm_source=newsletter&utm_medium=email&utm_campaign=launch`.

All other parameters—including `instagramUrl`, `q`, source-media links, `gclid`, `fbclid`, `msclkid` and opaque tokens—are omitted from application analytics. Arbitrary UTM text cannot be guaranteed non-personal, so it is not blindly forwarded. Consequently unapproved campaign labels and missing/suppressed browser referrers can reduce attribution; historical blank-referrer data cannot be reconstructed.

| Event | Verified trigger | Allowed custom fields |
|---|---|---|
| `media_resolved` | Accepted API metadata with downloadable items/formats | Media category |
| `download_started` | A non-duplicate user download action begins | Media category |
| `download_failed` | A real inspection/preparation error is caught | Category, resolve/download stage, standardized error code |

Preparation is not reported as proof that a file was saved. Preview preparation and repeated status polls do not become downloads. Instagram usernames, captions, source URLs, filenames, job IDs, cookie/token contents and raw errors are not copied into event parameters. Referring website origins are deliberately transmitted for attribution and may identify the referring publisher; no source-media path is included. Google still receives normal technical connection information from consenting/eligible visitors; this is not zero-data or fully anonymous third-party processing.

## Verification

Passed: `npm run typecheck`, `npm run lint`, `npm run test:analytics`, `npm run build`, the full `npm test` regression chain and the new production SSR check.

The analytics tests cover automatic eligibility, EEA/UK/CH and unknown-region gating, header trust disabled, extra restrictions, stored denial, explicit grants, DNT/GPC, bots/headless/WebDriver, production-origin exclusion, all configured languages/tools/articles/information routes, query stripping, Google/Bing/social/external referrers, approved campaigns, pagination/back navigation, controller remounts and the three safe events. No test sends a Google request. The temporary production server verifies real SSR, the compiled measurement ID, country-specific policy on public routes and `no-store` isolation; it uses its own disposable database and stops only its own process.

```sh
npm run typecheck
npm run lint
npm run test:analytics
npm test
npm run build
node scripts/check-analytics-production.cjs
```

Nginx syntax and live Cloudflare behavior were not executed on this Windows host. No authenticated GA4 property tools were available, and changes were not deployed, so Realtime/DebugView receipt remains **unverified**. Ad blockers, declined consent, privacy signals, bot filtering, offline clients and Google reporting thresholds prevent a literal count of every visitor.

## Google property settings before release

For stream G-0EYTT0CW4Z, disable **Enhanced Measurement**, including history page views, outbound clicks, site search, form interactions, file downloads and video events. The application sends sanitized manual page views/events; automatic collection could duplicate views or include private URLs. Leave Google signals, user-provided data collection, ad personalization and cross-domain linker configuration off. Do not add another GA/GTM snippet through the host, CDN or consent manager. Use standard GA acquisition/device/geography/session reports; create event-scoped custom dimensions for `media_type`, `failure_stage` and `error_code` if needed.

## GitHub instructions — owner runs after review

Repository: [2024is008-source/SaveFrame](https://github.com/2024is008-source/SaveFrame). No commands below were executed.

The working tree already contains earlier uncommitted media/security/initial-GA work. First establish a reviewed baseline or include that work in the reviewed release; do not deploy a partial GA-only branch that drops required existing files. The instructions below stage this request's files, not every prior change. Review staged content and test a clean clone of the actual release branch before deployment.

```powershell
git switch -c codex/ga4-automatic
git status --short
git diff
git ls-files --others --exclude-standard
git add -- src/components/Analytics.tsx src/lib/analytics.ts src/lib/analytics-policy.ts src/app/layout.tsx src/components/InformationPage.tsx src/content/information.json .env.production .env.example nginx/saveframe.conf nginx/saveframe-tls.conf.example nginx/saveframe-analytics-region.conf scripts/check-analytics.cjs scripts/check-analytics-production.cjs GA4_AUTOMATIC_REPORT.md GA4_IMPLEMENTATION_REPORT.md reports/analytics-automatic-tests.json reports/analytics-production-check.json
git diff --cached --check
git diff --cached
# Confirm the reviewed baseline includes the existing downloader event hooks,
# package scripts and their required modules/assets before committing.
git commit -m "Add region-aware GA4 automation and safe attribution"
git push -u origin codex/ga4-automatic
```

Open a reviewed PR from that branch to `main`. Never stage `.env.local`, `.data`, session/cookie files or private runtime output. No automatic commit, push or PR was created.

## VPS instructions — owner runs in a separate release

Use the existing service user, persistent environment/data paths and actual systemd unit. Those host-specific values are not in this checkout; do not invent or replace them. The following assumes the conventional `saveframe` service user; substitute the verified existing user/unit/release root first.

```sh
APP_USER=saveframe
APP_UNIT=saveframe.service
RELEASE=/srv/saveframe/releases/ga4-automatic-20261026

sudo systemctl show "$APP_UNIT" -p User -p WorkingDirectory -p EnvironmentFiles
sudo install -d -o "$APP_USER" -g "$APP_USER" /srv/saveframe/releases
sudo -u "$APP_USER" git clone --single-branch --branch codex/ga4-automatic https://github.com/2024is008-source/SaveFrame.git "$RELEASE"
cd "$RELEASE"
sudo -u "$APP_USER" npm ci
sudo -u "$APP_USER" npm run typecheck
sudo -u "$APP_USER" npm run lint
sudo -u "$APP_USER" npm test
sudo -u "$APP_USER" env NEXT_PUBLIC_GA_ID=G-0EYTT0CW4Z NEXT_PUBLIC_SITE_URL=https://saveframe.site npm run build
sudo -u "$APP_USER" node scripts/check-analytics-production.cjs
```

Do not copy Windows node_modules/binaries or private databases into the release. Retain the existing private admin database/key and download directory configuration. Set production runtime `GA4_ENABLED=1`, the reviewed country policy and campaign vocabulary in the protected environment. **Staging/test deployments must set `GA4_ENABLED=0`**, even if built with the production hostname/ID.

For an existing Cloudflare-proxied deployment, enable its country header, review the current [IPv4](https://www.cloudflare.com/ips-v4/) and [IPv6](https://www.cloudflare.com/ips-v6/) ranges against the supplied snippet, and then:

```sh
sudo install -d /etc/nginx/snippets
sudo install -m 0644 nginx/saveframe-analytics-region.conf /etc/nginx/snippets/saveframe-analytics-region.conf
# Review the existing site's configuration with sudoedit; do not blindly
# overwrite it. Add the snippet include once in http context and the frontend
# proxy_set_header X-SaveFrame-Country $saveframe_analytics_country;
sudo nginx -t
```

The geo map checks the original socket peer against Cloudflare networks before accepting CF-IPCountry. Direct/untrusted origins get `XX`, and Nginx overwrites a visitor-supplied X-SaveFrame-Country. Keep Node bound to 127.0.0.1, restrict origin ingress, maintain the trusted range list, and never cache country-dependent HTML/RSC responses across visitors. The supplied direct-peer snippet needs adaptation if another load balancer sits before Nginx. Without a trusted country provider, automatic collection remains off; no external GeoIP service was added.

After backups and draining active jobs, have the owner select the reviewed release using the existing service's deployment mechanism. If the unit uses a fixed WorkingDirectory, update that existing path/ExecStart consistently before restarting; if it uses a release symlink, switch only that verified symlink. Preserve the protected EnvironmentFile. Then the owner may run:

```sh
sudo systemctl daemon-reload   # only if the unit/drop-in changed
sudo systemctl restart "$APP_UNIT"
sudo systemctl reload nginx
```

Finally, inspect a real eligible production visit in GA4 Realtime/DebugView: one initial page view, one per navigation, correct referral/campaign, and genuine downloader outcomes. Verify zero tracking for opt-out/GPC/DNT, admin, staging and a consent-required visitor before valid permission. Verify the Privacy link disables subsequent events. Do not generate synthetic traffic to claim real users. If validation fails, return to the previous release and set `GA4_ENABLED=0`; do not reset the private database or session key.

Sources: [Google configuration](https://developers.google.com/analytics/devguides/collection/ga4/reference/config), [traffic-source attribution](https://support.google.com/analytics/answer/11242841?hl=en), [consent-mode implementation](https://developers.google.com/tag-platform/security/guides/consent), [Cloudflare request headers](https://developers.cloudflare.com/fundamentals/reference/http-headers/). These inform implementation, not a claim of worldwide legal compliance.
