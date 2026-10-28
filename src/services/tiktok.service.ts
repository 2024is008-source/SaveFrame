import { InstagramHttpClient } from './instagram-http.service';
import { validateTikTokUrl } from '../security/url-validator';
import { DownloaderAppError, NormalizedMediaResult } from '../types/media.types';

/** Reuses bounded streaming, pinned DNS and signature checks with TikTok-only hosts. */
export class TikTokHttpClient extends InstagramHttpClient {
  protected followRedirects = true;
  validateUrl(value: string, media = false): URL {
    let url: URL;
    try { url = new URL(value); } catch { throw new DownloaderAppError('SSRF_BLOCKED', 'Invalid TikTok media URL.', 403); }
    const domains = ['tiktokcdn.com', 'tiktokcdn-us.com', 'tiktokcdn-eu.com', 'tiktokcdn-eu.net', 'byteoversea.com', 'ibytedtos.com', 'ibyteimg.com', 'muscdn.com'];
    const allowed = media ? domains.some(domain => url.hostname === domain || url.hostname.endsWith('.' + domain)) : ['tiktok.com', 'www.tiktok.com', 'm.tiktok.com', 'vm.tiktok.com', 'vt.tiktok.com'].includes(url.hostname);
    if (!allowed || url.protocol !== 'https:' || url.username || url.password || url.port) throw new DownloaderAppError('SSRF_BLOCKED', 'Only approved TikTok media hosts are allowed.', 403);
    if (!media) validateTikTokUrl(url.href);
    return url;
  }
  async resolveUrl(value: string, signal?: AbortSignal): Promise<string> {
    const { response, url } = await this.open(value, false, { timeoutMs: 15000, signal });
    response.destroy();
    return validateTikTokUrl(url.href).canonicalUrl;
  }
}

/** Parses only the actual post image list; covers and avatars are never slides. */
export function parseTikTokPhotos(html: string, canonicalUrl: string): NormalizedMediaResult {
  const validated = validateTikTokUrl(canonicalUrl);
  let item: any;
  for (const match of html.matchAll(/<script\b[^>]*\bid=["'](__UNIVERSAL_DATA_FOR_REHYDRATION__|SIGI_STATE|sigi-persisted-data)["'][^>]*>([\s\S]*?)<\/script>/g)) {
    try {
      const data = JSON.parse(match[2]);
      const scope = data.__DEFAULT_SCOPE__?.['webapp.video-detail'];
      item = scope?.itemInfo?.itemStruct || data.ItemModule?.[validated.shortcode];
      if (item?.id && String(item.id) === validated.shortcode) break;
      item = undefined;
    } catch { /* Try the next supported hydration script. */ }
  }
  const images = item?.imagePost?.images;
  if (item?.privateItem || item?.forFriend) throw new DownloaderAppError('PRIVATE_CONTENT', 'Private and restricted TikTok photo posts are not supported.', 403);
  if (!Array.isArray(images) || !images.length || images.length > 100) throw new DownloaderAppError('EXTRACTOR_FAILURE', 'TikTok did not expose this photo post. It may be private, unavailable, or restricted. Try again later.', 502, true);
  const transport = new TikTokHttpClient();
  const items = images.map((image: any, index: number) => {
    const urls = image.imageURL?.urlList || image.displayImage?.urlList || [];
    const url = urls.find((candidate: unknown) => { try { return typeof candidate === 'string' && Boolean(transport.validateUrl(candidate, true)); } catch { return false; } });
    if (!url) throw new DownloaderAppError('EXTRACTOR_FAILURE', 'One photo has no supported download URL. Try again later.', 502, true);
    const width = Number(image.imageWidth || image.width) || undefined;
    const height = Number(image.imageHeight || image.height) || undefined;
    const ext = /(?:\.webp(?:\?|$)|[?&](?:format|fm)=webp)/i.test(url) ? 'webp' as const : 'jpg' as const;
    return { index, itemId: `${validated.shortcode}_${index + 1}`, shortcode: validated.shortcode, mediaType: 'photo' as const, title: `Photo ${index + 1}`, thumbnailUrl: url, width, height, aspectRatio: width && height ? `${width}:${height}` : 'Source image', formats: [{ formatId: 'photo-original', label: 'Original image', ext, Container: ext === 'webp' ? 'WebP' : 'JPEG', resolution: width && height ? `${width}x${height}` : 'Source resolution', width, height, hasVideo: false, hasAudio: false, needsMerge: false, filesizeFormatted: 'Size available after download', directUrl: url }] };
  });
  return { id: validated.shortcode, shortcode: validated.shortcode, canonicalUrl: validated.canonicalUrl, category: items.length > 1 ? 'carousel' : 'photo', title: String(item.desc || 'TikTok photos'), caption: item.desc, uploader: { username: String(item.author?.uniqueId || validated.username || 'creator'), fullName: item.author?.nickname }, itemCount: items.length, isCarousel: items.length > 1, supportsZipDownload: items.length > 1, items, extractorSource: 'tiktok-web' };
}
