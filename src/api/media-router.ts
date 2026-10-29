import * as http from 'http';
import * as fs from 'fs';
import {
  DownloaderAppError,
  HealthStatus,
  NormalizedMediaResult,
} from '../types/media.types';
import { sanitizeFilename, validatePublicMediaInput } from '../security/url-validator';
import { RedisStoreService } from '../services/redis-store.service';
import { YtDlpService } from '../services/yt-dlp.service';
import { DownloadManagerService } from '../services/download-manager.service';

export interface ApiContext {
  redisStore: RedisStoreService;
  ytDlpService: YtDlpService;
  downloadManager: DownloadManagerService;
  startedAt: number;
}

export function createDefaultApiContext(): ApiContext {
  const redisStore = new RedisStoreService();
  const ytDlpService = new YtDlpService();
  const downloadManager = new DownloadManagerService(ytDlpService);
  return {
    redisStore,
    ytDlpService,
    downloadManager,
    startedAt: Date.now(),
  };
}

function sendJson(
  res: http.ServerResponse,
  statusCode: number,
  payload: unknown,
  extraHeaders: Record<string, string> = {}
): void {
  const body = JSON.stringify(payload);
  res.writeHead(statusCode, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': Buffer.byteLength(body, 'utf8'),
    'X-Content-Type-Options': 'nosniff',
    'X-Frame-Options': 'DENY',
    'Referrer-Policy': 'no-referrer',
    'Cache-Control': 'no-store',
    ...extraHeaders,
  });
  res.end(body);
}

function readJsonBody(req: http.IncomingMessage, maxBytes = 16 * 1024): Promise<any> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    let total = 0;

    req.on('data', (chunk: Buffer) => {
      total += chunk.length;
      if (total > maxBytes) {
        req.destroy();
        reject(
          new DownloaderAppError(
            'INVALID_URL',
            'Request payload is too large.',
            413
          )
        );
        return;
      }
      chunks.push(chunk);
    });

    req.on('end', () => {
      const raw = Buffer.concat(chunks).toString('utf8').trim();
      if (!raw) {
        resolve({});
        return;
      }
      try {
        resolve(JSON.parse(raw));
      } catch {
        reject(
          new DownloaderAppError(
            'INVALID_URL',
            'Request body must be valid JSON.',
            400
          )
        );
      }
    });

    req.on('error', (err) => reject(err));
  });
}

function getClientIp(req: http.IncomingMessage): string {
  const xff = req.headers['x-forwarded-for'];
  if (typeof xff === 'string' && xff.trim()) {
    return xff.split(',')[0].trim();
  }
  return req.socket?.remoteAddress || '127.0.0.1';
}

/**
 * Strips internal `directUrl` fields before returning metadata to the browser
 * so the backend never acts as an open URL proxy or leaks signed CDN tokens.
 */
function sanitizeMediaResultForClient(
  result: NormalizedMediaResult
): NormalizedMediaResult {
  return {
    ...result,
    items: result.items.map((item) => ({
      ...item,
      formats: item.formats.map(({ directUrl, ...safeFmt }) => safeFmt),
    })),
  };
}

