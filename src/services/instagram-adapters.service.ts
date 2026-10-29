import * as https from 'https';
import * as http from 'http';
import * as fs from 'fs';
import * as dns from 'node:dns';
import { imagePreviews } from './image-previews';
import {
  DownloaderAppError,
  NormalizedFormat,
  NormalizedMediaItem,
  NormalizedMediaResult,
} from '../types/media.types';
import { ValidatedInstagramUrl, isPrivateOrReservedIp } from '../security/url-validator';
import {instagramAgent, resetActiveSocketTimeout} from './instagram-agents';
import {mediaDuration, mediaStage} from './media-timing';

export interface ImageAdapterFetchOptions {
  timeoutMs?: number;
  maxBytes?: number;
  customEndpointBase?: string;
}

/**
 * Authorized Image & Profile Provider Adapters.
 *
 * Why needed:
 * 1. Upstream `yt-dlp` (`InstagramIE` in `yt_dlp/extractor/instagram.py`) is a video extractor.
 *    When a single `/p/{shortcode}` post contains only a still image (`GraphImage`), `yt-dlp`
 *    raises `ExtractorError: There is no video in this post`. (For multi-item carousels, `yt-dlp`
 *    does return `thumbnails` from `image_versions2.candidates`).
 * 2. Upstream `InstagramUserIE` (`instagram:user`) is marked `_WORKING = False` in `yt-dlp`
 *    and we must never bulk-download entire user profiles.
 */
export class InstagramAuthorizedAdapters {
  private readonly timeoutMs: number;
  private readonly maxBytes: number;

  constructor(options?: ImageAdapterFetchOptions) {
    this.timeoutMs = options?.timeoutMs ?? 15000;
    this.maxBytes = options?.maxBytes ?? 25 * 1024 * 1024; // 25 MB max image size
    if(!Number.isSafeInteger(this.timeoutMs)||this.timeoutMs<=0||this.timeoutMs>120000)this.timeoutMs=15000;
    if(!Number.isSafeInteger(this.maxBytes)||this.maxBytes<=0||this.maxBytes>25*1024*1024)this.maxBytes=25*1024*1024;
  }

  /**
   * Performs a safe, size-bounded HTTP/HTTPS GET request without shell execution.
   */
  private fetchBuffer(targetUrl: string, timeoutMs = this.timeoutMs, callerSignal?: AbortSignal): Promise<{
    statusCode: number;
    headers: http.IncomingHttpHeaders;
    body: Buffer;
  }> {
    return mediaStage('upstream_body',()=>new Promise((resolve, reject) => {
      const connected = performance.now();
      const deadline=AbortSignal.timeout(timeoutMs);
      const signal=callerSignal?AbortSignal.any([callerSignal,deadline]):deadline;
      const failure=(error:Error)=>signal.aborted
        ? new DownloaderAppError(signal.reason?.name==='TimeoutError'?'DOWNLOAD_TIMEOUT':'JOB_CANCELLED',signal.reason?.name==='TimeoutError'?'Timed out while fetching public Instagram media.':'Media transfer was cancelled.',signal.reason?.name==='TimeoutError'?504:499,true)
        : error instanceof DownloaderAppError?error:new DownloaderAppError('EXTRACTOR_FAILURE','Unable to reach Instagram public media endpoint.',502,true);
      let parsed:URL;
      try{parsed=new URL(targetUrl);}catch{return reject(new DownloaderAppError('SSRF_BLOCKED','Invalid media URL.',403));}
      const fixture=process.env.NODE_ENV==='test'&&process.env.SAVEFRAME_FIXTURE_ORIGIN===parsed.origin;
      const host=parsed.hostname.toLowerCase();
      const allowed=['instagram.com','cdninstagram.com','fbcdn.net'].some(domain=>host===domain||host.endsWith('.'+domain));
      if(!fixture&&(!allowed||parsed.protocol!=='https:'||parsed.username||parsed.password||(parsed.port&&parsed.port!=='443')))return reject(new DownloaderAppError('SSRF_BLOCKED','Media URL is outside the approved Instagram hosts.',403));
      const client = parsed.protocol === 'https:' ? https : http;

      const req = client.request(
        parsed,
        {
          method: 'GET',
          agent: instagramAgent(parsed.protocol),
          signal,
          // Check the actual connection's DNS result, avoiding a lookup/connect race.
          ...(!fixture?{lookup:((hostname:string,options:any,callback:any)=>{dns.lookup(hostname,{all:true},(error,records)=>{if(error)return callback(error);if(!records.length||records.some(record=>isPrivateOrReservedIp(record.address)))return callback(new DownloaderAppError('SSRF_BLOCKED','Media host resolved to a restricted address.',403));if(options?.all)callback(null,records);else callback(null,records[0].address,records[0].family);});}) as any}:{}),
          headers: {
            'User-Agent':
              'Mozilla/5.0 (compatible; SaveFrameMediaUtility/1.0; +https://saveframe.site)',
            Accept: 'text/html,application/json,image/jpeg,image/webp,*/*;q=0.8',
          },
        },
        (res) => {
          // Connection includes DNS/TLS and time to first response headers.
          mediaDuration('upstream_connection',performance.now() - connected);
          const statusCode = res.statusCode || 500;
          const chunks: Buffer[] = [];
          let received = 0;
          res.on('error',error=>reject(failure(error)));
          res.on('aborted',()=>reject(failure(new Error('Incomplete upstream response'))));
          if(Number(res.headers['content-length'])>this.maxBytes){req.destroy();reject(new DownloaderAppError('FILE_TOO_LARGE','Media response exceeds the maximum allowed size.',413));return;}

          res.on('data', (chunk: Buffer) => {
            received += chunk.length;
            if (received > this.maxBytes) {
              req.destroy();
              reject(
                new DownloaderAppError(
                  'FILE_TOO_LARGE',
                  `Media file exceeds the maximum allowed size (${Math.round(
                    this.maxBytes / (1024 * 1024)
                  )} MB).`,
                  413
                )
              );
              return;
            }
            chunks.push(chunk);
          });

          res.on('end', () => {
            resolve({
              statusCode,
              headers: res.headers,
              body: Buffer.concat(chunks),
            });
          });
        }
      );

      req.on('error', (err) => {
        reject(failure(err));
      });

      resetActiveSocketTimeout(req);
      req.end();
    }));
  }

