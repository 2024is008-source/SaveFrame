import { NormalizedMediaResult, DownloadJob, HealthStatus } from '../types/media.types';

export type MediaCategory = 'photo' | 'reels' | 'video' | 'story' | 'profile';

/**
 * Frontend API Client connected to the yt-dlp Backend Endpoints:
 * - POST /api/media/resolve
 * - POST /api/media/download
 * - GET  /api/media/jobs/:jobId
 * - DELETE /api/media/jobs/:jobId
 * - GET  /api/media/download/:jobId
 * - GET  /api/health
 */
export async function resolveInstagramMedia(url: string): Promise<NormalizedMediaResult> {
  const res = await fetch('/api/media/resolve', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ url }),
  });
  const payload = await res.json();
  if (!res.ok || payload.status !== 'ok') {
    throw payload.error || { code: 'EXTRACTOR_FAILURE', message: 'Failed to resolve Instagram URL.' };
  }
  return payload.data as NormalizedMediaResult;
}

export async function startDownloadJob(params: {
  url: string;
  formatId?: string;
  itemIndex?: number;
  zipCarousel?: boolean;
}): Promise<{ jobId: string; jobStatus: string; pollUrl: string; downloadUrl: string }> {
  const res = await fetch('/api/media/download', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params),
  });
  const payload = await res.json();
  if (!res.ok || payload.status !== 'ok') {
    throw payload.error || { code: 'EXTRACTOR_FAILURE', message: 'Failed to start download job.' };
  }
  return payload;
}

export async function getDownloadJobStatus(jobId: string): Promise<DownloadJob> {
  const res = await fetch(`/api/media/jobs/${encodeURIComponent(jobId)}`);
  const payload = await res.json();
  if (!res.ok || payload.status !== 'ok') {
    throw payload.error || { code: 'JOB_NOT_FOUND', message: 'Failed to fetch job status.' };
  }
  return payload.job as DownloadJob;
}

export async function cancelDownloadJob(jobId: string): Promise<DownloadJob> {
  const res = await fetch(`/api/media/jobs/${encodeURIComponent(jobId)}`, {
    method: 'DELETE',
  });
  const payload = await res.json();
  return payload.job as DownloadJob;
}

export async function checkBackendHealth(): Promise<HealthStatus> {
  const res = await fetch('/api/health');
  return res.json();
}
