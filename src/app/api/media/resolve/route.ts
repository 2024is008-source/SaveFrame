import { NextRequest, NextResponse } from 'next/server';
import { getApiContext } from '../../singleton';
import { DownloaderAppError } from '../../../../types/media.types';

export async function POST(req: NextRequest) {
  const ctx = getApiContext();
  try {
    const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || '127.0.0.1';
    const rl = await ctx.redisStore.checkRateLimit(ip, 'resolve', 30, 60);
    if (!rl.allowed) {
      throw new DownloaderAppError('RATE_LIMITED', 'Rate limit exceeded.', 429, true);
    }
    const body = await req.json();
    const metadata = await ctx.ytDlpService.extractMetadata(body.url || '');
    await ctx.redisStore.setJson(`resolve:${metadata.canonicalUrl}`, metadata, 300);
    const publicMetadata = {
      ...metadata,
      items: metadata.items.map(item => ({
        ...item,
        formats: item.formats.map(({ directUrl, ...format }) => format),
      })),
    };
    return NextResponse.json({ status: 'ok', cached: false, data: publicMetadata });
  } catch (err: any) {
    const code = err?.code || 'EXTRACTOR_FAILURE';
    const status = err?.statusCode || 500;
    return NextResponse.json(
      { status: 'error', error: { code, message: err?.userMessage || err?.message, retryable: Boolean(err?.retryable) } },
      { status }
    );
  }
}
