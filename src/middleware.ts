import { NextRequest, NextResponse } from 'next/server';
import { isLocale } from './i18n/config';
import { isVerificationFilename } from './admin/verification-patterns';
import { analyticsPath, analyticsCampaign } from './lib/analytics';
import { analyticsPolicy } from './lib/analytics-policy';
export function middleware(request: NextRequest) {
  const pathname = request.nextUrl.pathname;
  if (/^\/(?:admin|api\/admin)(?:\/|$)/i.test(pathname)) {
    // Authentication, email OTP and CSRF remain in the existing Node handlers.
    const headers=new Headers(request.headers);
    headers.set('x-tiksave-document','0');
    headers.set('x-tiksave-page','');
    headers.set('x-tiksave-source','');
    headers.set('x-tiksave-medium','');
    headers.set('x-saveframe-locale','en');
    const response=NextResponse.next({request:{headers}});
    response.headers.set('X-Robots-Tag','noindex, nofollow, noarchive');
    response.headers.set('Cache-Control','private, no-store');
    return response;
  }
  if (pathname.replace(/\/+$/, '') === '/story-downloader') {
    return new NextResponse('<!doctype html><html lang="en"><head><title>Story Downloader Retired | TikSaveMP4</title><meta name="robots" content="noindex, follow"></head><body><main><h1>Story downloader retired</h1><p>The public story downloader is no longer available. Existing editorial guides remain in the <a href="/">TikSaveMP4</a>.</p></main></body></html>', {
      status: 410, headers: {'Content-Type':'text/html; charset=utf-8','X-Robots-Tag':'noindex, follow','Cache-Control':'public, max-age=3600'},
    });
  }
  if(isVerificationFilename(pathname.slice(1))) {
    const url=new URL(request.url); url.pathname='/api/verification/'+pathname.slice(1);
    return NextResponse.rewrite(url);
  }
  const candidate = pathname.replace(/^\//, '').replace(/\/$/, '');
  const locale = 'en';
  const canonicalPath = isLocale(candidate) ? '/' : pathname.length > 1 ? pathname.replace(/\/+$/, '') : '/';
  if (canonicalPath !== pathname) {
    const url = new URL(request.url); url.pathname = canonicalPath;
    return NextResponse.redirect(url, 308);
  }
  const headers = new Headers(request.headers);
  // Always overwrite client-supplied locale headers; non-homepage routes remain English.
  headers.set('x-saveframe-locale', locale);
  // Overwrite all client-supplied markers. Count HTML documents, never RSC,
  // prefetches, HEAD requests, assets or redirects. No full query is forwarded.
  const page=analyticsPath(pathname,request.nextUrl.search);
  const document=request.method==='GET'&&request.headers.get('accept')?.includes('text/html')&&!request.headers.has('rsc')&&!request.headers.has('next-router-prefetch')&&!/prefetch/i.test(request.headers.get('purpose')||request.headers.get('sec-purpose')||'');
  headers.set('x-tiksave-document',document&&page?'1':'0');
  headers.set('x-tiksave-page',page||'');
  const campaign=analyticsCampaign(request.nextUrl.search,analyticsPolicy(request.headers));
  headers.set('x-tiksave-source',campaign.campaign_source||'');
  headers.set('x-tiksave-medium',campaign.campaign_medium||'');
  return NextResponse.next({ request: { headers } });
}
export const config = { matcher: ['/api/admin/:path*', '/((?!api(?:/|$)|_next(?:/|$)|images(?:/|$)|social(?:/|$)|favicon\\.ico$).*)'] };
