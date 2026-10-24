"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.YtDlpService = void 0;
var _child_process = require("child_process");
var fs = _interopRequireWildcard(require("fs"));
var os = _interopRequireWildcard(require("os"));
var path = _interopRequireWildcard(require("path"));
var _media = require("../types/media.types");
var _urlValidator = require("../security/url-validator");
var _instagramAdapters = require("./instagram-adapters.service");
function _getRequireWildcardCache(nodeInterop) { if (typeof WeakMap !== "function") return null; var cacheBabelInterop = new WeakMap(); var cacheNodeInterop = new WeakMap(); return (_getRequireWildcardCache = function (nodeInterop) { return nodeInterop ? cacheNodeInterop : cacheBabelInterop; })(nodeInterop); }
function _interopRequireWildcard(obj, nodeInterop) { if (!nodeInterop && obj && obj.__esModule) { return obj; } if (obj === null || typeof obj !== "object" && typeof obj !== "function") { return { default: obj }; } var cache = _getRequireWildcardCache(nodeInterop); if (cache && cache.has(obj)) { return cache.get(obj); } var newObj = {}; var hasPropertyDescriptor = Object.defineProperty && Object.getOwnPropertyDescriptor; for (var key in obj) { if (key !== "default" && Object.prototype.hasOwnProperty.call(obj, key)) { var desc = hasPropertyDescriptor ? Object.getOwnPropertyDescriptor(obj, key) : null; if (desc && (desc.get || desc.set)) { Object.defineProperty(newObj, key, desc); } else { newObj[key] = obj[key]; } } } newObj.default = obj; if (cache) { cache.set(obj, newObj); } return newObj; }
/**
 * Dedicated yt-dlp Service (`YtDlpService`).
 *
 * Security & Architecture Guarantees:
 * - Executes `yt-dlp` strictly via `child_process.spawn(binary, argsArray, { shell: false })`.
 * - Never concatenates user input into a shell string or passes user-controlled CLI flags.
 * - Uses `--` argument terminator before the validated canonical Instagram URL.
 * - Enforces process timeouts, stdout buffer caps, socket timeouts, and max file size limits.
 * - Normalizes `yt-dlp --dump-single-json --no-download` into `NormalizedMediaResult` while
 *   stripping cookies, headers, and internal extractor secrets.
 */
class YtDlpService {
  activeProcesses = new Map();
  cancelledJobIds = new Set();
  constructor(config, adapters) {
    const defaultYtDlp = process.platform === 'win32' ? 'yt-dlp.exe' : fs.existsSync('/usr/local/bin/yt-dlp') ? '/usr/local/bin/yt-dlp' : 'yt-dlp';
    const defaultFfmpeg = process.platform === 'win32' ? 'ffmpeg.exe' : fs.existsSync('/usr/bin/ffmpeg') ? '/usr/bin/ffmpeg' : 'ffmpeg';
    this.ytDlpPath = config?.ytDlpBinaryPath || process.env.YTDLP_BINARY_PATH || defaultYtDlp;
    this.ffmpegPath = config?.ffmpegBinaryPath || process.env.FFMPEG_BINARY_PATH || defaultFfmpeg;
    this.metadataTimeoutMs = config?.metadataTimeoutMs || parseInt(process.env.YTDLP_METADATA_TIMEOUT_MS || '20000', 10);
    this.downloadTimeoutMs = config?.downloadTimeoutMs || parseInt(process.env.YTDLP_DOWNLOAD_TIMEOUT_MS || '120000', 10);
    this.maxStdoutBytes = config?.maxStdoutBytes || 10 * 1024 * 1024; // 10 MB JSON limit
    this.maxFileSizeBytes = config?.maxFileSizeBytes || parseInt(process.env.MAX_FILE_SIZE_BYTES || String(150 * 1024 * 1024), 10); // 150 MB default
    this.socketTimeoutSeconds = config?.socketTimeoutSeconds || 15;
    this.adapters = adapters || new _instagramAdapters.InstagramAuthorizedAdapters();
  }

