import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import * as crypto from 'crypto';
import {
  DownloadJob,
  DownloaderAppError,
} from '../types/media.types';
import { validateMediaInput, sanitizeFilename } from '../security/url-validator';
import { YtDlpService } from './yt-dlp.service';
import { beginDownload, attachJob, jobEvent, recoverInterruptedJobs } from '../admin/analytics';
import {isMp3Format} from './audio';
import {mediaFailure, mediaStage, withMediaTiming} from './media-timing';

export interface DownloadManagerConfig {
  tempDir?: string;
  maxConcurrentDownloads?: number;
  retentionMs?: number;
  minFreeDiskBytes?: number;
  maxFileSizeBytes?: number;
  maxQueuedJobs?: number;
}

export interface CreateDownloadJobInput {
  url: string;
  formatId?: string;
  itemIndex?: number;
  itemIndices?: number[];
  zipCarousel?: boolean;
  analyticsId?: string;
  trackAnalytics?: boolean;
}

/**
 * Pure Node.js IEEE 802.3 CRC-32 calculation for creating standard ZIP archives
 * without spawning any shell or requiring external native addons.
 */
const CRC32_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let i = 0; i < 256; i++) {
    let c = i;
    for (let k = 0; k < 8; k++) {
      c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    }
    table[i] = c >>> 0;
  }
  return table;
})();

