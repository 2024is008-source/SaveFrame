import reference from '../ui/saveframe.json';
import { crawlableNavigation } from './navigation';
import { jsonLd, pageGraph } from './seo';
import { publicSettings } from '../admin/db';
import { publicBrandMarkup } from '../admin/public-seo';
import { escapeHtml, homepageBlogMarkup } from './blog';
import tools from '../content/tools.json';

/** The supplied SaveFrame page, with TikTok content and its original visual system. */
export function tiktokPageMarkup(tool?: 'photo' | 'video') {
  let markup = crawlableNavigation(reference.markup);
  const activeTool = tool || 'video';
  const content = tools.find(page => page.tool === tool);
  const photo = tool === 'photo';
  const title = tool ? photo ? 'Download TikTok Photos & Slideshows' : 'Download TikTok Videos as MP4' : 'Download TikTok Videos & Photos';
  const description = tool ? photo ? 'Save public TikTok photos and photo slideshows with a simple link.' : 'Save public TikTok videos as MP4 with a simple link.' : 'Save public TikTok videos and photo slideshows with a simple link.';
  markup = markup.replace(/(<h1\b[^>]*id="hero-heading"[^>]*>)[\s\S]*?(<\/h1>)/, '$1' + escapeHtml(title) + '$2')
    .replace(/(<p\b[^>]*id="hero-description"[^>]*>)[\s\S]*?(<\/p>)/, '$1' + description + '$2')
    .replace(/(<input\b[^>]*id="tiktok-url-input"[^>]*)(>)/, '$1 inputmode="url" dir="ltr"$2')
    .replace('type="url"', 'type="text"');
  {
    markup = markup.replace(/<button\b[^>]*id="tab-(photo|video)"[^>]*>/g, (tag, name: string) => {
      const active = name === activeTool;
      return tag.replace(/aria-selected="[^"]*"/, `aria-selected="${active}"`).replace(/class="[^"]*"/, `class="media-tab-btn min-h-[52px] sm:min-h-[48px] px-1.5 sm:px-3 py-2 rounded-xl flex flex-col sm:flex-row items-center justify-center gap-1 sm:gap-2 text-xs sm:text-sm cursor-pointer ui-transition ${active ? 'font-semibold bg-white text-brand-violet border border-line' : 'font-medium text-ink-muted hover:text-ink border border-transparent'}"`);
    });
    markup = markup.replace('aria-labelledby="tab-photo"', `aria-labelledby="tab-${activeTool}"`);
    markup = markup.replace(/(<input\b[^>]*id="tiktok-url-input"[^>]*placeholder=")[^"]*/, '$1' + (photo ? 'Paste a TikTok photo post or share link' : 'Paste a TikTok video or share link'));
    const pageTitle = tool ? title : 'TikTok Video & Photo Downloader';
    const subtitle = photo ? 'Paste a public TikTok photo post or share link to save individual images or the whole slideshow.' : 'Paste a public TikTok video or share link to preview available MP4 formats.';
    for (const [id, text] of [['panel-tool-title', pageTitle], ['panel-tool-subtitle', subtitle], ['submit-btn-label', photo ? 'Download Photo' : 'Download Video']]) markup = markup.replace(new RegExp('(<[^>]+id="' + id + '"[^>]*>)[\\s\\S]*?(<\\/[^>]+>)'), '$1' + escapeHtml(text) + '$2');
  }
  if (content) {
    const wrap = (id: string, body: string) => `<section id="${id}" class="py-12 sm:py-16 px-4 sm:px-6 border-t border-line"><div class="max-w-[1120px] mx-auto">${body}</div></section>`;
    const headingClass = 'font-display font-bold text-2xl sm:text-3xl text-ink leading-tight';
    const steps = wrap('how-to-use', `<h2 class="${headingClass}">How to download TikTok ${photo ? 'photo slideshows' : 'videos as MP4'}</h2><p class="mt-3 text-ink-muted">${escapeHtml(content.intro)}</p><p class="mt-3 text-ink-muted">${escapeHtml(content.body)}</p><ol class="grid grid-cols-1 md:grid-cols-3 gap-6 mt-8">${content.steps.map((step, index) => `<li class="bg-white border border-line rounded-2xl p-5 sm:p-6"><h3 class="font-display font-bold text-lg text-ink mb-2">${index + 1}. ${photo ? ['Copy the photo post link', 'Inspect the slideshow', 'Save images or an ordered ZIP'][index] : ['Copy the video link', 'Check MP4 formats and sound', 'Save and play the MP4'][index]}</h3><p class="text-sm text-ink-muted leading-relaxed">${escapeHtml(step)}</p></li>`).join('')}</ol>`);
    const features = wrap('features-section', `<h2 class="${headingClass}">${photo ? 'Photo files, slideshow order and ZIP contents' : 'MP4 formats, video quality and sound'}</h2><dl class="grid grid-cols-1 sm:grid-cols-2 gap-6 mt-8">${content.specs.map(([name, value]) => `<div class="bg-soft border border-line rounded-xl p-5"><dt class="font-semibold text-ink">${escapeHtml(name)}</dt><dd class="mt-2 text-sm text-ink-muted">${escapeHtml(value)}</dd></div>`).join('')}</dl><p class="mt-6 text-sm text-ink-muted leading-relaxed">${escapeHtml(content.limits)}</p>`);
    for (const [id, body] of [['how-to-use', steps], ['features-section', features]]) markup = markup.replace(new RegExp(`<section\\b(?=[^>]*id="${id}")[\\s\\S]*?<\\/section>`), body);
    // Keep the existing accordion controls and replace both visible questions and answers.
    content.faqs.forEach(([question, answer], index) => {
      const number = index + 1;
      markup = markup.replace(new RegExp(`(<button\\b[^>]*id="faq-btn-${number}"[^>]*>[\\s\\S]*?<span>)[\\s\\S]*?(<\\/span>)`), '$1' + escapeHtml(question) + '$2');
      markup = markup.replace(new RegExp(`(<div\\b[^>]*id="faq-panel-${number}"[^>]*>)[\\s\\S]*?(<\\/div>)`), '$1' + escapeHtml(answer) + '$2');
    });
  }
  const pageTool = tool ? {tool, title, description, slug: tool + '-downloader'} : undefined;
  markup = markup.replace('</main>', homepageBlogMarkup(content?.guides) + '</main>');
  const settings = { ...publicSettings(), defaultTool: activeTool };
  const faq = content ? `<script type="application/ld+json">${jsonLd({'@context':'https://schema.org','@type':'FAQPage',mainEntity:content.faqs.map(([question, answer])=>({'@type':'Question',name:question,acceptedAnswer:{'@type':'Answer',text:answer}}))})}</script>` : '';
  return publicBrandMarkup(markup) + `<script type="application/json" id="home-i18n">${jsonLd({locale:'en',home:'/',language:'en',dictionary:{},publicSettings:settings,pageTool})}</script><script type="application/ld+json">${jsonLd(pageGraph(tool ? '/' + tool + '-downloader' : '/', title, description, 'en', true))}</script>` + faq;
}
