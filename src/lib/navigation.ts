export const toolPaths: Record<string, string> = { photo: '/photo-downloader', video: '/video-downloader', carousel: '/photo-downloader' };
export const infoPaths: Record<string, string> = { privacy: '/privacy', terms: '/terms', contact: '/contact' };
export function crawlableNavigation(markup: string, home = '/') {
  const linked = markup.replace(/<button\b([^>]*)>([\s\S]*?)<\/button>/g, (full, attrs, content) => {
    const tool = attrs.match(/data-route-tab="([^"]+)"/)?.[1];
    const legal = attrs.match(/data-modal-target="([^"]+)"/)?.[1];
    const href = tool ? toolPaths[tool] : legal ? infoPaths[legal] : attrs.includes('nav-carousel-inspector-btn') ? toolPaths.carousel : attrs.includes('brand-home-btn') ? home : null;
    return href ? `<a ${attrs.replace(/\s*type="button"/, '')} href="${href}">${content}</a>` : full;
  }).replace(/(<\/?)(h4)\b/g, '$1h2')
    // These are navigation disclosures, not application menus. Keep native
    // anchor/Tab behavior without promising ARIA menu-item arrow semantics.
    .replace(/(id="nav-(downloader|viewer)-menu"\s*)role="menu"/g, '$1role="group" aria-labelledby="nav-$2-btn"');
  return linked.replace(/(<footer\b[\s\S]*)(<\/ul>)/, '$1<li><a href="/about" class="hover:text-ink hover:underline">About TikSaveMP4</a></li><li><a href="/copyright" class="hover:text-ink hover:underline">Copyright</a></li><li><a href="/responsible-use" class="hover:text-ink hover:underline">Responsible Use</a></li>$2');
}