async function computeCrc32(filename: string): Promise<number> {
  let crc = 0xffffffff;
  for await(const buf of fs.createReadStream(filename,{highWaterMark:65536})) {
    for (let i = 0; i < buf.length; i++) crc = CRC32_TABLE[(crc ^ buf[i]) & 0xff] ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

/**
 * Builds a standards-compliant uncompressed (STORE) ZIP archive from a list of files.
 * Preserves exact carousel item order (`01_...`, `02_...`).
 */
export async function buildZipArchive(
  entries: Array<{ archiveName: string; filePath: string }>,
  destZipPath: string,
  maxBytes = 150 * 1024 * 1024
): Promise<number> {
  let estimate=22;
  for(const entry of entries){const size=(await fs.promises.stat(entry.filePath)).size;const name=sanitizeFilename(entry.archiveName,path.extname(entry.archiveName).slice(1)||'bin');estimate+=76+2*Buffer.byteLength(name)+size;}
  if(estimate>maxBytes)throw new DownloaderAppError('FILE_TOO_LARGE','Carousel ZIP archive exceeds the maximum allowed file size.',413);
  const output=await fs.promises.open(destZipPath,'wx',0o600);
  let written=0;
  const write=async(buffer:Buffer)=>{if(written+buffer.length>maxBytes)throw new DownloaderAppError('FILE_TOO_LARGE','Carousel ZIP archive exceeds the maximum allowed file size.',413);let cursor=0;while(cursor<buffer.length){const result=await output.write(buffer,cursor,buffer.length-cursor,null);if(!result.bytesWritten)throw Error('Unable to write archive');cursor+=result.bytesWritten;}written+=buffer.length;};
  try {
  const centralParts: Buffer[] = [];
  let offset = 0;

  for (const entry of entries) {
    const nameBuf = Buffer.from(sanitizeFilename(entry.archiveName, path.extname(entry.archiveName).slice(1) || 'bin'), 'utf8');
    const size = (await fs.promises.stat(entry.filePath)).size;
    const crc = await computeCrc32(entry.filePath);

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

    await write(localHeader);await write(nameBuf);
    let copied=0;
    for await(const chunk of fs.createReadStream(entry.filePath,{highWaterMark:65536})){await write(chunk);copied+=chunk.length;}
    if(copied!==size)throw Error('Archive source changed during packaging');

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

  await write(centralDirBuffer);await write(eocd);
  return written;
  } catch(error){await output.close();await fs.promises.unlink(destZipPath).catch(()=>{});throw error;}
  finally{await output.close().catch(()=>{});}
}

export class DownloadManagerService {
  private readonly tempDir: string;
  private readonly maxConcurrent: number;
  private readonly retentionMs: number;
  private readonly minFreeDiskBytes: number;
  private readonly maxFileSizeBytes: number;
  private readonly ytDlpService: YtDlpService;
  private readonly jobs = new Map<string, DownloadJob>();
  private readonly queue: string[] = [];
  private readonly activeDeliveries=new Map<string,number>();
  private activeCount = 0;
  private readonly maxQueuedJobs: number;
  private cleanupTimer?: NodeJS.Timeout;

  constructor(ytDlpService: YtDlpService, config?: DownloadManagerConfig) {
    this.ytDlpService = ytDlpService;
    this.tempDir =
      config?.tempDir ||
      process.env.DOWNLOAD_TEMP_DIR ||
      path.join(os.tmpdir(), 'saveframe-downloads');
    this.maxConcurrent =
      config?.maxConcurrentDownloads ||
      parseInt(process.env.MAX_CONCURRENT_DOWNLOADS || '3', 10);
    if(!Number.isInteger(this.maxConcurrent)||this.maxConcurrent<1||this.maxConcurrent>8) this.maxConcurrent=3;
    const configuredQueue=config?.maxQueuedJobs ?? Number(process.env.MAX_QUEUED_DOWNLOADS || 20);
    this.maxQueuedJobs=Number.isInteger(configuredQueue)&&configuredQueue>0&&configuredQueue<=100?configuredQueue:20;
    this.retentionMs =
      config?.retentionMs ||
      parseInt(process.env.FILE_RETENTION_MS || String(15 * 60 * 1000), 10); // 15 min default
    this.minFreeDiskBytes =
      config?.minFreeDiskBytes ||
      parseInt(process.env.MIN_FREE_DISK_BYTES || String(100 * 1024 * 1024), 10); // 100 MB min free
    this.maxFileSizeBytes =
      config?.maxFileSizeBytes ||
      parseInt(process.env.MAX_FILE_SIZE_BYTES || String(150 * 1024 * 1024), 10);
    if(!Number.isFinite(this.retentionMs)||this.retentionMs<=0)this.retentionMs=15*60*1000;
    if(!Number.isFinite(this.minFreeDiskBytes)||this.minFreeDiskBytes<0)this.minFreeDiskBytes=100*1024*1024;
    if(!Number.isFinite(this.maxFileSizeBytes)||this.maxFileSizeBytes<=0||this.maxFileSizeBytes>1024*1024*1024)this.maxFileSizeBytes=150*1024*1024;

    const overlaps=(left:string,right:string)=>{const relative=path.relative(left,right);return !relative||(!relative.startsWith('..'+path.sep)&&!path.isAbsolute(relative));};
    const publicDir=fs.realpathSync(path.join(process.cwd(),'public'));
    const adminDir=path.resolve(process.env.SAVEFRAME_ADMIN_DATA_DIR||path.join(process.cwd(),'.data'));
    const validateDirectory=(directory:string)=>{
      if(overlaps(directory,publicDir)||overlaps(publicDir,directory)||overlaps(directory,adminDir)||overlaps(adminDir,directory))throw new DownloaderAppError('INTERNAL_ERROR','Download storage must be private and separate from public assets and administrator data.',500);
    };
    validateDirectory(path.resolve(this.tempDir));
    fs.mkdirSync(this.tempDir, { recursive: true, mode: 0o700 });
    const storage=fs.lstatSync(this.tempDir);
    if(!storage.isDirectory()||storage.isSymbolicLink()||(process.platform!=='win32'&&(storage.mode&0o077)!==0))throw new DownloaderAppError('INTERNAL_ERROR','Download storage must be a private directory without symbolic links.',500);
    validateDirectory(fs.realpathSync(this.tempDir));
    recoverInterruptedJobs();

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
  public async getStorageHealth(): Promise<{
    ok: boolean;
    tempDir: string;
    freeBytes: number;
    freeFormatted: string;
    activeJobs: number;
  }> {
    let freeBytes = 1024 * 1024 * 1024; // Fallback 1 GB if statfs not supported
    try {
      if (typeof (fs.promises as any).statfs === 'function') {
        const stats = await (fs.promises as any).statfs(this.tempDir);
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
      activeJobs: this.activeCount,
    };
  }

  /**
   * Enqueues a new download job after validating URL and available disk space.
   */
  public async createJob(input: CreateDownloadJobInput): Promise<DownloadJob> {
    const validated = validateMediaInput(input.url);
    if(this.queue.length>=this.maxQueuedJobs || this.jobs.size>=1000) throw new DownloaderAppError('RATE_LIMITED','The download queue is full. Please try again shortly.',429,true);
    if(input.itemIndex!==undefined&&(!Number.isInteger(input.itemIndex)||input.itemIndex<0||input.itemIndex>99))throw new DownloaderAppError('UNSUPPORTED_OPERATION','Choose a valid media item.',400);
    if(input.formatId!==undefined&&(typeof input.formatId!=='string'||input.formatId.length>128))throw new DownloaderAppError('UNSUPPORTED_OPERATION','Choose a valid media format.',400);
    if (input.itemIndices !== undefined && (!input.zipCarousel || !Array.isArray(input.itemIndices) ||
      input.itemIndices.length === 0 || input.itemIndices.length > 100 ||
      input.itemIndices.some(index => !Number.isInteger(index) || index < 0))) {
      throw new DownloaderAppError('UNSUPPORTED_OPERATION', 'Choose valid carousel slides to download.', 400);
    }

    if (validated.category === 'profile' && input.formatId === 'bulk-profile') {
      throw new DownloaderAppError(
        'UNSUPPORTED_OPERATION',
        'Bulk downloading of entire Instagram profiles is not permitted.',
        400
      );
    }

    const storage = await this.getStorageHealth();
    if(this.queue.length>=this.maxQueuedJobs || this.jobs.size>=1000) throw new DownloaderAppError('RATE_LIMITED','The download queue is full. Please try again shortly.',429,true);
    if (!storage.ok) {
      throw new DownloaderAppError(
        'INSUFFICIENT_DISK_SPACE',
        'Server temporary storage is currently full. Please try again in a few minutes.',
        507,
        true
      );
    }

    const jobId = `job_${crypto.randomBytes(8).toString('hex')}`;
    const now = Date.now();

    const job: DownloadJob = {
      jobId,
      analyticsId: input.trackAnalytics===false?undefined:input.analyticsId || beginDownload(validated.category,'XX',Boolean(input.zipCarousel)),
      url: validated.canonicalUrl,
      shortcode: validated.shortcode,
      category: isMp3Format(input.formatId) ? 'audio' : validated.category,
      formatId: input.formatId || 'best',
      itemIndex: input.itemIndex ?? 0,
      itemIndices: input.itemIndices ? [...new Set(input.itemIndices)].sort((a, b) => a - b) : undefined,
      isCarouselZip: Boolean(input.zipCarousel),
      status: 'queued',
      progress: 0,
      downloadedBytes: 0,
      createdAt: now,
      updatedAt: now,
      expiresAt: now + this.retentionMs,
    };

    this.jobs.set(jobId, job);
    attachJob(job.analyticsId!, jobId, job.category, job.isCarouselZip);
    this.queue.push(jobId);
    this.processQueue();

    return job;
  }

  public getJob(jobId: string): DownloadJob {
    const job = this.jobs.get(jobId);
    if (!job) {
      throw new DownloaderAppError(
        'JOB_NOT_FOUND',
        `Download job "${jobId}" was not found or has expired.`,
        404
      );
    }
    return job;
  }

  public retainJobFile(jobId:string):()=>void {
    const job=this.getJob(jobId);this.activeDeliveries.set(jobId,(this.activeDeliveries.get(jobId)||0)+1);
    let released=false;
    return ()=>{if(released)return;released=true;const count=(this.activeDeliveries.get(jobId)||1)-1;if(count)this.activeDeliveries.set(jobId,count);else this.activeDeliveries.delete(jobId);job.expiresAt=Math.max(job.expiresAt,Date.now()+this.retentionMs);};
  }

  public cancelJob(jobId: string): DownloadJob {
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
    job.expiresAt=Date.now()+this.retentionMs;
    job.updatedAt = Date.now();
    job.error = {
      code: 'JOB_CANCELLED',
      message: 'Download was cancelled by the user.',
      retryable: true,
    };
    jobEvent(job.analyticsId,'download_failed',job.jobId,job.category,'JOB_CANCELLED');

    if (job.outputFilePath) {
      fs.promises.unlink(job.outputFilePath).catch(() => {});
      job.outputFilePath = undefined;
    }

    return job;
  }

  private processQueue(): void {
    while (this.activeCount < this.maxConcurrent && this.queue.length > 0) {
      const nextJobId = this.queue.shift();
      if (!nextJobId) break;
      const job = this.jobs.get(nextJobId);
      if (!job || job.status !== 'queued') continue;

      this.activeCount += 1;
      withMediaTiming(()=>mediaStage('download_preparation',()=>this.executeJob(job)), 'download')
        .catch(() => {})
        .finally(() => {
          this.activeCount = Math.max(0, this.activeCount - 1);
          this.processQueue();
        });
    }
  }

  private async executeJob(job: DownloadJob): Promise<void> {
    const partialFiles:string[]=[];
    const processingStarted = Date.now();
    job.status = 'processing';
    job.progress = 5;
    job.updatedAt = Date.now();
    jobEvent(job.analyticsId,'download_started',job.jobId,job.category);

    try {
      if (job.isCarouselZip) {
        const metadata = await this.ytDlpService.extractMetadata(job.url);
        job.category = metadata.category;
        attachJob(job.analyticsId!,job.jobId,job.category);
        if (!metadata.items.length) {
          throw new DownloaderAppError(
            'EXTRACTOR_FAILURE',
            'No carousel items found to package.',
            404
          );
        }

        const downloadedEntries: Array<{ archiveName: string; filePath: string }> = [];
        const indices = job.itemIndices || metadata.items.map((_, index) => index);
        if (indices.some(index => index >= metadata.items.length)) {
          throw new DownloaderAppError('UNSUPPORTED_OPERATION', 'A selected slide is no longer available. Inspect the post again.', 400);
        }
        const totalItems = indices.length;
        let downloadedPartBytes=0;

        for (let i = 0; i < totalItems; i++) {
          if ((job.status as string) === 'cancelled') {
            throw new DownloaderAppError('JOB_CANCELLED', 'Cancelled', 499);
          }

          const itemIndex = indices[i];
          const item = metadata.items[itemIndex];
          const artifact = await this.ytDlpService.downloadMedia(job.url, {
            jobId: `${job.jobId}_part${i + 1}`,
            itemIndex,
            formatId: item.formats[0]?.formatId || 'best',
            outputDir: this.tempDir,
            filenamePrefix: `${metadata.uploader?.username || 'instagram'}_${String(itemIndex + 1).padStart(2, '0')}_${metadata.shortcode}`,
            onProgress: (p) => {
              const basePct = (i / totalItems) * 85;
              const itemPct = (p.percent / 100) * (85 / totalItems);
              job.progress = Math.min(90, Math.round(basePct + itemPct));
              job.updatedAt = Date.now();
            },
          });

          downloadedEntries.push({
            archiveName: artifact.safeFilename,
            filePath: artifact.filePath,
          });
          partialFiles.push(artifact.filePath);
          if((job.status as string)==='cancelled')throw new DownloaderAppError('JOB_CANCELLED','Cancelled',499);
          downloadedPartBytes+=artifact.filesizeBytes ?? (await fs.promises.stat(artifact.filePath)).size;
          if(downloadedPartBytes>this.maxFileSizeBytes)throw new DownloaderAppError('FILE_TOO_LARGE','Carousel archive exceeds the allowed size.',413);
        }

        job.status = 'packaging_zip';
        job.progress = 94;
        job.updatedAt = Date.now();

        const zipFilename = sanitizeFilename(
          `${metadata.uploader?.username || 'instagram'}_${metadata.shortcode}_${totalItems}items`,
          'zip'
        );
        const zipFilePath = path.join(this.tempDir, `${job.jobId}_${zipFilename}`);
        const zipBytes = await buildZipArchive(downloadedEntries, zipFilePath, this.maxFileSizeBytes);
        if((job.status as string)==='cancelled'){await fs.promises.unlink(zipFilePath).catch(()=>{});throw new DownloaderAppError('JOB_CANCELLED','Cancelled',499);}

        // Clean up individual part files
        for (const entry of downloadedEntries) {
          await fs.promises.unlink(entry.filePath).catch(() => {});
        }
        partialFiles.length=0;

        if (zipBytes > this.maxFileSizeBytes) {
          await fs.promises.unlink(zipFilePath).catch(() => {});
          throw new DownloaderAppError(
            'FILE_TOO_LARGE',
            'Carousel ZIP archive exceeds the maximum allowed file size.',
            413
          );
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
        jobEvent(job.analyticsId,'media_prepared',job.jobId,job.category,undefined,Date.now()-processingStarted);
        return;
      }

      // Single item download
      const artifact = await this.ytDlpService.downloadMedia(job.url, {
        jobId: job.jobId,
        formatId: job.formatId,
        itemIndex: job.itemIndex,
        outputDir: this.tempDir,
        onProgress: (p) => {
          if ((job.status as string) === 'cancelled') return;
          if(job.category === 'audio' && p.conversionStarted && !job.conversionStarted) {
            job.conversionStarted = true;
            jobEvent(job.analyticsId, 'audio_conversion_started', job.jobId, 'audio');
          }
          job.status = p.stage;
          job.progress = Math.round(p.percent);
          if (p.etaSeconds !== undefined) job.etaSeconds = p.etaSeconds;
          job.updatedAt = Date.now();
        },
      });

      if((job.status as string)==='cancelled'){await fs.promises.unlink(artifact.filePath).catch(()=>{});throw new DownloaderAppError('JOB_CANCELLED','Cancelled',499);}
      job.outputFilePath = artifact.filePath;
      if(job.category==='photo' && artifact.mimeType.startsWith('video/')) {
        job.category='video'; attachJob(job.analyticsId!,job.jobId,job.category);
      }
      job.safeFilename = artifact.safeFilename;
      job.mimeType = artifact.mimeType;
      job.durationSeconds = artifact.durationSeconds;
      job.filesizeBytes = artifact.filesizeBytes;
      job.downloadedBytes = artifact.filesizeBytes;
      job.totalBytes = artifact.filesizeBytes;
      job.progress = 100;
      job.status = 'completed';
      job.updatedAt = Date.now();
      job.expiresAt = Date.now() + this.retentionMs;
      jobEvent(job.analyticsId,'media_prepared',job.jobId,job.category,undefined,Date.now()-processingStarted);
    } catch (err: any) {
      mediaFailure();
      if ((job.status as string) === 'cancelled' || err?.code === 'JOB_CANCELLED') {
        job.status = 'cancelled';
        job.error = {
          code: 'JOB_CANCELLED',
          message: 'Download was cancelled.',
          retryable: true,
        };
        jobEvent(job.analyticsId,'download_failed',job.jobId,job.category,'JOB_CANCELLED');
        return;
      }

      const appErr =
        err instanceof DownloaderAppError
          ? err
          : new DownloaderAppError(
              'INTERNAL_ERROR',
              'Download failed unexpectedly.',
              500,
              true
            );

      job.status = 'failed';
      job.updatedAt = Date.now();
      job.error = {
        code: appErr.code,
        message: appErr.userMessage,
        retryable: appErr.retryable,
      };
      jobEvent(job.analyticsId,'download_failed',job.jobId,job.category,appErr.code,Date.now()-processingStarted);
    } finally {
      for(const filename of partialFiles)await fs.promises.unlink(filename).catch(()=>{});
      if(['failed','cancelled'].includes(job.status)){
        // Only this finished job's generated files; never a global age-based sweep.
        const leftovers=await fs.promises.readdir(this.tempDir,{withFileTypes:true}).catch(()=>[]);
        for(const entry of leftovers)if(entry.isFile()&&entry.name.startsWith(job.jobId+'_'))await fs.promises.unlink(path.join(this.tempDir,entry.name)).catch(()=>{});
      }
    }
  }

  /**
   * Deletes expired temporary files and job records.
   */
  public async cleanupExpiredJobs(): Promise<number> {
    const now = Date.now();
    let cleaned = 0;
    for (const [jobId, job] of this.jobs.entries()) {
      if (now > job.expiresAt && ['completed','failed','cancelled'].includes(job.status) && !this.activeDeliveries.has(jobId)) {
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
  public async removeJobFile(jobId: string): Promise<void> {
    const job = this.jobs.get(jobId);
    if (job?.outputFilePath) {
      await fs.promises.unlink(job.outputFilePath).catch(() => {});
      job.outputFilePath = undefined;
    }
  }
}
