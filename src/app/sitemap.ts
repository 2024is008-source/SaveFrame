import type { MetadataRoute } from 'next';
import { getPublishedPosts } from '../lib/blog';
import { absoluteUrl, hasPublicSiteUrl } from '../lib/site';
import { locales, localePath } from '../i18n/config';
import { languageAlternates } from '../i18n/server';
export default function sitemap(): MetadataRoute.Sitemap {
  if (!hasPublicSiteUrl) return [];
  return [...locales.map(locale => ({ url: absoluteUrl(localePath(locale)), changeFrequency: 'weekly' as const, priority: 1, alternates: { languages: languageAlternates() } })), { url: absoluteUrl('/blog'), changeFrequency: 'weekly', priority: .8 }, ...getPublishedPosts().map(post => ({ url: absoluteUrl(`/blog/${post.slug}`), lastModified: new Date(`${post.updatedAt}T00:00:00+05:30`), changeFrequency: 'monthly' as const, priority: .7 }))];
}
