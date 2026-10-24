"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.DownloadManagerService = void 0;
exports.buildZipArchive = buildZipArchive;
var fs = _interopRequireWildcard(require("fs"));
var os = _interopRequireWildcard(require("os"));
var path = _interopRequireWildcard(require("path"));
var crypto = _interopRequireWildcard(require("crypto"));
var _media = require("../types/media.types");
var _urlValidator = require("../security/url-validator");
function _getRequireWildcardCache(nodeInterop) { if (typeof WeakMap !== "function") return null; var cacheBabelInterop = new WeakMap(); var cacheNodeInterop = new WeakMap(); return (_getRequireWildcardCache = function (nodeInterop) { return nodeInterop ? cacheNodeInterop : cacheBabelInterop; })(nodeInterop); }
function _interopRequireWildcard(obj, nodeInterop) { if (!nodeInterop && obj && obj.__esModule) { return obj; } if (obj === null || typeof obj !== "object" && typeof obj !== "function") { return { default: obj }; } var cache = _getRequireWildcardCache(nodeInterop); if (cache && cache.has(obj)) { return cache.get(obj); } var newObj = {}; var hasPropertyDescriptor = Object.defineProperty && Object.getOwnPropertyDescriptor; for (var key in obj) { if (key !== "default" && Object.prototype.hasOwnProperty.call(obj, key)) { var desc = hasPropertyDescriptor ? Object.getOwnPropertyDescriptor(obj, key) : null; if (desc && (desc.get || desc.set)) { Object.defineProperty(newObj, key, desc); } else { newObj[key] = obj[key]; } } } newObj.default = obj; if (cache) { cache.set(obj, newObj); } return newObj; }
/**
 * Pure Node.js IEEE 802.3 CRC-32 calculation for creating standard ZIP archives
 * without spawning any shell or requiring external native addons.
 */
const CRC32_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let i = 0; i < 256; i++) {
    let c = i;
    for (let k = 0; k < 8; k++) {
      c = c & 1 ? 0xedb88320 ^ c >>> 1 : c >>> 1;
    }
    table[i] = c >>> 0;
  }
  return table;
})();
function computeCrc32(buf) {
  let crc = 0xffffffff;
  for (let i = 0; i < buf.length; i++) {
    crc = CRC32_TABLE[(crc ^ buf[i]) & 0xff] ^ crc >>> 8;
  }
  return (crc ^ 0xffffffff) >>> 0;
}

/**
 * Builds a standards-compliant uncompressed (STORE) ZIP archive from a list of files.
 * Preserves exact carousel item order (`01_...`, `02_...`).
 */
