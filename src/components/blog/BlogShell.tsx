import reference from '../../ui/saveframe.json';
import { SiteChrome } from './SiteChrome';
import { toolPaths, infoPaths, crawlableNavigation } from '../../lib/navigation';
import { publicBrandMarkup } from '../../admin/public-seo';

function linkify(markup: string) {
  return markup.replace(/<button\b([^>]*)>([\s\S]*?)<\/button>/g, (full, attrs, content) => {
    const tool = attrs.match(/data-route-tab="([^"]+)"/);
    const modal = attrs.match(/data-modal-target="([^"]+)"/);
    const href = tool ? toolPaths[tool[1]] : modal ? infoPaths[modal[1]] : attrs.includes('brand-home-btn') ? '/' : attrs.includes('nav-carousel-inspector-btn') ? toolPaths.carousel : null;
    return href ? `<a ${attrs.replace(/\s*type="button"/, '')} href="${href}">${content}</a>` : full;
  }).replace(/href="#blog-section"/g, 'href="/blog"').replace(/href="#([^"\s]+)"/g, 'href="/#$1"')
    .replace(/(<select\b[^>]*id="language-select"[^>]*>)[\s\S]*?<\/select>/, '$1<option value="en">EN · English</option></select>');
}
const header = linkify(reference.markup.match(/<header\b[\s\S]*?<\/header>/)?.[0] || '');
const footer = crawlableNavigation(linkify(reference.markup.match(/<footer\b[\s\S]*?<\/footer>/)?.[0] || ''));
export function BlogShell({ children }: { children: React.ReactNode }) {
  return <><SiteChrome markup={publicBrandMarkup(header)} /><main id="blog-main" className="blog-main">{children}</main><SiteChrome markup={publicBrandMarkup(footer)} /></>;
}