  /**
   * Safe subprocess wrapper using `child_process.spawn` with `shell: false`.
   * Supports cross-platform execution on Windows, macOS, and Linux.
   */
  runSubprocess(binary, args, timeoutMs, jobId, onStdoutLine) {
    return new Promise((resolve, reject) => {
      // Allow cross-platform .js test fixture harnesses to run via process.execPath with shell: false
      const isNodeScript = binary.endsWith('.js');
      const execBin = isNodeScript ? process.execPath : binary;
      const execArgs = isNodeScript ? [binary, ...args] : args;
      let child;
      try {
        child = (0, _child_process.spawn)(execBin, execArgs, {
          shell: false,
          windowsHide: true,
          stdio: ['ignore', 'pipe', 'pipe'],
          env: {
            PATH: process.env.PATH || '/usr/local/bin:/usr/bin:/bin',
            ...(process.env.SystemRoot ? {
              SystemRoot: process.env.SystemRoot
            } : {}),
            TEMP: process.env.TEMP || os.tmpdir(),
            TMP: process.env.TMP || os.tmpdir(),
            LC_ALL: 'C.UTF-8',
            LANG: 'C.UTF-8',
            PYTHONIOENCODING: 'utf-8',
            ...(process.env.YTDLP_MOCK_SCENARIO ? {
              YTDLP_MOCK_SCENARIO: process.env.YTDLP_MOCK_SCENARIO
            } : {}),
            ...(process.env.SAVEFRAME_FIXTURE_ORIGIN ? {
              SAVEFRAME_FIXTURE_ORIGIN: process.env.SAVEFRAME_FIXTURE_ORIGIN
            } : {})
          }
        });
      } catch (err) {
        reject(new _media.DownloaderAppError('YTDLP_NOT_INSTALLED', `Required media extraction binary (${path.basename(binary)}) could not be started.`, 503, false, err?.message));
        return;
      }
      if (jobId) {
        this.activeProcesses.set(jobId, child);
      }
      const stdoutChunks = [];
      const stderrChunks = [];
      let stdoutLen = 0;
      let stderrLen = 0;
      let timedOut = false;
      const timer = setTimeout(() => {
        timedOut = true;
        child.kill('SIGTERM');
        setTimeout(() => {
          try {
            child.kill('SIGKILL');
          } catch {}
        }, 1500);
      }, timeoutMs);
      child.stdout?.on('data', chunk => {
        stdoutLen += chunk.length;
        if (stdoutLen <= this.maxStdoutBytes) {
          stdoutChunks.push(chunk);
        }
        if (onStdoutLine) {
          const lines = chunk.toString('utf8').split(/\r?\n/);
          for (const line of lines) {
            if (line.trim()) onStdoutLine(line.trim());
          }
        }
      });
      child.stderr?.on('data', chunk => {
        stderrLen += chunk.length;
        if (stderrLen <= 256 * 1024) {
          stderrChunks.push(chunk);
        }
      });
      child.on('error', err => {
        clearTimeout(timer);
        if (jobId) {
          this.activeProcesses.delete(jobId);
          this.cancelledJobIds.delete(jobId);
        }
        if (err.code === 'ENOENT') {
          reject(new _media.DownloaderAppError('YTDLP_NOT_INSTALLED', `Media extraction engine (${path.basename(binary)}) is not installed on the server.`, 503, false, err.message));
          return;
        }
        reject(new _media.DownloaderAppError('EXTRACTOR_FAILURE', 'Failed to execute media extractor subprocess.', 500, false, err.message));
      });
      child.on('close', (code, signal) => {
        clearTimeout(timer);
        const wasCancelled = jobId ? this.cancelledJobIds.has(jobId) : false;
        if (jobId) {
          this.activeProcesses.delete(jobId);
          this.cancelledJobIds.delete(jobId);
        }
        const stdout = Buffer.concat(stdoutChunks).toString('utf8');
        const stderr = Buffer.concat(stderrChunks).toString('utf8');
        if (timedOut) {
          reject(new _media.DownloaderAppError('DOWNLOAD_TIMEOUT', 'Media extraction timed out. Instagram may be slow or the file is too large.', 504, true, stderr));
          return;
        }
        if (wasCancelled || signal === 'SIGTERM' || signal === 'SIGKILL') {
          reject(new _media.DownloaderAppError('JOB_CANCELLED', 'Download job was cancelled.', 499, false));
          return;
        }
        resolve({
          stdout,
          stderr,
          exitCode: code ?? 1
        });
      });
    });
  }

