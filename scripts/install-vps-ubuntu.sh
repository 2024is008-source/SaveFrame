#!/usr/bin/env bash
set -euo pipefail

echo "[1/3] Installing Python 3, FFmpeg and Nginx prerequisites..."
sudo apt-get update
sudo apt-get install -y python3 python3-pip ffmpeg nginx curl ca-certificates

echo "[2/3] Installing the official yt-dlp binary..."
sudo curl --fail --location --proto '=https' --tlsv1.2 https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp -o /usr/local/bin/yt-dlp
sudo chmod a+rx /usr/local/bin/yt-dlp
/usr/local/bin/yt-dlp --version

echo "[3/3] Verifying FFmpeg..."
ffmpeg -version | head -n 1
echo "Install Node.js 24+ separately. The app creates its temporary directory as its service user."
echo "No Redis service, cleanup cron job, firewall, certificate or application service was configured."
