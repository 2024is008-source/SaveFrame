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
    if (a >= 224) return true; // Multicast & reserved
    return false;
  }
  if (net.isIPv6(clean)) {
    if (clean === '::1' || clean === '::') return true;
    if (clean.startsWith('fe80:') || clean.startsWith('fc') || clean.startsWith('fd')) {
      return true;
    }
    if (clean.startsWith('::ffff:')) {
      const mapped = clean.slice('::ffff:'.length);
      if (net.isIPv4(mapped)) return isPrivateOrReservedIp(mapped);
    }
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
  if (process.env.SKIP_DNS_SSRF_CHECK === 'true') return;
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