  /**
   * 1. extractMetadata(url)
   * Validates the Instagram URL, invokes `yt-dlp --dump-single-json --no-download`,
   * handles single-photo and profile fallback adapters, and normalizes the output.
   */
  async extractMetadata(rawUrl) {
    const validated = (0, _urlValidator.validateInstagramUrl)(rawUrl);
    await (0, _urlValidator.assertSafeHostResolution)('www.instagram.com');

    // Profile URLs are handled by our dedicated Profile Metadata Adapter
    // because yt-dlp's InstagramUserIE is marked _WORKING = False and bulk profile downloads are prohibited.
    if (validated.category === 'profile') {
      return this.adapters.extractPublicProfileMetadata(validated);
    }
    const args = ['--dump-single-json', '--no-download', '--no-config', '--no-warnings', '--socket-timeout', String(this.socketTimeoutSeconds), '--', validated.canonicalUrl];
    const {
      stdout,
      stderr,
      exitCode
    } = await this.runSubprocess(this.ytDlpPath, args, this.metadataTimeoutMs);
    if (exitCode !== 0) {
      // Check if yt-dlp reported "There is no video in this post" on a single photo post (/p/...)
      if (stderr.includes('There is no video in this post') && validated.category === 'photo') {
        return this.adapters.extractPublicPhotoPost(validated);
      }
      throw this.mapYtDlpStderrToAppError(stderr, validated.category);
    }
    let rawJson;
    try {
      rawJson = JSON.parse(stdout.trim());
    } catch (err) {
      throw new _media.DownloaderAppError('EXTRACTOR_FAILURE', 'Failed to parse media metadata returned by yt-dlp.', 502, true, err?.message);
    }
    return this.normalizeYtDlpOutput(rawJson, validated);
  }

  /**
   * 2. getAvailableFormats(url)
   * Returns the normalized list of available formats for the primary media item.
   */
  async getAvailableFormats(rawUrl) {
    const metadata = await this.extractMetadata(rawUrl);
    if (!metadata.items.length) return [];
    return metadata.items[0].formats;
  }

