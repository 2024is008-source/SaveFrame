# Hybrid Instagram stories

This extends SaveFrame's existing Next.js backend. It adds no persistent service, browser automation or npm dependency. Public URLs still enter `YtDlpService`, the existing download manager and its queue. Profile links, highlights, account-wide story collections and ZIP story requests remain unsupported.

## Provider order

1. Normalize a direct `/stories/username/numeric-id/` URL. Tracking parameters are discarded. Reject invalid usernames, missing IDs, reserved story routes and invalid origins.
2. Try the installed yt-dlp metadata extractor with `--no-config`, `--no-playlist`, bounded output and cancellation. Primary extraction gets up to 20 seconds, within the overall deadline.
3. On a recoverable extraction failure, missing primary binary or primary timeout, read the canonical Instagram story page once with the Node HTTP adapter. It parses JSON responses and embedded JSON scripts; it never evaluates page JavaScript. Only media explicitly associated with the requested story ID can be accepted. Open Graph avatars and unrelated page images are not stories.
4. If that fails recoverably, gallery-dl may run once when explicitly enabled and its configured executable exists. Otherwise the last useful error is retained. Gallery is metadata-only; the Node transport still downloads accepted files.
5. Before returning successful metadata, probe the selected media URL with a small ranged request. Check the approved host, actual connection DNS, HTTP status, MIME type and signature. Unknown dimensions and duration remain unknown. Do not manufacture HD labels or audio codecs.

`LOGIN_REQUIRED`, `PRIVATE_CONTENT`, `RATE_LIMITED`, explicit expiration/not-found responses, unsafe origins and invalid media are terminal outcomes. A provider is never retried with a different account to get around those restrictions. A public-looking story link is not evidence that anonymous extraction is permitted.

Current HTTP parsing understands exact-ID Instagram `video_versions` and `image_versions2.candidates` objects. The canonical public page was checked during implementation; the supplied story page did not expose playable media. No undocumented API endpoint from an old reference project was assumed to work. New Instagram response formats may require a parser update.

## Resource and security limits

| Item | Limit / behaviour |
|---|---|
| Total story provider deadline | 45 seconds by default; configurable from 5–60 seconds, including two seconds reserved for process termination |
| Primary provider | Up to 20 seconds, constrained by total deadline |
| HTTP metadata | One request, up to 10 seconds and 2 MiB |
| Media probe | Up to 5 seconds; retain at most 32 prefix bytes |
| Gallery process | Up to 10 seconds, zero retries, 2 MiB stdout |
| Concurrent metadata | Existing service cap of three; shared requests coalesce |
| Success cache | Existing eight-entry, two-minute cache |
| Story failure cache | Up to eight sanitized outcomes; 15 seconds, or 30 for rate limits |
| Download queue | Existing defaults: three active, twenty queued; no new worker service |
| Media transfer | Stream with backpressure; existing maximum file size, private files and cleanup |

Use HTTPS and approved Instagram CDN suffixes only. Check DNS results at connection time, rejecting private/reserved answers and mixed public/private answer sets. Redirects are not followed. Credentials never travel to CDN hosts. Image/video MIME types must agree with their signatures; unsupported formats fail honestly. Files use exclusive creation and partial files are removed on failure or cancellation. An existing output file is not overwritten or deleted.

Cancellation works while a story is being inspected or transferred. A shared metadata operation is aborted only when its last waiting caller cancels. Terminate subprocesses with a bounded forced-kill fallback. Do not add an age-based cleanup cron: the application's queue/retention manager already owns public download cleanup.

Story formats are progressive MP4, JPEG or WebP. When the provider explicitly confirms an audio track, M4A extraction remains available through the existing FFmpeg binary, using a verified local MP4 input. Temporary source files and failed outputs are removed; existing outputs are preserved. Unknown audio availability is not advertised. DASH-only video requiring a separate audio stream is not silently downloaded without its audio; another permitted provider must supply an acceptable direct file. Story bulk ZIP is not added. Existing Reel/video/audio/carousel processing retains its original path.

## Configuration

No existing `.env` file is changed by this feature. Set optional variables privately during deployment:

| Variable | Default / purpose |
|---|---|
| `STORY_EXTRACTION_TIMEOUT_MS` | `45000`; clamped to 5000–60000 |
| `STORY_GALLERY_DL_ENABLED` | Disabled unless exactly `1` |
| `GALLERY_DL_BINARY_PATH` | Optional absolute path; otherwise check the project-local `.runtime/bin/gallery-dl` or Windows `.runtime/Scripts/gallery-dl.exe` |
| `STORY_AUTH_ENABLED` | Disabled unless exactly `1`; used only by the operator command |
| `STORY_AUTH_COOKIE_FILE` | Operator's private Netscape-format file outside the checkout |
| `STORY_AUTH_ALLOWED_USERNAMES` | Explicit comma-separated account scope for that operator |

