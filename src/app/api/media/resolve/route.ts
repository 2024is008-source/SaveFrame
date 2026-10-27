import { NextRequest, NextResponse } from 'next/server';
import { getApiContext } from '../../singleton';
import { DownloaderAppError, InstagramMediaCategory } from '../../../../types/media.types';
import { apiFailure, beginResolution, resolveEvent } from '../../../../admin/analytics';
import { readMediaJson } from '../../../../api/request';
import { validatePublicMediaInput } from '../../../../security/url-validator';
import { requestCountry } from '../../../../admin/country-policy';

export async function POST(req: NextRequest) {
  const country=requestCountry(req.headers);
  let analyticsId:string|undefined;const started=Date.now();
  let attemptedCategory:InstagramMediaCategory|'unknown'='unknown';
  try {
    const ctx = getApiContext();
    const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || '127.0.0.1';
    const rl = await ctx.redisStore.checkRateLimit(ip, 'resolve', 30, 60);
    if (!rl.allowed) {
      throw new DownloaderAppError('RATE_LIMITED', 'Rate limit exceeded.', 429, true);
    }
    analyticsId=beginResolution(country);
    const body = await readMediaJson(req);
    attemptedCategory=validatePublicMediaInput(body.url||'',body.tool).category;
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
    else apiFailure('media_resolution_failed',attemptedCategory,code,country);
    const status = known ? err.statusCode : 500;
    return NextResponse.json(
      { status: 'error', error: { code, message: known ? err.userMessage : 'Unable to inspect this media. Please try again.', retryable: known && err.retryable } },
      { status }
    );
  }
}
