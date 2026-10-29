const assert = require('node:assert/strict');
const fs = require('node:fs');
const titles = require('../src/content/search-titles.json');
const base = process.argv[2] || process.env.TEST_BASE_URL || 'http://127.0.0.1:3000';
if (!['localhost', '127.0.0.1'].includes(new URL(base).hostname)) throw Error('Use a local preview.');
const decode = value => value.replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#x27;|&#39;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>');
function tag(html, attribute, value) {
  const tags = [...html.matchAll(/<meta\b[^>]*>/gi)].map(match => match[0]);
  return decode(tags.find(markup => markup.includes(`${attribute}="${value}"`))?.match(/content="([^"]*)"/)?.[1] || '');
}
async function main() {
  const results = [];
  const seenTitles = new Set(), seenDescriptions = new Set();
  const sitemap = await (await fetch(base + '/sitemap.xml')).text();
  for (const entry of sitemap.matchAll(/<url>([\s\S]*?)<\/url>/g)) assert.match(entry[1], /<lastmod>[^<]+<\/lastmod>/, 'Every sitemap entry needs a content date');
  assert.ok(!sitemap.includes('?page=2'), 'All current guides fit on the main catalog');
  const paths = [...sitemap.matchAll(/<loc>([^<]+)<\/loc>/g)].map(match => {
    const url = new URL(decode(match[1]));
    assert.equal(url.origin, 'https://tiksavemp4.online');
    return url.pathname + url.search;
  });
  assert.deepEqual(paths.sort(), Object.keys(titles).sort(), 'Every indexable URL needs reviewed metadata.');
  for (const path of paths) {
    const response = await fetch(base + path, { headers: { 'User-Agent': 'Googlebot' } });
    assert.equal(response.status, 200, path);
    const html = await response.text();
    if (path === '/blog') {
      for (const post of [...require('../src/content/blog/posts.json'), ...require('../src/content/blog/legacy-posts.json')].filter(post=>post.published)) assert.ok(html.includes(`href="/blog/${post.slug}"`), `Catalog links ${post.slug}`);
    }
    if (['/', '/video-downloader', '/photo-downloader', '/privacy'].includes(path)) assert.ok(html.includes('href="/responsible-use"'), 'Responsible use is linked');
    if (path === '/') assert.match(html, /id="tab-video"[^>]*aria-selected="true"/, 'Video is the SSR default');
    const tool = require('../src/content/tools.json').find(tool => '/' + tool.slug === path);
    if (tool) {
      const schemas=[...html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)].map(match=>JSON.parse(match[1]));
      const faq=schemas.find(schema=>schema['@type']==='FAQPage');
      assert.equal(faq?.mainEntity.length, 5);
      for (const [index, [question, answer]] of tool.faqs.entries()) {
        const panel=html.match(new RegExp(`<div[^>]*id="faq-panel-${index+1}"[^>]*>([\\s\\S]*?)<\\/div>`));
        assert.equal(decode(panel?.[1]||'').trim(),answer,'Visible FAQ matches schema');
        assert.equal(faq.mainEntity[index].name,question);
        assert.equal(faq.mainEntity[index].acceptedAnswer.text,answer);
      }
      for (const slug of tool.guides) assert.ok(html.includes(`href="/blog/${slug}"`));
    }
    const matches = [...html.matchAll(/<title>([^<]*)<\/title>/g)];
    assert.equal(matches.length, 1, path + ': one title');
    const title = decode(matches[0][1]), description = tag(html, 'name', 'description');
    assert.equal(title, titles[path], path);
    assert.ok(description.length > 70 && description.length < 190, path + ': useful summary');
    assert.ok(!/instagram|saveframe|�|Ã|â€/i.test(title + description), path + ': no stale or corrupted text');
    assert.ok(!seenTitles.has(title), path + ': unique title');
    assert.ok(!seenDescriptions.has(description), path + ': unique description');
    seenTitles.add(title); seenDescriptions.add(description);
    assert.equal(tag(html, 'property', 'og:title'), title, path);
    assert.equal(tag(html, 'property', 'og:description'), description, path);
    assert.equal(tag(html, 'name', 'twitter:title'), title, path);
    assert.equal(tag(html, 'name', 'twitter:description'), description, path);
    const canonical = html.match(/<link[^>]*rel="canonical"[^>]*href="([^"]+)"/);
    assert.equal(new URL(decode(canonical?.[1] || '')).href, new URL(path, 'https://tiksavemp4.online').href, path + ': canonical');
    results.push({ path, title, description });
  }
  for (const locale of ['en','es','fr','pt-br']) for (const slash of ['', '/']) {
    const response=await fetch(base+'/'+locale+slash,{redirect:'manual'});
    assert.equal(response.status,308,'One permanent locale redirect');
    assert.equal(new URL(response.headers.get('location')).pathname,'/');
  }
  for (const path of ['/nonexistent-seo-check']) {
    const response = await fetch(base + path);
    assert.equal(response.status, 404, path);
    if (path.includes('admin')) assert.match(response.headers.get('x-robots-tag') || '', /noindex/);
  }
  assert.equal((await fetch(base+'/admin/login')).status,200,'Admin login is accessible');
  assert.equal((await fetch(base+'/api/admin/settings')).status,401,'Admin API requires authentication');
  fs.mkdirSync('reports/seo', { recursive: true });
  fs.writeFileSync('reports/seo/metadata.json', JSON.stringify(results, null, 2) + '\n');
  console.log(`PASS: ${results.length} sitemap URLs, unique titles/descriptions, matching social metadata, canonicals, protected admin routes and unknown 404s.`);
}
main().catch(error => { console.error(error); process.exitCode = 1; });
