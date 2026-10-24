import type { Metadata } from 'next';
import './globals.css';
import { siteUrl, hasPublicSiteUrl } from '../lib/site';
import { headers } from 'next/headers';
import { isLocale, languageTag } from '../i18n/config';

export const metadata: Metadata = {
  title: 'SaveFrame — Instagram Downloader for Photos, Reels, Videos & Stories',
  description: 'Save supported public Instagram photos, videos, Reels, carousels, and stories with a simple link. Fast, clean, mobile-friendly web utility.',
  metadataBase: new URL(siteUrl),
  alternates: { canonical: '/' },
  robots: { index: hasPublicSiteUrl, follow: true },
};

export default async function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  const requested = (await headers()).get('x-saveframe-locale') || 'en';
  const locale = isLocale(requested) ? requested : 'en';
  return (
    <html lang={languageTag(locale)} dir={locale === 'ar' ? 'rtl' : 'ltr'} className="scroll-smooth">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600&family=Plus+Jakarta+Sans:wght@600;700&display=swap" rel="stylesheet" />
      </head>
      <body className="min-h-screen flex flex-col bg-canvas text-ink selection:bg-brand-violetSoft selection:text-brand-violet">{children}</body>
    </html>
  );
}