async function buildZipArchive(entries, destZipPath) {
  const localParts = [];
  const centralParts = [];
  let offset = 0;
  for (const entry of entries) {
    const data = await fs.promises.readFile(entry.filePath);
    const nameBuf = Buffer.from((0, _urlValidator.sanitizeFilename)(entry.archiveName, path.extname(entry.archiveName).slice(1) || 'bin'), 'utf8');
    const crc = computeCrc32(data);
    const size = data.length;

    // Local file header (30 bytes + filename)
    const localHeader = Buffer.alloc(30);
    localHeader.writeUInt32LE(0x04034b50, 0); // Signature
    localHeader.writeUInt16LE(20, 4); // Version needed (2.0)
    localHeader.writeUInt16LE(0, 6); // Flags
    localHeader.writeUInt16LE(0, 8); // Compression: STORE (0)
    localHeader.writeUInt16LE(0, 10); // Mod time
    localHeader.writeUInt16LE(0, 12); // Mod date
    localHeader.writeUInt32LE(crc, 14); // CRC-32
    localHeader.writeUInt32LE(size, 18); // Compressed size
    localHeader.writeUInt32LE(size, 22); // Uncompressed size
    localHeader.writeUInt16LE(nameBuf.length, 26); // Filename length
    localHeader.writeUInt16LE(0, 28); // Extra field length

    localParts.push(localHeader, nameBuf, data);

    // Central directory header (46 bytes + filename)
    const centralHeader = Buffer.alloc(46);
    centralHeader.writeUInt32LE(0x02014b50, 0); // Signature
    centralHeader.writeUInt16LE(20, 4); // Version made by
    centralHeader.writeUInt16LE(20, 6); // Version needed
    centralHeader.writeUInt16LE(0, 8); // Flags
    centralHeader.writeUInt16LE(0, 10); // Compression: STORE
    centralHeader.writeUInt16LE(0, 12); // Mod time
    centralHeader.writeUInt16LE(0, 14); // Mod date
    centralHeader.writeUInt32LE(crc, 16); // CRC-32
    centralHeader.writeUInt32LE(size, 20); // Compressed size
    centralHeader.writeUInt32LE(size, 24); // Uncompressed size
    centralHeader.writeUInt16LE(nameBuf.length, 28); // Filename length
    centralHeader.writeUInt16LE(0, 30); // Extra length
    centralHeader.writeUInt16LE(0, 32); // Comment length
    centralHeader.writeUInt16LE(0, 34); // Disk number
    centralHeader.writeUInt16LE(0, 36); // Internal attrs
    centralHeader.writeUInt32LE(0, 38); // External attrs
    centralHeader.writeUInt32LE(offset, 42); // Offset of local header

    centralParts.push(centralHeader, nameBuf);
    offset += localHeader.length + nameBuf.length + size;
  }
  const centralDirBuffer = Buffer.concat(centralParts);
  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0); // End of central directory signature
  eocd.writeUInt16LE(0, 4); // Disk number
  eocd.writeUInt16LE(0, 6); // Start disk
  eocd.writeUInt16LE(entries.length, 8); // Entries on disk
  eocd.writeUInt16LE(entries.length, 10); // Total entries
  eocd.writeUInt32LE(centralDirBuffer.length, 12); // Size of central directory
  eocd.writeUInt32LE(offset, 16); // Central dir offset
  eocd.writeUInt16LE(0, 20); // Comment length

  const finalZip = Buffer.concat([...localParts, centralDirBuffer, eocd]);
  await fs.promises.writeFile(destZipPath, finalZip, {
    mode: 0o600
  });
  return finalZip.length;
}
class DownloadManagerService {
  jobs = new Map();
  queue = [];
  activeCount = 0;
  constructor(ytDlpService, config) {
    this.ytDlpService = ytDlpService;
    this.tempDir = config?.tempDir || process.env.DOWNLOAD_TEMP_DIR || path.join(os.tmpdir(), 'saveframe-downloads');
    this.maxConcurrent = config?.maxConcurrentDownloads || parseInt(process.env.MAX_CONCURRENT_DOWNLOADS || '3', 10);
    this.retentionMs = config?.retentionMs || parseInt(process.env.FILE_RETENTION_MS || String(15 * 60 * 1000), 10); // 15 min default
    this.minFreeDiskBytes = config?.minFreeDiskBytes || parseInt(process.env.MIN_FREE_DISK_BYTES || String(100 * 1024 * 1024), 10); // 100 MB min free
    this.maxFileSizeBytes = config?.maxFileSizeBytes || parseInt(process.env.MAX_FILE_SIZE_BYTES || String(150 * 1024 * 1024), 10);
    fs.mkdirSync(this.tempDir, {
      recursive: true,
      mode: 0o700
    });

    // Start periodic cleanup sweep every 60 seconds
    this.cleanupTimer = setInterval(() => {
      this.cleanupExpiredJobs().catch(() => {});
    }, 60 * 1000);
    if (this.cleanupTimer.unref) {
      this.cleanupTimer.unref();
    }
  }

  /**
   * Checks available free disk space in the temporary storage directory.
   */
  async getStorageHealth() {
    let freeBytes = 1024 * 1024 * 1024; // Fallback 1 GB if statfs not supported
    try {
      if (typeof fs.promises.statfs === 'function') {
        const stats = await fs.promises.statfs(this.tempDir);
        freeBytes = Number(stats.bavail) * Number(stats.bsize);
      }
    } catch {
      // Ignore if statfs unavailable
    }
    const ok = freeBytes >= this.minFreeDiskBytes;
    return {
      ok,
      tempDir: this.tempDir,
      freeBytes,
      freeFormatted: `${(freeBytes / (1024 * 1024)).toFixed(0)} MB`,
      activeJobs: this.activeCount
    };
  }

