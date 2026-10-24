"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.cancelDownloadJob = cancelDownloadJob;
exports.checkBackendHealth = checkBackendHealth;
exports.getDownloadJobStatus = getDownloadJobStatus;
exports.resolveInstagramMedia = resolveInstagramMedia;
exports.startDownloadJob = startDownloadJob;
/**
 * Frontend API Client connected to the yt-dlp Backend Endpoints:
 * - POST /api/media/resolve
 * - POST /api/media/download
 * - GET  /api/media/jobs/:jobId
 * - DELETE /api/media/jobs/:jobId
 * - GET  /api/media/download/:jobId
 * - GET  /api/health
 */
async function resolveInstagramMedia(url) {
  const res = await fetch('/api/media/resolve', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      url
    })
  });
  const payload = await res.json();
  if (!res.ok || payload.status !== 'ok') {
    throw payload.error || {
      code: 'EXTRACTOR_FAILURE',
      message: 'Failed to resolve Instagram URL.'
    };
  }
  return payload.data;
}
async function startDownloadJob(params) {
  const res = await fetch('/api/media/download', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(params)
  });
  const payload = await res.json();
  if (!res.ok || payload.status !== 'ok') {
    throw payload.error || {
      code: 'EXTRACTOR_FAILURE',
      message: 'Failed to start download job.'
    };
  }
  return payload;
}
async function getDownloadJobStatus(jobId) {
  const res = await fetch(`/api/media/jobs/${encodeURIComponent(jobId)}`);
  const payload = await res.json();
  if (!res.ok || payload.status !== 'ok') {
    throw payload.error || {
      code: 'JOB_NOT_FOUND',
      message: 'Failed to fetch job status.'
    };
  }
  return payload.job;
}
async function cancelDownloadJob(jobId) {
  const res = await fetch(`/api/media/jobs/${encodeURIComponent(jobId)}`, {
    method: 'DELETE'
  });
  const payload = await res.json();
  return payload.job;
}
async function checkBackendHealth() {
  const res = await fetch('/api/health');
  return res.json();
}