  /**
   * 3. downloadMedia(url, options)
   * Safely downloads a specific media item / format using yt-dlp (and FFmpeg when stream merging is needed)
   * or the authorized image adapter for photo items.
   */
  async downloadMedia(rawUrl, options) {
    const validated = (0, _urlValidator.validateInstagramUrl)(rawUrl);
    if (validated.category === 'profile' && options.formatId === 'bulk-profile') {
      throw new _media.DownloaderAppError('UNSUPPORTED_OPERATION', 'Bulk downloading of entire Instagram profiles is not permitted.', 400);
    }
    await fs.promises.mkdir(options.outputDir, {
      recursive: true,
      mode: 0o700
    });

    // Resolve metadata first so we know exact item type and format specs
    const metadata = await this.extractMetadata(validated.canonicalUrl);
    const itemIndex = options.itemIndex ?? 0;
    const item = metadata.items[itemIndex] || metadata.items[0];
    if (!item) {
      throw new _media.DownloaderAppError('EXTRACTOR_FAILURE', 'Requested media item was not found in the resolved post.', 404);
    }
    const selectedFormat = item.formats.find(f => f.formatId === options.formatId) || item.formats[0];
    if (!selectedFormat) {
      throw new _media.DownloaderAppError('UNSUPPORTED_MEDIA_TYPE', 'No downloadable format is available for this media item.', 422);
    }
    const prefix = options.filenamePrefix || `saveframe_${metadata.shortcode}`;
    const safeFilename = (0, _urlValidator.sanitizeFilename)(`${prefix}_${item.index + 1}_${selectedFormat.formatId}`, selectedFormat.ext);
    const finalFilePath = path.join(options.outputDir, `${options.jobId}_${safeFilename}`);

    // Case A: Photo item (either single photo, carousel image slide, or profile HD avatar)
    if (item.mediaType === 'photo' && selectedFormat.directUrl) {
      if (options.onProgress) {
        options.onProgress({
          percent: 25,
          downloadedBytes: 0,
          stage: 'processing'
        });
      }
      const {
        bytesWritten,
        mimeType
      } = await this.adapters.downloadImageToFile(selectedFormat.directUrl, finalFilePath);
      if (options.onProgress) {
        options.onProgress({
          percent: 100,
          downloadedBytes: bytesWritten,
          totalBytes: bytesWritten,
          stage: 'processing'
        });
      }
      return {
        filePath: finalFilePath,
        safeFilename,
        mimeType,
        filesizeBytes: bytesWritten
      };
    }

    // Case B: Video / Reel / Story Video via yt-dlp subprocess
    const maxFileSizeArg = `${Math.floor(this.maxFileSizeBytes / (1024 * 1024))}M`;
    const formatSelector = selectedFormat.formatId && selectedFormat.formatId !== 'best' ? selectedFormat.needsMerge ? `${selectedFormat.formatId}+bestaudio/best` : selectedFormat.formatId : 'best[ext=mp4]/bestvideo[ext=mp4]+bestaudio[ext=m4a]/best';
    const args = ['--no-config', '--no-warnings', '--newline', '--socket-timeout', String(this.socketTimeoutSeconds), '--max-filesize', maxFileSizeArg, '-f', formatSelector, '--merge-output-format', selectedFormat.ext === 'm4a' ? 'm4a' : 'mp4', '--ffmpeg-location', this.ffmpegPath, '-o', finalFilePath];
    if (metadata.isCarousel) {
      args.push('--playlist-items', String(item.index + 1));
    } else {
      args.push('--no-playlist');
    }
    args.push('--', validated.canonicalUrl);
    const {
      stderr,
      exitCode
    } = await this.runSubprocess(this.ytDlpPath, args, this.downloadTimeoutMs, options.jobId, line => {
      if (!options.onProgress) return;
      // Parse yt-dlp progress line: [download]  45.2% of 8.64MiB at 2.10MiB/s ETA 00:02
      const progMatch = line.match(/\[download\]\s+(\d+(?:\.\d+)?)%/);
      if (progMatch) {
        const pct = Math.min(99, Math.max(1, parseFloat(progMatch[1])));
        const etaMatch = line.match(/ETA\s+(\d+):(\d+)/);
        const etaSeconds = etaMatch ? parseInt(etaMatch[1], 10) * 60 + parseInt(etaMatch[2], 10) : undefined;
        options.onProgress({
          percent: pct,
          downloadedBytes: 0,
          etaSeconds,
          stage: 'processing'
        });
      } else if (line.includes('[Merger]') || line.includes('Merging formats')) {
        options.onProgress({
          percent: 95,
          downloadedBytes: 0,
          stage: 'merging'
        });
      }
    });
    if (exitCode !== 0) {
      throw this.mapYtDlpStderrToAppError(stderr, validated.category);
    }
    let stat;
    try {
      stat = await fs.promises.stat(finalFilePath);
    } catch {
      throw new _media.DownloaderAppError('EXTRACTOR_FAILURE', 'Download process finished but the output media file was not created.', 500);
    }
    if (stat.size > this.maxFileSizeBytes) {
      await fs.promises.unlink(finalFilePath).catch(() => {});
      throw new _media.DownloaderAppError('FILE_TOO_LARGE', 'Downloaded file exceeds the maximum allowed size limit.', 413);
    }
    return {
      filePath: finalFilePath,
      safeFilename,
      mimeType: selectedFormat.ext === 'm4a' ? 'audio/mp4' : 'video/mp4',
      filesizeBytes: stat.size
    };
  }

  /**
   * 4. cancelDownload(jobId)
   * Terminates an active yt-dlp / FFmpeg subprocess for a given jobId.
   */
  cancelDownload(jobId) {
    let found = false;
    for (const [key, proc] of this.activeProcesses.entries()) {
      if (key === jobId || key.startsWith(`${jobId}_`)) {
        found = true;
        this.cancelledJobIds.add(key);
        try {
          proc.kill('SIGTERM');
          setTimeout(() => {
            try {
              proc.kill('SIGKILL');
            } catch {}
          }, 1000);
        } catch {}
        this.activeProcesses.delete(key);
      }
    }
    return found;
  }

