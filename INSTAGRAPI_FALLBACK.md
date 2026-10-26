# Optional instagrapi fallback — implementation and verification

Date: 2026-10-26. Implemented locally; not committed, pushed or deployed. The feature remains **disabled by default**. No Instagram account, live Instagram content, Google Analytics, Gmail credentials or production database was used in these tests.

Update: the separate owner-session CLI is now implemented and documented in `INSTAGRAM_OWNER_SESSIONS.md`. That guide supersedes the earlier operator-only limitations below. Anonymous fallback restrictions remain unchanged.

## Files

Added:

- `src/services/instagrapi.service.ts`: eligibility, owner authorization, bounded subprocess protocol, validation and normalization.
- `python/instagrapi_worker.py`: metadata-only worker using explicit instagrapi public web methods.
- `python/requirements-instagrapi.txt`: pinned primary library.
- `python/requirements-instagrapi.lock.txt`: the complete tested dependency set.
- `python/test_instagrapi_worker.py`: offline Python contract/security fixtures.
- `scripts/check-instagrapi.cjs`: integration and actual subprocess lifecycle regressions.
- This report/setup guide.

Modified:

- `src/services/yt-dlp.service.ts`: fallback orchestration, operator-only metadata entry point, existing guarded transport for fallback downloads.
- `src/types/media.types.ts`: adds `instagrapi` to the extraction-source union.
- `.env.example`: disabled feature flag and bounded settings; no secrets.
- `.gitignore`: excludes session directories/files and Python bytecode.
- `package.json`: adds `npm run test:instagrapi`. No npm dependency changes.

Existing public UI, translations, blog content, admin/authentication/SQLite, SEO and GA4 source files were not changed. Existing unrelated work in the checkout was retained. Builds regenerate the existing hashed public asset manifests; these are not an intentional design change.

## Extraction flow

1. Existing input validation, API rate limiting, metadata coalescing and cache apply.
2. Profiles use the existing profile adapter. Stories use the existing yt-dlp → exact-story HTTP → optional gallery-dl pipeline. Posts/Reels/videos use yt-dlp; photo posts also try the existing photo adapter on recoverable failure.
3. A successful primary never launches Python. Terminal errors stop the operation. Only `EXTRACTOR_FAILURE`, `DOWNLOAD_TIMEOUT` and `YTDLP_NOT_INSTALLED` are eligible; a retryable flag alone grants no eligibility.
4. With `INSTAGRAPI_FALLBACK_ENABLED=1`, an eligible final primary error can launch one Python worker. Public requests pass **no session**, even if operator session configuration exists.
5. The worker uses explicit public web methods for public media, a public-profile lookup for avatars, and an exact-ID selection from the requested account's accessible stories. It rejects private accounts, mismatched owners/media IDs and expired/unavailable stories. It neither returns a profile's bulk stories nor downloads files.
6. Node validates the entire response and every CDN URL before any probe. Existing DNS-pinned transport probes MIME/signatures and file size, then creates existing `NormalizedMediaResult` metadata. Ordered carousels retain their order; unknown resolution/audio stays unknown.
7. Public fallback metadata uses the existing bounded cache. Downloads use the existing download manager and the existing story transport, with DNS pinning, no redirects, signature checks, exclusive file creation, cancellation, size limits and partial-file cleanup. Fallback videos are not sent back through yt-dlp to resolve Instagram again.

No paid API, browser automation, additional service or exposed port is introduced.

## Security boundaries and resource limits

- JSON stdin/stdout, protocol version 1; canonical Instagram URL and category only. No arbitrary user paths, executable arguments, proxies or domains.
- Python launched with `shell:false`, `-I -B`, fixed worker path and operator-configured absolute interpreter path. Environment is restricted and excludes web-process secrets.
- 8 KiB worker input; 1 MiB stdout; 64 KiB stderr. Diagnostics are drained without retention or logging; public errors use standardized safe text. Worker metadata HTTP responses are capped at 2 MiB after decompression.
- One process by default; configurable maximum two per Node process. There is no waiting queue. The slot remains held until the child closes and metadata validation finishes. A 30-second global cooldown follows worker failures, preventing fallback retry storms. Multi-process deployments multiply these limits; start with a single Node service and one worker.
- Default total fallback deadline 20 seconds, configurable 5–30 seconds, including probes. Cancellation terminates Python; SIGKILL follows after one second if required. DNS/probes inherit the deadline.
- Linux workers set address-space limit 512 MiB by default (256–768 MiB configurable), CPU 25/26 seconds, open files 64, core dumps disabled and file-write size zero. They never produce media/temporary files. Windows has timeout/output/concurrency bounds but no enforced address-space rlimit; Linux resource compatibility remains a VPS verification item.
- Python public requests use TLS verification, no environment proxies, an exact `www.instagram.com:443` allowlist, no redirects and validated/pinned DNS answers. Mobile/private API calls, login and challenge resolution are disabled. SDK GraphQL errors are converted before its media helper can retry a login restriction against another endpoint.
- All returned sources/thumbnails must be HTTPS on `cdninstagram.com` or `fbcdn.net` and their subdomains, without credentials or alternate ports. Node's existing transport independently revalidates DNS at fetch time.
- Existing rate limits, download queues, ZIP limits, cancellation and cleanup remain in place. No session values or upstream exceptions enter analytics/public logs.