export async function handleApiRequest(
  req: http.IncomingMessage,
  res: http.ServerResponse,
  ctx: ApiContext
): Promise<boolean> {
  const method = (req.method || 'GET').toUpperCase();
  const parsedUrl = new URL(req.url || '/', 'http://localhost');
  const pathname = parsedUrl.pathname.replace(/\/+$/, '') || '/';
  const clientIp = getClientIp(req);

  try {
    // 1. GET /api/health
    if (method === 'GET' && pathname === '/api/health') {
      const [bins, redis, storage] = await Promise.all([
        ctx.ytDlpService.checkHealth(),
        ctx.redisStore.checkHealth(),
        ctx.downloadManager.getStorageHealth(),
      ]);

      const allCriticalOk = bins.ytDlp.ok && bins.ffmpeg.ok && storage.ok;
      const health: HealthStatus = {
        status: allCriticalOk ? 'ok' : 'degraded',
        timestamp: new Date().toISOString(),
        uptimeSeconds: Math.floor((Date.now() - ctx.startedAt) / 1000),
        components: {
          nodejs: { ok: true, version: process.version },
          ytDlp: bins.ytDlp,
          ffmpeg: bins.ffmpeg,
          redis,
          storage,
        },
      };

      sendJson(res, allCriticalOk ? 200 : 503, health);
      return true;
    }

    // 2. POST /api/media/resolve
    if (method === 'POST' && pathname === '/api/media/resolve') {
      const rl = await ctx.redisStore.checkRateLimit(clientIp, 'resolve', 30, 60);
      if (!rl.allowed) {
        throw new DownloaderAppError(
          'RATE_LIMITED',
          'Too many media resolution requests from your IP. Please wait a minute and try again.',
          429,
          true
        );
      }

      const body = await readJsonBody(req);
      const rawUrl = typeof body.url === 'string' ? body.url : '';
      const tool = typeof body.tool === 'string' ? body.tool : undefined;
      validatePublicMediaInput(rawUrl, tool);
      const metadata = await ctx.ytDlpService.extractMetadata(rawUrl, tool);
      // The extractor owns the bounded, expiry-aware public metadata cache.
      // Never duplicate signed CDN URLs in the legacy Redis JSON store.

      sendJson(
        res,
        200,
        {
          status: 'ok',
          cached: false,
          data: sanitizeMediaResultForClient(metadata),
        },
        {
          'X-RateLimit-Limit': String(rl.limit),
          'X-RateLimit-Remaining': String(rl.remaining),
        }
      );
      return true;
    }

    // 3. POST /api/media/download
    if (method === 'POST' && pathname === '/api/media/download') {
      const rl = await ctx.redisStore.checkRateLimit(clientIp, 'download', 15, 60);
      if (!rl.allowed) {
        throw new DownloaderAppError(
          'RATE_LIMITED',
          'Download rate limit exceeded. Please wait before starting another download.',
          429,
          true
        );
      }

      const body = await readJsonBody(req);
      validatePublicMediaInput(typeof body.url === 'string' ? body.url : '');
      const job = await ctx.downloadManager.createJob({
        url: typeof body.url === 'string' ? body.url : '',
        formatId: typeof body.formatId === 'string' ? body.formatId : undefined,
        itemIndex:
          typeof body.itemIndex === 'number' ? body.itemIndex : undefined,
        zipCarousel: Boolean(body.zipCarousel),
      });

      sendJson(
        res,
        202,
        {
          status: 'ok',
          jobId: job.jobId,
          jobStatus: job.status,
          pollUrl: `/api/media/jobs/${job.jobId}`,
          downloadUrl: `/api/media/download/${job.jobId}`,
        },
        {
          'X-RateLimit-Limit': String(rl.limit),
          'X-RateLimit-Remaining': String(rl.remaining),
        }
      );
      return true;
    }

    // 4. GET / DELETE / POST-cancel /api/media/jobs/:jobId
    const jobMatch = pathname.match(
      /^\/api\/media\/jobs(?:\/([A-Za-z0-9_-]+))?(?:\/(cancel))?$/
    );
    if (jobMatch) {
      const jobId =
        jobMatch[1] || parsedUrl.searchParams.get('jobId') || '';
      const isCancelAction =
        jobMatch[2] === 'cancel' || method === 'DELETE';

      if (!jobId) {
        throw new DownloaderAppError(
          'JOB_NOT_FOUND',
          'Missing download job ID.',
          400
        );
      }

      if (isCancelAction && (method === 'POST' || method === 'DELETE')) {
        const cancelled = ctx.downloadManager.cancelJob(jobId);
        sendJson(res, 200, {
          status: 'ok',
          job: {
            jobId: cancelled.jobId,
            status: cancelled.status,
            progress: cancelled.progress,
            error: cancelled.error,
          },
        });
        return true;
      }

      if (method === 'GET') {
        const job = ctx.downloadManager.getJob(jobId);
        sendJson(res, 200, {
          status: 'ok',
          job: {
            jobId: job.jobId,
            shortcode: job.shortcode,
            category: job.category,
            formatId: job.formatId,
            isCarouselZip: job.isCarouselZip,
            status: job.status,
            progress: job.progress,
            downloadedBytes: job.downloadedBytes,
            totalBytes: job.totalBytes,
            etaSeconds: job.etaSeconds,
            safeFilename: job.safeFilename,
            mimeType: job.mimeType,
            filesizeBytes: job.filesizeBytes,
            downloadUrl:
              job.status === 'completed'
                ? `/api/media/download/${job.jobId}`
                : undefined,
            error: job.error,
          },
        });
        return true;
      }
    }

    // 5. GET /api/media/download/:jobId
    const dlMatch = pathname.match(/^\/api\/media\/download(?:\/([A-Za-z0-9_-]+))?$/);
    if (method === 'GET' && dlMatch) {
      const jobId =
        dlMatch[1] || parsedUrl.searchParams.get('jobId') || '';
      if (!jobId) {
        throw new DownloaderAppError(
          'JOB_NOT_FOUND',
          'Missing job ID for file download.',
          400
        );
      }

      const job = ctx.downloadManager.getJob(jobId);
      if (job.status === 'cancelled') {
        throw new DownloaderAppError(
          'JOB_CANCELLED',
          'This download job was cancelled.',
          410
        );
      }
      if (job.status === 'failed') {
        throw new DownloaderAppError(
          job.error?.code || 'EXTRACTOR_FAILURE',
          job.error?.message || 'Download job failed.',
          422
        );
      }
      if (job.status !== 'completed' || !job.outputFilePath) {
        throw new DownloaderAppError(
          'JOB_NOT_READY',
          `Download job is currently "${job.status}" (${job.progress}%). Please wait until completion.`,
          409,
          true
        );
      }

      let stat: fs.Stats;
      try {
        stat = await fs.promises.stat(job.outputFilePath);
      } catch {
        throw new DownloaderAppError(
          'JOB_NOT_FOUND',
          'Downloaded file has expired and been cleaned up from temporary storage.',
          410
        );
      }

      const safeFilename = sanitizeFilename(
        job.safeFilename || `saveframe_${job.shortcode}`,
        job.isCarouselZip ? 'zip' : 'mp4'
      );

      res.writeHead(200, {
        'Content-Type': job.mimeType || 'application/octet-stream',
        'Content-Length': stat.size,
        'Content-Disposition': `attachment; filename="${safeFilename}"`,
        'X-Content-Type-Options': 'nosniff',
        'Cache-Control': 'private, no-store, max-age=0',
      });

      const stream = fs.createReadStream(job.outputFilePath);
      req.on('close', () => {
        stream.destroy();
      });
      stream.on('error', () => {
        if (!res.headersSent) {
          sendJson(res, 500, {
            status: 'error',
            error: {
              code: 'EXTRACTOR_FAILURE',
              message: 'Error streaming media file.',
            },
          });
        } else {
          res.destroy();
        }
      });
      stream.pipe(res);
      return true;
    }

    return false;
  } catch (err: any) {
    const appErr =
      err instanceof DownloaderAppError
        ? err
        : new DownloaderAppError(
            'EXTRACTOR_FAILURE',
            'An unexpected server error occurred while processing the Instagram request.',
            500,
            true,
            err?.message
          );

    sendJson(res, appErr.statusCode, {
      status: 'error',
      error: {
        code: appErr.code,
        message: appErr.userMessage,
        retryable: appErr.retryable,
      },
    });
    return true;
  }
}
