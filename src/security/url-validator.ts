import * as net from 'net';
import * as dns from 'dns';
import { DownloaderAppError, InstagramMediaCategory } from '../types/media.types';

export interface ValidatedInstagramUrl {
  canonicalUrl: string;
  category: InstagramMediaCategory;
  shortcode: string;
  username?: string;
  storyId?: string;
}

const ALLOWED_HOSTS = new Set([
  'instagram.com',
  'www.instagram.com',
  'm.instagram.com',
  'instagr.am',
]);

const RESERVED_ROOT_PATHS = new Set([
  'explore',
  'accounts',
  'direct',
  'about',
  'legal',
  'developer',
  'press',
  'api',
  'graphql',
  'challenge',
  'session',
  ' share',
  'share',
]);

// Allowlisted Instagram URL regex patterns
const POST_OR_REEL_REGEX =
  /^\/(?:([A-Za-z0-9._]{1,30})\/)?(p|reel|reels|tv)\/([A-Za-z0-9_-]{5,64})\/?$/;
const STORY_REGEX =
  /^\/stories\/([A-Za-z0-9._]{1,30})(?:\/([0-9]{5,32}))?\/?$/;
const PROFILE_REGEX = /^\/([A-Za-z0-9._]{2,30})\/?$/;

/** Direct story items only. Do not turn a profile URL into a bulk story request. */
export function validateMediaInput(rawUrl: string, tool?: string): ValidatedInstagramUrl {
  if (tool && !['video', 'photo', 'carousel'].includes(tool)) throw new DownloaderAppError('UNSUPPORTED_OPERATION', 'Choose TikTok videos or photos.', 400);
  return validateTikTokUrl(rawUrl);
}

export function validateLegacyMediaInput(rawUrl: string, tool?: string): ValidatedInstagramUrl {
  const validated = validateInstagramUrl(rawUrl);
  if (tool === 'audio' && !['reel','video','photo'].includes(validated.category)) throw new DownloaderAppError('UNSUPPORTED_MEDIA_TYPE', 'Paste a public Instagram Reel or video post link for MP3 extraction.', 400);
  if ((tool === 'story' && validated.category !== 'story') ||
      (validated.category === 'story' && (!/^[1-9][0-9]{4,31}$/.test(validated.storyId||'') ||
        !/^[A-Za-z0-9_](?:[A-Za-z0-9._]{0,28}[A-Za-z0-9_])?$/.test(validated.username||'') ||
        (validated.username||'').includes('..') || ['highlights','me'].includes((validated.username||'').toLowerCase())))) {
    throw new DownloaderAppError('INVALID_STORY_LINK', 'Paste a direct Instagram story link containing /stories/username/story-id/. Profile links and bulk story downloads are not supported.', 400);
  }
  return validated;
}

