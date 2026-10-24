"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.InstagramAuthorizedAdapters = void 0;
var https = _interopRequireWildcard(require("https"));
var http = _interopRequireWildcard(require("http"));
var fs = _interopRequireWildcard(require("fs"));
var _media = require("../types/media.types");
function _getRequireWildcardCache(nodeInterop) { if (typeof WeakMap !== "function") return null; var cacheBabelInterop = new WeakMap(); var cacheNodeInterop = new WeakMap(); return (_getRequireWildcardCache = function (nodeInterop) { return nodeInterop ? cacheNodeInterop : cacheBabelInterop; })(nodeInterop); }
function _interopRequireWildcard(obj, nodeInterop) { if (!nodeInterop && obj && obj.__esModule) { return obj; } if (obj === null || typeof obj !== "object" && typeof obj !== "function") { return { default: obj }; } var cache = _getRequireWildcardCache(nodeInterop); if (cache && cache.has(obj)) { return cache.get(obj); } var newObj = {}; var hasPropertyDescriptor = Object.defineProperty && Object.getOwnPropertyDescriptor; for (var key in obj) { if (key !== "default" && Object.prototype.hasOwnProperty.call(obj, key)) { var desc = hasPropertyDescriptor ? Object.getOwnPropertyDescriptor(obj, key) : null; if (desc && (desc.get || desc.set)) { Object.defineProperty(newObj, key, desc); } else { newObj[key] = obj[key]; } } } newObj.default = obj; if (cache) { cache.set(obj, newObj); } return newObj; }
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
class InstagramAuthorizedAdapters {
  constructor(options) {
    this.timeoutMs = options?.timeoutMs ?? 15000;
    this.maxBytes = options?.maxBytes ?? 25 * 1024 * 1024; // 25 MB max image size
  }

  /**
   * Performs a safe, size-bounded HTTP/HTTPS GET request without shell execution.
   */
  fetchBuffer(targetUrl, timeoutMs = this.timeoutMs) {
    return new Promise((resolve, reject) => {
      const parsed = new URL(targetUrl);
      const client = parsed.protocol === 'https:' ? https : http;
      const req = client.request(parsed, {
        method: 'GET',
        timeout: timeoutMs,
        headers: {
          'User-Agent': 'Mozilla/5.0 (compatible; SaveFrameMediaUtility/1.0; +https://saveframe.app)',
          Accept: 'text/html,application/json,image/jpeg,image/webp,*/*;q=0.8'
        }
      }, res => {
        const statusCode = res.statusCode || 500;
        const chunks = [];
        let received = 0;
        res.on('data', chunk => {
          received += chunk.length;
          if (received > this.maxBytes) {
            req.destroy();
            reject(new _media.DownloaderAppError('FILE_TOO_LARGE', `Media file exceeds the maximum allowed size (${Math.round(this.maxBytes / (1024 * 1024))} MB).`, 413));
            return;
          }
          chunks.push(chunk);
        });
        res.on('end', () => {
          resolve({
            statusCode,
            headers: res.headers,
            body: Buffer.concat(chunks)
          });
        });
      });
      req.on('timeout', () => {
        req.destroy();
        reject(new _media.DownloaderAppError('DOWNLOAD_TIMEOUT', 'Timed out while fetching public Instagram metadata.', 504, true));
      });
      req.on('error', err => {
        reject(new _media.DownloaderAppError('EXTRACTOR_FAILURE', 'Unable to reach Instagram public media endpoint.', 502, true, err.message));
      });
      req.end();
    });
  }

