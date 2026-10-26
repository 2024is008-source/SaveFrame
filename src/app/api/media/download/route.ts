import { NextRequest, NextResponse } from 'next/server';
import { getApiContext } from '../../singleton';
import { DownloaderAppError } from '../../../../types/media.types';
import { beginDownload, jobEvent } from '../../../../admin/analytics';
import { readMediaJson } from '../../../../api/request';

export async function POST(req: NextRequest) {
  const ctx = getApiContext();
  let analyticsId:string|undefined;
  try {
    const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || '127.0.0.1';
    const rl = await ctx.redisStore.checkRateLimit(ip, 'download', 15, 60);
    if (!rl.allowed) {
      throw new DownloaderAppError('RATE_LIMITED', 'Download rate limit exceeded.', 429, true);
    }
    const body = await readMediaJson(req);
    // Explicit, user-started playback uses the same bounded preparation queue.
    // It must not inflate download totals.
    if(body.preview !== true) analyticsId=beginDownload();
    const job = await ctx.downloadManager.createJob({
      url: body.url || '',
      formatId: body.formatId,
      itemIndex: body.itemIndex,
      itemIndices: body.itemIndices,
      zipCarousel: Boolean(body.zipCarousel),
      analyticsId,
      trackAnalytics: body.preview !== true,
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
    const known=err instanceof DownloaderAppError;
    jobEvent(analyticsId,'download_failed',null,'unknown',known ? err.code : 'INTERNAL_ERROR');
    return NextResponse.json(
      { status: 'error', error: { code: known ? err.code : 'INTERNAL_ERROR', message: known ? err.userMessage : 'Unable to prepare this download. Please try again.' } },
      { status: known ? err.statusCode : 500 }
    );
  }
}
