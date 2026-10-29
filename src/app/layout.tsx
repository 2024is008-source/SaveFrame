import type { Metadata } from 'next';
import './globals.css';
import '../ui/fonts.css';
import fontAssets from '../ui/font-assets.json';
import { siteUrl, hasPublicSiteUrl } from '../lib/site';
import { headers } from 'next/headers';
import { isLocale, languageTag } from '../i18n/config';
import Analytics from '../components/Analytics';
import { Suspense } from 'react';
import { analyticsPolicy } from '../lib/analytics-policy';
import { socialImage } from '../lib/seo';
import english from '../i18n/dictionaries/en.json';
import titles from '../content/search-titles.json';

const home = { title: titles['/'], description: english['Save supported public Instagram photos, videos, Reels, carousels, and stories with a simple link. Fast, clean, mobile-friendly web utility.'] };

export const metadata: Metadata = {
  title: home.title,
  description: home.description,
  openGraph: { type: 'website', siteName: 'SaveFrame', title: home.title, description: home.description, url: siteUrl, images: [socialImage] },
  twitter: { card: 'summary_large_image', title: home.title, description: home.description, images: [socialImage.url] },
  metadataBase: new URL(siteUrl),
  alternates: { canonical: '/' },
  robots: { index: hasPublicSiteUrl, follow: true },
  icons: {
    icon: [{ url: '/favicon.svg', type: 'image/svg+xml' }, { url: '/icon-32.png', sizes: '32x32', type: 'image/png' }, { url: '/icon-16.png', sizes: '16x16', type: 'image/png' }],
    shortcut: '/favicon.ico',
    apple: [{ url: '/icon-180.png', sizes: '180x180', type: 'image/png' }],
  },
  manifest: '/site.webmanifest',
};

export default async function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  const requestHeaders=await headers();
  const requested = requestHeaders.get('x-saveframe-locale') || 'en';
  const locale = isLocale(requested) ? requested : 'en';
  return (
    <html lang={languageTag(locale)} dir={locale === 'ar' ? 'rtl' : 'ltr'} className="scroll-smooth">
      <head>{fontAssets.map(href => <link key={href} rel="preload" href={href} as="font" type="font/woff2" crossOrigin="anonymous" />)}</head>
      <body className="min-h-screen flex flex-col bg-canvas text-ink selection:bg-brand-violetSoft selection:text-brand-violet">{children}<Suspense fallback={null}><Analytics id={process.env.NEXT_PUBLIC_GA_ID || ''} origin={siteUrl} production={process.env.NODE_ENV==='production'&&process.env.GA4_ENABLED==='1'} options={analyticsPolicy(requestHeaders)}/></Suspense></body>
    </html>
  );
}