Existing yt-dlp/FFmpeg paths, download-size limits, concurrency and temporary-directory configuration still apply. Normal startup does not require gallery-dl. An absent/disabled gallery provider is skipped, not treated as a new mandatory dependency.

## Optional gallery-dl

The [official Instagram extractor](https://github.com/mikf/gallery-dl/blob/master/gallery_dl/extractor/instagram.py) supports story image/video records and exact story IDs. It is not a credential-free guarantee; access is still checked by Instagram. Its source is GPL-2.0; it runs as an optional external executable and no gallery source is copied into SaveFrame.

It remains disabled by default. The supplied login-gated story does not justify enabling another public fallback after an access denial. A real installed gallery binary was not required for the deterministic suite; CLI execution was exercised with a clearly identified local fixture. Verify a compatible gallery version and permitted media on your target host before enabling it.

For an optional isolated Linux installation, review these commands and run them yourself in a release/workspace:

```sh
python3 -m venv .runtime/story-tools
.runtime/story-tools/bin/python -m pip install gallery-dl
```

Configure `GALLERY_DL_BINARY_PATH` to the absolute `.runtime/story-tools/bin/gallery-dl` path. Do not install globally or copy Windows executables to Ubuntu. Public gallery calls ignore global configuration, disable interactive/password/netrc/browser-cookie sources and proxy inheritance, and cannot load an operator cookie file. Cookie-file updating is disabled.

## Explicitly authorized extraction

There is deliberately **no visitor cookie/password form and no shared authenticated public endpoint**. SaveFrame currently has one private administrator rather than a requester-scoped Instagram authorization system. Automatically applying an owner's session to public requests would expose that owner's access to unrelated visitors.

The implemented optional capability is an **operator-only command**, executed by a trusted local OS user. Enable it explicitly, provide a private external session file and allowlist only accounts that this operator is authorized to access. The server-side `downloadAuthorizedStory` method enforces the same scope. Instagram still enforces session access; an allowlist alone does not grant permission.

```sh
npm run story:authorized -- --url https://www.instagram.com/stories/authorized_account/1234567890123456789/ --output /private/operator/story-downloads
```

Use a local private directory outside the application checkout, never `public/`. On Unix, the session file must have no group/other permissions and the output directory must be private. On Windows, restrict its ACL to the operator yourself; Unix mode checks do not substitute for Windows ACL review.

Only secure, unexpired Instagram session cookie fields are read. Providers receive a filtered disposable 0600 cookie copy in a private temporary directory, so they cannot overwrite the original session file. Remove that copy in `finally`. Cookies and tokens are never returned to frontend JavaScript, sent to media CDNs or placed in analytics. Authorized results do not enter the public metadata/failure cache, public job registry or public delivery routes. One CLI invocation downloads one item; run operator invocations serially on a small VPS.

No passwords, login challenge handling, CAPTCHA solving, browser-cookie harvesting or anti-bot evasion are implemented. Authorized real-account access was not exercised without an operator-provided session. Tests use disposable fake sessions. A future authenticated web workflow would require a separate requester authorization design; setting `STORY_AUTH_ENABLED=1` does not turn the public downloader into such a workflow.

## Outcomes and analytics

Reuse existing codes: `LOGIN_REQUIRED`, `PRIVATE_CONTENT` (access denied), `EXPIRED_STORY` (explicit expiry), `DELETED_CONTENT` (not found), `NO_ACTIVE_STORIES`, `INVALID_STORY_LINK`/`INVALID_URL`, `RATE_LIMITED`, `EXTRACTOR_FAILURE`, `DOWNLOAD_TIMEOUT`, `UNSUPPORTED_MEDIA_TYPE`, `JOB_CANCELLED` and `INTERNAL_ERROR`.

Record final resolution outcome, story category, duration and sanitized failure code. Do not store submitted URLs, authentication headers, cookie contents or provider stderr in SQLite. The existing confirmed-system-failure allowlist remains unchanged. Access restrictions, source failures, invalid requests and visitor cancellation do not become software-failure scores. Preview preparations also explicitly opt out of download request analytics; actual download accounting remains enabled.

## Verification and release

```sh
npm run typecheck
npm run lint
npm run test:security
npm run test:downloader
npm run test:stories
npm run test:admin
npm run test:preview
npm run build
```

`test:stories` includes both the existing checks and hybrid deterministic fixtures. To request a live test of a URL you are authorized to inspect, after building:

```sh
npm run test:stories -- --live-url=https://www.instagram.com/stories/username/1234567890123456789/
```

That explicit flag starts a disposable local production process on `127.0.0.1:3111`, uses an isolated temporary administrator database, tests the exact URL anonymously, optionally streams an actual accepted file, records `reports/hybrid-story-live.json`, and removes its own test data. It does not restart an existing service or modify production. A port conflict fails without stopping the other process.

Review the new source and `HYBRID_STORY_REPORT.md`, build in a separate release directory, retain existing private data/keys, and follow `DEPLOYMENT_CHECKLIST.md`. No automatic commit, push, deploy, DNS, Nginx or service restart is part of this change.