  /**
   * 5. checkHealth()
   * Verifies both `yt-dlp` and `ffmpeg` binaries and reports their versions.
   */
  async checkHealth() {
    let ytDlpHealth;
    try {
      const res = await this.runSubprocess(this.ytDlpPath, ['--version'], 5000);
      if (res.exitCode === 0 && res.stdout.trim()) {
        ytDlpHealth = {
          ok: true,
          version: res.stdout.trim().split(/\r?\n/)[0],
          binaryPath: this.ytDlpPath
        };
      } else {
        ytDlpHealth = {
          ok: false,
          binaryPath: this.ytDlpPath,
          message: res.stderr.trim() || 'yt-dlp returned non-zero exit code'
        };
      }
    } catch (err) {
      ytDlpHealth = {
        ok: false,
        binaryPath: this.ytDlpPath,
        message: err?.userMessage || err?.message || 'yt-dlp not available'
      };
    }
    let ffmpegHealth;
    try {
      const res = await this.runSubprocess(this.ffmpegPath, ['-version'], 5000);
      if (res.exitCode === 0 && res.stdout.trim()) {
        const firstLine = res.stdout.trim().split(/\r?\n/)[0];
        ffmpegHealth = {
          ok: true,
          version: firstLine,
          binaryPath: this.ffmpegPath
        };
      } else {
        ffmpegHealth = {
          ok: false,
          binaryPath: this.ffmpegPath,
          message: 'ffmpeg returned non-zero exit code'
        };
      }
    } catch (err) {
      ffmpegHealth = {
        ok: false,
        binaryPath: this.ffmpegPath,
        message: err?.message || 'ffmpeg not available'
      };
    }
    return {
      ytDlp: ytDlpHealth,
      ffmpeg: ffmpegHealth
    };
  }

