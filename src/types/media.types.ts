export type InstagramMediaCategory =
  | 'reel'
  | 'video'
  | 'photo'
  | 'carousel'
  | 'story'
  | 'profile';

export type ErrorCode =
  | 'INTERNAL_ERROR'
  | 'INVALID_URL'
  | 'UNSUPPORTED_DOMAIN'
  | 'SSRF_BLOCKED'
  | 'UNSUPPORTED_MEDIA_TYPE'
  | 'UNSUPPORTED_OPERATION'
  | 'PRIVATE_CONTENT'
  | 'DELETED_CONTENT'
  | 'EXPIRED_STORY'
  | 'NO_ACTIVE_STORIES'
  | 'INVALID_STORY_LINK'
  | 'LOGIN_REQUIRED'
  | 'RATE_LIMITED'
  | 'EXTRACTOR_FAILURE'
  | 'DOWNLOAD_TIMEOUT'
  | 'FILE_TOO_LARGE'
  | 'FFMPEG_ERROR'
  | 'INSUFFICIENT_DISK_SPACE'
  | 'YTDLP_NOT_INSTALLED'
  | 'JOB_NOT_FOUND'
  | 'JOB_CANCELLED'
  | 'JOB_NOT_READY';

export class DownloaderAppError extends Error {
  // API route bundles and a retained development worker can hold different
  // copies of this class. Recognize real Error instances by our stable fields,
  // so an upstream LOGIN_REQUIRED does not become a false INTERNAL_ERROR.
  static [Symbol.hasInstance](value: unknown): boolean {
    if (!(value instanceof Error)) return false;
    const error = value as Partial<DownloaderAppError>;
    return error.name === 'DownloaderAppError' && typeof error.code === 'string' &&
      typeof error.userMessage === 'string' && typeof error.retryable === 'boolean' &&
      Number.isInteger(error.statusCode) && Number(error.statusCode) >= 400 && Number(error.statusCode) <= 599;
  }
  public readonly code: ErrorCode;
  public readonly statusCode: number;
  public readonly userMessage: string;
  public readonly retryable: boolean;

  constructor(
    code: ErrorCode,
    userMessage: string,
    statusCode = 400,
    retryable = false,
    internalMessage?: string
  ) {
    super(internalMessage || userMessage);
    this.name = 'DownloaderAppError';
    this.code = code;
    this.userMessage = userMessage;
    this.statusCode = statusCode;
    this.retryable = retryable;
  }
}

export interface NormalizedFormat {
  formatId: string;
  sourceFormatId?: string; // Audio extracted from a combined video/audio source.
  label: string;
  ext: 'mp4' | 'm4a' | 'jpg' | 'webp';
  Container: string;
  width?: number;
  height?: number;
  resolution: string;
  fps?: number;
  vcodec?: string;
  acodec?: string;
  hasVideo: boolean;
  hasAudio: boolean;
  needsMerge: boolean;
  filesizeBytes?: number;
  filesizeFormatted: string;
  directUrl?: string; // Kept internal on server; never exposed as raw proxy URL
}

export interface NormalizedMediaItem {
  index: number;
  itemId: string;
  shortcode: string;
  mediaType: 'video' | 'photo';
  title: string;
  thumbnailUrl: string;
  thumbnailSmallUrl?: string;
  imagePreviewUrl?: string;
  width?: number;
  height?: number;
  aspectRatio: string;
  durationSeconds?: number;
  formats: NormalizedFormat[];
}

export interface NormalizedMediaResult {
  id: string;
  shortcode: string;
  canonicalUrl: string;
  category: InstagramMediaCategory;
  title: string;
  caption?: string;
  uploader: {
    username: string;
    fullName?: string;
    avatarUrl?: string;
    isVerified?: boolean;
  };
  timestamp?: number;
  durationSeconds?: number;
  itemCount: number;
  isCarousel: boolean;
  supportsZipDownload: boolean;
  items: NormalizedMediaItem[];
  extractorSource: 'yt-dlp' | 'yt-dlp+image-adapter' | 'profile-adapter' | 'story-http' | 'gallery-dl' | 'instagrapi';
  warnings?: string[];
}

export type JobStatus =
  | 'queued'
  | 'processing'
  | 'merging'
  | 'packaging_zip'
  | 'completed'
  | 'failed'
  | 'cancelled';

export interface DownloadJob {
  jobId: string;
  analyticsId?: string;
  url: string;
  shortcode: string;
  category: InstagramMediaCategory;
  formatId: string;
  itemIndex?: number;
  itemIndices?: number[];
  isCarouselZip: boolean;
  status: JobStatus;
  progress: number;
  downloadedBytes: number;
  totalBytes?: number;
  etaSeconds?: number;
  createdAt: number;
  updatedAt: number;
  expiresAt: number;
  outputFilePath?: string;
  safeFilename?: string;
  mimeType?: string;
  filesizeBytes?: number;
  error?: {
    code: ErrorCode;
    message: string;
    retryable: boolean;
  };
}

export interface HealthStatus {
  status: 'ok' | 'degraded' | 'unhealthy';
  timestamp: string;
  uptimeSeconds: number;
  components: {
    nodejs: { ok: boolean; version: string };
    ytDlp: { ok: boolean; version?: string; binaryPath?: string; message?: string };
    ffmpeg: { ok: boolean; version?: string; binaryPath?: string; message?: string };
    redis: { ok: boolean; mode: 'redis' | 'memory-fallback'; latencyMs?: number };
    storage: {
      ok: boolean;
      tempDir: string;
      freeBytes: number;
      freeFormatted: string;
      activeJobs: number;
    };
  };
}
