import { NextRequest, NextResponse } from 'next/server';
import * as fs from 'fs';
import { getApiContext } from '../../../singleton';
import { sanitizeFilename } from '../../../../../security/url-validator';
import { jobEvent } from '../../../../../admin/analytics';
import { DownloaderAppError } from '../../../../../types/media.types';
import { byteRange } from '../../../../../api/byte-range';
import { updateDelivery } from '../../../../../lib/download-delivery';

export async function GET(_req: NextRequest, context: { params: Promise<{ jobId: string }> }) {
  const ctx = getApiContext();
  let unavailable: (() => void) | undefined;
  try {
    const { jobId } = await context.params;
    const job = ctx.downloadManager.getJob(jobId);
    if (job.status !== 'completed' || !job.outputFilePath) {
      return NextResponse.json(
        { status: 'error', error: { code: 'JOB_NOT_READY', message: 'Download job is not yet completed.' } },
        { status: 409 }
      );
    }
    const inline = new URL(_req.url).searchParams.get('preview') === '1';
    if (!inline && _req.method !== 'HEAD') unavailable = () => {
      updateDelivery(job, 'failed', 'FILE_UNAVAILABLE');
      jobEvent(job.analyticsId, 'delivery_failed', job.jobId, job.category, 'FILE_UNAVAILABLE');
    };
    const stat=await fs.promises.stat(job.outputFilePath);
    if (inline && job.mimeType !== 'video/mp4') return NextResponse.json({status:'error',error:{code:'UNSUPPORTED_OPERATION',message:'This file is not a playable video.'}},{status:400});
    const requestedRange = inline ? _req.headers.get('range') : null;
    const range = requestedRange ? byteRange(requestedRange,stat.size) : null;
    if (requestedRange && !range) return new NextResponse(null,{status:416,headers:{'Content-Range':`bytes */${stat.size}`,'Cache-Control':'private, no-store'}});
    const headers:Record<string,string>={'Content-Type':job.mimeType || 'application/octet-stream','Content-Length':String(range ? range.end-range.start+1 : stat.size),'Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff'};
    if(inline) headers['Accept-Ranges']='bytes';
    if(range) headers['Content-Range']=`bytes ${range.start}-${range.end}/${stat.size}`;
    if (_req.method === 'HEAD') return new NextResponse(null, {status:range?206:200,headers});
    const file=fs.createReadStream(job.outputFilePath,{highWaterMark:65536,...(range||{})});
    const iterator=file[Symbol.asyncIterator]();
    const release=ctx.downloadManager.retainJobFile?.(jobId)||(()=>{});
    // Playback and seek requests are not completed file downloads in analytics.
    let deliveryFinished = false;
    const delivery=(event:string,code?:'DELIVERY_STREAM_ERROR'|'DELIVERY_CANCELLED')=>{
      if(inline || deliveryFinished) return;
      if(event === 'delivery_completed' || event === 'delivery_failed') deliveryFinished = true;
      updateDelivery(job, event === 'delivery_completed' ? 'handed_off' : event === 'delivery_failed' ? 'failed' : 'streaming', code);
      jobEvent(job.analyticsId,event,job.jobId,job.category,code);
    };
    delivery('delivery_started');
    const body=new ReadableStream<Uint8Array>({
      async pull(controller) {
        try {
          const next=await iterator.next();
          if(next.done) { release();delivery('delivery_completed'); controller.close(); }
          else controller.enqueue(new Uint8Array(next.value));
        } catch(error) { release();delivery('delivery_failed','DELIVERY_STREAM_ERROR'); controller.error(error); file.destroy(); }
      },
      cancel() { release();file.destroy(); delivery('delivery_failed','DELIVERY_CANCELLED'); },
    });
    const extension = job.isCarouselZip ? 'zip' : job.mimeType === 'audio/mp4' ? 'm4a' : job.mimeType === 'image/webp' ? 'webp' : job.mimeType === 'image/jpeg' ? 'jpg' : 'mp4';
    const safeFilename = sanitizeFilename(job.safeFilename || `saveframe_${job.shortcode}`, extension);
    return new NextResponse(body, {
      status: range ? 206 : 200,
      headers: {
        ...headers,
        'Content-Disposition': `${inline ? 'inline' : 'attachment'}; filename="${safeFilename}"`,
      },
    });
  } catch (err: any) {
    unavailable?.();
    return NextResponse.json(
      { status: 'error', error: { code: err instanceof DownloaderAppError ? err.code : 'JOB_NOT_FOUND', message: err instanceof DownloaderAppError ? err.userMessage : 'The prepared file is unavailable or has expired.' } },
      { status: err instanceof DownloaderAppError ? err.statusCode : 404 }
    );
  }
}
