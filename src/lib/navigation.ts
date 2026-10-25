export const toolPaths: Record<string, string> = { photo: '/photo-downloader', reels: '/reels-downloader', video: '/video-downloader', carousel: '/carousel-downloader', story: '/story-downloader', profile: '/profile-viewer' };
export const infoPaths: Record<string, string> = { privacy: '/privacy', terms: '/terms', contact: '/contact' };
export function crawlableNavigation(markup: string, home = '/') {
  const linked = markup.replace(/<button\b([^>]*)>([\s\S]*?)<\/button>/g, (full, attrs, content) => {
    const tool = attrs.match(/data-route-tab="([^"]+)"/)?.[1];
    const legal = attrs.match(/data-modal-target="([^"]+)"/)?.[1];
    const href = tool ? toolPaths[tool] : legal ? infoPaths[legal] : attrs.includes('nav-carousel-inspector-btn') ? toolPaths.carousel : attrs.includes('brand-home-btn') ? home : null;
    return href ? `<a ${attrs.replace(/\s*type="button"/, '')} href="${href}">${content}</a>` : full;
  }).replace(/(<\/?)(h4)\b/g, '$1h2');
  return linked.replace(/(<footer\b[\s\S]*)(<\/ul>)/, '$1<li><a href="/about" class="hover:text-ink hover:underline">About SaveFrame</a></li><li><a href="/copyright" class="hover:text-ink hover:underline">Copyright</a></li>$2');
}
