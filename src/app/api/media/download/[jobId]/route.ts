import { NextRequest, NextResponse } from 'next/server';
import * as fs from 'fs';
import { getApiContext } from '../../../singleton';
import { sanitizeFilename } from '../../../../../security/url-validator';
import { jobEvent } from '../../../../../admin/analytics';
import { DownloaderAppError } from '../../../../../types/media.types';

export async function GET(_req: NextRequest, context: { params: Promise<{ jobId: string }> }) {
  const ctx = getApiContext();
  try {
    const { jobId } = await context.params;
    const job = ctx.downloadManager.getJob(jobId);
    if (job.status !== 'completed' || !job.outputFilePath) {
      return NextResponse.json(
        { status: 'error', error: { code: 'JOB_NOT_READY', message: 'Download job is not yet completed.' } },
        { status: 409 }
      );
    }
    const stat=await fs.promises.stat(job.outputFilePath);
    if (_req.method === 'HEAD') return new NextResponse(null, {headers:{'Content-Type':job.mimeType || 'application/octet-stream','Content-Length':String(stat.size),'Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff'}});
    const file=fs.createReadStream(job.outputFilePath,{highWaterMark:65536});
    const iterator=file[Symbol.asyncIterator]();
    const release=ctx.downloadManager.retainJobFile?.(jobId)||(()=>{});
    jobEvent(job.analyticsId,'delivery_started',job.jobId,job.category);
    const body=new ReadableStream<Uint8Array>({
      async pull(controller) {
        try {
          const next=await iterator.next();
          if(next.done) { release();jobEvent(job.analyticsId,'delivery_completed',job.jobId,job.category); controller.close(); }
          else controller.enqueue(new Uint8Array(next.value));
        } catch(error) { release();jobEvent(job.analyticsId,'delivery_failed',job.jobId,job.category,'DELIVERY_STREAM_ERROR'); controller.error(error); file.destroy(); }
      },
      cancel() { release();file.destroy(); jobEvent(job.analyticsId,'delivery_failed',job.jobId,job.category,'DELIVERY_CANCELLED'); },
    });
    const extension = job.isCarouselZip ? 'zip' : job.mimeType === 'audio/mp4' ? 'm4a' : job.mimeType === 'image/webp' ? 'webp' : job.mimeType === 'image/jpeg' ? 'jpg' : 'mp4';
    const safeFilename = sanitizeFilename(job.safeFilename || `saveframe_${job.shortcode}`, extension);
    return new NextResponse(body, {
      status: 200,
      headers: {
        'Content-Type': job.mimeType || 'application/octet-stream',
        'Content-Length': String(stat.size),
        'Content-Disposition': `attachment; filename="${safeFilename}"`,
        'X-Content-Type-Options': 'nosniff',
        'Cache-Control': 'private, no-store',
      },
    });
  } catch (err: any) {
    return NextResponse.json(
      { status: 'error', error: { code: err instanceof DownloaderAppError ? err.code : 'JOB_NOT_FOUND', message: err instanceof DownloaderAppError ? err.userMessage : 'The prepared file is unavailable or has expired.' } },
      { status: err instanceof DownloaderAppError ? err.statusCode : 404 }
    );
  }
}
