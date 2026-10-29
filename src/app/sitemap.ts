import type { MetadataRoute } from 'next';
import { absoluteUrl, hasPublicSiteUrl } from '../lib/site';
import information from '../content/information.json';
import { getCatalogPosts, blogPageSize } from '../lib/blog';
export default function sitemap(): MetadataRoute.Sitemap {
  if (!hasPublicSiteUrl) return [];
  const posts = getCatalogPosts();
  // Update only when the page content changes; do not stamp every request with today.
  const contentUpdatedAt = new Date('2026-10-30T00:00:00+05:30');
  const blogPages = Array.from({length: Math.max(0, Math.ceil(posts.length / blogPageSize) - 1)}, (_, index) => `/blog?page=${index + 2}`);
  return [
    ...['/', '/video-downloader', '/photo-downloader', ...information.map(page => '/' + page.slug), '/blog', ...blogPages].map(path => ({ url: absoluteUrl(path), lastModified: contentUpdatedAt })),
    ...posts.map(post => ({ url: absoluteUrl('/blog/' + post.slug), lastModified: new Date(post.updatedAt + 'T00:00:00+05:30') })),
  ];
}