## Operator sessions: intentionally separate from public requests

Persistent sessions may be **loaded from an existing protected file**, never automatically created/refreshed through login. The same protected file is reused across permitted calls without automatic writes. There is no password configuration, automatic re-login, interactive challenge or account-verification loop.

The trusted TypeScript library entry point is:

```ts
await service.extractOperatorMetadata(canonicalUrl, {
  requesterId: 'internal-owner-task',
  ownerUsername: 'your_operator_account',
  ownerUserId: '123456789',
  sessionKey: 'owner',
  allowedCanonicalUrls: [canonicalUrl],
}, signal);
```

This is **not a new HTTP API**. The caller must establish operator ownership and exact-operation authorization. Never populate this object from an anonymous request. `INSTAGRAPI_AUTH_ENABLED=1` is also required. The resulting account must match both configured owner username and user ID, and remain public. Login/private/deleted/expired errors from primary extractors never authorize this operation. Session-backed fallback results never enter public caches or the public download queue. A caller needing protected file delivery must retain an operator-only boundary; this change does not add a session-backed public download endpoint.

`sessionKey=owner` maps only to `<INSTAGRAPI_SESSION_DIR>/owner.json`. Node and Python reject traversal, symlinks, non-private permissions, oversized files and storage inside the checkout, OS temp or configured download directory. Linux requires current service-user ownership, directory mode 700 and session file mode 600. Windows operators must restrict the external directory's ACL to the service account and administrators; mode bits cannot establish that guarantee on Windows. The default is `/var/lib/saveframe/instagram-sessions/`.

Python checks the persisted session's `ds_user_id` against `ownerUserId`, then restores only credential/device fields. Session credentials are never passed on the command line. Challenges, invalid sessions and verification requirements produce controlled errors with no refresh attempt.

## Dependencies and local setup

