"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.createDefaultApiContext = createDefaultApiContext;
exports.handleApiRequest = handleApiRequest;
var fs = _interopRequireWildcard(require("fs"));
var _media = require("../types/media.types");
var _urlValidator = require("../security/url-validator");
var _redisStore = require("../services/redis-store.service");
var _ytDlp = require("../services/yt-dlp.service");
var _downloadManager = require("../services/download-manager.service");
function _getRequireWildcardCache(nodeInterop) { if (typeof WeakMap !== "function") return null; var cacheBabelInterop = new WeakMap(); var cacheNodeInterop = new WeakMap(); return (_getRequireWildcardCache = function (nodeInterop) { return nodeInterop ? cacheNodeInterop : cacheBabelInterop; })(nodeInterop); }
function _interopRequireWildcard(obj, nodeInterop) { if (!nodeInterop && obj && obj.__esModule) { return obj; } if (obj === null || typeof obj !== "object" && typeof obj !== "function") { return { default: obj }; } var cache = _getRequireWildcardCache(nodeInterop); if (cache && cache.has(obj)) { return cache.get(obj); } var newObj = {}; var hasPropertyDescriptor = Object.defineProperty && Object.getOwnPropertyDescriptor; for (var key in obj) { if (key !== "default" && Object.prototype.hasOwnProperty.call(obj, key)) { var desc = hasPropertyDescriptor ? Object.getOwnPropertyDescriptor(obj, key) : null; if (desc && (desc.get || desc.set)) { Object.defineProperty(newObj, key, desc); } else { newObj[key] = obj[key]; } } } newObj.default = obj; if (cache) { cache.set(obj, newObj); } return newObj; }
function createDefaultApiContext() {
  const redisStore = new _redisStore.RedisStoreService();
  const ytDlpService = new _ytDlp.YtDlpService();
  const downloadManager = new _downloadManager.DownloadManagerService(ytDlpService);
  return {
    redisStore,
    ytDlpService,
    downloadManager,
    startedAt: Date.now()
  };
}
function sendJson(res, statusCode, payload, extraHeaders = {}) {
  const body = JSON.stringify(payload);
  res.writeHead(statusCode, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': Buffer.byteLength(body, 'utf8'),
    'X-Content-Type-Options': 'nosniff',
    'X-Frame-Options': 'DENY',
    'Referrer-Policy': 'no-referrer',
    'Cache-Control': 'no-store',
    ...extraHeaders
  });
  res.end(body);
}
function readJsonBody(req, maxBytes = 16 * 1024) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let total = 0;
    req.on('data', chunk => {
      total += chunk.length;
      if (total > maxBytes) {
        req.destroy();
        reject(new _media.DownloaderAppError('INVALID_URL', 'Request payload is too large.', 413));
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
        reject(new _media.DownloaderAppError('INVALID_URL', 'Request body must be valid JSON.', 400));
      }
    });
    req.on('error', err => reject(err));
  });
}
function getClientIp(req) {
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
function sanitizeMediaResultForClient(result) {
  return {
    ...result,
    items: result.items.map(item => ({
      ...item,
      formats: item.formats.map(({
        directUrl,
        ...safeFmt
      }) => safeFmt)
    }))
  };
}
async function handleApiRequest(req, res, ctx) {
  const method = (req.method || 'GET').toUpperCase();
  const parsedUrl = new URL(req.url || '/', 'http://localhost');
  const pathname = parsedUrl.pathname.replace(/\/+$/, '') || '/';
  const clientIp = getClientIp(req);
  try {
    // 1. GET /api/health
    if (method === 'GET' && pathname === '/api/health') {
      const [bins, redis, storage] = await Promise.all([ctx.ytDlpService.checkHealth(), ctx.redisStore.checkHealth(), ctx.downloadManager.getStorageHealth()]);
      const allCriticalOk = bins.ytDlp.ok && bins.ffmpeg.ok && storage.ok;
      const health = {
        status: allCriticalOk ? 'ok' : 'degraded',
        timestamp: new Date().toISOString(),
        uptimeSeconds: Math.floor((Date.now() - ctx.startedAt) / 1000),
        components: {
          nodejs: {
            ok: true,
            version: process.version
          },
          ytDlp: bins.ytDlp,
          ffmpeg: bins.ffmpeg,
          redis,
          storage
        }
      };
      sendJson(res, allCriticalOk ? 200 : 503, health);
      return true;
    }

    // 2. POST /api/media/resolve
    if (method === 'POST' && pathname === '/api/media/resolve') {
      const rl = await ctx.redisStore.checkRateLimit(clientIp, 'resolve', 30, 60);
      if (!rl.allowed) {
        throw new _media.DownloaderAppError('RATE_LIMITED', 'Too many media resolution requests from your IP. Please wait a minute and try again.', 429, true);
      }
      const body = await readJsonBody(req);
      const rawUrl = typeof body.url === 'string' ? body.url : '';
      const metadata = await ctx.ytDlpService.extractMetadata(rawUrl);
      const cacheKey = `resolve:${metadata.canonicalUrl}`;
      await ctx.redisStore.setJson(cacheKey, metadata, 300);
      sendJson(res, 200, {
        status: 'ok',
        cached: false,
        data: sanitizeMediaResultForClient(metadata)
      }, {
        'X-RateLimit-Limit': String(rl.limit),
        'X-RateLimit-Remaining': String(rl.remaining)
      });
      return true;
    }

    // 3. POST /api/media/download
    if (method === 'POST' && pathname === '/api/media/download') {
      const rl = await ctx.redisStore.checkRateLimit(clientIp, 'download', 15, 60);
      if (!rl.allowed) {
        throw new _media.DownloaderAppError('RATE_LIMITED', 'Download rate limit exceeded. Please wait before starting another download.', 429, true);
      }
      const body = await readJsonBody(req);
      const job = await ctx.downloadManager.createJob({
        url: typeof body.url === 'string' ? body.url : '',
        formatId: typeof body.formatId === 'string' ? body.formatId : undefined,
        itemIndex: typeof body.itemIndex === 'number' ? body.itemIndex : undefined,
        zipCarousel: Boolean(body.zipCarousel)
      });
      sendJson(res, 202, {
        status: 'ok',
        jobId: job.jobId,
        jobStatus: job.status,
        pollUrl: `/api/media/jobs/${job.jobId}`,
        downloadUrl: `/api/media/download/${job.jobId}`
      }, {
        'X-RateLimit-Limit': String(rl.limit),
        'X-RateLimit-Remaining': String(rl.remaining)
      });
      return true;
    }

    // 4. GET / DELETE / POST-cancel /api/media/jobs/:jobId
    const jobMatch = pathname.match(/^\/api\/media\/jobs(?:\/([A-Za-z0-9_-]+))?(?:\/(cancel))?$/);
    if (jobMatch) {
      const jobId = jobMatch[1] || parsedUrl.searchParams.get('jobId') || '';
      const isCancelAction = jobMatch[2] === 'cancel' || method === 'DELETE';
      if (!jobId) {
        throw new _media.DownloaderAppError('JOB_NOT_FOUND', 'Missing download job ID.', 400);
      }
      if (isCancelAction && (method === 'POST' || method === 'DELETE')) {
        const cancelled = ctx.downloadManager.cancelJob(jobId);
        sendJson(res, 200, {
          status: 'ok',
          job: {
            jobId: cancelled.jobId,
            status: cancelled.status,
            progress: cancelled.progress,
            error: cancelled.error
          }
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
            downloadUrl: job.status === 'completed' ? `/api/media/download/${job.jobId}` : undefined,
            error: job.error
          }
        });
        return true;
      }
    }

    // 5. GET /api/media/download/:jobId
    const dlMatch = pathname.match(/^\/api\/media\/download(?:\/([A-Za-z0-9_-]+))?$/);
    if (method === 'GET' && dlMatch) {
      const jobId = dlMatch[1] || parsedUrl.searchParams.get('jobId') || '';
      if (!jobId) {
        throw new _media.DownloaderAppError('JOB_NOT_FOUND', 'Missing job ID for file download.', 400);
      }
      const job = ctx.downloadManager.getJob(jobId);
      if (job.status === 'cancelled') {
        throw new _media.DownloaderAppError('JOB_CANCELLED', 'This download job was cancelled.', 410);
      }
      if (job.status === 'failed') {
        throw new _media.DownloaderAppError(job.error?.code || 'EXTRACTOR_FAILURE', job.error?.message || 'Download job failed.', 422);
      }
      if (job.status !== 'completed' || !job.outputFilePath) {
        throw new _media.DownloaderAppError('JOB_NOT_READY', `Download job is currently "${job.status}" (${job.progress}%). Please wait until completion.`, 409, true);
      }
      let stat;
      try {
        stat = await fs.promises.stat(job.outputFilePath);
      } catch {
        throw new _media.DownloaderAppError('JOB_NOT_FOUND', 'Downloaded file has expired and been cleaned up from temporary storage.', 410);
      }
      const safeFilename = (0, _urlValidator.sanitizeFilename)(job.safeFilename || `saveframe_${job.shortcode}`, job.isCarouselZip ? 'zip' : 'mp4');
      res.writeHead(200, {
        'Content-Type': job.mimeType || 'application/octet-stream',
        'Content-Length': stat.size,
        'Content-Disposition': `attachment; filename="${safeFilename}"`,
        'X-Content-Type-Options': 'nosniff',
        'Cache-Control': 'private, no-store, max-age=0'
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
              message: 'Error streaming media file.'
            }
          });
        } else {
          res.destroy();
        }
      });
      stream.pipe(res);
      return true;
    }
    return false;
  } catch (err) {
    const appErr = err instanceof _media.DownloaderAppError ? err : new _media.DownloaderAppError('EXTRACTOR_FAILURE', 'An unexpected server error occurred while processing the Instagram request.', 500, true, err?.message);
    sendJson(res, appErr.statusCode, {
      status: 'error',
      error: {
        code: appErr.code,
        message: appErr.userMessage,
        retryable: appErr.retryable
      }
    });
    return true;
  }
}