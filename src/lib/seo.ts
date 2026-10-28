import type { Metadata } from 'next';
import { absoluteUrl, hasPublicSiteUrl } from './site';
import { applySeo } from '../admin/public-seo';
export const socialImage = { url: absoluteUrl('/social/tiksave.png'), width: 1200, height: 630, alt: 'TikSaveMP4 TikTok video and photo downloader' };
export function pageMetadata(path: string, title: string, description: string): Metadata {
  return applySeo(path,{ title, description, alternates: { canonical: absoluteUrl(path) }, robots: { index: hasPublicSiteUrl, follow: true }, openGraph: { type: 'website', siteName: 'TikSaveMP4', title, description, url: absoluteUrl(path), images: [socialImage], locale: 'en_US' }, twitter: { card: 'summary_large_image', title, description, images: [socialImage.url] } });
}
export function pageGraph(path: string, name: string, description: string, language = 'en', application = false) {
  const url = absoluteUrl(path);
  return { '@context': 'https://schema.org', '@graph': [
    { '@type': 'Organization', '@id': absoluteUrl('/#organization'), name: 'TikSaveMP4', url: absoluteUrl('/') },
    { '@type': 'WebSite', '@id': absoluteUrl('/#website'), name: 'TikSaveMP4', url: absoluteUrl('/'), publisher: { '@id': absoluteUrl('/#organization') } },
    { '@type': 'WebPage', '@id': url + '#page', url, name, description, inLanguage: language, isPartOf: { '@id': absoluteUrl('/#website') }, ...(application ? { mainEntity: { '@id': url + '#application' } } : {}) },
    ...(application ? [{ '@type': 'WebApplication', '@id': url + '#application', name, url, description, inLanguage: language, applicationCategory: 'MultimediaApplication', operatingSystem: 'Any', browserRequirements: 'Requires a modern web browser', publisher: { '@id': absoluteUrl('/#organization') } }] : []),
    ...(path === '/' || /^\/[a-z]{2}(?:-br)?\/$/.test(path) ? [] : [{ '@type': 'BreadcrumbList', itemListElement: [{ '@type': 'ListItem', position: 1, name: 'Home', item: absoluteUrl('/') }, { '@type': 'ListItem', position: 2, name, item: url }] }]),
  ] };
}
export const jsonLd = (data: unknown) => JSON.stringify(data).replace(/</g, '\\u003c');