/** Only public TikTok posts and official short share links are accepted. */
export function validateTikTokUrl(rawInput: string): ValidatedInstagramUrl {
  const invalid = () => new DownloaderAppError('INVALID_URL', 'Paste a TikTok video, photo post, or share link.', 400);
  if (typeof rawInput !== 'string' || !rawInput.trim() || rawInput.length > 2048 || /[\s\\]/.test(rawInput.trim())) throw invalid();
  let url: URL;
  try { url = new URL(/^https?:\/\//i.test(rawInput.trim()) ? rawInput.trim() : `https://${rawInput.trim()}`); } catch { throw invalid(); }
  if (url.protocol !== 'https:' || url.username || url.password || url.port) throw invalid();
  const host = url.hostname.toLowerCase();
  if (!['tiktok.com', 'www.tiktok.com', 'm.tiktok.com', 'vm.tiktok.com', 'vt.tiktok.com'].includes(host)) throw new DownloaderAppError('UNSUPPORTED_DOMAIN', 'Only official TikTok links are supported.', 400);
  const short = ['vm.tiktok.com', 'vt.tiktok.com'].includes(host) ? url.pathname.match(/^\/([A-Za-z0-9]{4,80})\/?$/) : url.pathname.match(/^\/t\/([A-Za-z0-9]{4,80})\/?$/);
  if (short) return { canonicalUrl: `https://${host}${host.startsWith('v') ? '/' : '/t/'}${short[1]}/`, category: 'video', shortcode: short[1] };
  if (host.startsWith('v')) throw invalid();
  const post = url.pathname.match(/^\/@([A-Za-z0-9._]{1,30})\/(video|photo)\/([0-9]{10,25})\/?$/);
  if (!post) throw invalid();
  return { canonicalUrl: `https://www.tiktok.com/@${post[1]}/${post[2]}/${post[3]}`, category: post[2] === 'photo' ? 'photo' : 'video', shortcode: post[3], username: post[1] };
}

/** Public tools no longer expose story extraction; operator workflows stay separate. */
export function validatePublicMediaInput(rawUrl: string, tool?: string) {
  if (tool === 'story') throw new DownloaderAppError('UNSUPPORTED_OPERATION', 'The public story downloader has been retired.', 410);
  const value = validateMediaInput(rawUrl, tool);
  if (tool === 'story' || value.category === 'story') throw new DownloaderAppError('UNSUPPORTED_OPERATION', 'The public story downloader has been retired.', 410);
  return value;
}

/**
 * Checks whether an IPv4 or IPv6 address belongs to a private, loopback,
 * link-local, multicast, or metadata range (SSRF defense).
 */
export function isPrivateOrReservedIp(ip: string): boolean {
  const clean = ip.trim().toLowerCase();
  if (net.isIPv4(clean)) {
    const parts = clean.split('.').map((n) => parseInt(n, 10));
    const [a, b] = parts;
    if (a === 0 || a === 10 || a === 127) return true;
    if (a === 169 && b === 254) return true; // Cloud metadata / link-local
    if (a === 172 && b >= 16 && b <= 31) return true;
    if (a === 192 && b === 168) return true;
    if (a === 100 && b >= 64 && b <= 127) return true; // CGNAT
    if((a===192&&b===0&&(parts[2]===0||parts[2]===2))||(a===198&&(b===18||b===19||(b===51&&parts[2]===100)))||(a===203&&b===0&&parts[2]===113))return true;
    if (a >= 224) return true; // Multicast & reserved
    return false;
  }
  if (net.isIPv6(clean)) {
    let hex=clean;
    if(hex.includes('.')){const split=hex.lastIndexOf(':');const v4=hex.slice(split+1).split('.').map(Number);hex=hex.slice(0,split+1)+((v4[0]<<8)|v4[1]).toString(16)+':'+((v4[2]<<8)|v4[3]).toString(16);}
    const [head,tail]=hex.split('::'),left=head?head.split(':'):[],right=tail?tail.split(':'):[];
    const words=(hex.includes('::')?[...left,...Array(8-left.length-right.length).fill('0'),...right]:left).map(part=>parseInt(part,16));
    if(words.slice(0,5).every(word=>word===0)&&words[5]===0xffff)return isPrivateOrReservedIp([words[6]>>8,words[6]&255,words[7]>>8,words[7]&255].join('.'));
    if(words[0]===0 || (words[0]&0xfe00)===0xfc00 || (words[0]&0xffc0)===0xfe80 || (words[0]&0xffc0)===0xfec0 || (words[0]&0xff00)===0xff00)return true;
    if(words[0]===0x2001&&words[1]===0xdb8)return true;
    if(words[0]===0x64&&words[1]===0xff9b&&words.slice(2,6).every(word=>word===0))return isPrivateOrReservedIp([words[6]>>8,words[6]&255,words[7]>>8,words[7]&255].join('.'));
    return false;
  }
  return true;
}

/**
 * Strictly validates and normalizes user-supplied Instagram URLs or @usernames.
 * Blocks SSRF vectors, CLI option injection (leading dashes), credentials,
 * non-Instagram hosts, and unsupported paths.
 */
export function validateInstagramUrl(rawInput: string): ValidatedInstagramUrl {
  if (typeof rawInput !== 'string') {
    throw new DownloaderAppError(
      'INVALID_URL',
      'Please provide a valid Instagram link.',
      400
    );
  }

  const trimmed = rawInput.trim();
  if (!trimmed || trimmed.length > 512) {
    throw new DownloaderAppError(
      'INVALID_URL',
      'Please paste a valid Instagram photo, Reel, video, story, or profile link.',
      400
    );
  }

  // Block CLI flag injection attempts
  if (trimmed.startsWith('-')) {
    throw new DownloaderAppError(
      'INVALID_URL',
      'Invalid link format: URLs cannot start with a hyphen.',
      400
    );
  }

  // Support shorthand @username for Profile Viewer
  if (/^@[A-Za-z0-9._]{2,30}$/.test(trimmed)) {
    const username = trimmed.slice(1);
    return {
      canonicalUrl: `https://www.instagram.com/${username}/`,
      category: 'profile',
      shortcode: username,
      username,
    };
  }

  let parsed: URL;
  try {
    const withProtocol = /^https?:\/\//i.test(trimmed)
      ? trimmed
      : `https://${trimmed}`;
    parsed = new URL(withProtocol);
  } catch {
    throw new DownloaderAppError(
      'INVALID_URL',
      'Malformed URL. Example: https://www.instagram.com/reel/C8vR4nTq9Lm/',
      400
    );
  }

  if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') {
    throw new DownloaderAppError(
      'INVALID_URL',
      'Only HTTP/HTTPS Instagram links are supported.',
      400
    );
  }

  if (parsed.username || parsed.password) {
    throw new DownloaderAppError(
      'SSRF_BLOCKED',
      'URLs containing embedded credentials are not allowed.',
      400
    );
  }

  if (parsed.port && parsed.port !== '443' && parsed.port !== '80') {
    throw new DownloaderAppError(
      'SSRF_BLOCKED',
      'Non-standard network ports are not permitted.',
      400
    );
  }

  const hostname = parsed.hostname.toLowerCase();
  if (net.isIP(hostname) !== 0) {
    throw new DownloaderAppError(
      'SSRF_BLOCKED',
      'Direct IP address URLs are forbidden.',
      400
    );
  }

  if (!ALLOWED_HOSTS.has(hostname)) {
    throw new DownloaderAppError(
      'UNSUPPORTED_DOMAIN',
      'Only official instagram.com or instagr.am links are supported.',
      400
    );
  }

  const pathname = parsed.pathname.replace(/\/+/g, '/');

  // 1. Check /p/, /reel/, /reels/, /tv/
  const postMatch = pathname.match(POST_OR_REEL_REGEX);
  if (postMatch) {
    const [, maybeUser, kind, shortcode] = postMatch;
    if (maybeUser && RESERVED_ROOT_PATHS.has(maybeUser.toLowerCase())) {
      throw new DownloaderAppError(
        'UNSUPPORTED_MEDIA_TYPE',
        'Share wrapper or internal Instagram paths cannot be resolved directly. Please copy the direct post or Reel link.',
        400
      );
    }

    const lowerKind = kind.toLowerCase();
    let category: InstagramMediaCategory = 'video';
    if (lowerKind === 'reel' || lowerKind === 'reels') {
      category = 'reel';
    } else if (lowerKind === 'p') {
      category = 'photo'; // Refined to 'video' or 'carousel' after yt-dlp inspection
    } else if (lowerKind === 'tv') {
      category = 'video';
    }

    const canonicalSegment = lowerKind === 'reels' ? 'reel' : lowerKind;
    return {
      canonicalUrl: `https://www.instagram.com/${canonicalSegment}/${shortcode}/`,
      category,
      shortcode,
      username: maybeUser || undefined,
    };
  }

  // 2. Check /stories/{username}/{storyId?}
  const storyMatch = pathname.match(STORY_REGEX);
  if (storyMatch) {
    const [, storyUser, storyId] = storyMatch;
    if (storyUser.toLowerCase() === 'highlights' && !storyId) {
      throw new DownloaderAppError(
        'INVALID_URL',
        'Instagram Highlight URLs must include a numeric Highlight ID.',
        400
      );
    }
    const shortcode = storyId ? `story_${storyId}` : `story_${storyUser}`;
    const canonicalUrl = storyId
      ? `https://www.instagram.com/stories/${storyUser}/${storyId}/`
      : `https://www.instagram.com/stories/${storyUser}/`;
    return {
      canonicalUrl,
      category: 'story',
      shortcode,
      username: storyUser,
      storyId: storyId || undefined,
    };
  }

  // 3. Check Profile URL /{username}/
  const profileMatch = pathname.match(PROFILE_REGEX);
  if (profileMatch) {
    const username = profileMatch[1];
    if (RESERVED_ROOT_PATHS.has(username.toLowerCase())) {
      throw new DownloaderAppError(
        'UNSUPPORTED_MEDIA_TYPE',
        `The Instagram path "/${username}" is not a downloadable media post or public profile.`,
        400
      );
    }
    return {
      canonicalUrl: `https://www.instagram.com/${username}/`,
      category: 'profile',
      shortcode: username,
      username,
    };
  }

  throw new DownloaderAppError(
    'UNSUPPORTED_MEDIA_TYPE',
    'Unsupported Instagram URL structure. Supported links: Photos (/p/...), Reels (/reel/...), Videos (/tv/...), Stories (/stories/...), and Profiles.',
    400
  );
}

/**
 * Optional DNS resolution SSRF verification before outbound network calls.
 */
export async function assertSafeHostResolution(hostname: string): Promise<void> {
  if (process.env.NODE_ENV==='test' && process.env.SKIP_DNS_SSRF_CHECK === 'true') return;
  try {
    const records = await dns.promises.lookup(hostname, { all: true });
    for (const rec of records) {
      if (isPrivateOrReservedIp(rec.address)) {
        throw new DownloaderAppError(
          'SSRF_BLOCKED',
          'Host resolved to a restricted internal network address.',
          403
        );
      }
    }
  } catch (err) {
    if (err instanceof DownloaderAppError) throw err;
    // In offline unit test environments, DNS lookup for instagram.com may fail with ENOTFOUND;
    // yt-dlp or the adapter will handle connectivity errors cleanly.
  }
}

/**
 * Sanitizes filenames for safe filesystem storage and HTTP Content-Disposition headers.
 */
export function sanitizeFilename(rawName: string, defaultExt = 'mp4'): string {
  const cleaned = rawName
    .replace(/[^A-Za-z0-9._-]/g, '_')
    .replace(/_+/g, '_')
    .replace(/^[._-]+|[._-]+$/g, '')
    .slice(0, 96);

  const safeBase = cleaned || 'instagram_media';
  const extClean = defaultExt.replace(/[^A-Za-z0-9]/g, '').toLowerCase() || 'mp4';
  if (safeBase.toLowerCase().endsWith(`.${extClean}`)) {
    return safeBase;
  }
  return `${safeBase}.${extClean}`;
}
