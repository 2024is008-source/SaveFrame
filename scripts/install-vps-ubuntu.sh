#!/usr/bin/env bash
set -euo pipefail

echo "[1/5] Updating Ubuntu packages and installing Python 3, FFmpeg, Redis, and Nginx..."
sudo apt-get update
sudo apt-get install -y python3 python3-pip ffmpeg redis-server nginx curl ca-certificates

echo "[2/5] Installing official yt-dlp binary to /usr/local/bin/yt-dlp..."
sudo curl -L https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp -o /usr/local/bin/yt-dlp
sudo chmod a+rx /usr/local/bin/yt-dlp
/usr/local/bin/yt-dlp --version

echo "[3/5] Creating restricted temporary download directory..."
sudo mkdir -p /tmp/saveframe-downloads
sudo chmod 700 /tmp/saveframe-downloads

echo "[4/5] Installing cron job for automatic temporary file cleanup..."
(crontab -l 2>/dev/null || true; echo "*/5 * * * * find /tmp/saveframe-downloads -type f -mmin +15 -delete") | crontab -

echo "[5/5] Verifying FFmpeg and Redis..."
ffmpeg -version | head -n 1
redis-cli ping
echo "Ubuntu VPS prerequisites installed successfully."
