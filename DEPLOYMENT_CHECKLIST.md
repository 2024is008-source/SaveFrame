# SaveFrame deployment and rollback checklist

This is a plan only. No VPS login, deployment, DNS change, Nginx reload or certificate operation was performed. Read `FINAL_AUDIT_REPORT.md` first: the supplied story remains login-restricted.

## Before a release

1. Resolve or explicitly accept the anonymous-story limitation. The tested direct story returned `LOGIN_REQUIRED`; changing its URL cannot grant authenticated access. Do not advertise guaranteed downloads of every public story.
2. Have the owner perform one real Gmail OTP/inbox test. The audit tested a local SMTP transport and Gmail TLS connectivity, not the real account's SMTP authentication. Never put the App Password in Git, a screenshot, a shell argument or a support message.
3. Use a security-maintained Node.js 24+ build and FFmpeg/yt-dlp installations suitable for Ubuntu. Local Windows binary tests are not Ubuntu validation. Never copy Windows `node_modules` or executables to Linux.
4. Review the final Git diff, including deletions and pre-existing work. Run `npm ci`, `npm run lint`, `npm run typecheck`, `npm test`, `npm run test:runtime`, and `npm run build` in a clean release folder. Do not build over a directory currently served by `next start`.
5. Review the remaining development-only Tailwind selector-parser advisories and ESLint 9 compatibility/support limitation. Do not run `npm audit fix --force`; a Tailwind/framework major migration needs its own visual regression review. Runtime-only audit currently reports zero known findings.

## Persistent data and private environment

- Put SQLite and its stable session key outside the release and web root, for example `SAVEFRAME_ADMIN_DATA_DIR=/var/lib/saveframe/admin`. Keep ownership with the unprivileged application service account and directory mode 0700. Preserve the SQLite main file, any WAL/SHM files and `session.key`; do not initialize over the existing administrator database.
- Use a separate service-owned private `DOWNLOAD_TEMP_DIR`, for example `/var/lib/saveframe/downloads`. Never point it at `public/`, a shared upload folder, the admin database folder or a directory containing unrelated files. Existing jobs and active deliveries must be allowed to finish before a planned shutdown.
- Startup now rejects download storage overlapping public/admin directories, a symbolic-link directory, or group/other permissions on Unix. Prepare the dedicated directory with mode 0700 and the service user's ownership before switching releases; do not change permissions on unrelated data directories. Windows deployments require an equivalent private ACL.
- Configure `NEXT_PUBLIC_SITE_URL=https://saveframe.site` at build time. Configure `ADMIN_ORIGIN=https://saveframe.site`, the existing owner email, SMTP settings and any stable private secret through the host's protected environment. Do not copy the workspace's `.env.local` HTTP exception to production.
- Production must not set `ADMIN_ALLOW_LOCAL_HTTP=1`, `SKIP_DNS_SSRF_CHECK`, `SAVEFRAME_FIXTURE_ORIGIN`, `YTDLP_MOCK_SCENARIO`, analytics-disable flags or SEO-test-disable flags. Keep test fixture servers off the public interface.
- `MAX_CONCURRENT_DOWNLOADS=1` or `2` is a conservative starting point for a small VPS; the application default is 3, queue default 20. Measure actual CPU/RAM/disk before increasing it. Defaults: 150 MiB archive/file cap, 15-minute completed-file retention, 100 MiB minimum free space. The image adapter separately bounds buffered photos to 25 MiB.
- Do not add a filesystem cleanup cron that deletes files by age while the app is processing or delivering them. The app cleans its own finished/failed jobs. Orphan files from a hard crash require an operator review with the service stopped; do not delete active files.

## Application and reverse proxy

- Run one persistent Next.js process as the service account, bound to `127.0.0.1:3000`. Use a process supervisor with a fixed working directory and protected environment file. Do not expose the Node port publicly. No Redis, PostgreSQL or Docker service is required.
- Build with development dependencies; a built release can install production packages with `npm ci --omit=dev`. TypeScript is a runtime dependency because the admin CLI and TS configuration need it. Ship the source content, private CLI, and `src/admin/migrations/` along with `.next`, `public`, package manifests and configuration.
- Choose one Nginx template. The templates now proxy to `127.0.0.1:3000`; they are not simultaneously loadable. Supply real certificates for both hostnames, review the paths, run `nginx -t`, and only then activate the reviewed configuration yourself. The TLS example redirects HTTP and www to the canonical HTTPS origin.
- The trusted edge must overwrite `X-Forwarded-For`. Never preserve a visitor-supplied value as the trusted first address. Keep POST body limits, rate limits and streaming timeouts.
- The resolution proxy timeout is now 75 seconds, covering the default metadata budget and photo fallback. If you raise extractor timeouts, review the proxy budget too. Behind Cloudflare, configure real client IP restoration from explicitly trusted Cloudflare networks and block direct origin access; do not trust arbitrary `CF-Connecting-IP` headers. No Cloudflare or systemd configuration is installed by this repository.
- Do not enable proxy/CDN caching on `/admin`, `/api/admin`, temporary downloads or verification responses. Respect application `private, no-store` headers. Public images can use their existing cache policy.
- The installer installs prerequisites only; it no longer installs Redis, adds cron jobs or creates a root-owned application temp directory. Inspect it before running it on a host. It does not install Node, create a service, issue certificates or configure DNS.

## Smoke checks before enabling traffic

- Verify binary readiness and local FFmpeg mux/audio extraction, disk permissions, temp paths and SQLite integrity as the service user.
- Test one authorized accessible Reel/video, photo, carousel ZIP/subset, DP and active story. Record actual bytes/MIME/filenames and acknowledge restrictions rather than fabricating success. The audit verified the provided DP live; the supplied story did not pass anonymous access.
- Verify signed-out admin redirects and API 401s, owner-only password/email-code login, optional TOTP, expiry/logout and CSRF rejection. Do not reset the existing password or disable TOTP merely for smoke testing.
- Verify metadata draft/publish/restore, canonical/hreflang stability, approved root verification URLs, and that arbitrary filenames/scripts are rejected. Complete Search Console/Bing ownership confirmation yourself if required; uploading a file does not complete provider verification.
- Check sitemap (37 canonical entries), 38 indexable pages including blog page 2, robots, API/admin noindex responses, 404s, mobile layouts, images and public links on the real HTTPS origin. Test certificate and redirects on the host; localhost cannot validate them.
- Re-run production `test:styles`, `test:seo`, live localization and blog checks with `TEST_BASE_URL` pointing to the controlled release preview. Measure actual VPS memory/concurrency and production performance. No Lighthouse/CWV score was fabricated in this audit.

## Backup and rollback

Before migration/release, stop new work, let active transfers finish, stop the service and copy the complete private data directory to protected backup storage. Preserve the stable key and WAL/SHM files with the database. Record the previous release path, configuration, lockfile and binary versions. Do not copy only a live SQLite main file while WAL writes are active.

Keep the preceding release intact. To roll back, stop new work and the service, select that release, and restore data only when the rollback actually requires it. The audit introduced no database schema migration. Do not roll back by deleting the data folder, recreating the admin, rotating keys, or running `git reset --hard` against uncommitted work. Recheck readiness and login after restarting. Restore a database backup only with the service stopped and with an explicit owner-approved recovery plan; otherwise current user activity would be lost.
