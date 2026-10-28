import reference from '../ui/saveframe.json';
import { crawlableNavigation } from './navigation';
import { jsonLd, pageGraph } from './seo';
import { publicSettings } from '../admin/db';
import { publicBrandMarkup } from '../admin/public-seo';
import { escapeHtml, homepageBlogMarkup } from './blog';

/** The supplied SaveFrame page, with TikTok content and its original visual system. */
export function tiktokPageMarkup(tool?: 'photo' | 'video') {
  let markup = crawlableNavigation(reference.markup);
  const photo = tool === 'photo';
  const title = tool ? photo ? 'Download TikTok Photos & Slideshows' : 'Download TikTok Videos as MP4' : 'Download TikTok Videos & Photos';
  const description = tool ? photo ? 'Save public TikTok photos and photo slideshows with a simple link.' : 'Save public TikTok videos as MP4 with a simple link.' : 'Save public TikTok videos and photo slideshows with a simple link.';
  markup = markup.replace(/(<h1\b[^>]*id="hero-heading"[^>]*>)[\s\S]*?(<\/h1>)/, '$1' + escapeHtml(title) + '$2')
    .replace(/(<p\b[^>]*id="hero-description"[^>]*>)[\s\S]*?(<\/p>)/, '$1' + description + '$2')
    .replace(/(<input\b[^>]*id="tiktok-url-input"[^>]*)(>)/, '$1 inputmode="url" dir="ltr"$2')
    .replace('type="url"', 'type="text"');
  if (tool) {
    markup = markup.replace(/<button\b[^>]*id="tab-(photo|video)"[^>]*>/g, (tag, name: string) => tag.replace(/aria-selected="[^"]*"/, `aria-selected="${name === tool}"`));
    markup = markup.replace('aria-labelledby="tab-photo"', `aria-labelledby="tab-${tool}"`);
    markup = markup.replace(/(<input\b[^>]*id="tiktok-url-input"[^>]*placeholder=")[^"]*/, '$1' + (photo ? 'Paste a TikTok photo post or share link' : 'Paste a TikTok video or share link'));
    const pageTitle = title;
    const subtitle = photo ? 'Paste a public TikTok photo post or share link to save individual images or the whole slideshow.' : 'Paste a public TikTok video or share link to preview available MP4 formats.';
    for (const [id, text] of [['panel-tool-title', pageTitle], ['panel-tool-subtitle', subtitle], ['submit-btn-label', photo ? 'Download Photo' : 'Download Video']]) markup = markup.replace(new RegExp('(<[^>]+id="' + id + '"[^>]*>)[\\s\\S]*?(<\\/[^>]+>)'), '$1' + escapeHtml(text) + '$2');
  }
  const pageTool = tool ? {tool, title, description, slug: tool + '-downloader'} : undefined;
  markup = markup.replace('</main>', homepageBlogMarkup() + '</main>');
  const settings = { ...publicSettings(), defaultTool: tool || 'photo' };
  return publicBrandMarkup(markup) + `<script type="application/json" id="home-i18n">${jsonLd({locale:'en',home:'/',language:'en',dictionary:{},publicSettings:settings,pageTool})}</script><script type="application/ld+json">${jsonLd(pageGraph(tool ? '/' + tool + '-downloader' : '/', title, description, 'en', true))}</script>`;
}
