import { NextRequest, NextResponse } from 'next/server';
import * as fs from 'fs';
import { getApiContext } from '../../../singleton';
import { sanitizeFilename } from '../../../../../security/url-validator';

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
    const buf = await fs.promises.readFile(job.outputFilePath);
    const safeFilename = sanitizeFilename(job.safeFilename || `saveframe_${job.shortcode}`, job.isCarouselZip ? 'zip' : 'mp4');
    return new NextResponse(buf, {
      status: 200,
      headers: {
        'Content-Type': job.mimeType || 'application/octet-stream',
        'Content-Length': String(buf.length),
        'Content-Disposition': `attachment; filename="${safeFilename}"`,
        'X-Content-Type-Options': 'nosniff',
        'Cache-Control': 'private, no-store',
      },
    });
  } catch (err: any) {
    return NextResponse.json(
      { status: 'error', error: { code: err?.code || 'JOB_NOT_FOUND', message: err?.userMessage || err?.message } },
      { status: err?.statusCode || 404 }
    );
  }
}
