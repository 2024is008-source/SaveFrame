import { NextResponse } from 'next/server';
import { getApiContext } from '../singleton';

export async function GET() {
  const ctx = getApiContext();
  const [bins, redis, storage] = await Promise.all([
    ctx.ytDlpService.checkHealth(),
    ctx.redisStore.checkHealth(),
    ctx.downloadManager.getStorageHealth(),
  ]);
  const ok = bins.ytDlp.ok && bins.ffmpeg.ok && storage.ok;
  return NextResponse.json(
    {
      status: ok ? 'ok' : 'degraded',
      timestamp: new Date().toISOString(),
      uptimeSeconds: Math.floor((Date.now() - ctx.startedAt) / 1000),
      components: {
        nodejs: { ok: true, version: process.version },
        ytDlp: bins.ytDlp,
        ffmpeg: bins.ffmpeg,
        redis,
        storage,
      },
    },
    { status: ok ? 200 : 503 }
  );
}
