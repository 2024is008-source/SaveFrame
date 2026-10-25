import Link from 'next/link';
import { BlogShell } from '../components/blog/BlogShell';
export default function NotFound() {
  return <BlogShell><div className="blog-container"><article className="blog-article article-prose"><h1 className="font-display font-bold text-3xl">Page not found</h1><p>This address does not match an available SaveFrame page. Check the URL or choose a tool below.</p><p><Link href="/">Instagram downloader</Link> · <Link href="/reels-downloader">Reels downloader</Link> · <Link href="/photo-downloader">Photo downloader</Link> · <Link href="/blog">Download guides</Link></p></article></div></BlogShell>;
}
