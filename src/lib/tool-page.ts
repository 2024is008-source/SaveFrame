import tools from '../content/tools.json';
import { localizedHomepage } from '../i18n/homepage';
import { escapeHtml, getPost } from './blog';
import { jsonLd, pageGraph } from './seo';
export type ToolPage = typeof tools[number];
export function toolPageMarkup(page: ToolPage) {
  let html = localizedHomepage('en');
  html = html.replace(/(<h1\b[^>]*id="hero-heading"[^>]*>)[\s\S]*?(<\/h1>)/, `$1${escapeHtml(page.title)}$2`)
    .replace(/(<p\b[^>]*id="hero-description"[^>]*>)[\s\S]*?(<\/p>)/, `$1${escapeHtml(page.description)}$2`);
  const wrap = (id: string, content: string) => `<section id="${id}" class="py-12 sm:py-16 px-4 sm:px-6 border-t border-line"><div class="max-w-[1120px] mx-auto"><div class="article-prose blog-article">${content}</div></div></section>`;
  const instructions = wrap('how-to-use', `<nav class="breadcrumbs" aria-label="Breadcrumb"><a href="/">Home</a> / <span>${escapeHtml(page.title)}</span></nav><h2>${escapeHtml(page.heading)}</h2><p>${escapeHtml(page.intro)}</p><p>${escapeHtml(page.body)}</p><h3>How to use this tool</h3><ol>${page.steps.map(step => `<li>${escapeHtml(step)}</li>`).join('')}</ol>`);
  const limits = wrap('features-section', `<h2>Available files and access limits</h2><p>${escapeHtml(page.limits)}</p><p>Choose the tool for your link: ${tools.map(tool => `<a href="/${tool.slug}">${escapeHtml(tool.title)}</a>`).join(' · ')}.</p>`);
  const faq = wrap('faq-section', `<h2>Questions about ${escapeHtml(page.title)}</h2>${page.faqs.map(([q, a]) => `<details class="border-b border-line py-3"><summary class="font-semibold cursor-pointer">${escapeHtml(q)}</summary><p>${escapeHtml(a)}</p></details>`).join('')}<h2>Related guides</h2><ul>${page.guides.map(slug => { const post = getPost(slug); return post ? `<li><a href="/blog/${slug}">${escapeHtml(post.title)}</a></li>` : ''; }).join('')}</ul>`);
  for (const [id, content] of [['how-to-use', instructions], ['features-section', limits], ['faq-section', faq]]) html = html.replace(new RegExp(`<section\\b(?=[^>]*id="${id}")[\\s\\S]*?<\\/section>`), content);
  html = html.replace(/(<script type="application\/json" id="home-i18n">)([\s\S]*?)(<\/script>)/, (_, open, data, close) => open + jsonLd({ ...JSON.parse(data), pageTool: { slug: page.slug, tool: page.tool, title: page.title, description: page.description } }) + close);
  html = html.replace(/<script type="application\/ld\+json">[\s\S]*?<\/script>/g, '');
  return html.replace(/(<select\b[^>]*id="language-select"[^>]*>)[\s\S]*?<\/select>/, '$1<option value="en">EN · English</option></select>') + `<script type="application/ld+json">${jsonLd(pageGraph('/' + page.slug, page.title, page.description, 'en', true))}</script>`;
}
