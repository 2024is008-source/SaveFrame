# TikSaveMP4

TikTok video and photo downloader for **https://tiksavemp4.online**. Built from SaveFrame with its original page layout, downloader controls, carousel previews, FAQ and admin dashboard. The public interface uses a white theme, TikTok Sans, cyan highlights and pink download buttons.

## Downloads

- Public TikTok videos as MP4 using yt-dlp and FFmpeg.
- Photo posts: individual JPEG/WebP images or an ordered ZIP of the slideshow.
- Direct `/@creator/video/{id}` and `/@creator/photo/{id}` URLs, plus official `vm.tiktok.com`, `vt.tiktok.com` and `tiktok.com/t/` share links.
- Real previews, format selection, bounded downloads, rate limits, background jobs and temporary-file cleanup.

The public tools are `/`, `/video-downloader` and `/photo-downloader`. The blog at `/blog` includes 12 TikTok guides, with search, category filters, related articles and a homepage preview. The original Instagram-only tools and article URLs are no longer advertised or indexed. Retained Instagram extraction modules and historical reports are implementation history, not supported public features. Existing environment variable names beginning with `SAVEFRAME_` remain compatible with the admin and queue internals.

## Local development

Requires Node.js 24+ and Python 3.11+.

```powershell
npm ci
python -m venv .runtime
.\.runtime\Scripts\python.exe -m pip install -r requirements.txt imageio-ffmpeg
npm run dev
```

Open http://127.0.0.1:3000. Windows discovers yt-dlp and FFmpeg in `.runtime`. On Linux, install FFmpeg with your package manager. Custom locations can be supplied using `YTDLP_BINARY_PATH` and `FFMPEG_BINARY_PATH`.

`.env.production` supplies the production origin. For development with domain-specific SEO, set `NEXT_PUBLIC_SITE_URL=https://tiksavemp4.online` in `.env.local`. Google Analytics is disabled; the original site's measurement ID has been removed.

## VPS deployment: Nginx and PM2

The supplied PM2 configuration uses **127.0.0.1:3002**, one process and persistent data under `/var/lib/tiksave`. Choose another free port in both the PM2 and Nginx files if needed. Run the application under a dedicated deployment user.

From the uploaded project directory, with Node 24, Python, Nginx, Certbot and FFmpeg installed:

```bash
npm ci
python3 -m venv .runtime
.runtime/bin/python -m pip install -r requirements.txt
sudo install -d -o "$USER" /var/lib/tiksave/admin /var/lib/tiksave/downloads
npm test
npm run build
npm install -g pm2
pm2 start ecosystem.config.cjs --env production
pm2 save
pm2 startup
```

Run the startup command PM2 prints to register boot persistence. Configure any private admin email/SMTP credentials in the server environment or a protected `.env.local`; never commit them. No admin account is created automatically. The inherited admin setup command is `npm run admin:setup`.

Point the apex and `www` DNS records to the VPS, then enable the supplied HTTP proxy and obtain HTTPS:

```bash
sudo cp nginx/tiksavemp4-proxy.conf /etc/nginx/snippets/tiksavemp4-proxy.conf
sudo cp nginx/tiksavemp4.conf /etc/nginx/sites-available/tiksavemp4
sudo ln -s /etc/nginx/sites-available/tiksavemp4 /etc/nginx/sites-enabled/tiksavemp4
sudo nginx -t
sudo systemctl reload nginx
sudo certbot --nginx --redirect -d tiksavemp4.online -d www.tiksavemp4.online
curl http://127.0.0.1:3002/api/health
```

Use the new `tiksavemp4` configurations; the older `saveframe` Nginx files are retained examples. Keep **one PM2 worker** because the queue and job lookup share in-process state. Rebuild before restarting after updates. Active jobs do not survive a restart, so wait for the queue to finish before maintenance.

## Checks

```bash
npm test
npm run typecheck
npm run lint
npm run build
```

`npm test` uses explicit offline fixtures to verify URL validation, restricted hosts, private IP checks, photo metadata, share-link routing, cached MP4 preparation, image downloads and ZIP ordering.

For browser checks, install Playwright separately or point `TIKSAVE_PLAYWRIGHT_PATH` to an existing installation. Start a local production preview, then run:

```bash
TEST_BASE_URL=http://127.0.0.1:3002 node scripts/check-tiktok-browser.cjs
```

The browser test exercises responsive layouts, navigation, validation, slideshow/MP4 download controls, information pages and the production-domain sitemap. Its media responses are test fixtures. Screenshots are written to `reports/tiktok-browser/`.

## Source availability

TikTok can restrict server IPs, regions or unauthenticated access. Private, deleted and login-restricted posts are unsupported. Downloads use the files TikTok exposes; source quality and watermark removal are not guaranteed. During development, a live video test returned an upstream IP block, so successful live downloads must also be checked from the VPS after deployment. Update yt-dlp when TikTok changes its extraction behavior.

Media expires after 15 minutes by default. The public downloader accepts no passwords or cookies. Optional operational analytics and private administrator features remain available from the original project.

## Design resources

TikTok Sans is self-hosted from Google Fonts. The font is released by TikTok under the SIL Open Font License; the license is included at `src/app/fonts/tiktok-sans-OFL.txt`. References: [TikTok Sans](https://github.com/tiktok/TikTokSans) and [TikTok developer design guidance](https://developers.tiktok.com/docs/en/getting-started-design-guidelines). TikSaveMP4 retains its own name and an independently drawn mark.
