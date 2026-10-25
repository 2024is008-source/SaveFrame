import { spawn, ChildProcess } from 'child_process';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import {
  DownloaderAppError,
  InstagramMediaCategory,
  NormalizedFormat,
  NormalizedMediaItem,
  NormalizedMediaResult,
} from '../types/media.types';
import {
  validateInstagramUrl,
  validateMediaInput,
  assertSafeHostResolution,
  sanitizeFilename,
} from '../security/url-validator';
import { InstagramAuthorizedAdapters } from './instagram-adapters.service';

export interface YtDlpServiceConfig {
  ytDlpBinaryPath?: string;
  ffmpegBinaryPath?: string;
  metadataTimeoutMs?: number;
  downloadTimeoutMs?: number;
  maxStdoutBytes?: number;
  maxFileSizeBytes?: number;
  socketTimeoutSeconds?: number;
}

export interface DownloadMediaOptions {
  jobId: string;
  formatId?: string;
  itemIndex?: number;
  outputDir: string;
  filenamePrefix?: string;
  onProgress?: (progress: {
    percent: number;
    downloadedBytes: number;
    totalBytes?: number;
    etaSeconds?: number;
    stage: 'processing' | 'merging';
  }) => void;
}

export interface DownloadMediaArtifact {
  filePath: string;
  safeFilename: string;
  mimeType: string;
  filesizeBytes: number;
}

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
export class YtDlpService {
  private readonly ytDlpPath: string;
  private readonly ffmpegPath: string;
  private readonly metadataTimeoutMs: number;
  private readonly downloadTimeoutMs: number;
  private readonly maxStdoutBytes: number;
  private readonly maxFileSizeBytes: number;
  private readonly socketTimeoutSeconds: number;
  private readonly activeProcesses = new Map<string, ChildProcess>();
  private readonly cancelledJobIds = new Set<string>();
  private readonly adapters: InstagramAuthorizedAdapters;
  private readonly metadataCache = new Map<string, { data: NormalizedMediaResult; raw: any; expiresAt: number }>();

  constructor(config?: YtDlpServiceConfig, adapters?: InstagramAuthorizedAdapters) {
    const localYtDlp = path.join(process.cwd(), '.runtime', process.platform === 'win32' ? 'Scripts/yt-dlp.exe' : 'bin/yt-dlp');
    const localFfmpegDirectory = path.join(process.cwd(), '.runtime', 'Lib', 'site-packages', 'imageio_ffmpeg', 'binaries');
    const localFfmpeg = fs.existsSync(localFfmpegDirectory)
      ? fs.readdirSync(localFfmpegDirectory).find(name => /^ffmpeg.*\.exe$/i.test(name))
      : undefined;
    const defaultYtDlp =
      fs.existsSync(localYtDlp) ? localYtDlp : process.platform === 'win32'
        ? 'yt-dlp.exe'
        : fs.existsSync('/usr/local/bin/yt-dlp')
        ? '/usr/local/bin/yt-dlp'
        : 'yt-dlp';
    const defaultFfmpeg =
      localFfmpeg ? path.join(localFfmpegDirectory, localFfmpeg) : process.platform === 'win32'
        ? 'ffmpeg.exe'
        : fs.existsSync('/usr/bin/ffmpeg')
        ? '/usr/bin/ffmpeg'
        : 'ffmpeg';

    this.ytDlpPath =
      config?.ytDlpBinaryPath ||
      process.env.YTDLP_BINARY_PATH ||
      defaultYtDlp;
    this.ffmpegPath =
      config?.ffmpegBinaryPath ||
      process.env.FFMPEG_BINARY_PATH ||
      defaultFfmpeg;
    this.metadataTimeoutMs =
      config?.metadataTimeoutMs ||
      parseInt(process.env.YTDLP_METADATA_TIMEOUT_MS || '45000', 10);
    this.downloadTimeoutMs =
      config?.downloadTimeoutMs ||
      parseInt(process.env.YTDLP_DOWNLOAD_TIMEOUT_MS || '120000', 10);
    this.maxStdoutBytes = config?.maxStdoutBytes || 10 * 1024 * 1024; // 10 MB JSON limit
    this.maxFileSizeBytes =
      config?.maxFileSizeBytes ||
      parseInt(process.env.MAX_FILE_SIZE_BYTES || String(150 * 1024 * 1024), 10); // 150 MB default
    this.socketTimeoutSeconds = config?.socketTimeoutSeconds || 15;
    this.adapters = adapters || new InstagramAuthorizedAdapters();
  }

