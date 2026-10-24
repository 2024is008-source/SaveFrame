import Image from 'next/image';
import Link from 'next/link';
import type { BlogPost } from '../../lib/blog';
import { formatDate } from '../../lib/blog';

export function ArticleCard({ post }: { post: BlogPost }) {
  return <article className="guide-card">
    <Link href={`/blog/${post.slug}`} className="guide-cover" aria-label={post.title}>
      <Image src={`/images/blog/${post.cover}-960.webp`} alt={post.coverAlt} fill sizes="(min-width:1168px) 357px, (min-width:768px) 45vw, 95vw" quality={85} />
    </Link>
    <div className="guide-card-copy"><p className="guide-meta"><span>{post.category}</span><span>·</span><time dateTime={post.publishedAt}>{formatDate(post.publishedAt)}</time><span>·</span><span>{post.readingMinutes} min read</span></p>
      <h3><Link href={`/blog/${post.slug}`}>{post.title}</Link></h3><p>{post.description}</p>
      <Link className="guide-read" href={`/blog/${post.slug}`}>Read guide <span aria-hidden="true">→</span></Link>
    </div>
  </article>;
}
