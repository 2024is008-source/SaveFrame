import * as http from 'node:http';
import * as https from 'node:https';
import * as dns from 'node:dns';
import * as fs from 'node:fs';
import { Transform } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { isPrivateOrReservedIp } from '../security/url-validator';
import { DownloaderAppError } from '../types/media.types';
import {instagramAgent, resetActiveSocketTimeout} from './instagram-agents';
import {mediaStage} from './media-timing';

export interface InstagramRequestOptions { signal?: AbortSignal; timeoutMs: number; cookie?: string; mediaUserAgent?: string; mediaReferer?: string }
export type StoryMime = 'image/jpeg' | 'image/webp' | 'video/mp4';
const failure = (message = 'Instagram did not provide accessible media media.') => new DownloaderAppError('EXTRACTOR_FAILURE', message, 502, true);

/** Shared, bounded transport for media metadata and media. Redirects never follow. */
export class InstagramHttpClient {
  validateUrl(value: string, media = false): URL {
    let url: URL;
    try { url = new URL(value); } catch { throw new DownloaderAppError('SSRF_BLOCKED', 'Invalid Instagram media URL.', 403); }
    if(url.username||url.password)throw new DownloaderAppError('SSRF_BLOCKED','Embedded credentials are not accepted in media URLs.',403);
    const fixture = process.env.NODE_ENV === 'test' && process.env.SAVEFRAME_FIXTURE_ORIGIN === url.origin;
    const domains = media ? ['cdninstagram.com', 'fbcdn.net'] : ['instagram.com'];
    const allowed = domains.some(domain => url.hostname === domain || url.hostname.endsWith('.' + domain));
    if (!fixture && (!allowed || url.protocol !== 'https:' || url.username || url.password || (url.port && url.port !== '443'))) {
      throw new DownloaderAppError('SSRF_BLOCKED', 'Media media must use an approved Instagram host.', 403);
    }
    return url;
  }

  private async open(value: string, media: boolean, options: InstagramRequestOptions, range?: string) {
    const url = this.validateUrl(value, media);
    const userAgent = media && options.mediaUserAgent && options.mediaUserAgent.length <= 512 && !/[\r\n]/.test(options.mediaUserAgent) ? options.mediaUserAgent : 'SaveFrameMediaUtility/1.0 (+https://saveframe.site)';
    const referer = media && options.mediaReferer ? this.validateUrl(options.mediaReferer).href : undefined;
    const timeout = Math.max(1, Math.min(options.timeoutMs, 120000));
    const signal = options.signal ? AbortSignal.any([options.signal, AbortSignal.timeout(timeout)]) : AbortSignal.timeout(timeout);
    const fixture = process.env.NODE_ENV === 'test' && process.env.SAVEFRAME_FIXTURE_ORIGIN === url.origin;
    const response = await mediaStage('upstream_connection',()=>new Promise<http.IncomingMessage>((resolve, reject) => {
      const request = (url.protocol === 'https:' ? https : http).request(url, {
        method: 'GET', signal, agent: instagramAgent(url.protocol),
        // Pin the actual connection to checked DNS answers, not an earlier lookup.
        ...(!fixture ? { lookup: ((host: string, lookupOptions: any, callback: any) => {
          dns.lookup(host, { all: true }, (error, records) => {
            if (error) return callback(error);
            if (!records.length || records.some(record => isPrivateOrReservedIp(record.address))) return callback(new DownloaderAppError('SSRF_BLOCKED', 'Instagram host resolved to a restricted address.', 403));
            if (lookupOptions?.all) callback(null, records);
            else callback(null, records[0].address, records[0].family);
          });
        }) as any } : {}),
        headers: {
          'User-Agent': userAgent,
          'Accept-Encoding': 'identity', Accept: media ? 'image/jpeg,image/webp,video/mp4' : 'text/html,application/json',
          ...(range ? { Range: range } : {}),
          ...(referer ? {Referer: referer} : {}),
          // Account credentials never accompany CDN requests.
          ...(!media && options.cookie ? { Cookie: options.cookie } : {}),
        },
      }, resolve);
      request.on('error', error => reject(this.mapError(error, signal)));
      resetActiveSocketTimeout(request);
      request.end();
    }));
    const status = response.statusCode || 500;
    try {
      if (status >= 300 && status < 400) {
        if (response.headers.location) {
          let destination:URL;
          try{destination=this.validateUrl(new URL(response.headers.location, url).href, media);}catch(error){if(error instanceof DownloaderAppError)throw error;throw failure('Instagram returned an invalid redirect.');}
          if (/\/(accounts\/login|challenge)(?:\/|$)/.test(destination.pathname)) throw new DownloaderAppError('LOGIN_REQUIRED', 'Instagram requires login to access this media.', 403);
        }
        throw failure('Instagram redirected this media request; redirects are not followed.');
      }
      if (status === 401) throw new DownloaderAppError('LOGIN_REQUIRED', 'Instagram requires login to access this media.', 403);
      if (status === 403) throw new DownloaderAppError('PRIVATE_CONTENT', 'Instagram denied access to this media.', 403);
      if (status === 404 || status === 410) throw new DownloaderAppError('DELETED_CONTENT', 'This media is unavailable or no longer exists.', 404);
      if (status === 429) throw new DownloaderAppError('RATE_LIMITED', 'Instagram is limiting requests. Please try again later.', 429, true);
      if (status < 200 || status >= 300) throw failure();
      if (response.headers['content-encoding'] && response.headers['content-encoding'] !== 'identity') throw failure('Compressed media responses are not accepted.');
    } catch (error) { response.destroy(); throw error; }
    return { response, signal };
  }

