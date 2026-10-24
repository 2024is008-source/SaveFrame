const assert = require('node:assert/strict');
const en = require('../src/i18n/dictionaries/en.json');
const locales = ['en', 'es', 'pt-br', 'de', 'fr', 'ja', 'id', 'tr', 'hi', 'ar'];
const base = process.env.TEST_BASE_URL || 'http://localhost:3000';
const origin = 'https://saveframe.site';
const home = locale => locale === 'en' ? '/' : `/${locale}/`;
const escape = value => value.replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));
async function main() {
  for (const locale of locales) {
    const response = await fetch(base + home(locale));
    assert.equal(response.status, 200, locale);
    assert.equal(new URL(response.url).pathname, home(locale));
    const html = await response.text();
    const tag = locale === 'pt-br' ? 'pt-BR' : locale;
    assert.match(html, new RegExp(`<html[^>]*lang="${tag}"[^>]*dir="${locale === 'ar' ? 'rtl' : 'ltr'}"`));
    assert.equal(new URL(html.match(/<link rel="canonical" href="([^"]+)"/)[1]).href, origin + home(locale));
    for (const item of [...locales, 'x-default']) {
      const hreflang = item === 'pt-br' ? 'pt-BR' : item;
      const alternate = html.match(new RegExp(`hrefLang="${hreflang}" href="([^"]+)"`));
      assert.ok(alternate, locale + ': missing hreflang ' + item);
      assert.equal(new URL(alternate[1]).href, origin + home(item === 'x-default' ? 'en' : item));
    }
    const dict = require(`../src/i18n/dictionaries/${locale}.json`);
    const visible = html.replace(/<script\b[^>]*>[\s\S]*?<\/script>/g, '');
    for (const key of ['Instagram Downloader', 'Save Supported Media in Three Steps', 'Frequently Asked Questions', 'Built for Fast, Transparent Media Inspection', 'Downloader Tools', 'Creator Workflow & Format Guides']) assert.ok(visible.includes(escape(dict[key])), locale + ': missing server translation ' + key);
    assert.ok(html.includes(`<title>${escape(dict['SaveFrame — Instagram Downloader for Photos, Reels, Videos & Stories'])}</title>`));
    assert.ok(visible.includes('How to Download Instagram Stories by Link'));
    assert.ok(!html.includes('href="/' + locale + '/blog'));
    if (locale !== 'en') {
      const redirect = await fetch(base + '/' + locale, { redirect: 'manual' });
      assert.equal(redirect.status, 308);
      assert.equal(new URL(redirect.headers.get('location'), base).pathname, home(locale));
    }
  }
  for (const path of ['/en/', '/pt/', '/xx/', '/es/blog', '/ar/privacy']) {
    assert.equal((await fetch(base + path)).status, 404, path);
  }
  const blog = await (await fetch(base + '/blog')).text();
  assert.match(blog, /<html[^>]*lang="en"[^>]*dir="ltr"/);
  assert.ok(!blog.includes('hrefLang='), 'Homepage alternatives must not leak into the blog');
  const spoof = await (await fetch(base + '/blog', { headers: { 'x-saveframe-locale': 'ar' } })).text();
  assert.match(spoof, /<html[^>]*lang="en"/);
  const sitemap = await (await fetch(base + '/sitemap.xml')).text();
  assert.equal((sitemap.match(/<loc>/g) || []).length, 26);
  for (const locale of locales) assert.ok(sitemap.includes(`<loc>${origin}${home(locale)}</loc>`));
  assert.ok(sitemap.includes('hreflang="pt-BR"'));
  assert.equal((await fetch(base + '/saveframe.js')).status, 200);
  assert.equal((await fetch(base + '/api/health')).status, 200);
  console.log('PASS: 10 SSR homepages, localized metadata, lang/dir, 11 hreflang alternatives each, trailing-slash redirects, invalid-locale 404s, English blog isolation, static/API paths and 26 sitemap entries.');
}
main().catch(error => { console.error(error); process.exitCode = 1; });
