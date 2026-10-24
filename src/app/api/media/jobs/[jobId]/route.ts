import { NextRequest, NextResponse } from 'next/server';
import { getApiContext } from '../../../singleton';

export async function GET(_req: NextRequest, context: { params: Promise<{ jobId: string }> }) {
  const ctx = getApiContext();
  try {
    const { jobId } = await context.params;
    const job = ctx.downloadManager.getJob(jobId);
    return NextResponse.json({
      status: 'ok',
      job: {
        jobId: job.jobId,
        status: job.status,
        progress: job.progress,
        safeFilename: job.safeFilename,
        filesizeBytes: job.filesizeBytes,
        downloadUrl: job.status === 'completed' ? `/api/media/download/${job.jobId}` : undefined,
        error: job.error,
      },
    });
  } catch (err: any) {
    return NextResponse.json(
      { status: 'error', error: { code: err?.code || 'JOB_NOT_FOUND', message: err?.userMessage || err?.message } },
      { status: err?.statusCode || 404 }
    );
  }
}

export async function DELETE(_req: NextRequest, context: { params: Promise<{ jobId: string }> }) {
  const ctx = getApiContext();
  try {
    const { jobId } = await context.params;
    const job = ctx.downloadManager.cancelJob(jobId);
    return NextResponse.json({ status: 'ok', job });
  } catch (err: any) {
    return NextResponse.json(
      { status: 'error', error: { code: err?.code || 'JOB_NOT_FOUND', message: err?.userMessage || err?.message } },
      { status: err?.statusCode || 404 }
    );
  }
}
