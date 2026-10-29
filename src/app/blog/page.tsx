import type { Metadata } from 'next';
import Link from 'next/link';
import { ArticleCard } from '../../components/blog/ArticleCard';
import { BlogShell } from '../../components/blog/BlogShell';
import { categories, filterPosts, getPublishedPosts } from '../../lib/blog';
import { absoluteUrl, hasPublicSiteUrl } from '../../lib/site';
import { pageGraph, jsonLd } from '../../lib/seo';
import { applySeo } from '../../admin/public-seo';
export const dynamic='force-dynamic';

type Query = { q?: string; category?: string; page?: string };
export async function generateMetadata({ searchParams }: { searchParams: Promise<Query> }): Promise<Metadata> {
  const query = await searchParams;
  const page = Math.min(Math.ceil(getPublishedPosts().length / 9), Math.max(1, Number.parseInt(query.page || '1', 10) || 1));
  const title = page > 1 ? `Instagram Download Guides — Page ${page} | SaveFrame` : 'Instagram Download Guides & Tutorials | SaveFrame';
  const description = 'Practical guides to downloading supported Instagram photos, Reels, videos, and MP3 audio, with clear troubleshooting and backup advice.';
  const canonical = absoluteUrl(page > 1 && !query.q && !query.category ? `/blog?page=${page}` : '/blog');
  return applySeo(page>1?'/blog?page='+page:'/blog',{ title, description: page > 1 ? `Page ${page} of SaveFrame's Instagram guides: audio, mobile photo downloads, troubleshooting, image dimensions and keeping your own media backups.` : description, alternates: { canonical }, robots: { index: hasPublicSiteUrl && !query.q && !query.category, follow: true }, openGraph: { title, description, url: canonical, images: [{ url: absoluteUrl('/images/blog/reels-1200.webp'), width: 1200, height: 900, alt: 'SaveFrame Instagram download guides' }], type: 'website' }, twitter: { card: 'summary_large_image', title, description, images: [absoluteUrl('/images/blog/reels-1200.webp')] } });
}
export default async function BlogIndex({ searchParams }: { searchParams: Promise<Query> }) {
  const query = await searchParams;
  const q = (query.q || '').slice(0, 200);
  const category = categories.includes(query.category || '') ? query.category! : '';
  const all = getPublishedPosts();
  const filtered = filterPosts(all, q, category);
  const pages = Math.max(1, Math.ceil(filtered.length / 9));
  const page = Math.min(pages, Math.max(1, Number.parseInt(query.page || '1', 10) || 1));
  const href = (next: { category?: string; page?: number }) => {
    const params = new URLSearchParams();
    if (q) params.set('q', q);
    if (next.category ?? category) params.set('category', next.category ?? category);
    if (next.page && next.page > 1) params.set('page', String(next.page));
    return '/blog' + (params.size ? '?' + params : '');
  };
  return <BlogShell><script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLd(pageGraph(page > 1 && !q && !category ? `/blog?page=${page}` : '/blog', 'Instagram Download Guides & Tutorials', 'Practical Instagram media guides.')) }} /><div className="blog-container">
    <nav className="breadcrumbs" aria-label="Breadcrumb"><Link href="/">Home</Link><span aria-hidden="true">/</span><span>Guides</span></nav>
    <header className="blog-intro"><h1>Instagram Download Guides &amp; Tutorials</h1><p>Clear instructions for saving supported public media, finding your files, and keeping an organized archive of your own work.</p></header>
    {!q && !category && page === 1 && <section aria-labelledby="featured-heading"><h2 id="featured-heading" className="blog-section-heading">Start with these guides</h2><div className="guide-grid">{['download-instagram-videos-on-pc', 'how-to-download-instagram-photos-online', 'how-to-download-instagram-reels-mp4'].map(slug => <ArticleCard key={slug} post={all.find(post => post.slug === slug)!} />)}</div></section>}
    <section className="blog-catalog" aria-labelledby="all-guides-heading"><h2 id="all-guides-heading" className="blog-section-heading">All guides</h2>
      <form className="blog-search" action="/blog" method="get" role="search"><label htmlFor="guide-search">Search titles and descriptions</label><div><input id="guide-search" type="search" name="q" defaultValue={q} placeholder="Search a topic, device, or problem" maxLength={200} />{category && <input type="hidden" name="category" value={category} />}<button type="submit">Search guides</button></div></form>
      <nav className="category-filters" aria-label="Guide categories"><Link href={href({ category: '' })} aria-current={!category ? 'page' : undefined}>All categories</Link>{categories.map(item => <Link key={item} href={href({ category: item })} aria-current={category === item ? 'page' : undefined}>{item}</Link>)}</nav>
      <p className="results-count" role="status">{filtered.length ? `Showing ${(page - 1) * 9 + 1}–${Math.min(page * 9, filtered.length)} of ${filtered.length} guides` : 'No guides match your search.'}</p>
      {filtered.length ? <div className="guide-grid">{filtered.slice((page - 1) * 9, page * 9).map(post => <ArticleCard key={post.slug} post={post} />)}</div> : <div className="blog-empty"><h3>Try another topic</h3><p>Use a shorter phrase, choose another category, or browse every guide.</p><Link href="/blog">Clear search and filters</Link></div>}
      {pages > 1 && <nav className="blog-pagination" aria-label="Guide pages">{page > 1 && <Link href={href({ page: page - 1 })}>← Previous</Link>}<span>Page {page} of {pages}</span>{page < pages && <Link href={href({ page: page + 1 })}>Next →</Link>}</nav>}
    </section>
  </div></BlogShell>;
}
