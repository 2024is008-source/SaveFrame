import type { DownloadJob } from '../types/media.types';

// A completed response stream is a server handoff, never proof of a browser save.
// Keep the successful milestone stable across duplicate attachment requests.
export function updateDelivery(job: DownloadJob, status: NonNullable<DownloadJob['deliveryStatus']>, code?: DownloadJob['deliveryErrorCode']) {
  if (!job.analyticsId || job.deliveryStatus === 'handed_off') return;
  job.deliveryStatus = status;
  job.deliveryErrorCode = status === 'failed' ? code : undefined;
}
