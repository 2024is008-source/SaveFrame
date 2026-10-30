import fs from 'node:fs';
import path from 'node:path';
import records from '../content/blog/posts.json';
import cardAssets from '../ui/card-assets.json';
import { pageDescription } from '../admin/public-seo';

export const categories = ['Instagram Reels', 'Instagram Photos', 'Instagram Videos', 'Profile Pictures', 'Troubleshooting', 'Tips & Guides'];
export interface BlogPost {
  slug: string; title: string; description: string; category: string; primaryKeyword: string;
  publishedAt: string; updatedAt: string; published: boolean; author: string;
  cover: string; coverAlt: string; tool: string; content: string; wordCount: number; readingMinutes: number;
}
const contentRoot = path.join(process.cwd(), 'src/content/blog');
export function getPublishedPosts(): BlogPost[] {
  return records.filter(post => post.published).map(post => {
    const content = fs.readFileSync(path.join(contentRoot, `${post.slug}.md`), 'utf8');
    const wordCount = content.trim().split(/\s+/).length;
    return { ...post, description:pageDescription('/blog/'+post.slug,post.description), content, wordCount, readingMinutes: Math.max(1, Math.ceil(wordCount / 220)) };
  }).sort((a, b) => b.publishedAt.localeCompare(a.publishedAt) || records.findIndex(p => p.slug === a.slug) - records.findIndex(p => p.slug === b.slug));
}
export function getPost(slug: string) { return getPublishedPosts().find(post => post.slug === slug); }
export function relatedPosts(post: BlogPost) {
  return getPublishedPosts().filter(item => item.slug !== post.slug)
    .sort((a, b) => Number(b.category === post.category) - Number(a.category === post.category)).slice(0, 3);
}
export function filterPosts(posts: BlogPost[], search: string, category: string) {
  const query = search.trim().toLowerCase();
  return posts.filter(post => (!category || post.category === category) && (!query || `${post.title} ${post.description}`.toLowerCase().includes(query)));
}
export function headingId(text: string) { return text.toLowerCase().replace(/[^a-z0-9\s-]/g, '').trim().replace(/\s+/g, '-'); }
export function tableOfContents(content: string) { return [...content.matchAll(/^## (.+)$/gm)].map(match => ({ title: match[1], id: headingId(match[1]) })); }
export const formatDate = (date: string) => new Intl.DateTimeFormat('en', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' }).format(new Date(date + 'T00:00:00Z'));
export function escapeHtml(value: string) { return value.replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]!)); }
export function homepageBlogMarkup() {
  const slugs = ['download-instagram-videos-on-pc', 'how-to-download-instagram-photos-online', 'how-to-download-instagram-reels-mp4'];
  const coverVariants = (cover: string) => cardAssets.filter(asset => asset.cover === cover);
  const posts = slugs.map(slug => getPost(slug)).filter(Boolean) as BlogPost[];
  return `<section id="blog-section" class="py-12 sm:py-16 bg-white border-t border-line px-4 sm:px-6"><div class="max-w-[1120px] mx-auto"><div class="flex flex-col sm:flex-row sm:items-end justify-between gap-4 mb-8 sm:mb-10"><div><h2 class="font-display font-bold text-2xl sm:text-3xl text-ink leading-tight">Creator Workflow &amp; Format Guides</h2><p class="mt-2 text-sm sm:text-base text-ink-muted">Practical guides to saving Instagram videos, photos, and Reels.</p></div><a href="/blog" class="text-sm font-semibold text-brand-violet hover:underline">View All Guides →</a></div><div class="grid grid-cols-1 md:grid-cols-3 gap-6">${posts.map(post => `<article class="bg-white border border-line rounded-2xl overflow-hidden flex flex-col justify-between group"><div><a href="/blog/${post.slug}" aria-label="${escapeHtml(post.title)}" class="block aspect-[4/3] w-full bg-soft overflow-hidden border-b border-line"><img src="${coverVariants(post.cover).find(asset => asset.width === 640)!.path}" srcset="${coverVariants(post.cover).map(asset => `${asset.path} ${asset.width}w`).join(", ")}" sizes="(min-width:1168px) 357px, (min-width:768px) calc((100vw - 96px) / 3), (min-width:640px) calc(100vw - 50px), calc(100vw - 34px)" alt="${escapeHtml(post.coverAlt)}" width="960" height="720" loading="lazy" decoding="async" class="w-full h-full object-cover group-hover:scale-[1.02] ui-transition" /></a><div class="p-5 sm:p-6"><p class="text-xs sm:text-sm text-ink-muted mb-3"><span class="font-semibold text-brand-violet">${escapeHtml(post.category)}</span> · ${post.readingMinutes} min read</p><h3 class="font-display font-bold text-lg sm:text-xl text-ink leading-snug mb-2"><a href="/blog/${post.slug}">${escapeHtml(post.title)}</a></h3><p class="text-sm sm:text-base text-ink-muted leading-relaxed">${escapeHtml(post.description)}</p></div></div><div class="px-5 sm:px-6 pb-5 sm:pb-6 pt-2"><a href="/blog/${post.slug}" aria-label="${escapeHtml(post.title)}" class="min-h-[44px] inline-flex items-center gap-2 text-brand-violet font-semibold text-sm hover:underline">Read guide <span aria-hidden="true">→</span></a></div></article>`).join('')}</div></div></section>`;
}