  private mapError(error: unknown, signal: AbortSignal): DownloaderAppError {
    if (error instanceof DownloaderAppError) return error;
    if (signal.aborted) return signal.reason?.name === 'TimeoutError'
      ? new DownloaderAppError('DOWNLOAD_TIMEOUT', 'Media media request timed out.', 504, true)
      : new DownloaderAppError('JOB_CANCELLED', 'Media request was cancelled.', 499);
    return failure('Unable to fetch Instagram media media.');
  }

  async metadata(url: string, options: InstagramRequestOptions): Promise<string> {
    const { response, signal } = await this.open(url, false, options);
    const maximum = 2 * 1024 * 1024;
    const chunks: Buffer[] = []; let bytes = 0;
    try {
      if (Number(response.headers['content-length']) > maximum) throw new DownloaderAppError('FILE_TOO_LARGE', 'Media metadata response is too large.', 413);
      if (!/^(text\/html|application\/json)(?:;|$)/i.test(String(response.headers['content-type'] || ''))) throw failure('Instagram returned an unsupported media response.');
      for await (const chunk of response) {
        bytes += chunk.length;
        if (bytes > maximum) throw new DownloaderAppError('FILE_TOO_LARGE', 'Media metadata response is too large.', 413);
        chunks.push(chunk);
      }
      return Buffer.concat(chunks).toString('utf8');
    } catch (error) { response.destroy(); throw this.mapError(error, signal); }
  }

  mime(headers: http.IncomingHttpHeaders): StoryMime {
    const mime = String(headers['content-type'] || '').split(';')[0].trim().toLowerCase();
    if (!['image/jpeg', 'image/webp', 'video/mp4'].includes(mime)) throw new DownloaderAppError('UNSUPPORTED_MEDIA_TYPE', 'Instagram returned unsupported media media.', 422);
    return mime as StoryMime;
  }

  verifySignature(prefix: Buffer, mime: StoryMime) {
    const valid = prefix.length>=12 && (mime === 'image/jpeg' ? prefix[0] === 0xff && prefix[1] === 0xd8 && prefix[2] === 0xff
      : mime === 'image/webp' ? prefix.toString('ascii', 0, 4) === 'RIFF' && prefix.toString('ascii', 8, 12) === 'WEBP'
      : prefix.toString('ascii', 4, 8) === 'ftyp');
    if (!valid) throw new DownloaderAppError('UNSUPPORTED_MEDIA_TYPE', 'Media media does not match its declared format.', 422);
  }

  async probe(url: string, options: InstagramRequestOptions): Promise<{ mime: StoryMime; bytes?: number }> {
    const { response, signal } = await this.open(url, true, options, 'bytes=0-255');
    try {
      const mime = this.mime(response.headers);
      const total = response.statusCode === 206 ? String(response.headers['content-range'] || '').match(/\/(\d+)$/)?.[1] : response.headers['content-length'];
      const bytes = Number(total);
      let prefix = Buffer.alloc(0);
      for await (const chunk of response) {
        prefix = Buffer.concat([prefix, chunk.subarray(0, 32 - prefix.length)]);
        if (prefix.length >= 12) break;
      }
      this.verifySignature(prefix, mime);
      return { mime, ...(Number.isSafeInteger(bytes) && bytes > 0 ? { bytes } : {}) };
    } catch (error) { throw this.mapError(error, signal); }
    finally { response.destroy(); }
  }

  async download(url: string, destination: string, expected: StoryMime, maximum: number, options: InstagramRequestOptions, progress?: (bytes: number) => void) {
    if (!Number.isSafeInteger(maximum) || maximum <= 0) throw new DownloaderAppError('INTERNAL_ERROR', 'Invalid media size configuration.', 500);
    const { response, signal } = await this.open(url, true, options);
    let created = false, bytes = 0;
    try {
      const mime = this.mime(response.headers);
      if (mime !== expected) throw new DownloaderAppError('UNSUPPORTED_MEDIA_TYPE', 'Media media format changed. Inspect this link again.', 422);
      if (Number(response.headers['content-length']) > maximum) throw new DownloaderAppError('FILE_TOO_LARGE', 'Media media exceeds the download size limit.', 413);
      let prefix = Buffer.alloc(0), verified = false;
      const client = this;
      const guard = new Transform({
        transform(chunk: Buffer, _encoding, callback) {
          try {
            bytes += chunk.length;
            if (bytes > maximum) throw new DownloaderAppError('FILE_TOO_LARGE', 'Media media exceeds the download size limit.', 413);
            if (!verified) {
              prefix = Buffer.concat([prefix, chunk]);
              if (prefix.length < 12) return callback();
              client.verifySignature(prefix, mime); verified = true; this.push(prefix); prefix = Buffer.alloc(0);
            } else this.push(chunk);
            progress?.(bytes); callback();
          } catch (error) { callback(error as Error); }
        },
        flush(callback) { callback(verified ? undefined : new DownloaderAppError('UNSUPPORTED_MEDIA_TYPE', 'Media media is empty or incomplete.', 422)); },
      });
      const output = fs.createWriteStream(destination, { flags: 'wx', mode: 0o600, highWaterMark: 65536 });
      output.once('open', () => { created = true; });
      await pipeline(response, guard, output, { signal });
      return { bytesWritten: bytes, mimeType: mime };
    } catch (error) {
      response.destroy(); if (created) await fs.promises.unlink(destination).catch(() => {});
      throw this.mapError(error, signal);
    }
  }
}