Upstream [instagrapi](https://github.com/subzeroid/instagrapi) and [PyPI metadata](https://pypi.org/project/instagrapi/3.2.1/) specify Python **3.11+** for 3.2.1. Local verification used CPython **3.14.6**, Node **24.18.0**, Next **15.5.28**, instagrapi **3.2.1**. The pinned dependency set is in `python/requirements-instagrapi.lock.txt`; it includes Pillow 13.0.0, requests 2.34.2, pydantic 2.13.5 and curl_cffi 0.17.0. Although installed as an upstream dependency, curl is not used by the worker's network calls.

From this repository, PowerShell:

```powershell
# Existing compatible virtualenv was reused; do not recreate it blindly.
.\.runtime\Scripts\python.exe --version
.\.runtime\Scripts\python.exe -m pip install -r python/requirements-instagrapi.lock.txt
.\.runtime\Scripts\python.exe -m pip check
npm run test:instagrapi
npm run typecheck
npm run lint
npm test
npm run build
```

If the existing interpreter is older than 3.11, create a separate compatible virtualenv rather than upgrading/removing the environment used by working extractors. Set `INSTAGRAPI_PYTHON_PATH` to its absolute Python executable. The worker and tests require no credentials for offline checks.

Add only to your private runtime configuration when ready:

```dotenv
INSTAGRAPI_FALLBACK_ENABLED=1
INSTAGRAPI_TIMEOUT_MS=20000
INSTAGRAPI_MAX_WORKERS=1
INSTAGRAPI_MEMORY_MB=512
INSTAGRAPI_AUTH_ENABLED=0
# INSTAGRAPI_PYTHON_PATH=/absolute/path/to/venv/bin/python
```

Disable by setting `INSTAGRAPI_FALLBACK_ENABLED=0`. A running Next server reads its process environment; apply changes during your normal approved restart/deployment. No local or production service was restarted here.

## Safe Contabo preparation and deployment

Commands below are **instructions, not executed**. Substitute the actual SaveFrame release path, service user and unit name after checking them. Do not run commands against another website. Do not overwrite the production `.env`, admin directory, session keys, database or download storage. Use your normal backup/release procedure first.

```bash
# Verify existing paths/user/unit; example values must match your installation.
APP_DIR=/srv/saveframe
APP_USER=saveframe
APP_UNIT=saveframe.service
cd "$APP_DIR"
node --version                         # >=24
python3 --version                      # >=3.11
systemctl show "$APP_UNIT" -p User -p WorkingDirectory -p EnvironmentFiles

# Reuse only after verifying that the existing env is compatible.
"$APP_DIR/.runtime/bin/python" --version
sudo -u "$APP_USER" "$APP_DIR/.runtime/bin/python" -m pip install -r python/requirements-instagrapi.lock.txt
sudo -u "$APP_USER" "$APP_DIR/.runtime/bin/python" -m pip check
sudo -u "$APP_USER" npm run test:instagrapi
sudo -u "$APP_USER" npm run typecheck
sudo -u "$APP_USER" npm run lint
sudo -u "$APP_USER" npm test
sudo -u "$APP_USER" npm run build

# Optional session directory only for explicitly authorized internal operations.
sudo install -d -o "$APP_USER" -g "$APP_USER" -m 700 /var/lib/saveframe/instagram-sessions
# Import an existing operator-owned instagrapi settings file through a secure channel:
# sudo install -o "$APP_USER" -g "$APP_USER" -m 600 /secure/operator-settings.json /var/lib/saveframe/instagram-sessions/owner.json
```

If `.runtime` is incompatible, prepare a separate Python >=3.11 virtualenv under a private service-owned directory, install the lock there and set its absolute interpreter path; do not replace the working yt-dlp environment. Verify package wheel availability on the VPS architecture and Python version.

Keep the feature disabled while testing. In an isolated release/preview, run the worker smoke/regressions under the actual service account and Linux limits. The deployed artifact must contain `python/instagrapi_worker.py` in its repository-relative location and the configured interpreter must exist on that host. The current production build traces include the worker (five manifests verified); a Node-only bundle cannot install Python dependencies.

Set the settings in the unit's **existing protected EnvironmentFile** (or your existing runtime configuration), retaining its current credentials. Start with one worker. Check `MemoryMax`, available VPS RAM and the unit's existing sandbox: the worker needs read access to its interpreter/packages and worker source; operator mode additionally needs read-only access to its private session directory. Do not weaken unrelated services or the existing filesystem/network protections.

After compatibility checks and at your approved maintenance window only:

```bash
# Review diff/release, backup, private environment and rollback first.
sudo systemctl restart "$APP_UNIT"
sudo systemctl is-active "$APP_UNIT"
curl --fail --silent --show-error https://saveframe.site/api/health
```

Do not enable a session for the anonymous downloader. Test live extraction only with operator-owned or explicitly authorized public fixtures. For rollback, set `INSTAGRAPI_FALLBACK_ENABLED=0` and apply through the same approved service restart. No database migration, Nginx port, cron job or additional daemon is required.

## Validation results

- `npm run test:instagrapi`: PASS, including eight Python test cases; real Python process cancellation, timeout and output overflow; primary success suppression; one eligible fallback; terminal errors; ordered photo/video/carousel/story/profile mapping; URL validation before probes; safe error messages; operator scope/cache isolation; direct guarded video delivery compatibility.
- `npm run typecheck`: PASS.
- `npm run lint`: PASS.
- `npm test`: PASS (admin, security/audit regressions, preview/paste, downloader, stories/hybrid stories, i18n, blog, analytics).
- `npm run build`: PASS; final build privacy check verified 21 manifests and removed 56 private-state references without modifying private originals.
- `pip check`: PASS; import/Client construction PASS; locked dependency dry-run resolves to the installed tested set.
- `pip-audit 2.10.1` against all 17 entries in the pinned Python dependency set: no known vulnerabilities found. Report: `reports/instagrapi-dependency-audit.json`. The audit tool was installed in a separate ignored virtualenv, not the application's Python environment. Pins are version-locked but not hash-locked; the audit explicitly noted that limitation.
- `npm audit --omit=dev`: zero known production dependency vulnerabilities; no npm dependencies were added.
- `npm run test:runtime`: PASS using real local yt-dlp/FFmpeg readiness, MP4 encoding, AAC/video muxing, M4A extraction and non-silent decoded audio; no Instagram extraction.
- `npm run test:seo`: initially pointed to an existing non-indexable development environment (zero sitemap entries). Rerun against an isolated production server with the correct public origin: PASS, 37 canonical URLs, 15 preserved modification dates, 110 reciprocal hreflang annotations, 38 indexable pages and 52 internal destinations. Test server used disposable admin state, analytics off, fallback off and was stopped afterward.

## Remaining limits

- No live Instagram extraction or real file-save success is claimed. Public web endpoints can be login-gated or changed by Instagram; this fallback cannot guarantee access or repair `LOGIN_REQUIRED`.
- No VPS/Contabo access was used; Linux resource-limit behavior and shared-server capacity require the pre-enable checks above. Windows validation does not prove Linux compatibility.
- Public profile avatars from private accounts retain their existing primary-adapter behavior. The fallback conservatively rejects private accounts rather than using an account session to expand public access.
- No automatic session creation, authentication bypass, challenge solving, shared-account access, bulk story delivery or private-content delivery is added.
- Dependency pinning and tests are not a guarantee of absence of vulnerabilities. This change does not claim a complete new repository-wide security audit; keep upstream and pinned dependencies under review.
