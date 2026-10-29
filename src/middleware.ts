import { NextRequest, NextResponse } from 'next/server';
import { isLocale } from './i18n/config';
import { isVerificationFilename } from './admin/verification-patterns';
export function middleware(request: NextRequest) {
  const pathname = request.nextUrl.pathname;
  if (/^\/(?:admin|api\/admin)(?:\/|$)/i.test(pathname)) {
    const headers = { 'X-Robots-Tag': 'noindex, nofollow, noarchive', 'Cache-Control': 'no-store' };
    if (pathname.startsWith('/api/')) return NextResponse.json({ error: 'Not found' }, { status: 404, headers });
    return new NextResponse('<!doctype html><html lang="en"><head><title>Page Not Found | TikSaveMP4</title><meta name="robots" content="noindex, nofollow"></head><body><main><h1>Page not found</h1><p><a href="/">Return to TikSaveMP4</a></p></main></body></html>', { status: 404, headers: { ...headers, 'Content-Type': 'text/html; charset=utf-8' } });
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
  return NextResponse.next({ request: { headers } });
}
export const config = { matcher: ['/api/admin/:path*', '/((?!api(?:/|$)|_next(?:/|$)|images(?:/|$)|social(?:/|$)|favicon\\.ico$).*)'] };
