import { NextRequest, NextResponse } from 'next/server';
import { isLocale } from './i18n/config';
import { isVerificationFilename } from './admin/verification-patterns';
export function middleware(request: NextRequest) {
  const pathname = request.nextUrl.pathname;
  if (['/story-downloader','/stories-downloader','/story-viewer','/public-story-viewer','/blog/how-to-download-instagram-stories-by-link','/blog/how-to-download-instagram-story-videos'].includes(pathname.replace(/\/+$/, ''))) {
    return new NextResponse('<!doctype html><html lang="en"><head><title>Page Removed | SaveFrame</title><meta name="robots" content="noindex, follow"></head><body><main><h1>This page is no longer available</h1><p>Explore the current <a href="/">SaveFrame tools</a> or <a href="/blog">download guides</a>.</p></main></body></html>', {
      status: 410, headers: {'Content-Type':'text/html; charset=utf-8','X-Robots-Tag':'noindex, follow','Cache-Control':'public, max-age=3600'},
    });
  }
  if(isVerificationFilename(pathname.slice(1))) {
    const url=new URL(request.url); url.pathname='/api/verification/'+pathname.slice(1);
    return NextResponse.rewrite(url);
  }
  const candidate = pathname.replace(/^\//, '').replace(/\/$/, '');
  const locale = isLocale(candidate) && candidate !== 'en' ? candidate : 'en';
  const localizedHome = locale !== 'en';
  const canonicalPath = localizedHome ? `/${locale}/` : pathname.length > 1 ? pathname.replace(/\/+$/, '') : '/';
  if (canonicalPath !== pathname) {
    const url = new URL(request.url); url.pathname = canonicalPath;
    return NextResponse.redirect(url, 308);
  }
  const headers = new Headers(request.headers);
  // Always overwrite client-supplied locale headers; non-homepage routes remain English.
  headers.set('x-saveframe-locale', locale);
  return NextResponse.next({ request: { headers } });
}
export const config = { matcher: ['/((?!api(?:/|$)|_next(?:/|$)|images(?:/|$)|social(?:/|$)|favicon\\.ico$).*)'] };