  /**
   * Normalizes raw `yt-dlp` JSON into a sanitized `NormalizedMediaResult`.
   * Strips cookies, HTTP headers, and internal extractor tokens.
   */
  normalizeYtDlpOutput(raw, validated) {
    const isPlaylist = raw._type === 'playlist' && Array.isArray(raw.entries) && raw.entries.length > 0;
    const rawEntries = isPlaylist ? raw.entries : [raw];
    const uploaderUsername = raw.channel || raw.uploader_id || rawEntries[0]?.channel || rawEntries[0]?.uploader || 'instagram_user';
    const uploaderFullName = raw.uploader || rawEntries[0]?.uploader || uploaderUsername;
    const items = rawEntries.map((entry, idx) => {
      const itemShortcode = entry.id || `${validated.shortcode}_${idx + 1}`;
      const rawFormats = Array.isArray(entry.formats) ? entry.formats : [];
      const rawThumbnails = Array.isArray(entry.thumbnails) ? entry.thumbnails : entry.thumbnail ? [{
        url: entry.thumbnail,
        width: entry.width || 1080,
        height: entry.height || 1350
      }] : [];

      // Determine if this entry is a video or an image slide inside a carousel
      if (rawFormats.length > 0) {
        const normalizedFormats = this.normalizeVideoFormats(rawFormats);
        const bestFmt = normalizedFormats[0];
        const w = bestFmt?.width || entry.width || 1080;
        const h = bestFmt?.height || entry.height || 1920;
        const thumbUrl = rawThumbnails[rawThumbnails.length - 1]?.url || entry.thumbnail || '';
        return {
          index: idx,
          itemId: itemShortcode,
          shortcode: itemShortcode,
          mediaType: 'video',
          title: entry.title || `Video ${idx + 1} by @${uploaderUsername}`,
          thumbnailUrl: thumbUrl,
          width: w,
          height: h,
          aspectRatio: this.computeAspectRatio(w, h),
          durationSeconds: typeof entry.duration === 'number' ? entry.duration : undefined,
          formats: normalizedFormats
        };
      }

      // Image entry inside a carousel (or image candidate returned by yt-dlp)
      const sortedThumbs = [...rawThumbnails].filter(t => t && typeof t.url === 'string').sort((a, b) => (b.width || 1080) * (b.height || 1080) - (a.width || 1080) * (a.height || 1080));
      const imageFormats = sortedThumbs.map((t, tIdx) => {
        const w = t.width || 1080;
        const h = t.height || 1350;
        return {
          formatId: tIdx === 0 ? 'photo-original' : `photo-${w}w`,
          label: tIdx === 0 ? `Original (${w}×${h})` : `${w}×${h} JPEG`,
          ext: 'jpg',
          Container: 'JPEG sRGB',
          width: w,
          height: h,
          resolution: `${w}x${h}`,
          hasVideo: false,
          hasAudio: false,
          needsMerge: false,
          filesizeFormatted: tIdx === 0 ? '~1.2 MB' : '~520 KB',
          directUrl: t.url
        };
      });
      const primaryThumb = sortedThumbs[0] || {
        url: '',
        width: 1080,
        height: 1350
      };
      return {
        index: idx,
        itemId: itemShortcode,
        shortcode: itemShortcode,
        mediaType: 'photo',
        title: entry.title || `Photo ${idx + 1} by @${uploaderUsername}`,
        thumbnailUrl: primaryThumb.url,
        width: primaryThumb.width || 1080,
        height: primaryThumb.height || 1350,
        aspectRatio: this.computeAspectRatio(primaryThumb.width || 1080, primaryThumb.height || 1350),
        formats: imageFormats
      };
    });
    let resolvedCategory = validated.category;
    if (items.length > 1) {
      resolvedCategory = 'carousel';
    } else if (resolvedCategory === 'photo' && items[0]?.mediaType === 'video') {
      resolvedCategory = 'video';
    }
    return {
      id: raw.id || validated.shortcode,
      shortcode: validated.shortcode,
      canonicalUrl: validated.canonicalUrl,
      category: resolvedCategory,
      title: raw.title || `${resolvedCategory.charAt(0).toUpperCase() + resolvedCategory.slice(1)} by @${uploaderUsername}`,
      caption: raw.description || undefined,
      uploader: {
        username: String(uploaderUsername).replace(/^@/, ''),
        fullName: String(uploaderFullName)
      },
      timestamp: typeof raw.timestamp === 'number' ? raw.timestamp : undefined,
      durationSeconds: typeof raw.duration === 'number' ? raw.duration : items[0]?.durationSeconds,
      itemCount: items.length,
      isCarousel: items.length > 1,
      supportsZipDownload: items.length > 1,
      items,
      extractorSource: 'yt-dlp'
    };
  }
  normalizeVideoFormats(rawFormats) {
    const videoFormats = [];
    const audioFormats = [];
    for (const f of rawFormats) {
      if (!f || !f.url) continue;
      const vcodec = f.vcodec && f.vcodec !== 'none' ? String(f.vcodec) : undefined;
      const acodec = f.acodec && f.acodec !== 'none' ? String(f.acodec) : undefined;
      const hasVideo = Boolean(vcodec || f.width || f.height);
      const hasAudio = Boolean(acodec || f.has_audio !== false);
      const width = typeof f.width === 'number' ? f.width : undefined;
      const height = typeof f.height === 'number' ? f.height : undefined;
      const filesizeBytes = typeof f.filesize === 'number' ? f.filesize : typeof f.filesize_approx === 'number' ? f.filesize_approx : undefined;
      if (hasVideo) {
        const needsMerge = !hasAudio;
        const heightLabel = height ? `${height}p` : 'HD';
        videoFormats.push({
          formatId: String(f.format_id || 'best'),
          label: `${height && height >= 1080 ? 'Full HD' : 'HD'} (${width || 1080}×${height || 1920})`,
          ext: 'mp4',
          Container: needsMerge ? 'MP4 (FFmpeg Mux)' : 'MP4 (H.264 + AAC)',
          width,
          height,
          resolution: width && height ? `${width}x${height}` : heightLabel,
          fps: typeof f.fps === 'number' ? f.fps : undefined,
          vcodec,
          acodec,
          hasVideo: true,
          hasAudio: true,
          // Guaranteed after download/FFmpeg merge
          needsMerge,
          filesizeBytes,
          filesizeFormatted: this.formatBytes(filesizeBytes) || '~6.8 MB'
        });
      } else if (hasAudio && !hasVideo) {
        audioFormats.push({
          formatId: String(f.format_id || 'bestaudio'),
          label: 'Audio Track Only (M4A)',
          ext: 'm4a',
          Container: 'M4A Audio',
          resolution: 'Audio Only',
          acodec: acodec || 'aac',
          hasVideo: false,
          hasAudio: true,
          needsMerge: false,
          filesizeBytes,
          filesizeFormatted: this.formatBytes(filesizeBytes) || '~720 KB'
        });
      }
    }

    // Sort video formats highest resolution first, preferring pre-muxed streams at equal resolution
    videoFormats.sort((a, b) => {
      const areaA = (a.width || 0) * (a.height || 0);
      const areaB = (b.width || 0) * (b.height || 0);
      if (areaB !== areaA) return areaB - areaA;
      return (a.needsMerge ? 1 : 0) - (b.needsMerge ? 1 : 0);
    });

    // Deduplicate by resolution + merge status
    const seen = new Set();
    const deduped = [];
    for (const vf of videoFormats) {
      const key = `${vf.resolution}:${vf.needsMerge}`;
      if (!seen.has(key)) {
        seen.add(key);
        deduped.push(vf);
      }
    }
    if (audioFormats.length > 0) {
      deduped.push(audioFormats[0]);
    }
    return deduped;
  }
  computeAspectRatio(w, h) {
    const gcd = (a, b) => b === 0 ? a : gcd(b, a % b);
    const d = gcd(w, h) || 1;
    const rw = Math.round(w / d);
    const rh = Math.round(h / d);
    if (rw > 20 || rh > 20) {
      if (Math.abs(w / h - 9 / 16) < 0.05) return '9:16';
      if (Math.abs(w / h - 4 / 5) < 0.05) return '4:5';
      if (Math.abs(w / h - 1) < 0.05) return '1:1';
    }
    return `${rw}:${rh}`;
  }
  formatBytes(bytes) {
    if (!bytes || bytes <= 0) return '';
    if (bytes >= 1024 * 1024) {
      return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
    }
    return `${Math.round(bytes / 1024)} KB`;
  }