  /**
   * Extracts public single-photo metadata from an Instagram `/p/{shortcode}/` embed/public page
   * when `yt-dlp` reports "There is no video in this post".
   */
  async extractPublicPhotoPost(validated, overrideEmbedUrl) {
    const targetUrl = overrideEmbedUrl || `${process.env.INSTAGRAM_PUBLIC_EMBED_BASE || 'https://www.instagram.com'}/p/${validated.shortcode}/embed/captioned/`;
    const response = await this.fetchBuffer(targetUrl);
    if (response.statusCode === 404) {
      throw new _media.DownloaderAppError('DELETED_CONTENT', 'This Instagram photo post was not found or has been deleted.', 404);
    }
    if (response.statusCode === 429) {
      throw new _media.DownloaderAppError('RATE_LIMITED', 'Instagram rate limit reached for anonymous requests. Please wait a moment and try again.', 429, true);
    }
    const html = response.body.toString('utf8');
    if (html.includes('loginPage') || html.includes('Private Account') || html.includes('This content is only available')) {
      throw new _media.DownloaderAppError('PRIVATE_CONTENT', 'This Instagram photo belongs to a private or restricted account and cannot be accessed.', 403);
    }

    // Check if JSON candidate payload or OpenGraph image is present
    let candidates = [];
    let username = validated.username || 'instagram_creator';
    let fullName = username;
    let caption = `Public photo post (${validated.shortcode})`;

    // 1. Try parsing JSON payload if returned by test/oEmbed endpoint or embedded JSON
    try {
      if (html.trim().startsWith('{')) {
        const parsedJson = JSON.parse(html);
        if (parsedJson.status === 'private') {
          throw new _media.DownloaderAppError('PRIVATE_CONTENT', 'This Instagram post is private and cannot be downloaded.', 403);
        }
        if (Array.isArray(parsedJson.image_versions2?.candidates)) {
          candidates = parsedJson.image_versions2.candidates;
        }
        if (parsedJson.user?.username) username = parsedJson.user.username;
        if (parsedJson.user?.full_name) fullName = parsedJson.user.full_name;
        if (parsedJson.caption?.text) caption = parsedJson.caption.text;
      }
    } catch (err) {
      if (err instanceof _media.DownloaderAppError) throw err;
    }

    // 2. Fallback to extracting EmbeddedMediaImage or og:image from public embed HTML
    if (candidates.length === 0) {
      const embedImgMatch = html.match(/class="EmbeddedMediaImage"[^>]+src="([^"]+)"/i);
      const ogImgMatch = html.match(/<meta[^>]+property="og:image"[^>]+content="([^"]+)"/i);
      const userMatch = html.match(/class="UsernameText"[^>]*>([^<]+)</i);
      const captionMatch = html.match(/class="Caption"[^>]*>([\s\S]*?)<\/div>/i);
      if (userMatch && userMatch[1]) {
        username = userMatch[1].trim().replace(/^@/, '');
      }
      if (captionMatch && captionMatch[1]) {
        caption = captionMatch[1].replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
      }
      const rawUrl = (embedImgMatch?.[1] || ogImgMatch?.[1] || '').replace(/&amp;/g, '&');
      if (rawUrl) {
        candidates.push({
          url: rawUrl,
          width: 1080,
          height: 1350
        });
      }
    }
    if (candidates.length === 0) {
      throw new _media.DownloaderAppError('PRIVATE_CONTENT', 'Instagram did not return a public image stream for this link. Verify that the post is public.', 403);
    }

    // Sort highest resolution first
    const sorted = [...candidates].sort((a, b) => (b.width || 1080) * (b.height || 1080) - (a.width || 1080) * (a.height || 1080));
    const formats = sorted.map((c, idx) => {
      const w = c.width || 1080;
      const h = c.height || 1350;
      return {
        formatId: idx === 0 ? 'photo-original' : `photo-${w}w`,
        label: idx === 0 ? `Original (${w}×${h})` : `${w}×${h} JPEG`,
        ext: 'jpg',
        Container: 'JPEG sRGB',
        width: w,
        height: h,
        resolution: `${w}x${h}`,
        hasVideo: false,
        hasAudio: false,
        needsMerge: false,
        filesizeFormatted: idx === 0 ? '~1.2 MB' : '~540 KB',
        directUrl: c.url
      };
    });
    const primary = sorted[0];
    const item = {
      index: 0,
      itemId: validated.shortcode,
      shortcode: validated.shortcode,
      mediaType: 'photo',
      title: `Photo by @${username}`,
      thumbnailUrl: primary.url,
      width: primary.width || 1080,
      height: primary.height || 1350,
      aspectRatio: `${primary.width || 1080}:${primary.height || 1350}`,
      formats
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
        fullName
      },
      timestamp: Math.floor(Date.now() / 1000),
      itemCount: 1,
      isCarousel: false,
      supportsZipDownload: false,
      items: [item],
      extractorSource: 'yt-dlp+image-adapter'
    };
  }

  /**
   * Resolves legitimate public profile metadata without bulk-downloading profile posts.
   */
  async extractPublicProfileMetadata(validated, overrideProfileEndpoint) {
    const username = validated.username || validated.shortcode;
    const targetUrl = overrideProfileEndpoint || `${process.env.INSTAGRAM_PUBLIC_EMBED_BASE || 'https://www.instagram.com'}/${encodeURIComponent(username)}/`;
    const response = await this.fetchBuffer(targetUrl);
    if (response.statusCode === 404) {
      throw new _media.DownloaderAppError('DELETED_CONTENT', `Instagram profile @${username} was not found.`, 404);
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
      const ogImg = bodyStr.match(/<meta[^>]+property="og:image"[^>]+content="([^"]+)"/i);
      const ogDesc = bodyStr.match(/<meta[^>]+property="og:description"[^>]+content="([^"]+)"/i);
      const ogTitle = bodyStr.match(/<meta[^>]+property="og:title"[^>]+content="([^"]+)"/i);
      if (ogImg?.[1]) avatarUrl = ogImg[1].replace(/&amp;/g, '&');
      if (ogDesc?.[1]) bio = ogDesc[1].replace(/&amp;/g, '&');
      if (ogTitle?.[1]) fullName = ogTitle[1].split('(@')[0].trim() || username;
    }
    if (!avatarUrl) {
      throw new _media.DownloaderAppError('LOGIN_REQUIRED', 'Instagram requires authentication to view this profile or its profile picture is restricted.', 403);
    }
    const formats = [{
      formatId: 'profile-avatar-hd',
      label: 'Profile Picture (HD)',
      ext: 'jpg',
      Container: 'JPEG sRGB',
      width: 1080,
      height: 1080,
      resolution: '1080x1080',
      hasVideo: false,
      hasAudio: false,
      needsMerge: false,
      filesizeFormatted: '~380 KB',
      directUrl: avatarUrl
    }];
    return {
      id: username,
      shortcode: username,
      canonicalUrl: validated.canonicalUrl,
      category: 'profile',
      title: `${fullName} (@${username})`,
      caption: isPrivate ? `[Private Account] ${bio}` : bio,
      uploader: {
        username,
        fullName,
        avatarUrl
      },
      itemCount: 1,
      isCarousel: false,
      supportsZipDownload: false,
      items: [{
        index: 0,
        itemId: `${username}_avatar`,
        shortcode: username,
        mediaType: 'photo',
        title: `@${username} Profile Picture`,
        thumbnailUrl: avatarUrl,
        width: 1080,
        height: 1080,
        aspectRatio: '1:1',
        formats
      }],
      extractorSource: 'profile-adapter',
      warnings: ['Bulk downloading of entire user profiles is unsupported by policy and upstream yt-dlp (InstagramUserIE is disabled). Only public profile metadata and avatar inspection are provided.']
    };
  }

  /**
   * Downloads a direct image URL to a target file path safely.
   */
  async downloadImageToFile(imageUrl, destinationPath) {
    const res = await this.fetchBuffer(imageUrl);
    if (res.statusCode < 200 || res.statusCode >= 300) {
      throw new _media.DownloaderAppError('EXTRACTOR_FAILURE', `Image download failed with HTTP ${res.statusCode}.`, 502, true);
    }
    await fs.promises.writeFile(destinationPath, res.body, {
      mode: 0o600
    });
    const contentType = String(res.headers['content-type'] || 'image/jpeg');
    return {
      bytesWritten: res.body.length,
      mimeType: contentType.includes('webp') ? 'image/webp' : 'image/jpeg'
    };
  }
}
exports.InstagramAuthorizedAdapters = InstagramAuthorizedAdapters;