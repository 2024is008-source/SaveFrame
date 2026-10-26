import { spawn } from 'node:child_process';
import * as path from 'node:path';
import { DownloaderAppError, ErrorCode, NormalizedMediaResult } from '../types/media.types';
import { validateMediaInput, ValidatedInstagramUrl } from '../security/url-validator';
import { InstagramHttpClient } from './instagram-http.service';

const fs: typeof import('node:fs') = process.getBuiltinModule('fs');
const os: typeof import('node:os') = process.getBuiltinModule('os');
const recoverable = new Set(['EXTRACTOR_FAILURE', 'DOWNLOAD_TIMEOUT', 'YTDLP_NOT_INSTALLED']);
const allowedErrors = new Set<ErrorCode>(['INVALID_URL', 'SSRF_BLOCKED', 'PRIVATE_CONTENT', 'DELETED_CONTENT', 'EXPIRED_STORY', 'LOGIN_REQUIRED', 'RATE_LIMITED', 'EXTRACTOR_FAILURE', 'DOWNLOAD_TIMEOUT', 'FILE_TOO_LARGE', 'UNSUPPORTED_MEDIA_TYPE']);
allowedErrors.add('SESSION_EXPIRED'); allowedErrors.add('CHALLENGE_REQUIRED');
const failure = () => new DownloaderAppError('EXTRACTOR_FAILURE', 'The optional Instagram extractor could not resolve this media.', 502, true);
const cancelled = () => new DownloaderAppError('JOB_CANCELLED', 'Media inspection was cancelled.', 499);
const bounded = (value: unknown, fallback: number, min: number, max: number) => { const n = Number(value); return Number.isInteger(n) && n >= min && n <= max ? n : fallback; };
const dimension = (value: unknown) => typeof value === 'number' && Number.isInteger(value) && value > 0 && value <= 32768 ? value : undefined;

/** Trusted library callers only. Never construct from public HTTP input. */
export interface AuthorizedInstagrapiAccess {
  requesterId: string;
  ownerUsername: string;
  ownerUserId: string;
  sessionKey: string;
  allowedCanonicalUrls: readonly string[];
}

interface WorkerState { active: number; cooldown: number; sessions: Set<string> }
const workerKey = Symbol.for('saveframe.instagrapi.workers');
const stateRoot = globalThis as typeof globalThis & { [workerKey]?: WorkerState };
const state = stateRoot[workerKey] ||= { active: 0, cooldown: 0, sessions: new Set() };

export function instagrapiEligible(error: unknown): error is DownloaderAppError {
  return error instanceof DownloaderAppError && recoverable.has(error.code);
}

/** One bounded process, no queue, no credentials inherited from the web process. */
export class InstagrapiService {
  constructor(private readonly http = new InstagramHttpClient()) {}

  /** Explicit owner operation, independent of anonymous extraction/failure flags. */
  async extractAuthorizedStory(url: ValidatedInstagramUrl, access: AuthorizedInstagrapiAccess, signal?: AbortSignal): Promise<NormalizedMediaResult> {
    if (url.category !== 'story' || !access || process.env.INSTAGRAPI_AUTH_ENABLED !== '1') throw new DownloaderAppError('PRIVATE_CONTENT', 'Owner story extraction is disabled or unauthorized.', 403);
    return this.extract(url, signal, access, true);
  }

  async afterPrimaryFailure(url: ValidatedInstagramUrl, error: unknown, signal?: AbortSignal, access?: AuthorizedInstagrapiAccess): Promise<NormalizedMediaResult> {
    if (process.env.INSTAGRAPI_FALLBACK_ENABLED !== '1' || !instagrapiEligible(error)) throw error;
    return this.extract(url, signal, access);
  }