  /**
   * Extracts public single-photo metadata from an Instagram `/p/{shortcode}/` embed/public page
   * when `yt-dlp` reports "There is no video in this post".
   */
  public async extractPublicPhotoPost(
    validated: ValidatedInstagramUrl,
    overrideEmbedUrl?: string,
    signal?: AbortSignal
  ): Promise<NormalizedMediaResult> {
    const targetUrl =
      overrideEmbedUrl ||
      `${
        process.env.INSTAGRAM_PUBLIC_EMBED_BASE || 'https://www.instagram.com'
      }/p/${validated.shortcode}/embed/captioned/`;

    const response = await this.fetchBuffer(targetUrl,this.timeoutMs,signal);

    if (response.statusCode === 404) {
      throw new DownloaderAppError(
        'DELETED_CONTENT',
        'This Instagram photo post was not found or has been deleted.',
        404
      );
    }

    if (response.statusCode === 429) {
      throw new DownloaderAppError(
        'RATE_LIMITED',
        'Instagram rate limit reached for anonymous requests. Please wait a moment and try again.',
        429,
        true
      );
    }

    const html = response.body.toString('utf8');

    if (response.statusCode === 401 || /\/(?:accounts\/login|challenge)\//.test(String(response.headers.location || ''))) throw new DownloaderAppError('LOGIN_REQUIRED', 'Instagram requires login to access this media.', 403);
    if (response.statusCode === 403) throw new DownloaderAppError('PRIVATE_CONTENT', 'Instagram denied access to this media.', 403);
    if (response.statusCode < 200 || response.statusCode >= 300) throw new DownloaderAppError('EXTRACTOR_FAILURE', 'Instagram did not return public photo metadata.', 502, true);

    if (
      html.includes('loginPage') ||
      html.includes('Private Account') ||
      html.includes('This content is only available')
    ) {
      throw new DownloaderAppError(
        'PRIVATE_CONTENT',
        'This Instagram photo belongs to a private or restricted account and cannot be accessed.',
        403
      );
    }

    // Check if JSON candidate payload or OpenGraph image is present
    let candidates: Array<{ url: string; width?: number; height?: number }> = [];
    let username = validated.username || 'instagram_creator';
    let fullName = username;
    let caption = `Public photo post (${validated.shortcode})`;

    // 1. Try parsing JSON payload if returned by test/oEmbed endpoint or embedded JSON
    try {
      if (html.trim().startsWith('{')) {
        const parsedJson = JSON.parse(html);
        if (parsedJson.status === 'private') {
          throw new DownloaderAppError(
            'PRIVATE_CONTENT',
            'This Instagram post is private and cannot be downloaded.',
            403
          );
        }
        if (Array.isArray(parsedJson.image_versions2?.candidates)) {
          candidates = parsedJson.image_versions2.candidates;
        }
        if (parsedJson.user?.username) username = parsedJson.user.username;
        if (parsedJson.user?.full_name) fullName = parsedJson.user.full_name;
        if (parsedJson.caption?.text) caption = parsedJson.caption.text;
      }
    } catch (err) {
      if (err instanceof DownloaderAppError) throw err;
    }

    // 2. Fallback to extracting EmbeddedMediaImage or og:image from public embed HTML
    if (candidates.length === 0) {
      const embedImgMatch = html.match(
        /class="EmbeddedMediaImage"[^>]+src="([^"]+)"/i
      );
      const ogImgMatch = html.match(
        /<meta[^>]+property="og:image"[^>]+content="([^"]+)"/i
      );
      const userMatch = html.match(/class="UsernameText"[^>]*>([^<]+)</i);
      const captionMatch = html.match(/class="Caption"[^>]*>([\s\S]*?)<\/div>/i);

      if (userMatch && userMatch[1]) {
        username = userMatch[1].trim().replace(/^@/, '');
      }
      if (captionMatch && captionMatch[1]) {
        caption = captionMatch[1].replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
      }

      const rawUrl = (embedImgMatch?.[1] || ogImgMatch?.[1] || '').replace(
        /&amp;/g,
        '&'
      );
      if (rawUrl) {
        candidates.push({ url: rawUrl });
      }
    }

    if (candidates.length === 0) {
      throw new DownloaderAppError(
        'PRIVATE_CONTENT',
        'Instagram did not return a public image stream for this link. Verify that the post is public.',
        403
      );
    }

    // Sort highest resolution first
    const sorted = [...candidates].sort(
      (a, b) => (b.width || 0) * (b.height || 0) - (a.width || 0) * (a.height || 0)
    );

    const formats: NormalizedFormat[] = sorted.map((c, idx) => {
      const w = c.width || undefined;
      const h = c.height || undefined;
      return {
        formatId: idx === 0 ? 'photo-original' : `photo-${idx}`,
        label: w&&h ? (idx === 0 ? `Original (${w}×${h})` : `${w}×${h} JPEG`) : (idx===0?'Original image':`Image variant ${idx+1}`),
        ext: 'jpg',
        Container: 'JPEG sRGB',
        width: w,
        height: h,
        resolution: w&&h?`${w}x${h}`:'Source resolution',
        hasVideo: false,
        hasAudio: false,
        needsMerge: false,
        filesizeFormatted: 'Size unavailable',
        directUrl: c.url,
      };
    });

    const primary = sorted[0];
    const item: NormalizedMediaItem = {
      index: 0,
      itemId: validated.shortcode,
      shortcode: validated.shortcode,
      mediaType: 'photo',
      title: `Photo by @${username}`,
      thumbnailUrl: primary.url,
      ...imagePreviews(sorted),
      width: primary.width || undefined,
      height: primary.height || undefined,
      aspectRatio: primary.width&&primary.height?`${primary.width}:${primary.height}`:'Source image',
      formats,
    };

    return {
      id: validated.shortcode,
      shortcode: validated.shortcode,
      canonicalUrl: validated.canonicalUrl,
      category: 'photo',
      title: `Photo by @${username}`,
      caption,
      uploader: {
        username,
        fullName,
      },
      timestamp: Math.floor(Date.now() / 1000),
      itemCount: 1,
      isCarousel: false,
      supportsZipDownload: false,
      items: [item],
      extractorSource: 'yt-dlp+image-adapter',
    };
  }

  /**
   * Resolves legitimate public profile metadata without bulk-downloading profile posts.
   */
  public async extractPublicProfileMetadata(
    validated: ValidatedInstagramUrl,
    overrideProfileEndpoint?: string,
    signal?: AbortSignal
  ): Promise<NormalizedMediaResult> {
    const username = validated.username || validated.shortcode;
    const targetUrl =
      overrideProfileEndpoint ||
      `${
        process.env.INSTAGRAM_PUBLIC_EMBED_BASE || 'https://www.instagram.com'
      }/${encodeURIComponent(username)}/`;

    const response = await this.fetchBuffer(targetUrl,this.timeoutMs,signal);

    if (response.statusCode === 404) {
      throw new DownloaderAppError(
        'DELETED_CONTENT',
        `Instagram profile @${username} was not found.`,
        404
      );
    }

    const bodyStr = response.body.toString('utf8');
    let fullName = username;
    let bio = `Public Instagram profile (@${username})`;
    let avatarUrl = '';
    let isPrivate = false;

    try {
      if (bodyStr.trim().startsWith('{')) {
        const data = JSON.parse(bodyStr);
        fullName = data.full_name || username;
        bio = data.biography || bio;
        avatarUrl = data.profile_pic_url_hd || data.profile_pic_url || '';
        isPrivate = Boolean(data.is_private);
      }
    } catch {
      // Fallback to HTML meta tags
    }

    if (!avatarUrl) {
      const ogImg = bodyStr.match(
        /<meta[^>]+property="og:image"[^>]+content="([^"]+)"/i
      );
      const ogDesc = bodyStr.match(
        /<meta[^>]+property="og:description"[^>]+content="([^"]+)"/i
      );
      const ogTitle = bodyStr.match(
        /<meta[^>]+property="og:title"[^>]+content="([^"]+)"/i
      );
      if (ogImg?.[1]) avatarUrl = ogImg[1].replace(/&amp;/g, '&');
      if (ogDesc?.[1]) bio = ogDesc[1].replace(/&amp;/g, '&');
      if (ogTitle?.[1]) fullName = ogTitle[1].split('(@')[0].trim() || username;
    }

    // Account privacy protects posts, not an avatar already exposed by
    // this unauthenticated public response. Never query private media here.

    if (!avatarUrl) {
      throw new DownloaderAppError(
        'LOGIN_REQUIRED',
        'Instagram requires authentication to view this profile or its profile picture is restricted.',
        403
      );
    }

    const formats: NormalizedFormat[] = [
      {
        formatId: 'profile-avatar-hd',
        label: 'Profile Picture',
        ext: 'jpg',
        Container: 'JPEG sRGB',
        resolution: 'Source resolution',
        hasVideo: false,
        hasAudio: false,
        needsMerge: false,
        filesizeFormatted: 'Size unavailable',
        directUrl: avatarUrl,
      },
    ];

    return {
      id: username,
      shortcode: username,
      canonicalUrl: validated.canonicalUrl,
      category: 'profile',
      title: `${fullName} (@${username})`,
      caption: isPrivate ? `Public profile picture · Private account. ${bio}` : bio,
      uploader: {
        username,
        fullName,
        avatarUrl,
      },
      itemCount: 1,
      isCarousel: false,
      supportsZipDownload: false,
      items: [
        {
          index: 0,
          itemId: `${username}_avatar`,
          shortcode: username,
          mediaType: 'photo',
          title: `@${username} Profile Picture`,
          thumbnailUrl: avatarUrl,
          aspectRatio: 'Source image',
          formats,
        },
      ],
      extractorSource: 'profile-adapter',
      warnings: [
        'Bulk downloading of entire user profiles is unsupported by policy and upstream yt-dlp (InstagramUserIE is disabled). Only public profile metadata and avatar inspection are provided.',
      ],
    };
  }

  /**
   * Downloads a direct image URL to a target file path safely.
   */
  public async downloadImageToFile(
    imageUrl: string,
    destinationPath: string,
    signal?: AbortSignal
  ): Promise<{ bytesWritten: number; mimeType: string }> {
    const res = await this.fetchBuffer(imageUrl,this.timeoutMs,signal);
    if (res.statusCode < 200 || res.statusCode >= 300) {
      throw new DownloaderAppError(
        'EXTRACTOR_FAILURE',
        `Image download failed with HTTP ${res.statusCode}.`,
        502,
        true
      );
    }
    const contentType = String(res.headers['content-type'] || '');
    if(!/^image\/(jpeg|webp)(?:;|$)/i.test(contentType))throw new DownloaderAppError('UNSUPPORTED_MEDIA_TYPE','The image source did not return a supported photo.',422);
    const jpeg=res.body.length>=3&&res.body[0]===0xff&&res.body[1]===0xd8&&res.body[2]===0xff;
    const webp=res.body.length>=12&&res.body.toString('ascii',0,4)==='RIFF'&&res.body.toString('ascii',8,12)==='WEBP';
    if(!(contentType.includes('webp')?webp:jpeg))throw new DownloaderAppError('UNSUPPORTED_MEDIA_TYPE','The image source did not return a valid JPEG or WebP file.',422);
    if(signal?.aborted)throw new DownloaderAppError('JOB_CANCELLED','Media transfer was cancelled.',499);
    const file=await fs.promises.open(destinationPath,'wx',0o600);
    try {await file.writeFile(res.body,{signal});}
    catch(error){await file.close();await fs.promises.unlink(destinationPath).catch(()=>{});throw error;}
    finally {await file.close().catch(()=>{});}
    return {
      bytesWritten: res.body.length,
      mimeType: contentType.includes('webp') ? 'image/webp' : 'image/jpeg',
    };
  }
}
