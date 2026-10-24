import { NextRequest, NextResponse } from 'next/server';
import { getApiContext } from '../../singleton';
import { DownloaderAppError } from '../../../../types/media.types';

export async function POST(req: NextRequest) {
  const ctx = getApiContext();
  try {
    const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || '127.0.0.1';
    const rl = await ctx.redisStore.checkRateLimit(ip, 'download', 15, 60);
    if (!rl.allowed) {
      throw new DownloaderAppError('RATE_LIMITED', 'Download rate limit exceeded.', 429, true);
    }
    const body = await req.json();
    const job = await ctx.downloadManager.createJob({
      url: body.url || '',
      formatId: body.formatId,
      itemIndex: body.itemIndex,
      zipCarousel: Boolean(body.zipCarousel),
    });
    return NextResponse.json(
      {
        status: 'ok',
        jobId: job.jobId,
        jobStatus: job.status,
        pollUrl: `/api/media/jobs/${job.jobId}`,
        downloadUrl: `/api/media/download/${job.jobId}`,
      },
      { status: 202 }
    );
  } catch (err: any) {
    return NextResponse.json(
      { status: 'error', error: { code: err?.code || 'EXTRACTOR_FAILURE', message: err?.userMessage || err?.message } },
      { status: err?.statusCode || 500 }
    );
  }
}
