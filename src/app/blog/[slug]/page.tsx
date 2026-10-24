import type { Metadata } from 'next';
import Image from 'next/image';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { BlogShell } from '../../../components/blog/BlogShell';
import { ArticleCard } from '../../../components/blog/ArticleCard';
import { Markdown } from '../../../components/blog/Markdown';
import { formatDate, getPost, getPublishedPosts, relatedPosts, tableOfContents } from '../../../lib/blog';
import { absoluteUrl, hasPublicSiteUrl } from '../../../lib/site';

export const dynamicParams = false;
export function generateStaticParams() { return getPublishedPosts().map(post => ({ slug: post.slug })); }
export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const post = getPost((await params).slug);
  if (!post) return { title: 'Guide not found | SaveFrame', robots: { index: false, follow: false } };
  const title = `${post.title} | SaveFrame`;
  const url = absoluteUrl(`/blog/${post.slug}`);
  const image = absoluteUrl(`/images/blog/${post.cover}-1200.webp`);
  return { title, description: post.description, keywords: [post.primaryKeyword], authors: [{ name: post.author }], alternates: { canonical: url }, robots: { index: hasPublicSiteUrl, follow: true }, openGraph: { title, description: post.description, url, type: 'article', publishedTime: `${post.publishedAt}T00:00:00+05:30`, modifiedTime: `${post.updatedAt}T00:00:00+05:30`, authors: [post.author], section: post.category, images: [{ url: image, width: 1200, height: 900, alt: post.coverAlt }] }, twitter: { card: 'summary_large_image', title, description: post.description, images: [image] } };
}
export default async function ArticlePage({ params }: { params: Promise<{ slug: string }> }) {
  const post = getPost((await params).slug);
  if (!post) notFound();
  const toc = tableOfContents(post.content);
  const url = absoluteUrl(`/blog/${post.slug}`);
  const structured = [{ '@context': 'https://schema.org', '@type': 'BlogPosting', headline: post.title, description: post.description, author: { '@type': 'Organization', name: post.author }, publisher: { '@type': 'Organization', name: 'SaveFrame', url: absoluteUrl('/') }, datePublished: `${post.publishedAt}T00:00:00+05:30`, dateModified: `${post.updatedAt}T00:00:00+05:30`, mainEntityOfPage: { '@type': 'WebPage', '@id': url }, image: [absoluteUrl(`/images/blog/${post.cover}-1200.webp`)], articleSection: post.category, wordCount: post.wordCount, inLanguage: 'en' }, { '@context': 'https://schema.org', '@type': 'BreadcrumbList', itemListElement: [{ '@type': 'ListItem', position: 1, name: 'Home', item: absoluteUrl('/') }, { '@type': 'ListItem', position: 2, name: 'Guides', item: absoluteUrl('/blog') }, { '@type': 'ListItem', position: 3, name: post.title, item: url }] }];
  return <BlogShell><div className="blog-container">
    <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(structured).replace(/</g, '\\u003c') }} />
    <nav className="breadcrumbs" aria-label="Breadcrumb"><Link href="/">Home</Link><span aria-hidden="true">/</span><Link href="/blog">Guides</Link><span aria-hidden="true">/</span><span>{post.category}</span></nav>
    <article className="blog-article"><header className="article-header"><Link className="article-category" href={`/blog?category=${encodeURIComponent(post.category)}`}>{post.category}</Link><h1>{post.title}</h1><p className="article-description">{post.description}</p><p className="article-byline">By {post.author} · <time dateTime={post.publishedAt}>{formatDate(post.publishedAt)}</time> · {post.readingMinutes} min read</p></header>
      <Image className="article-hero" src={`/images/blog/${post.cover}-1200.webp`} width={1200} height={900} alt={post.coverAlt} priority sizes="(min-width: 960px) 800px, 95vw" quality={85} />
      <details className="article-toc" open><summary>In this guide</summary><nav aria-label="Table of contents"><ol>{toc.map(item => <li key={item.id}><a href={`#${item.id}`}>{item.title}</a></li>)}</ol></nav></details>
      <Markdown content={post.content} />
      <aside className="article-cta"><h2>Try the matching SaveFrame tool</h2><p>Paste a supported public link and inspect the media actually available for download.</p><Link href={`/?tool=${post.tool}#main-tool`}>Open {post.tool === 'profile' ? 'Profile Viewer' : post.tool === 'reels' ? 'Reels Downloader' : post.tool === 'story' ? 'Story Downloader' : post.tool === 'video' ? 'Video Downloader' : 'Photo Downloader'} →</Link></aside>
      <Link className="back-to-guides" href="/blog">← Back to All Guides</Link>
    </article>
    <section className="related-guides" aria-labelledby="related-heading"><h2 id="related-heading" className="blog-section-heading">Related articles</h2><div className="guide-grid">{relatedPosts(post).map(related => <ArticleCard key={related.slug} post={related} />)}</div></section>
  </div></BlogShell>;
}
