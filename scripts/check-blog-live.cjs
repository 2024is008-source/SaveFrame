const assert = require('node:assert/strict');
const records = require('../src/content/blog/posts.json').filter(post => post.published);
const base = process.env.TEST_BASE_URL || 'http://localhost:3000';
async function page(path, status = 200) {
  const response = await fetch(base + path);
  assert.equal(response.status, status, path);
  return response.text();
}
async function main() {
  for (const post of records) {
    const html = await page('/blog/' + post.slug);
    assert.ok(html.includes(`href="https://saveframe.site/blog/${post.slug}"`));
    assert.match(html, /name="robots" content="index, follow"/);
    const script = html.match(/<script type="application\/ld\+json">(.*?)<\/script>/s);
    const data = JSON.parse(script[1]);
    assert.equal(data[0]['@type'], 'BlogPosting');
    assert.equal(data[0].headline, post.title);
    assert.equal(data[1]['@type'], 'BreadcrumbList');
    assert.ok(html.includes('article-prose'));
  }
  await page('/blog/not-a-published-article', 404);
  assert.match(await page('/blog?page=2'), /Showing 10–15 of 15 guides/);
  assert.match(await page('/blog?q=audio'), /Showing 1–2 of 2 guides/);
  assert.match(await page('/blog?category=Instagram+Stories'), /Showing 1–2 of 2 guides/);
  assert.match(await page('/blog?q=notarealtopicxyz'), /No guides match your search/);
  assert.match(await page('/blog?q=audio'), /name="robots" content="noindex, follow"/);
  const home = await page('/');
  assert.match(home, /How to Download Instagram Stories by Link/);
  assert.ok(!home.includes('Understanding Instagram Reels Export Settings'));
  const sitemap = await page('/sitemap.xml');
  assert.equal((sitemap.match(/<loc>/g) || []).length, 26);
  assert.ok(!sitemap.includes('localhost'));
  assert.match(await page('/robots.txt'), /Sitemap: https:\/\/saveframe.site\/sitemap.xml/);
  console.log('Live checks passed: 15 articles, 404, search, categories, pagination, home cards, canonical URLs, structured data, robots and sitemap.');
}
main().catch(error => { console.error(error); process.exitCode = 1; });