  /**
   * Maps raw yt-dlp stderr messages into clear, user-friendly `DownloaderAppError` instances.
   * Never suggests bypassing platform login or privacy restrictions.
   */
  mapYtDlpStderrToAppError(stderr, category) {
    const lower = (stderr || '').toLowerCase();
    if (lower.includes('rate-limit') || lower.includes('rate limit') || lower.includes('http error 429') || lower.includes('too many requests')) {
      return new _media.DownloaderAppError('RATE_LIMITED', 'Instagram rate limit reached for unauthenticated requests. Please wait a few minutes and try again.', 429, true, stderr);
    }
    if (category === 'story') {
      if (lower.includes('unreachable') || lower.includes('expired') || lower.includes('not found') || lower.includes('404')) {
        return new _media.DownloaderAppError('EXPIRED_STORY', 'This Instagram Story is unavailable or has expired past its 24-hour visibility window.', 404, false, stderr);
      }
      if (lower.includes('log in') || lower.includes('login') || lower.includes('authentication')) {
        return new _media.DownloaderAppError('LOGIN_REQUIRED', 'Instagram restricts Story access to authenticated sessions. SaveFrame does not bypass login restrictions.', 403, false, stderr);
      }
    }
    if (lower.includes('only available for registered users') || lower.includes('private') || lower.includes('restricted video') || lower.includes('granting access')) {
      return new _media.DownloaderAppError('PRIVATE_CONTENT', 'This content belongs to a private or restricted Instagram account and cannot be accessed.', 403, false, stderr);
    }
    if (lower.includes('login page') || lower.includes('need to log in') || lower.includes('cookies')) {
      return new _media.DownloaderAppError('LOGIN_REQUIRED', 'Instagram requires login to view this post. Only publicly accessible media without login walls can be processed.', 403, false, stderr);
    }
    if (lower.includes('404') || lower.includes('not found') || lower.includes('empty media response') || lower.includes('deleted')) {
      return new _media.DownloaderAppError('DELETED_CONTENT', 'This Instagram post could not be found. It may have been deleted or the shortcode is invalid.', 404, false, stderr);
    }
    if (lower.includes('ffmpeg') || lower.includes('postprocessing')) {
      return new _media.DownloaderAppError('FFMPEG_ERROR', 'FFmpeg encountered an error while merging video and audio streams.', 500, true, stderr);
    }
    if (lower.includes('file is larger than max-filesize')) {
      return new _media.DownloaderAppError('FILE_TOO_LARGE', 'The requested media exceeds the server maximum file size limit.', 413, false, stderr);
    }
    return new _media.DownloaderAppError('EXTRACTOR_FAILURE', 'Unable to extract media from this Instagram link. Verify that the link points to a public post.', 502, true, stderr);
  }
}
exports.YtDlpService = YtDlpService;