  /**
   * Safe subprocess wrapper using `child_process.spawn` with `shell: false`.
   * Supports cross-platform execution on Windows, macOS, and Linux.
   */
  private runSubprocess(
    binary: string,
    args: string[],
    timeoutMs: number,
    jobId?: string,
    onStdoutLine?: (line: string) => void
  ): Promise<{ stdout: string; stderr: string; exitCode: number }> {
    return new Promise((resolve, reject) => {
      // Allow cross-platform .js test fixture harnesses to run via process.execPath with shell: false
      const isNodeScript = binary.endsWith('.js');
      const execBin = isNodeScript ? process.execPath : binary;
      const execArgs = isNodeScript ? [binary, ...args] : args;

      let child: ChildProcess;
      try {
        child = spawn(execBin, execArgs, {
          shell: false,
          windowsHide: true,
          stdio: ['ignore', 'pipe', 'pipe'],
          env: {
            NODE_ENV: process.env.NODE_ENV || 'production',
            PATH: process.env.PATH || '/usr/local/bin:/usr/bin:/bin',
            ...(process.env.SystemRoot ? { SystemRoot: process.env.SystemRoot } : {}),
            TEMP: process.env.TEMP || os.tmpdir(),
            TMP: process.env.TMP || os.tmpdir(),
            LC_ALL: 'C.UTF-8',
            LANG: 'C.UTF-8',
            PYTHONIOENCODING: 'utf-8',
            ...(process.env.YTDLP_MOCK_SCENARIO
              ? { YTDLP_MOCK_SCENARIO: process.env.YTDLP_MOCK_SCENARIO }
              : {}),
            ...(process.env.SAVEFRAME_FIXTURE_ORIGIN
              ? { SAVEFRAME_FIXTURE_ORIGIN: process.env.SAVEFRAME_FIXTURE_ORIGIN }
              : {}),
          },
        });
      } catch (err: any) {
        reject(
          new DownloaderAppError(
            'YTDLP_NOT_INSTALLED',
            `Required media extraction binary (${path.basename(binary)}) could not be started.`,
            503,
            false,
            err?.message
          )
        );
        return;
      }

      if (jobId) {
        this.activeProcesses.set(jobId, child);
      }

      const stdoutChunks: Buffer[] = [];
      const stderrChunks: Buffer[] = [];
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

      child.stdout?.on('data', (chunk: Buffer) => {
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

      child.stderr?.on('data', (chunk: Buffer) => {
        stderrLen += chunk.length;
        if (stderrLen <= 256 * 1024) {
          stderrChunks.push(chunk);
        }
      });

      child.on('error', (err: NodeJS.ErrnoException) => {
        clearTimeout(timer);
        if (jobId) {
          this.activeProcesses.delete(jobId);
          this.cancelledJobIds.delete(jobId);
        }
        if (err.code === 'ENOENT') {
          reject(
            new DownloaderAppError(
              'YTDLP_NOT_INSTALLED',
              `Media extraction engine (${path.basename(
                binary
              )}) is not installed on the server.`,
              503,
              false,
              err.message
            )
          );
          return;
        }
        reject(
          new DownloaderAppError(
            'EXTRACTOR_FAILURE',
            'Failed to execute media extractor subprocess.',
            500,
            false,
            err.message
          )
        );
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
          reject(
            new DownloaderAppError(
              'DOWNLOAD_TIMEOUT',
              'Media extraction timed out. Instagram may be slow or the file is too large.',
              504,
              true,
              stderr
            )
          );
          return;
        }

        if (wasCancelled || signal === 'SIGTERM' || signal === 'SIGKILL') {
          reject(
            new DownloaderAppError(
              'JOB_CANCELLED',
              'Download job was cancelled.',
              499,
              false
            )
          );
          return;
        }

        resolve({
          stdout,
          stderr,
          exitCode: code ?? 1,
        });
      });
    });
  }

  /**
   * 1. extractMetadata(url)
   * Validates the Instagram URL, invokes `yt-dlp --dump-single-json --no-download`,
   * handles single-photo and profile fallback adapters, and normalizes the output.
   */
  public async extractMetadata(rawUrl: string, tool?: string): Promise<NormalizedMediaResult> {
    const validated = validateMediaInput(rawUrl, tool);
    const cached = this.metadataCache.get(validated.canonicalUrl);
    if (cached && cached.expiresAt > Date.now()) return cached.data;
    this.metadataCache.delete(validated.canonicalUrl);
    await assertSafeHostResolution('www.instagram.com');

    // Profile URLs are handled by our dedicated Profile Metadata Adapter
    // because yt-dlp's InstagramUserIE is marked _WORKING = False and bulk profile downloads are prohibited.
    if (validated.category === 'profile') {
      return this.adapters.extractPublicProfileMetadata(validated);
    }

    const args = [
      '--dump-single-json',
      '--no-download',
      '--no-config',
      '--no-warnings',
      // Instagram photo carousels expose thumbnails without video formats.
      // Keep those entries so they can be normalized as downloadable images.
      ...(validated.category === 'photo' ? ['--ignore-no-formats-error'] : []),
      ...(validated.category === 'story' ? ['--no-playlist'] : []),
      '--socket-timeout',
      String(this.socketTimeoutSeconds),
      '--',
      validated.canonicalUrl,
    ];

    const { stdout, stderr, exitCode } = await this.runSubprocess(
      this.ytDlpPath,
      args,
      this.metadataTimeoutMs
    );

    if (exitCode !== 0) {
      // Check if yt-dlp reported "There is no video in this post" on a single photo post (/p/...)
      if (
        stderr.includes('There is no video in this post') &&
        validated.category === 'photo'
      ) {
        return this.adapters.extractPublicPhotoPost(validated);
      }
      throw this.mapYtDlpStderrToAppError(stderr, validated.category);
    }

    let rawJson: any;
    try {
      rawJson = JSON.parse(stdout.trim());
    } catch (err: any) {
      throw new DownloaderAppError(
        'EXTRACTOR_FAILURE',
        'Failed to parse media metadata returned by yt-dlp.',
        502,
        true,
        err?.message
      );
    }

    const data = this.normalizeYtDlpOutput(rawJson, validated);
    if (this.metadataCache.size >= 32) this.metadataCache.delete(this.metadataCache.keys().next().value!);
    this.metadataCache.set(validated.canonicalUrl, { data, raw: rawJson, expiresAt: Date.now() + 120000 });
    return data;
  }

  /**
   * 2. getAvailableFormats(url)
   * Returns the normalized list of available formats for the primary media item.
   */
  public async getAvailableFormats(rawUrl: string): Promise<NormalizedFormat[]> {
    const metadata = await this.extractMetadata(rawUrl);
    if (!metadata.items.length) return [];
    return metadata.items[0].formats;
  }

  /**
   * 3. downloadMedia(url, options)
   * Safely downloads a specific media item / format using yt-dlp (and FFmpeg when stream merging is needed)
   * or the authorized image adapter for photo items.
   */
  public async downloadMedia(
    rawUrl: string,
    options: DownloadMediaOptions
  ): Promise<DownloadMediaArtifact> {
    const validated = validateInstagramUrl(rawUrl);
    if (validated.category === 'profile' && options.formatId === 'bulk-profile') {
      throw new DownloaderAppError(
        'UNSUPPORTED_OPERATION',
        'Bulk downloading of entire Instagram profiles is not permitted.',
        400
      );
    }

    await fs.promises.mkdir(options.outputDir, { recursive: true, mode: 0o700 });

    // Resolve metadata first so we know exact item type and format specs
    const metadata = await this.extractMetadata(validated.canonicalUrl);
    const itemIndex = options.itemIndex ?? 0;
    const item = metadata.items[itemIndex] || metadata.items[0];
    if (!item) {
      throw new DownloaderAppError(
        'EXTRACTOR_FAILURE',
        'Requested media item was not found in the resolved post.',
        404
      );
    }

    const selectedFormat =
      item.formats.find((f) => f.formatId === options.formatId) || item.formats[0];

    if (!selectedFormat) {
      throw new DownloaderAppError(
        'UNSUPPORTED_MEDIA_TYPE',
        'No downloadable format is available for this media item.',
        422
      );
    }

    const audioOnly = selectedFormat.hasAudio && !selectedFormat.hasVideo;
    const prefix = options.filenamePrefix || `${metadata.uploader.username}_${metadata.shortcode}`;
    const itemSuffix = metadata.items.length > 1 ? `_${item.index + 1}` : '';
    const safeFilename = sanitizeFilename(
      `${prefix}${itemSuffix}_${audioOnly ? 'audio' : item.mediaType}`,
      selectedFormat.ext
    );
    const finalFilePath = path.join(options.outputDir, `${options.jobId}_${safeFilename}`);

    // Case A: Photo item (either single photo, carousel image slide, or profile HD avatar)
    if (item.mediaType === 'photo' && selectedFormat.directUrl) {
      if (options.onProgress) {
        options.onProgress({
          percent: 25,
          downloadedBytes: 0,
          stage: 'processing',
        });
      }
      const { bytesWritten, mimeType } = await this.adapters.downloadImageToFile(
        selectedFormat.directUrl,
        finalFilePath
      );
      if (options.onProgress) {
        options.onProgress({
          percent: 100,
          downloadedBytes: bytesWritten,
          totalBytes: bytesWritten,
          stage: 'processing',
        });
      }
      return {
        filePath: finalFilePath,
        safeFilename,
        mimeType,
        filesizeBytes: bytesWritten,
      };
    }

    // Case B: Video / Reel / Story Video via yt-dlp subprocess
    const sourceFormatId = selectedFormat.sourceFormatId || selectedFormat.formatId;
    const maxFileSizeArg = `${Math.floor(this.maxFileSizeBytes / (1024 * 1024))}M`;
    const formatSelector =
      sourceFormatId && sourceFormatId !== 'best'
        ? selectedFormat.needsMerge
          ? `${sourceFormatId}+bestaudio/best`
          : sourceFormatId
        : 'best[ext=mp4]/bestvideo[ext=mp4]+bestaudio[ext=m4a]/best';

    const args: string[] = [
      '--no-config',
      '--no-warnings',
      '--newline',
      '--socket-timeout',
      String(this.socketTimeoutSeconds),
      '--max-filesize',
      maxFileSizeArg,
      '-f',
      formatSelector,
      ...(audioOnly ? ['--extract-audio', '--audio-format', 'm4a'] : ['--merge-output-format', 'mp4']),
      '--ffmpeg-location',
      this.ffmpegPath,
      '-o',
      audioOnly ? finalFilePath.replace(/\.m4a$/, '.%(ext)s') : finalFilePath,
    ];

    if (metadata.isCarousel) {
      args.push('--playlist-items', String(item.index + 1));
    } else {
      args.push('--no-playlist');
    }

    // Reuse the server-only extraction result, including its stream URLs, so a
    // click does not make Instagram resolve the same post a second time.
    const cachedMetadata = this.metadataCache.get(validated.canonicalUrl);
    const infoPath = cachedMetadata && cachedMetadata.expiresAt > Date.now()
      ? path.join(options.outputDir, `${options.jobId}.info.json`)
      : undefined;
    if (infoPath) {
      await fs.promises.writeFile(infoPath, JSON.stringify(cachedMetadata!.raw), { mode: 0o600 });
      args.push('--load-info-json', infoPath);
    } else {
      args.push('--', validated.canonicalUrl);
    }

    let processResult: { stdout: string; stderr: string; exitCode: number };
    try {
      processResult = await this.runSubprocess(
      this.ytDlpPath,
      args,
      this.downloadTimeoutMs,
      options.jobId,
      (line) => {
        if (!options.onProgress) return;
        // Parse yt-dlp progress line: [download]  45.2% of 8.64MiB at 2.10MiB/s ETA 00:02
        const progMatch = line.match(/\[download\]\s+(\d+(?:\.\d+)?)%/);
        if (progMatch) {
          const pct = Math.min(99, Math.max(1, parseFloat(progMatch[1])));
          const etaMatch = line.match(/ETA\s+(\d+):(\d+)/);
          const etaSeconds = etaMatch
            ? parseInt(etaMatch[1], 10) * 60 + parseInt(etaMatch[2], 10)
            : undefined;
          options.onProgress({
            percent: pct,
            downloadedBytes: 0,
            etaSeconds,
            stage: 'processing',
          });
        } else if (line.includes('[Merger]') || line.includes('Merging formats') || line.includes('[ExtractAudio]')) {
          options.onProgress({
            percent: 95,
            downloadedBytes: 0,
            stage: 'merging',
          });
        }
      }
      );
    } finally {
      if (infoPath) await fs.promises.unlink(infoPath).catch(() => {});
    }
    const { stderr, exitCode } = processResult;

    if (exitCode !== 0) {
      throw this.mapYtDlpStderrToAppError(stderr, validated.category);
    }

    let stat: fs.Stats;
    try {
      stat = await fs.promises.stat(finalFilePath);
    } catch {
      throw new DownloaderAppError(
        'EXTRACTOR_FAILURE',
        'Download process finished but the output media file was not created.',
        500
      );
    }

    if (stat.size > this.maxFileSizeBytes) {
      await fs.promises.unlink(finalFilePath).catch(() => {});
      throw new DownloaderAppError(
        'FILE_TOO_LARGE',
        'Downloaded file exceeds the maximum allowed size limit.',
        413
      );
    }

    return {
      filePath: finalFilePath,
      safeFilename,
      mimeType: selectedFormat.ext === 'm4a' ? 'audio/mp4' : 'video/mp4',
      filesizeBytes: stat.size,
    };
  }

  /**
   * 4. cancelDownload(jobId)
   * Terminates an active yt-dlp / FFmpeg subprocess for a given jobId.
   */
  public cancelDownload(jobId: string): boolean {
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
  public async checkHealth(): Promise<{
    ytDlp: { ok: boolean; version?: string; binaryPath: string; message?: string };
    ffmpeg: { ok: boolean; version?: string; binaryPath: string; message?: string };
  }> {
    let ytDlpHealth: {
      ok: boolean;
      version?: string;
      binaryPath: string;
      message?: string;
    };
    try {
      const res = await this.runSubprocess(this.ytDlpPath, ['--version'], 5000);
      if (res.exitCode === 0 && res.stdout.trim()) {
        ytDlpHealth = {
          ok: true,
          version: res.stdout.trim().split(/\r?\n/)[0],
          binaryPath: this.ytDlpPath,
        };
      } else {
        ytDlpHealth = {
          ok: false,
          binaryPath: this.ytDlpPath,
          message: res.stderr.trim() || 'yt-dlp returned non-zero exit code',
        };
      }
    } catch (err: any) {
      ytDlpHealth = {
        ok: false,
        binaryPath: this.ytDlpPath,
        message: err?.userMessage || err?.message || 'yt-dlp not available',
      };
    }

    let ffmpegHealth: {
      ok: boolean;
      version?: string;
      binaryPath: string;
      message?: string;
    };
    try {
      const res = await this.runSubprocess(this.ffmpegPath, ['-version'], 5000);
      if (res.exitCode === 0 && res.stdout.trim()) {
        const firstLine = res.stdout.trim().split(/\r?\n/)[0];
        ffmpegHealth = {
          ok: true,
          version: firstLine,
          binaryPath: this.ffmpegPath,
        };
      } else {
        ffmpegHealth = {
          ok: false,
          binaryPath: this.ffmpegPath,
          message: 'ffmpeg returned non-zero exit code',
        };
      }
    } catch (err: any) {
      ffmpegHealth = {
        ok: false,
        binaryPath: this.ffmpegPath,
        message: err?.message || 'ffmpeg not available',
      };
    }

    return { ytDlp: ytDlpHealth, ffmpeg: ffmpegHealth };
  }

  /**
   * Normalizes raw `yt-dlp` JSON into a sanitized `NormalizedMediaResult`.
   * Strips cookies, HTTP headers, and internal extractor tokens.
   */
  public normalizeYtDlpOutput(
    raw: any,
    validated: { canonicalUrl: string; category: InstagramMediaCategory; shortcode: string }
  ): NormalizedMediaResult {
    if (validated.category === 'story' && raw?._type === 'playlist' && Array.isArray(raw.entries) && !raw.entries.length) {
      throw new DownloaderAppError('NO_ACTIVE_STORIES', 'No downloadable active stories were returned by Instagram.', 404);
    }
    const isPlaylist =
      raw._type === 'playlist' && Array.isArray(raw.entries) && raw.entries.length > 0;
    const rawEntries: any[] = isPlaylist ? raw.entries : [raw];

    const uploaderUsername =
      raw.channel ||
      raw.uploader_id ||
      rawEntries[0]?.channel ||
      rawEntries[0]?.uploader ||
      'instagram_user';
    const uploaderFullName =
      raw.uploader || rawEntries[0]?.uploader || uploaderUsername;

    const items: NormalizedMediaItem[] = rawEntries.map((entry, idx) => {
      const itemShortcode = entry.id || `${validated.shortcode}_${idx + 1}`;
      const rawFormats: any[] = Array.isArray(entry.formats) ? entry.formats : [];
      const rawThumbnails: any[] = Array.isArray(entry.thumbnails)
        ? entry.thumbnails
        : entry.thumbnail
        ? [{ url: entry.thumbnail, width: entry.width || 1080, height: entry.height || 1350 }]
        : [];

      // Determine if this entry is a video or an image slide inside a carousel
      if (rawFormats.length > 0) {
        const normalizedFormats = this.normalizeVideoFormats(rawFormats);
        const bestFmt = normalizedFormats[0];
        const w = bestFmt?.width || entry.width || 1080;
        const h = bestFmt?.height || entry.height || 1920;
        const thumbUrl =
          rawThumbnails[rawThumbnails.length - 1]?.url ||
          entry.thumbnail ||
          '';

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
          durationSeconds:
            typeof entry.duration === 'number' ? entry.duration : undefined,
          formats: normalizedFormats,
        };
      }

      // Image entry inside a carousel (or image candidate returned by yt-dlp)
      const sortedThumbs = [...rawThumbnails]
        .map((thumbnail, sourceOrder) => ({ ...thumbnail, sourceOrder }))
        .filter((t) => t && typeof t.url === 'string')
        .sort(
          (a, b) =>
            (b.width || 0) * (b.height || 0) -
            (a.width || 0) * (a.height || 0) || b.sourceOrder - a.sourceOrder
        );

      const imageFormats: NormalizedFormat[] = sortedThumbs.map((t, tIdx) => {
        const w = t.width || undefined;
        const h = t.height || undefined;
        return {
          formatId: tIdx === 0 ? 'photo-original' : `photo-${tIdx}`,
          label: tIdx === 0 ? (w && h ? `Original (${w}×${h})` : 'Original image') : (w && h ? `${w}×${h} JPEG` : `Image variant ${tIdx + 1}`),
          ext: 'jpg',
          Container: 'JPEG sRGB',
          width: w,
          height: h,
          resolution: w && h ? `${w}x${h}` : 'Source resolution',
          hasVideo: false,
          hasAudio: false,
          needsMerge: false,
          filesizeFormatted: 'Size unavailable',
          directUrl: t.url,
        };
      });

      const primaryThumb = sortedThumbs[0] || {
        url: '',
        width: 1080,
        height: 1350,
      };

      return {
        index: idx,
        itemId: itemShortcode,
        shortcode: itemShortcode,
        mediaType: 'photo',
        title: entry.title || `Photo ${idx + 1} by @${uploaderUsername}`,
        thumbnailUrl: primaryThumb.url,
        width: primaryThumb.width || undefined,
        height: primaryThumb.height || undefined,
        aspectRatio: primaryThumb.width && primaryThumb.height
          ? this.computeAspectRatio(primaryThumb.width, primaryThumb.height)
          : 'Source image',
        formats: imageFormats,
      };
    });

    if (validated.category === 'story' && (items.length !== 1 || items[0].mediaType !== 'video')) {
      throw new DownloaderAppError('UNSUPPORTED_OPERATION', 'Use a direct link to one story video. Bulk story downloads are not supported.', 400);
    }
    let resolvedCategory: InstagramMediaCategory = validated.category;
    if (items.length > 1 && validated.category !== 'story') {
      resolvedCategory = 'carousel';
    } else if (
      resolvedCategory === 'photo' &&
      items[0]?.mediaType === 'video'
    ) {
      resolvedCategory = 'video';
    }

    return {
      id: raw.id || validated.shortcode,
      shortcode: validated.shortcode,
      canonicalUrl: validated.canonicalUrl,
      category: resolvedCategory,
      title:
        raw.title ||
        `${resolvedCategory.charAt(0).toUpperCase() + resolvedCategory.slice(1)} by @${uploaderUsername}`,
      caption: raw.description || undefined,
      uploader: {
        username: String(uploaderUsername).replace(/^@/, ''),
        fullName: String(uploaderFullName),
      },
      timestamp: typeof raw.timestamp === 'number' ? raw.timestamp : undefined,
      durationSeconds:
        typeof raw.duration === 'number'
          ? raw.duration
          : items[0]?.durationSeconds,
      itemCount: items.length,
      isCarousel: items.length > 1,
      supportsZipDownload: items.length > 1,
      items,
      extractorSource: 'yt-dlp',
    };
  }

  private normalizeVideoFormats(rawFormats: any[]): NormalizedFormat[] {
    const videoFormats: NormalizedFormat[] = [];
    const audioFormats: NormalizedFormat[] = [];

    for (const f of rawFormats) {
      if (!f || !f.url) continue;
      const vcodec = f.vcodec && f.vcodec !== 'none' ? String(f.vcodec) : undefined;
      const acodec = f.acodec && f.acodec !== 'none' ? String(f.acodec) : undefined;
      const hasVideo = Boolean(vcodec || f.width || f.height);
      const hasAudio = Boolean(acodec || (f.acodec == null && f.has_audio !== false));
      const width = typeof f.width === 'number' ? f.width : undefined;
      const height = typeof f.height === 'number' ? f.height : undefined;
      const filesizeBytes =
        typeof f.filesize === 'number'
          ? f.filesize
          : typeof f.filesize_approx === 'number'
          ? f.filesize_approx
          : undefined;

      if (hasVideo) {
        const needsMerge = !hasAudio;
        const heightLabel = height ? `${height}p` : 'HD';
        videoFormats.push({
          formatId: String(f.format_id || 'best'),
          label: `${
            width && height && Math.min(width, height) >= 1080 ? 'Full HD' : 'HD'
          } (${width && height ? `${width}×${height}` : 'source resolution'})`,
          ext: 'mp4',
          Container: needsMerge ? 'MP4 (FFmpeg Mux)' : 'MP4 (H.264 + AAC)',
          width,
          height,
          resolution: width && height ? `${width}x${height}` : heightLabel,
          fps: typeof f.fps === 'number' ? f.fps : undefined,
          vcodec,
          acodec,
          hasVideo: true,
          hasAudio: true, // Guaranteed after download/FFmpeg merge
          needsMerge,
          filesizeBytes,
          filesizeFormatted: this.formatBytes(filesizeBytes) || 'Size unavailable',
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
          filesizeFormatted: this.formatBytes(filesizeBytes) || 'Size unavailable',
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
    const seen = new Set<string>();
    const deduped: NormalizedFormat[] = [];
    for (const vf of videoFormats) {
      const key = `${vf.resolution}:${vf.needsMerge}`;
      if (!seen.has(key)) {
        seen.add(key);
        deduped.push(vf);
      }
    }

    if (audioFormats.length > 0) {
      deduped.push(audioFormats[0]);
    } else {
      // A combined stream can still provide audio when Instagram has no separate track.
      const combined = deduped.find(format => !format.needsMerge);
      if (combined) deduped.push({
        formatId: 'audio-extract', sourceFormatId: combined.formatId,
        label: 'Audio Track Only (M4A)', ext: 'm4a', Container: 'M4A Audio',
        resolution: 'Audio Only', hasVideo: false, hasAudio: true, needsMerge: false,
        filesizeFormatted: 'Size unavailable',
      });
    }

    return deduped;
  }

  private computeAspectRatio(w: number, h: number): string {
    const gcd = (a: number, b: number): number => (b === 0 ? a : gcd(b, a % b));
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

  private formatBytes(bytes?: number): string {
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
  public mapYtDlpStderrToAppError(
    stderr: string,
    category: InstagramMediaCategory
  ): DownloaderAppError {
    const lower = (stderr || '').toLowerCase();

    if (
      lower.includes('rate-limit') ||
      lower.includes('rate limit') ||
      lower.includes('http error 429') ||
      lower.includes('too many requests')
    ) {
      return new DownloaderAppError(
        'RATE_LIMITED',
        'Instagram rate limit reached for unauthenticated requests. Please wait a few minutes and try again.',
        429,
        true,
        stderr
      );
    }

    if (category === 'story') {
      // Upstream often reports "unreachable" together with "login required".
      // Authentication failure is not evidence that a story has expired.
      if (/log[ -]?in|log in|authentication|cookies/.test(lower)) {
        return new DownloaderAppError('LOGIN_REQUIRED', 'Instagram requires login to access this story. Only publicly accessible story videos can be retrieved.', 403, false, stderr);
      }
      if (
        lower.includes('expired') ||
        lower.includes('not found') ||
        lower.includes('404')
      ) {
        return new DownloaderAppError(
          'EXPIRED_STORY',
          'This Instagram Story is unavailable or has expired past its 24-hour visibility window.',
          404,
          false,
          stderr
        );
      }
    }

    if (
      lower.includes('only available for registered users') ||
      lower.includes('private') ||
      lower.includes('restricted video') ||
      lower.includes('granting access')
    ) {
      return new DownloaderAppError(
        'PRIVATE_CONTENT',
        'This content belongs to a private or restricted Instagram account and cannot be accessed.',
        403,
        false,
        stderr
      );
    }

    if (
      lower.includes('login page') ||
      lower.includes('need to log in') ||
      lower.includes('cookies')
    ) {
      return new DownloaderAppError(
        'LOGIN_REQUIRED',
        'Instagram requires login to view this post. Only publicly accessible media without login walls can be processed.',
        403,
        false,
        stderr
      );
    }

    if (
      lower.includes('404') ||
      lower.includes('not found') ||
      lower.includes('empty media response') ||
      lower.includes('deleted')
    ) {
      return new DownloaderAppError(
        'DELETED_CONTENT',
        'This Instagram post could not be found. It may have been deleted or the shortcode is invalid.',
        404,
        false,
        stderr
      );
    }

    if (lower.includes('ffmpeg') || lower.includes('postprocessing')) {
      return new DownloaderAppError(
        'FFMPEG_ERROR',
        'FFmpeg encountered an error while merging video and audio streams.',
        500,
        true,
        stderr
      );
    }

    if (lower.includes('file is larger than max-filesize')) {
      return new DownloaderAppError(
        'FILE_TOO_LARGE',
        'The requested media exceeds the server maximum file size limit.',
        413,
        false,
        stderr
      );
    }

    return new DownloaderAppError(
      'EXTRACTOR_FAILURE',
      'Unable to extract media from this Instagram link. Verify that the link points to a public post.',
      502,
      true,
      stderr
    );
  }
}
