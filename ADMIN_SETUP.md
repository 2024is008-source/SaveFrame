# SaveFrame private administration

## First account

Use Node.js 24 or newer. From the project directory, run:

```powershell
npm run admin:setup
```

Enter your email and a unique password of at least 12 characters at the terminal prompts. Password input is hidden. There are no built-in credentials, public signup, or automatic production accounts. Do not send passwords in chat, commit them to source control, or put them in command arguments. The email used for admin login is independent of the public support address.

For this workspace, `SAVEFRAME_ADMIN_EMAIL` is set to `backbencherz2027@gmail.com` in ignored `.env.local`. Setup uses that address and asks for your password privately. This local configuration also enables HTTP cookies only for the loopback preview at `http://localhost:3000`; it must not be copied to public hosting. The public contact email remains `backbencherz@gmail.com`.

## Required Gmail sign-in code

Only `SAVEFRAME_ADMIN_EMAIL` can log in. Other account emails and their existing sessions are rejected on the server. Every new sign-in requires the owner password followed by a six-digit email code; optional authenticator-app TOTP is an additional check. There is no password-only fallback when email delivery is unavailable.

The workspace has the owner, Gmail SMTP address and SMTP credential configured in ignored `.env.local`. The audit verified configuration presence and TLS connectivity without sending email or testing Gmail authentication. Actual inbox delivery still needs an owner sign-in test. For a new installation or credential replacement, configure it privately:

1. Sign into the Google account for `backbencherz2027@gmail.com`, enable Google 2-Step Verification, and create an App Password named SaveFrame. [Google's official instructions](https://support.google.com/accounts/answer/185833) explain requirements and account restrictions.
2. In `.env.local`, set `ADMIN_SMTP_PASSWORD` to that App Password, without display spaces. Do not use your normal Gmail password and do not send it in chat. On production use the host's private secret store instead.
3. Confirm `ADMIN_SMTP_USER` and `ADMIN_MAIL_FROM` are the Gmail sender address, `ADMIN_SMTP_HOST=smtp.gmail.com`, and `ADMIN_SMTP_PORT=587`. The configured sender is also the only allowed owner/recipient in this workspace.
4. Create the owner account using `npm run admin:setup`, then restart the server after configuration changes. Enter the owner email and password at `/admin/login`, then enter the code received in Gmail.

SMTP uses verified TLS, bounded timeouts and no paid delivery provider. Email codes expire in five minutes, are single use, permit five guesses and are stored as keyed hashes. A pending browser cookie binds verification to the browser that supplied the password. Re-requesting a pending code has a one-minute cooldown and the existing login rate limits. Codes, passwords and SMTP errors containing credentials are never written to audit logs or returned to the browser. Failed email delivery creates no session. Gmail itself may apply account sending limits; this is intended for one owner's admin sign-in.

For development, run `npm run dev` and open `/admin/login`. For a production-mode loopback preview, explicitly set `ADMIN_ALLOW_LOCAL_HTTP=1` and `ADMIN_ORIGIN=http://localhost:3000` in that process before `npm start`. Remove the local exception from public hosting. `/admin` redirects signed-out visitors to login.

## Production configuration

- `NEXT_PUBLIC_SITE_URL=https://saveframe.site` is the public canonical origin.
- `ADMIN_ORIGIN=https://saveframe.site` must exactly match the origin used for administration. It is checked for write requests and used for public verification checks. Set `SAVEFRAME_ADMIN_EMAIL=backbencherz2027@gmail.com` privately on the host; without an owner email, access fails closed. The same value must be used by setup and the running server.
- `SAVEFRAME_ADMIN_DATA_DIR` should point to a persistent directory outside `public/`, for example `/var/lib/saveframe`, owned only by the application OS user. The default is `.data/` under the project. Windows deployments must restrict that directory's ACL to the service account and administrators.
- Optionally supply `SAVEFRAME_ADMIN_SECRET` through your host's secret store: at least 32 random characters, stable across restarts. Otherwise the application generates a private `session.key` in its data directory. Preserve that key alongside the database. Losing or replacing it invalidates authentication challenges and requires administrator TOTP recovery/re-enrollment.
- Serve HTTPS. Production cookies use `__Host-` names, Secure, HttpOnly, SameSite=Strict and Path=/. Never enable `ADMIN_ALLOW_LOCAL_HTTP` publicly.
- Use one persistent Node process on a single host with local disk. The downloader already has an in-memory queue; this design does not support ephemeral/serverless filesystems or separate queue replicas. SQLite is WAL-backed with transactions and a busy timeout.
- Keep the Node port private behind the reverse proxy. The trusted proxy must overwrite forwarded headers, including `X-Forwarded-For`, rather than accepting a visitor's supplied value. Login has per-address, per-account and global rate limits.
- Ship `src/admin/migrations/` and the native Argon2 package with the server deployment. `npm run admin:migrate` initializes the database; migrations 001 and 002 also run automatically on first access.
- Do not cache `/admin`, `/admin/*`, `/api/admin/*` or verification responses in a CDN/reverse proxy. Application responses carry private/no-store headers.

No deployment, Search Console connection, DNS edit, paid API purchase or external publishing was performed by this implementation.

## Security and indexing

Every dashboard section authenticates on the server before loading private data. Every admin data API requires a server-side session; writes additionally require an allowed Origin and session CSRF token. Passwords use Argon2id. Sessions expire after eight hours or 30 minutes of inactivity, are limited to five per administrator, and store only token hashes in SQLite. Login attempts are rate limited with hashed buckets; logs do not record submitted passwords or raw client addresses.

`/admin` and descendants return `X-Robots-Tag: noindex, nofollow, nosnippet`, private/no-store caching headers and noindex metadata. Robots.txt disallows admin paths and the public sitemap excludes them. These crawler directives supplement authentication; they do not replace it. The sign-in screen itself must be reachable to sign in. If an older deployment already exposed an admin URL in search, deploy these protections and use Search Console's removal tool if immediate removal is required; code cannot instantly remove a prior search result.

In Settings, enter your current password to begin optional authenticator setup, add the displayed secret to a time-based six-digit authenticator, then confirm a fresh code. The secret is encrypted at rest. Codes cannot be replayed, and enabling/disabling TOTP signs out other sessions. No third-party QR service receives the secret.

Recovery from the trusted server terminal:

```powershell
node scripts/admin.cjs reset-password
node scripts/admin.cjs disable-totp
node scripts/admin.cjs status
```

Follow the CLI prompts. Recovery revokes sessions and records an audit event. OS-level access to the data directory and CLI is therefore privileged.

## Dashboard workflows

- **Overview / Download Analytics:** real request counts, file preparations, failures, success percentage, daily chart, media distribution, processing time, current queue, 1/7/30-day totals, recent requests, date/type/status filters, pagination and aggregate CSV export. All report dates use UTC.
- **Error Reports:** grouped sanitized failure reasons and paginated events. No Instagram URLs, media URLs, extractor logs, cookies or visitor identities are stored in analytics.
- **SEO Manager:** select an existing public page, edit plain-text metadata, choose an approved existing social image, save a private draft, then publish. Published fields affect server-rendered metadata on subsequent requests without rebuilding. History restores into a draft so a restoration is reviewable before publishing. Version conflicts prevent one tab overwriting another. Canonicals, hreflang, robots and the sitemap remain application-controlled; target keywords are internal planning only. Selected tool, information-page and article summaries can be edited; this is not an arbitrary HTML or article-body CMS.
- **Verification Files:** upload the exact Google verification file, BingSiteAuth.xml or valid ads.txt; inspect its preview, publish it at its allowlisted root URL, check that URL, replace with version checking, or remove it. Data is stored in SQLite and served through a narrow root rewrite, with a 16 KB limit. Arbitrary HTML, scripts, XML entities, arbitrary filenames, path traversal and asset replacement are rejected. Google DNS TXT instructions can be saved and checked after you manually add the record at your DNS provider. Uploading a file alone does not complete the provider's ownership confirmation.
- **Settings:** approved non-secret public name, support email, default tool, fallback description, default social image, detail retention and optional TOTP. Deployment secrets are never editable here.
- **Audit Logs:** searchable, paginated administrative actions. SEO publication/restoration, verification changes/checks, settings, login/security and report export are recorded.

## Data semantics and retention

Tracking begins after this implementation is running; historical downloads cannot be reconstructed. A request is counted once with a correlation ID. Resolution, preparation and delivery transitions are separate deduplicated events. Preparation success is prepared / (prepared + failed); active jobs are not counted as successes. Processing duration measures server preparation. A full response handoff is not proof that a person saved the file on their device. Repeated file fetches do not inflate the per-request delivery count; HEAD requests do not count as delivery.

Raw events and recent request details default to 30 days; Settings permits 7–180 days. Daily UTC aggregates remain for up to 730 days and audit entries for 180 days. Cleanup runs at most hourly during authenticated/tracking activity; use `npm run admin:cleanup` for an explicit cleanup, including when the site has no traffic. Deleted detail rows cannot be restored through the UI. Retained aggregates preserve historical totals. Jobs interrupted by a process restart are marked failed when the download manager next starts.

Back up the database and stable key outside the web root. For a simple consistent file backup, stop the application, copy the entire data directory (including any SQLite WAL/SHM files), protect the backup, then restart. Restore with the application stopped, preserve OS ownership/ACLs and key, and restart. Do not copy only a live SQLite main file while WAL writes are in progress. Schedule backups and cleanup with your existing hosting operations; no scheduled tasks were installed.

## Verification commands

```powershell
npm run test:admin
npm run build
npm run test:admin:live
npm run typecheck
npm run test:downloader
npm run test:stories
npm run test:i18n
npm run test:blog
npm run test:seo
```

The live admin test starts a loopback-only production preview on port 3107 and an SMTP sink on 3108 using a temporary database, temporary credentials and no fake download traffic. No email leaves the machine. It cleans its own test files when complete. `-- --keep` retains that isolated preview for browser QA until interrupted; fixture credentials and captured test mail go only to ignored `.runtime/admin-preview.json` and `.runtime/admin-preview-mail.txt`. Graceful shutdown removes them; a forced Windows process termination can require removing these two fixture files manually. These fixture paths are part of the test script; the production application has no code-return or mail-capture bypass. Public live regression scripts accept `TEST_BASE_URL`. Run `test:seo` against a running preview.
