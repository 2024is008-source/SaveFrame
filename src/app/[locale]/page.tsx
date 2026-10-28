import { notFound, redirect } from 'next/navigation';
import { SaveFrameReference } from '../../components/SaveFrameReference';
import { tiktokPageMarkup } from '../../lib/tiktok-page';
import { InformationPage } from '../../components/InformationPage';
import information from '../../content/information.json';
import { pageMetadata } from '../../lib/seo';
import { isLocale } from '../../i18n/config';
import seoPages from '../../content/seo-pages.json';
type Props = { params: Promise<{ locale: string }> };
export const dynamic = 'force-dynamic';
export async function generateMetadata({ params }: Props) {
  const { locale } = await params;
  const info = information.find(page => page.slug === locale);
  const route = '/' + locale;
  const tool = Object.hasOwn(seoPages, route) ? seoPages[route as keyof typeof seoPages] : undefined;
  if (info) return pageMetadata(route, info.title + ' | TikSaveMP4', info.description);
  if (tool) return pageMetadata(route, tool.title, tool.description);
  return { title: 'Page Not Found | TikSaveMP4', description: 'This address does not match an available TikSaveMP4 page. Visit the TikTok downloader or browse the download guides.', robots: { index: false, follow: true }, alternates: { canonical: null } };

}
export default async function PublicPage({ params }: Props) {
  const { locale } = await params;
  if (isLocale(locale)) redirect('/');
  if (['video-downloader', 'photo-downloader'].includes(locale)) return <SaveFrameReference markup={tiktokPageMarkup(locale === 'photo-downloader' ? 'photo' : 'video')} />;
  const info = information.find(page => page.slug === locale);
  if (info) return <InformationPage page={info} />;
  notFound();
}
