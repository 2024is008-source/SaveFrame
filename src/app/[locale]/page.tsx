import { notFound } from 'next/navigation';
import { SaveFrameReference } from '../../components/SaveFrameReference';
import { isLocale } from '../../i18n/config';
import { localizedHomepage } from '../../i18n/homepage';
import { homepageMetadata } from '../../i18n/server';
import tools from '../../content/tools.json';
import information from '../../content/information.json';
import { toolPageMarkup } from '../../lib/tool-page';
import { InformationPage } from '../../components/InformationPage';
import { pageMetadata } from '../../lib/seo';
import { pageDescription } from '../../admin/public-seo';
export const dynamic='force-dynamic';
type Props = { params: Promise<{ locale: string }> };
export async function generateMetadata({ params }: Props) {
  const { locale } = await params;
  const page = tools.find(page => page.slug === locale) || information.find(page => page.slug === locale);
  if (page) return pageMetadata('/' + page.slug, page.title + ' | SaveFrame', page.description);
  if (!isLocale(locale) || locale === 'en') notFound();
  return homepageMetadata(locale);
}
export default async function LocalizedHome({ params }: Props) {
  const { locale } = await params;
  const tool = tools.find(page => page.slug === locale);
  if (tool) return <SaveFrameReference markup={toolPageMarkup({...tool,description:pageDescription('/'+tool.slug,tool.description)})} />;
  const info = information.find(page => page.slug === locale);
  if (info) return <InformationPage page={info} />;
  if (!isLocale(locale) || locale === 'en') notFound();
  return <SaveFrameReference markup={localizedHomepage(locale)} />;
}
