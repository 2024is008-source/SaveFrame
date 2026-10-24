import reference from '../ui/saveframe.json';
import { homepageBlogMarkup, escapeHtml } from '../lib/blog';
import { getDictionary, translate, type TranslationKey } from './server';
import { localeOptions, locales, localePath, languageTag, type Locale } from './config';
const decode = (value: string) => value.replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>');
export function localizedHomepage(locale: Locale) {
  const dict = getDictionary(locale);
  const text = (source: string) => {
    const key = decode(source.trim()) as TranslationKey;
    return dict[key] ? source.replace(source.trim(), escapeHtml(dict[key])) : source;
  };
  let markup = reference.markup.replace(/>([^<>]+)</g, (_, value: string) => `>${text(value)}<`)
    .replace(/(aria-label|placeholder|title|alt)="([^"]*)"/g, (_, attr: string, value: string) => `${attr}="${text(value)}"`);
  markup = markup.replace(/(<span data-i18n="navDownloader">)[^<]*(<\/span>)/, `$1${escapeHtml(dict['nav.downloader'])}$2`).replace(/(<span data-i18n="navViewer">)[^<]*(<\/span>)/, `$1${escapeHtml(dict['nav.viewer'])}$2`);
  markup = markup.replace(/(<select\b[^>]*id="language-select"[^>]*>)[\s\S]*?<\/select>/, (_, open: string) => `${open}${locales.map(item => `<option value="${item}"${item === locale ? ' selected' : ''}>${localeOptions[item]}</option>`).join('')}</select>`);
  // Article content remains English. Only the surrounding homepage interface is localized.
  let blog = homepageBlogMarkup();
  for (const source of ['Creator Workflow & Format Guides', 'Practical guides to saving Instagram stories, photos, and Reels.', 'View All Guides →', 'Read guide'] as const) blog = blog.replaceAll(escapeHtml(source), escapeHtml(dict[source]));
  blog = blog.replace(/(\d+) min read/g, (_, minutes: string) => escapeHtml(translate(dict, '{minutes} min read', { minutes })));
  for (const [category, label] of [['Instagram Stories', 'Story'], ['Instagram Photos', 'Photo'], ['Instagram Reels', 'Reels']] as const) blog = blog.replaceAll(`>${category}</span>`, `>${escapeHtml(locale === 'en' ? category : 'Instagram · ' + dict[label])}</span>`);
  blog = blog.replace(/(<time datetime="([^"]+)">)[^<]+(<\/time>)/g, (_, open: string, date: string, close: string) => open + new Intl.DateTimeFormat(languageTag(locale), { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' }).format(new Date(date + 'T00:00:00Z')) + close);
  // Editorial titles and descriptions remain English, including their text direction in Arabic.
  blog = blog.replace(/(<h3\b[^>]*)(>)/g, '$1 lang="en" dir="ltr"$2').replace(/(<p class="text-sm sm:text-base text-ink-muted leading-relaxed")>/g, '$1 lang="en" dir="ltr">');
  if (locale !== 'en') blog = blog.replace(/(<a href="\/blog\/[^" ]+"[^>]*)(>)/g, `$1 title="${escapeHtml(dict['English article'])}"$2`);
  markup = markup.replace('<section data-home-blog></section>', blog);
  markup = markup.replace('id="info-modal-body"', 'id="info-modal-body" lang="en" dir="ltr"').replace('id="info-modal-title"', 'id="info-modal-title" lang="en" dir="ltr"');
  markup = markup.replace('type="url"', 'type="text" inputmode="url" dir="ltr"');
  const client = JSON.stringify({ locale, home: localePath(locale), language: languageTag(locale), dictionary: dict }).replace(/</g, '\\u003c');
  return markup + `<script type="application/json" id="home-i18n">${client}</script>`;
}
