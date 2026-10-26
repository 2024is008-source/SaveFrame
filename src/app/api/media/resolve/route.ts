import { NextRequest, NextResponse } from 'next/server';
import { getApiContext } from '../../singleton';
import { DownloaderAppError } from '../../../../types/media.types';
import { beginResolution, resolveEvent } from '../../../../admin/analytics';
import { readMediaJson } from '../../../../api/request';
import { validateMediaInput } from '../../../../security/url-validator';

export async function POST(req: NextRequest) {
  const ctx = getApiContext();
  let analyticsId:string|undefined;const started=Date.now();
  let attemptedCategory:'story'|'unknown'='unknown';
  try {
    const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || '127.0.0.1';
    const rl = await ctx.redisStore.checkRateLimit(ip, 'resolve', 30, 60);
    if (!rl.allowed) {
      throw new DownloaderAppError('RATE_LIMITED', 'Rate limit exceeded.', 429, true);
    }
    analyticsId=beginResolution();
    const body = await readMediaJson(req);
    if(validateMediaInput(body.url||'',body.tool).category==='story')attemptedCategory='story';
    const metadata = await ctx.ytDlpService.extractMetadata(body.url || '', body.tool, req.signal);
    resolveEvent(analyticsId,true,metadata.category,undefined,Date.now()-started);
    // YtDlpService already owns the bounded metadata cache used by downloads.
    const publicMetadata = {
      ...metadata,
      items: metadata.items.map(item => ({
        ...item,
        formats: item.formats.map(({ directUrl, ...format }) => format),
      })),
    };
    return NextResponse.json({ status: 'ok', cached: false, data: publicMetadata });
  } catch (err: any) {
    const known=err instanceof DownloaderAppError;
    const code = known ? err.code : 'INTERNAL_ERROR';
    if(analyticsId)resolveEvent(analyticsId,false,attemptedCategory,code,Date.now()-started);
    const status = known ? err.statusCode : 500;
    return NextResponse.json(
      { status: 'error', error: { code, message: known ? err.userMessage : 'Unable to inspect this media. Please try again.', retryable: known && err.retryable } },
      { status }
    );
  }
}