  private authorize(url: ValidatedInstagramUrl, access: AuthorizedInstagrapiAccess) {
    if (process.env.INSTAGRAPI_AUTH_ENABLED !== '1' || !/^[A-Za-z0-9@._-]{1,128}$/.test(access.requesterId) ||
        !/^[A-Za-z0-9._]{1,30}$/.test(access.ownerUsername) || !/^\d{1,30}$/.test(access.ownerUserId) ||
        !/^[A-Za-z0-9_-]{1,64}$/.test(access.sessionKey) || !(process.env.INSTAGRAPI_SESSION_KEYS || 'owner').split(',').includes(access.sessionKey) || !Array.isArray(access.allowedCanonicalUrls) ||
        access.allowedCanonicalUrls.length > 100 || !access.allowedCanonicalUrls.includes(url.canonicalUrl) ||
        (url.username && url.username.toLowerCase() !== access.ownerUsername.toLowerCase())) {
      throw new DownloaderAppError('PRIVATE_CONTENT', 'This operation has no matching operator authorization.', 403);
    }
    const configured = process.env.INSTAGRAPI_SESSION_DIR || '/var/lib/saveframe/instagram-sessions';
    try {
      if (!path.isAbsolute(configured)) throw failure();
      const directory = fs.realpathSync(configured), file = path.join(directory, access.sessionKey + '.json');
      if (directory !== path.resolve(configured) || fs.realpathSync(file) !== file) throw failure();
      const inside = (root: string) => { const relative = path.relative(path.resolve(root), directory); return !relative || (!relative.startsWith('..' + path.sep) && !path.isAbsolute(relative)); };
      if (inside(process.cwd()) || inside(os.tmpdir()) || (process.env.DOWNLOAD_TEMP_DIR && inside(process.env.DOWNLOAD_TEMP_DIR))) throw failure();
      for (const target of [directory, file]) {
        const stat = fs.lstatSync(target);
        if (stat.isSymbolicLink() || (process.platform !== 'win32' && ((stat.mode & 0o077) !== 0 || stat.uid !== process.getuid?.()))) throw failure();
      }
      if (!fs.statSync(directory).isDirectory() || !fs.statSync(file).isFile() || fs.statSync(file).size > 65536) throw failure();
      return { requesterId: access.requesterId, ownerUsername: access.ownerUsername, ownerUserId: access.ownerUserId, sessionKey: access.sessionKey };
    } catch { throw new DownloaderAppError('PRIVATE_CONTENT', 'An external private operator session is required.', 403); }
  }

  private async extract(url: ValidatedInstagramUrl, signal?: AbortSignal, access?: AuthorizedInstagrapiAccess, ownerStory=false): Promise<NormalizedMediaResult> {
    // Revalidate even trusted callers. Never pass user-supplied args or paths to Python.
    url = validateMediaInput(url.canonicalUrl, url.category === 'profile' ? 'profile' : undefined);
    if (signal?.aborted) throw cancelled();
    const authorization = access ? this.authorize(url, access) : undefined;
    const max = bounded(process.env.INSTAGRAPI_MAX_WORKERS, 1, 1, 2);
    if (state.active >= max || state.cooldown > Date.now() || (access && state.sessions.has(access.sessionKey))) {
      throw new DownloaderAppError('RATE_LIMITED', 'The optional extractor is busy. Try again later.', 429, true);
    }
    state.active++;
    if (access) state.sessions.add(access.sessionKey);
    const timeout = bounded(process.env.INSTAGRAPI_TIMEOUT_MS, 20000, 5000, 30000);
    const total = signal ? AbortSignal.any([signal, AbortSignal.timeout(timeout)]) : AbortSignal.timeout(timeout);
    try {
      const raw = await this.runWorker({ version: 1, url: url.canonicalUrl, category: url.category, ...(ownerStory ? { operation: 'owner-story' } : {}), ...(authorization ? { access: authorization } : {}) }, total);
      return await this.normalize(raw, url, total, access);
    } catch (error) {
      if (!signal?.aborted) state.cooldown = Date.now() + 30000;
      if (signal?.aborted) throw cancelled();
      if (total.aborted) throw new DownloaderAppError('DOWNLOAD_TIMEOUT', 'The optional extractor timed out.', 504, true);
      throw error instanceof DownloaderAppError ? error : failure();
    } finally {
      state.active--;
      if (access) state.sessions.delete(access.sessionKey);
    }
  }

