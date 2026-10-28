import type { MetadataRoute } from 'next';
import { absoluteUrl, hasPublicSiteUrl } from '../lib/site';
import information from '../content/information.json';
import { getPublishedPosts } from '../lib/blog';
export default function sitemap(): MetadataRoute.Sitemap {
  if (!hasPublicSiteUrl) return [];
  const posts = getPublishedPosts();
  return [
    ...['/', '/video-downloader', '/photo-downloader', ...information.map(page => '/' + page.slug), '/blog', ...(posts.length > 9 ? ['/blog?page=2'] : [])].map(path => ({ url: absoluteUrl(path) })),
    ...posts.map(post => ({ url: absoluteUrl('/blog/' + post.slug), lastModified: new Date(post.updatedAt + 'T00:00:00+05:30') })),
  ];
}
