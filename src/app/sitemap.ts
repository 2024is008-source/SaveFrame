import type { MetadataRoute } from 'next';
import { getPublishedPosts } from '../lib/blog';
import { absoluteUrl, hasPublicSiteUrl } from '../lib/site';
import { locales, localePath } from '../i18n/config';
import { languageAlternates } from '../i18n/server';
import tools from '../content/tools.json';
import information from '../content/information.json';
export default function sitemap(): MetadataRoute.Sitemap {
  if (!hasPublicSiteUrl) return [];
  return [
    ...locales.map(locale => ({
      url: absoluteUrl(localePath(locale)),
      alternates: { languages: languageAlternates() },
    })),
    // These pages have no maintained date for significant content changes.
    ...tools.map(page => ({ url: absoluteUrl('/' + page.slug) })),
    ...information.map(page => ({ url: absoluteUrl('/' + page.slug) })),
    { url: absoluteUrl('/blog') },
    // Preserve the editorial modification date, not the sitemap/build time.
    ...getPublishedPosts().map(post => ({
      url: absoluteUrl(`/blog/${post.slug}`),
      lastModified: new Date(`${post.updatedAt}T00:00:00+05:30`),
    })),
  ];
}
