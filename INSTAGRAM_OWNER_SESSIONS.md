# Owner-only Instagram session and story workflow

Implemented locally on 2026-10-26. No production configuration was changed, no service was restarted, no account login was attempted, and no push/deployment was performed. `INSTAGRAPI_AUTH_ENABLED` remains disabled by default. This supplements and supersedes the owner-session limitations in `INSTAGRAPI_FALLBACK.md`.

## What changed

- `python/create_instagram_session.py`: interactive local login, hidden password/manual two-factor input, identity validation, `dump_settings()`, private atomic export and explicit `--renew`. Unknown challenges stop; there is no challenge solver or automatic login loop. A lock prevents simultaneous local creation attempts.
- `python/instagrapi_worker.py`: protected `load_settings()` and a distinct `owner-story` operation. It checks the saved user ID, validates the live authenticated username/ID once per operation, requests one bounded owner story list using the installed SDK's `user_stories_v1()`, and returns only the exact matching active story. Login/revocation and verification produce `SESSION_EXPIRED`/`CHALLENGE_REQUIRED`. Owner-mode API access is limited to the current-account read and that owner's story-list read.
- `src/services/instagrapi.service.ts`: explicit authorized entry point, configured session identifiers, error mapping, existing process/concurrency/deadline bounds. Owner authentication is independent of the anonymous fallback flag.
- `src/services/yt-dlp.service.ts`: reuses `extractOperatorMetadata()` for the dedicated authorized story operation; `downloadOperatorStory()` reuses the existing verified transport and cancellation controls, with separate private output storage. Authenticated results never enter public metadata caches.
- `scripts/story-owner.cjs`: an OS-authorized CLI creates a separate instance of the existing `DownloadManagerService`, with public analytics disabled. Its jobs/files are never registered with the public HTTP server. No new endpoint, admin UI, port or persistent service was added.
- `src/types/media.types.ts`, `.env.example`, `package.json`: controlled errors, documented flags/identity and `npm run story:owner`.
- `python/test_instagrapi_worker.py`, `scripts/check-instagrapi.cjs`: extended offline regression coverage.

The first implementation intentionally supports **the authenticated owner's own active stories only**. It does not grant anonymous users access to another person's stories, use a shared account for unrelated visitors, deliver a whole story collection or silently reuse a rejected session. Existing anonymous yt-dlp/HTTP/gallery/instagrapi flows remain separate.

## Local creation: owner runs this manually

Use an interactive terminal, not piped credentials. Python >=3.11 is required by instagrapi 3.2.1. The pinned dependencies remain in `python/requirements-instagrapi.lock.txt`.

From the checkout in PowerShell:

```powershell
.\.runtime\Scripts\python.exe --version
.\.runtime\Scripts\python.exe -m pip install -r python/requirements-instagrapi.lock.txt
.\.runtime\Scripts\python.exe -m pip check
.\.runtime\Scripts\python.exe python/create_instagram_session.py
```

The script prompts for username/password and, if supported/required, a manually entered two-factor code. The default Windows file is `%LOCALAPPDATA%\SaveFrame\instagram-sessions\owner.json`; on Linux it defaults under `~/.local/share/SaveFrame/instagram-sessions/`. It prints the expected username and account ID for configuration, never cookies/passwords. A custom `--output` must be absolute and end in `owner.json`, outside the checkout and temp/download directories, without symlinks. Linux requires directory 700/file 600 and current-user ownership. Windows requires an ACL restricted to the owner and administrators; POSIX mode bits cannot prove Windows ACL privacy.

To renew explicitly after completing any required checks in Instagram:

```powershell
.\.runtime\Scripts\python.exe python/create_instagram_session.py --renew
```

Renewal reuses prior device settings and only replaces the old file after successful login/identity verification/export. It does not automatically upload anything to the VPS. Passwords are never accepted as arguments or saved in configuration.

## Contabo preparation: commands for the operator, not executed here

These paths match the supplied Ubuntu deployment. Replace `VPS_HOST`, `SSH_OPERATOR`, `LOCAL_OWNER_FILE`, `OWNER_USERNAME` and `OWNER_NUMERIC_ID` with real values. Keep all existing production environment lines, SQLite database/WAL/SHM files, keys and other websites intact.

First inspect the actual unit/account and compatible Python:

```bash
ssh SSH_OPERATOR@VPS_HOST
systemctl show saveframe.service -p User -p Group -p WorkingDirectory -p EnvironmentFiles
sudo -u saveframe /var/www/SaveFrame/.venv/bin/python --version
sudo -u saveframe /var/www/SaveFrame/.venv/bin/python -m pip show instagrapi
sudo -u saveframe /var/www/SaveFrame/.venv/bin/python -m pip check
```

Expected: working directory `/var/www/SaveFrame`, account `saveframe`, Python 3.12.3 and instagrapi 3.2.1. If the service uses a different account, stop and reconcile ownership rather than changing unrelated services. Install the pinned dependencies into the stated compatible venv during your normal reviewed release preparation, without replacing existing extractors:

```bash
cd /var/www/SaveFrame
sudo -u saveframe .venv/bin/python -m pip install -r python/requirements-instagrapi.lock.txt
sudo -u saveframe .venv/bin/python -m pip check
sudo install -d -o saveframe -g saveframe -m 700 /var/lib/saveframe/instagram-sessions
sudo install -d -o saveframe -g saveframe -m 700 /var/lib/saveframe-owner-downloads
```

Transfer over SSH using a private staging directory under the SSH operator's home. Do not upload to the web root or `/tmp`:

```bash
ssh SSH_OPERATOR@VPS_HOST 'umask 077; mkdir -p "$HOME/.saveframe-session-upload"; chmod 700 "$HOME/.saveframe-session-upload"'
# Run this scp command on your local machine; quote the actual local path.
scp "LOCAL_OWNER_FILE" SSH_OPERATOR@VPS_HOST:.saveframe-session-upload/owner.json
```

Back in the same remote SSH operator shell:

```bash
chmod 600 "$HOME/.saveframe-session-upload/owner.json"
sudo install -o saveframe -g saveframe -m 600 "$HOME/.saveframe-session-upload/owner.json" /var/lib/saveframe/instagram-sessions/owner.json
# After verifying the protected copy, remove only your disposable upload copy:
rm -- "$HOME/.saveframe-session-upload/owner.json"
sudo -u saveframe test -r /var/lib/saveframe/instagram-sessions/owner.json
sudo stat -c '%a %U:%G %n' /var/lib/saveframe/instagram-sessions /var/lib/saveframe/instagram-sessions/owner.json
```

Never print the file contents or include it in Git/support logs. If replacing an old session, stop existing owner CLI operations first; do not renew or replace it during active extraction.

## Protected environment

Edit the **existing** `/etc/saveframe/production.env`, retaining unrelated settings and secrets. Do not paste its contents into chat. Do not put these credentials in `.env.production` in Git.

```dotenv
INSTAGRAPI_FALLBACK_ENABLED=1
INSTAGRAPI_PYTHON_PATH=/var/www/SaveFrame/.venv/bin/python
INSTAGRAPI_TIMEOUT_MS=20000
INSTAGRAPI_MAX_WORKERS=1
INSTAGRAPI_MEMORY_MB=512
INSTAGRAPI_AUTH_ENABLED=0
INSTAGRAPI_SESSION_DIR=/var/lib/saveframe/instagram-sessions
INSTAGRAPI_SESSION_KEYS=owner
INSTAGRAPI_OWNER_USERNAME=OWNER_USERNAME
INSTAGRAPI_OWNER_USER_ID=OWNER_NUMERIC_ID
```

The public fallback and owner authentication flags are separate. Setting `INSTAGRAPI_FALLBACK_ENABLED=1` does not grant public requests a session. Set authentication to 1 only after offline/Linux compatibility checks and the controlled owner CLI test. In the CLI test below, the flag is enabled for that one process only, leaving the web service unchanged.

## Offline verification on the release candidate

```bash
cd /var/www/SaveFrame
sudo -u saveframe env INSTAGRAPI_PYTHON_PATH=/var/www/SaveFrame/.venv/bin/python npm run test:instagrapi
sudo -u saveframe npm run test:stories
sudo -u saveframe npm run test:downloader
sudo -u saveframe npm run test:security
sudo -u saveframe npm run typecheck
sudo -u saveframe npm run lint
sudo -u saveframe npm test
sudo -u saveframe npm run build
```

The regression script defaults to `.runtime` on this Windows workspace; when configuring the VPS interpreter explicitly, it uses that interpreter for its real subprocess checks. Run tests in the reviewed writable release/workspace under the correct service user. No automated test performs an Instagram login.

## Controlled owner live test

Use a currently active story from **OWNER_USERNAME**, with an ID in its exact URL. Run on the VPS as the service user; this is a local CLI, not a public web request:

```bash
cd /var/www/SaveFrame
sudo -u saveframe env \
  INSTAGRAPI_AUTH_ENABLED=1 \
  INSTAGRAPI_PYTHON_PATH=/var/www/SaveFrame/.venv/bin/python \
  INSTAGRAPI_SESSION_DIR=/var/lib/saveframe/instagram-sessions \
  INSTAGRAPI_SESSION_KEYS=owner \
  INSTAGRAPI_OWNER_USERNAME=OWNER_USERNAME \
  INSTAGRAPI_OWNER_USER_ID=OWNER_NUMERIC_ID \
  npm run story:owner -- \
  --url 'https://www.instagram.com/stories/OWNER_USERNAME/STORY_NUMERIC_ID/' \
  --output /var/lib/saveframe-owner-downloads
```

The CLI disables public/admin download analytics and does not load `/etc/saveframe/production.env` automatically. Supply the flags above or use your already secured process-environment loader; do not `source` an unreviewed dotenv file as shell code. Any additional deployment limits should be supplied through the same protected environment.

Success means the CLI reports a nonempty private file with verified MIME/signature and actual downloaded byte count. For video, inspect the resulting local file with `ffprobe`/your player and play it through the end. Metadata alone is not success. Repeat with another active owner story to verify session reuse; verify the protected session file remains unchanged. The new CLI manager never registers these jobs in the public server, so its job IDs cannot be retrieved from public job/download endpoints.

Stop on `SESSION_EXPIRED`, `LOGIN_REQUIRED`, `CHALLENGE_REQUIRED`, private-content denial, missing story or rate limit. Complete verification manually in Instagram, then explicitly renew/export/transfer if needed. No automatic password login is performed by the worker.

## Enabling, disabling and revoking

After target-host and controlled live checks, an operator may set `INSTAGRAPI_AUTH_ENABLED=1` in `/etc/saveframe/production.env`. This still enables no public HTTP authenticated extraction endpoint. Apply any web-service environment changes only at your approved maintenance window:

```bash
sudo systemctl restart saveframe.service
sudo systemctl is-active saveframe.service
# Inspect only application status, never dump the protected environment/session:
sudo journalctl -u saveframe.service --since '5 minutes ago' --no-pager
```

No Nginx/Cloudflare change or restart of another website is needed. Keep `INSTAGRAPI_AUTH_ENABLED=0` if the feature is not needed. To revoke access, disable the flag, stop owner CLI operations and revoke the session in Instagram's account security settings. Move the local saved file into protected offline storage or remove it deliberately afterward; deleting a saved file alone does not revoke the upstream Instagram session. Never recursively delete `/var/lib/saveframe`.

## Limits, security review and test evidence

Local compatibility: Python 3.14.6 and instagrapi 3.2.1; requested VPS Python 3.12.3/Linux limits have not been exercised on Contabo. No dependency upgrade was needed for this feature. Linux worker rlimits bound address space, CPU, descriptors and file writes; mocked tests verify configuration calls, not actual VPS enforcement. Windows uses subprocess time/output/concurrency bounds; it lacks POSIX rlimits/flock and requires external ACL protection. Linux owner workers also acquire a nonblocking lock on the saved session file, released by process termination without modifying it.

The authenticated transport explicitly uses the installed SDK's supported `private_transport='requests'`, verified TLS and pinned public DNS answers. Curl/uTLS are not used in the worker's authenticated network calls. Requests are limited to exact Instagram hosts/read endpoints, no redirects/proxies, bounded decoded responses, no SDK retry wrapper/challenge handler. Node independently validates all CDN URLs, MIME, signatures and size before delivery. Unknown errors are sanitized; credentials and session contents never appear in worker output, logs, GA4 or public analytics.

Verified offline: valid saved settings, ID/username mismatch, missing credentials, session expiration, verification challenges, exact story selection, image/video metadata, owner authorization, anonymous isolation, no public metadata cache, traversal/symlink checks, permissions where supported, actual subprocess cancellation/timeout/output bounds, concurrency, resource-limit configuration, CDN validation and **real local JPEG delivery through the existing download manager**. A corrupt follow-up transfer fails signature verification and cleans its partial file. Local login/export tests use mocked clients and confirm failed renewal preserves the old file. No live story/playability result is claimed.

Also verified locally: full existing admin/security/preview/downloader/story/i18n/blog/GA4 tests, typecheck, lint and production build. Final SEO crawl checks all 37 canonical routes, reciprocal language annotations and sitemap exclusions. See the final completion message for any remaining verification limitation.
