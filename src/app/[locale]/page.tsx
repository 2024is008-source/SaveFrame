import { notFound } from 'next/navigation';
import { SaveFrameReference } from '../../components/SaveFrameReference';
import { isLocale } from '../../i18n/config';
import { localizedHomepage } from '../../i18n/homepage';
import { homepageMetadata } from '../../i18n/server';
type Props = { params: Promise<{ locale: string }> };
export async function generateMetadata({ params }: Props) {
  const { locale } = await params;
  if (!isLocale(locale) || locale === 'en') notFound();
  return homepageMetadata(locale);
}
export default async function LocalizedHome({ params }: Props) {
  const { locale } = await params;
  if (!isLocale(locale) || locale === 'en') notFound();
  return <SaveFrameReference markup={localizedHomepage(locale)} />;
}