  private runWorker(input: object, signal: AbortSignal): Promise<unknown> {
    const local = path.join(process.cwd(), '.runtime', process.platform === 'win32' ? 'Scripts/python.exe' : 'bin/python');
    const python = process.env.INSTAGRAPI_PYTHON_PATH || local;
    if (!path.isAbsolute(python) || !fs.existsSync(python)) return Promise.reject(failure());
    const worker = path.join(process.cwd(), 'python', 'instagrapi_worker.py');
    return new Promise((resolve, reject) => {
      if (signal.aborted) { reject(cancelled()); return; }
      const child = spawn(python, ['-I', '-B', worker], {
        shell: false, windowsHide: true, stdio: ['pipe', 'pipe', 'pipe'],
        env: {
          NODE_ENV: 'production',
          PATH: process.env.PATH || '/usr/bin:/bin',
          ...(process.env.SystemRoot ? { SystemRoot: process.env.SystemRoot } : {}),
          TEMP: os.tmpdir(), TMP: os.tmpdir(), LANG: 'C.UTF-8',
          INSTAGRAPI_MEMORY_MB: String(bounded(process.env.INSTAGRAPI_MEMORY_MB, 512, 256, 768)),
          INSTAGRAPI_AUTH_ENABLED: process.env.INSTAGRAPI_AUTH_ENABLED === '1' ? '1' : '0',
          INSTAGRAPI_SESSION_KEYS: process.env.INSTAGRAPI_SESSION_KEYS || 'owner',
          ...(process.env.INSTAGRAPI_SESSION_DIR ? { INSTAGRAPI_SESSION_DIR: process.env.INSTAGRAPI_SESSION_DIR } : {}),
          ...(process.env.DOWNLOAD_TEMP_DIR ? { DOWNLOAD_TEMP_DIR: process.env.DOWNLOAD_TEMP_DIR } : {}),
        },
      });
      const chunks: Buffer[] = []; let bytes = 0, stderrBytes = 0, overflow = false;
      let killTimer: ReturnType<typeof setTimeout> | undefined;
      const abort = () => { child.kill('SIGTERM'); killTimer ||= setTimeout(() => child.kill('SIGKILL'), 1000); killTimer.unref(); };
      signal.addEventListener('abort', abort, { once: true });
      child.stdout.on('data', (chunk: Buffer) => { bytes += chunk.length; if (bytes > 1024 * 1024) { overflow = true; abort(); } else chunks.push(chunk); });
      // Drain without retaining or logging library diagnostics/session information.
      child.stderr.on('data', (chunk: Buffer) => { stderrBytes += chunk.length; if (stderrBytes > 65536) { overflow = true; abort(); } });
      child.stdin.on('error', () => {});
      child.once('error', () => { /* close always follows spawn errors */ });
      child.once('close', code => {
        signal.removeEventListener('abort', abort); if (killTimer) clearTimeout(killTimer);
        if (signal.aborted) { reject(cancelled()); return; }
        if (overflow || code !== 0) { reject(failure()); return; }
        try { resolve(JSON.parse(Buffer.concat(chunks).toString('utf8'))); } catch { reject(failure()); }
      });
      child.stdin.end(JSON.stringify(input));
      if (signal.aborted) abort();
    });
  }

