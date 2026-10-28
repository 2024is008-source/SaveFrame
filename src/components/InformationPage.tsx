import Link from 'next/link';
import { BlogShell } from './blog/BlogShell';
import { jsonLd, pageGraph } from '../lib/seo';
import records from '../content/information.json';
import { pageDescription } from '../admin/public-seo';
import { publicSettings } from '../admin/db';
export type Information = typeof records[number];
export function InformationPage({ page }: { page: Information }) {
  page={...page,description:pageDescription('/'+page.slug,page.description)};
  const support = publicSettings().contactEmail;
  const copyright = process.env.SAVEFRAME_COPYRIGHT_EMAIL?.trim();
  const validEmail = (value?: string) => value && /^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/.test(value);
  return <BlogShell><div className="blog-container"><nav className="breadcrumbs" aria-label="Breadcrumb"><Link href="/">Home</Link><span>/</span><span>{page.title}</span></nav><article className="blog-article"><header className="article-header"><h1>{page.title}</h1><p className="article-description">{page.description}</p></header><div className="article-prose">{page.sections.map(([heading, text]) => <section key={heading}><h2>{heading}</h2><p>{text}</p></section>)}{page.slug==='privacy' && <p><Link href="/privacy?analytics=off" prefetch={false}>Opt out of optional analytics in this browser</Link></p>}{['contact', 'copyright'].includes(page.slug) && <section><h2>Public contact channels</h2>{validEmail(support) ? <p>Support: <a href={`mailto:${support}`}>{support}</a></p> : <p>A public support email has not yet been published.</p>}{validEmail(copyright) ? <p>Copyright: <a href={`mailto:${copyright}`}>{copyright}</a></p> : <p>A public copyright email has not yet been published.</p>}</section>}<p><Link href="/about">About TikSaveMP4</Link> · <Link href="/contact">Contact</Link> · <Link href="/privacy">Privacy</Link> · <Link href="/terms">Terms</Link> · <Link href="/copyright">Copyright</Link></p><p>For help, read the FAQs or <Link href="/">return to the TikTok downloader</Link>.</p></div></article></div><script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLd(pageGraph('/' + page.slug, page.title, page.description)) }} /></BlogShell>;
}
