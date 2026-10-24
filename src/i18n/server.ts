import fs from 'node:fs';
import path from 'node:path';
import type { Metadata } from 'next';
import english from './dictionaries/en.json';
import { locales, localePath, languageTag, ogLocales, type Locale } from './config';
import { absoluteUrl, hasPublicSiteUrl } from '../lib/site';
export type TranslationKey = keyof typeof english;
export type Dictionary = Record<TranslationKey, string>;
const cache = new Map<Locale, Dictionary>();
export function getDictionary(locale: Locale): Dictionary {
  if (locale === 'en') return english;
  if (!cache.has(locale)) cache.set(locale, { ...english, ...JSON.parse(fs.readFileSync(path.join(process.cwd(), 'src/i18n/dictionaries', `${locale}.json`), 'utf8')) });
  return cache.get(locale)!;
}
export function translate(dict: Dictionary, key: TranslationKey, values: Record<string, string | number> = {}) {
  return (dict[key] || english[key]).replace(/\{(\w+)\}/g, (match, name) => String(values[name] ?? match));
}
export const languageAlternates = () => Object.fromEntries([...locales.map(locale => [languageTag(locale), absoluteUrl(localePath(locale))]), ['x-default', absoluteUrl('/')]]);
export function homepageMetadata(locale: Locale): Metadata {
  const dict = getDictionary(locale);
  const title = dict['SaveFrame — Instagram Downloader for Photos, Reels, Videos & Stories'];
  const description = dict['Save supported public Instagram photos, videos, Reels, carousels, and stories with a simple link. Fast, clean, mobile-friendly web utility.'];
  return { title, description, alternates: { canonical: absoluteUrl(localePath(locale)), languages: languageAlternates() }, robots: { index: hasPublicSiteUrl, follow: true }, openGraph: { title, description, url: absoluteUrl(localePath(locale)), siteName: 'SaveFrame', type: 'website', locale: ogLocales[locale], alternateLocale: locales.filter(item => item !== locale).map(item => ogLocales[item]) }, twitter: { card: 'summary', title, description } };
}