  private async normalize(raw: any, url: ValidatedInstagramUrl, signal: AbortSignal, access?: AuthorizedInstagrapiAccess): Promise<NormalizedMediaResult> {
    if (!raw || raw.version !== 1) throw failure();
    if (raw.status === 'error') {
      const code: ErrorCode = allowedErrors.has(raw.code) ? raw.code : 'EXTRACTOR_FAILURE';
      const status = ['LOGIN_REQUIRED', 'SESSION_EXPIRED', 'CHALLENGE_REQUIRED', 'PRIVATE_CONTENT', 'SSRF_BLOCKED'].includes(code) ? 403 : code === 'RATE_LIMITED' ? 429 : ['DELETED_CONTENT', 'EXPIRED_STORY'].includes(code) ? 404 : 502;
      const message = code === 'SESSION_EXPIRED' ? 'The saved Instagram session has expired or was revoked. Renew it locally.' : code === 'CHALLENGE_REQUIRED' ? 'Instagram requires account verification. Complete it manually in Instagram.' : code === 'LOGIN_REQUIRED' ? 'Instagram requires authorized access; no automatic login was attempted.' : code === 'PRIVATE_CONTENT' ? 'Instagram denied access to this media.' : 'The optional extractor could not provide accessible media.';
      throw new DownloaderAppError(code, message, status, code === 'EXTRACTOR_FAILURE');
    }
    if (raw.status !== 'ok' || typeof raw.username !== 'string' || !/^[A-Za-z0-9._]{1,30}$/.test(raw.username) || !Array.isArray(raw.items) || !raw.items.length || raw.items.length > 100 ||
        (['profile', 'story'].includes(url.category) && raw.items.length !== 1) ||
        (url.username && raw.username.toLowerCase() !== url.username.toLowerCase()) ||
        (access && raw.username.toLowerCase() !== access.ownerUsername.toLowerCase())) throw failure();
    // Validate EVERY URL before any probe/fetch. Never trust subprocess output.
    for (const item of raw.items) {
      if (!item || !['photo', 'video'].includes(item.type) || typeof item.id !== 'string' || !/^\d{1,30}$/.test(item.id) ||
          typeof item.url !== 'string' || item.url.length > 8192 || typeof item.thumbnail !== 'string' || item.thumbnail.length > 8192 ||
          (url.category === 'story' && item.id !== url.storyId) || (url.category === 'profile' && item.type !== 'photo')) throw failure();
      this.http.validateUrl(item.url, true); this.http.validateUrl(item.thumbnail, true);
    }
    const items: NormalizedMediaResult['items'] = [];
    const maxBytes = bounded(process.env.MAX_FILE_SIZE_BYTES, 150 * 1024 * 1024, 1, 1024 * 1024 * 1024);
    for (const [index, item] of raw.items.entries()) {
      if (signal.aborted) throw cancelled();
      const proof = await this.http.probe(item.url, { signal, timeoutMs: 3000 });
      if ((proof.mime === 'video/mp4') !== (item.type === 'video')) throw failure();
      if (proof.bytes && proof.bytes > maxBytes) throw new DownloaderAppError('FILE_TOO_LARGE', 'Media exceeds the download size limit.', 413);
      const ext = proof.mime === 'video/mp4' ? 'mp4' : proof.mime === 'image/webp' ? 'webp' : 'jpg';
      const width = dimension(item.width), height = dimension(item.height), resolution = width && height ? `${width}x${height}` : 'Source resolution';
      items.push({ index, itemId: item.id, shortcode: url.shortcode, mediaType: item.type, title: `${item.type === 'video' ? 'Video' : 'Photo'} by ${raw.username}`,
        thumbnailUrl: item.thumbnail, ...(item.type === 'photo' ? { imagePreviewUrl: item.url } : {}), width, height, aspectRatio: width && height ? `${width}:${height}` : 'Source resolution',
        durationSeconds: typeof item.duration === 'number' && Number.isFinite(item.duration) && item.duration > 0 && item.duration <= 86400 ? item.duration : undefined,
        formats: [{ formatId: 'instagrapi-original', label: 'Original', ext, Container: ext === 'mp4' ? 'MP4' : ext === 'webp' ? 'WebP' : 'JPEG', width, height, resolution,
          hasVideo: item.type === 'video', hasAudio: item.type === 'video' && item.hasAudio === true, needsMerge: false, filesizeBytes: proof.bytes, filesizeFormatted: '', directUrl: item.url }],
      });
    }
    const category = url.category === 'profile' || url.category === 'story' ? url.category : items.length > 1 ? 'carousel' : items[0].mediaType === 'photo' ? 'photo' : url.category === 'reel' ? 'reel' : 'video';
    return { id: url.shortcode, shortcode: url.shortcode, canonicalUrl: url.canonicalUrl, category,
      title: items[0].title, uploader: { username: raw.username }, itemCount: items.length, isCarousel: items.length > 1, supportsZipDownload: items.length > 1,
      items, extractorSource: 'instagrapi' };
  }
}