  /**
   * Enqueues a new download job after validating URL and available disk space.
   */
  async createJob(input) {
    const validated = (0, _urlValidator.validateInstagramUrl)(input.url);
    if (validated.category === 'profile' && input.formatId === 'bulk-profile') {
      throw new _media.DownloaderAppError('UNSUPPORTED_OPERATION', 'Bulk downloading of entire Instagram profiles is not permitted.', 400);
    }
    const storage = await this.getStorageHealth();
    if (!storage.ok) {
      throw new _media.DownloaderAppError('INSUFFICIENT_DISK_SPACE', 'Server temporary storage is currently full. Please try again in a few minutes.', 507, true);
    }
    const jobId = `job_${crypto.randomBytes(8).toString('hex')}`;
    const now = Date.now();
    const job = {
      jobId,
      url: validated.canonicalUrl,
      shortcode: validated.shortcode,
      category: validated.category,
      formatId: input.formatId || 'best',
      itemIndex: input.itemIndex ?? 0,
      isCarouselZip: Boolean(input.zipCarousel),
      status: 'queued',
      progress: 0,
      downloadedBytes: 0,
      createdAt: now,
      updatedAt: now,
      expiresAt: now + this.retentionMs
    };
    this.jobs.set(jobId, job);
    this.queue.push(jobId);
    this.processQueue();
    return job;
  }
  getJob(jobId) {
    const job = this.jobs.get(jobId);
    if (!job) {
      throw new _media.DownloaderAppError('JOB_NOT_FOUND', `Download job "${jobId}" was not found or has expired.`, 404);
    }
    return job;
  }
  cancelJob(jobId) {
    const job = this.getJob(jobId);
    if (job.status === 'completed' || job.status === 'failed' || job.status === 'cancelled') {
      return job;
    }

    // Remove from pending queue if not yet started
    const qIdx = this.queue.indexOf(jobId);
    if (qIdx !== -1) {
      this.queue.splice(qIdx, 1);
    }

    // Kill active subprocess if running
    this.ytDlpService.cancelDownload(jobId);
    job.status = 'cancelled';
    job.updatedAt = Date.now();
    job.error = {
      code: 'JOB_CANCELLED',
      message: 'Download was cancelled by the user.',
      retryable: true
    };
    if (job.outputFilePath) {
      fs.promises.unlink(job.outputFilePath).catch(() => {});
      job.outputFilePath = undefined;
    }
    return job;
  }
  processQueue() {
    while (this.activeCount < this.maxConcurrent && this.queue.length > 0) {
      const nextJobId = this.queue.shift();
      if (!nextJobId) break;
      const job = this.jobs.get(nextJobId);
      if (!job || job.status !== 'queued') continue;
      this.activeCount += 1;
      this.executeJob(job).catch(() => {}).finally(() => {
        this.activeCount = Math.max(0, this.activeCount - 1);
        this.processQueue();
      });
    }
  }
  async executeJob(job) {
    job.status = 'processing';
    job.progress = 5;
    job.updatedAt = Date.now();
    try {
      if (job.isCarouselZip) {
        const metadata = await this.ytDlpService.extractMetadata(job.url);
        if (!metadata.items.length) {
          throw new _media.DownloaderAppError('EXTRACTOR_FAILURE', 'No carousel items found to package.', 404);
        }
        const downloadedEntries = [];
        const totalItems = metadata.items.length;
        for (let i = 0; i < totalItems; i++) {
          if (job.status === 'cancelled') {
            throw new _media.DownloaderAppError('JOB_CANCELLED', 'Cancelled', 499);
          }
          const item = metadata.items[i];
          const artifact = await this.ytDlpService.downloadMedia(job.url, {
            jobId: `${job.jobId}_part${i + 1}`,
            itemIndex: i,
            formatId: item.formats[0]?.formatId || 'best',
            outputDir: this.tempDir,
            filenamePrefix: `${String(i + 1).padStart(2, '0')}_${metadata.shortcode}`,
            onProgress: p => {
              const basePct = i / totalItems * 85;
              const itemPct = p.percent / 100 * (85 / totalItems);
              job.progress = Math.min(90, Math.round(basePct + itemPct));
              job.updatedAt = Date.now();
            }
          });
          downloadedEntries.push({
            archiveName: artifact.safeFilename,
            filePath: artifact.filePath
          });
        }
        job.status = 'packaging_zip';
        job.progress = 94;
        job.updatedAt = Date.now();
        const zipFilename = (0, _urlValidator.sanitizeFilename)(`saveframe_carousel_${metadata.shortcode}_${totalItems}items`, 'zip');
        const zipFilePath = path.join(this.tempDir, `${job.jobId}_${zipFilename}`);
        const zipBytes = await buildZipArchive(downloadedEntries, zipFilePath);

        // Clean up individual part files
        for (const entry of downloadedEntries) {
          await fs.promises.unlink(entry.filePath).catch(() => {});
        }
        if (zipBytes > this.maxFileSizeBytes) {
          await fs.promises.unlink(zipFilePath).catch(() => {});
          throw new _media.DownloaderAppError('FILE_TOO_LARGE', 'Carousel ZIP archive exceeds the maximum allowed file size.', 413);
        }
        job.outputFilePath = zipFilePath;
        job.safeFilename = zipFilename;
        job.mimeType = 'application/zip';
        job.filesizeBytes = zipBytes;
        job.downloadedBytes = zipBytes;
        job.totalBytes = zipBytes;
        job.progress = 100;
        job.status = 'completed';
        job.updatedAt = Date.now();
        job.expiresAt = Date.now() + this.retentionMs;
        return;
      }

      // Single item download
      const artifact = await this.ytDlpService.downloadMedia(job.url, {
        jobId: job.jobId,
        formatId: job.formatId,
        itemIndex: job.itemIndex,
        outputDir: this.tempDir,
        onProgress: p => {
          if (job.status === 'cancelled') return;
          job.status = p.stage;
          job.progress = Math.round(p.percent);
          if (p.etaSeconds !== undefined) job.etaSeconds = p.etaSeconds;
          job.updatedAt = Date.now();
        }
      });
      job.outputFilePath = artifact.filePath;
      job.safeFilename = artifact.safeFilename;
      job.mimeType = artifact.mimeType;
      job.filesizeBytes = artifact.filesizeBytes;
      job.downloadedBytes = artifact.filesizeBytes;
      job.totalBytes = artifact.filesizeBytes;
      job.progress = 100;
      job.status = 'completed';
      job.updatedAt = Date.now();
      job.expiresAt = Date.now() + this.retentionMs;
    } catch (err) {
      if (job.status === 'cancelled' || err?.code === 'JOB_CANCELLED') {
        job.status = 'cancelled';
        job.error = {
          code: 'JOB_CANCELLED',
          message: 'Download was cancelled.',
          retryable: true
        };
        return;
      }
      const appErr = err instanceof _media.DownloaderAppError ? err : new _media.DownloaderAppError('EXTRACTOR_FAILURE', err?.message || 'Download failed unexpectedly.', 500, true);
      job.status = 'failed';
      job.updatedAt = Date.now();
      job.error = {
        code: appErr.code,
        message: appErr.userMessage,
        retryable: appErr.retryable
      };
    }
  }

  /**
   * Deletes expired temporary files and job records.
   */
  async cleanupExpiredJobs() {
    const now = Date.now();
    let cleaned = 0;
    for (const [jobId, job] of this.jobs.entries()) {
      if (now > job.expiresAt) {
        if (job.outputFilePath) {
          await fs.promises.unlink(job.outputFilePath).catch(() => {});
        }
        this.jobs.delete(jobId);
        cleaned += 1;
      }
    }
    return cleaned;
  }

  /**
   * Immediately deletes a downloaded file if configured or after stream completion.
   */
  async removeJobFile(jobId) {
    const job = this.jobs.get(jobId);
    if (job?.outputFilePath) {
      await fs.promises.unlink(job.outputFilePath).catch(() => {});
      job.outputFilePath = undefined;
    }
  }
}
exports.DownloadManagerService = DownloadManagerService;