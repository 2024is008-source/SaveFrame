const assert = require('node:assert/strict');
const fs = require('node:fs');
const base = process.env.TEST_BASE_URL || 'http://localhost:3000';
const origin = 'https://saveframe.site';
const decode = text => text.replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>');
async function main() {
  const sitemap = await (await fetch(base + '/sitemap.xml')).text();
  const urls = [...sitemap.matchAll(/<loc>([^<]+)<\/loc>/g)].map(match => new URL(decode(match[1])));
  assert.equal(urls.length, 37);
  const pages = [...urls.map(url => url.pathname), '/blog?page=2'];
  const titles = new Set(), descriptions = new Set(), links = new Set(), rows = [], fragments = [], htmlCache = new Map();
  for (const path of pages) {
    const start = performance.now();
    const response = await fetch(base + path);
    assert.equal(response.status, 200, path);
    const html = await response.text();
    htmlCache.set(path, html);
    const title = decode(html.match(/<title>(.*?)<\/title>/s)?.[1] || '');
    const description = decode(html.match(/<meta name="description" content="([^"]*)"/)?.[1] || '');
    assert.ok(title && description, path + ': metadata missing');
    assert.ok(!titles.has(title), path + ': duplicate title'); titles.add(title);
    assert.ok(!descriptions.has(description), path + ': duplicate description'); descriptions.add(description);
    assert.equal((html.match(/<h1\b/g) || []).length, 1, path + ': H1 count');
    assert.equal(new URL(html.match(/<link rel="canonical" href="([^"]+)"/)[1]).href, origin + path, path + ': canonical');
    assert.match(html, /name="robots" content="index, follow"/, path);
    assert.match(html, /property="og:image"/, path);
    assert.match(html, /name="twitter:card"/, path);
    assert.match(html, /name="viewport"/, path);
    const schemas = [...html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)].map(match => JSON.parse(match[1]));
    assert.ok(schemas.length, path + ': schema missing');
    const nodes = schemas.flatMap(value => Array.isArray(value) ? value : value['@graph'] || [value]);
    for (const data of schemas) assert.ok(Array.isArray(data) || data['@context'] === 'https://schema.org');
    assert.ok(nodes.some(node => ['WebPage', 'BlogPosting'].includes(node['@type'])), path + ': page schema');
    for (const node of nodes) {
      assert.ok(!node.aggregateRating && !node.review, path + ': no invented ratings');
      if (node['@type'] === 'BreadcrumbList') for (const [index, item] of node.itemListElement.entries()) { assert.equal(item.position, index + 1); assert.ok(item.name); assert.ok(new URL(item.item).origin === origin); }
      if (node['@type'] === 'BlogPosting') { assert.ok(node.author.name && node.image.length); assert.ok(!Number.isNaN(Date.parse(node.datePublished))); }
      if (node['@type'] === 'WebApplication') { assert.ok(node.name && node.url && node.operatingSystem && node.applicationCategory); }
    }
    const body = html.replace(/<script\b[^>]*>[\s\S]*?<\/script>/g, '');
    for (const match of body.matchAll(/<a\b[^>]*href="([^"]+)"/g)) {
      const target = new URL(decode(match[1]), origin + path);
      if (target.origin === origin) { assert.ok(!target.pathname.startsWith('/api/')); links.add(target.pathname + target.search); if (target.hash) fragments.push({ path: target.pathname + target.search, id: decodeURIComponent(target.hash.slice(1)) }); }
    }
    for (const match of body.matchAll(/<img\b([^>]+)>/g)) assert.match(match[1], /\balt="[^"]*"/, path + ': image alt');
    rows.push({ path, status: response.status, title, description, h1: 1, schemaTypes: nodes.map(node => node['@type']), responseAndBodyMs: Math.round(performance.now() - start) });
  }
  for (const path of links) assert.equal((await fetch(base + path)).status, 200, 'Broken internal link ' + path);
  for (const { path, id } of fragments) {
    if (!htmlCache.has(path)) htmlCache.set(path, await (await fetch(base + path)).text());
    assert.ok(htmlCache.get(path).includes(`id="${id}"`), `Broken fragment ${path}#${id}`);
  }
  for (const path of pages.filter(path => path !== '/' && !/^\/[a-z]{2}(?:-br)?\/$/.test(path))) assert.ok(links.has(path), 'Orphan page ' + path);
  for (const path of ['/api/health', '/api/media/jobs/unknown-seo-check']) {
    const response = await fetch(base + path); assert.match(response.headers.get('x-robots-tag') || '', /noindex/);
  }
  assert.equal((await fetch(base + '/not-a-real-page')).status, 404);
  assert.match(await (await fetch(base + '/blog?q=audio')).text(), /name="robots" content="noindex, follow"/);
  const contact = await (await fetch(base + '/contact')).text(); assert.ok(contact.includes('mailto:backbencherz@gmail.com'));
  const robots = await (await fetch(base + '/robots.txt')).text(); assert.match(robots, /Sitemap: https:\/\/saveframe.site\/sitemap.xml/); assert.ok(!robots.includes('Disallow: /_next'));
  fs.mkdirSync('reports', { recursive: true });
  fs.writeFileSync('reports/seo-crawl.json', JSON.stringify({ scope: 'Local production build; not public production verification', pages: rows, internalDestinationsChecked: [...links].sort() }, null, 2));
  console.log(`PASS: ${rows.length} indexable pages; unique metadata, H1, canonicals, schema, social tags, ${links.size} internal destinations, API noindex, contact, sitemap and 404.`);
}
main().catch(error => { console.error(error); process.exitCode = 1; });
