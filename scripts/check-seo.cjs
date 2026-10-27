const assert = require('node:assert/strict');
const fs = require('node:fs');
const base = process.env.TEST_BASE_URL || 'http://localhost:3000';
const origin = 'https://saveframe.site';
const decode = text => text.replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>');
async function main() {
  const sitemap = await (await fetch(base + '/sitemap.xml')).text();
  const urls = [...sitemap.matchAll(/<loc>([^<]+)<\/loc>/g)].map(match => new URL(decode(match[1])));
  assert.equal(urls.length, 37);
  const homeAlternates={en:'/',es:'/es/','pt-BR':'/pt-br/',de:'/de/',fr:'/fr/',ja:'/ja/',id:'/id/',tr:'/tr/',hi:'/hi/',ar:'/ar/','x-default':'/'};
  const expectedLanguages=Object.fromEntries(Object.entries(homeAlternates).map(([language,path])=>[language,origin+path]));
  const tools=require('../src/content/tools.json'),information=require('../src/content/information.json'),posts=require('../src/content/blog/posts.json').filter(post=>post.published);
  assert.equal(tools.length,6);assert.equal(information.length,5);assert.equal(posts.length,15);
  const expectedUrls=[...new Set(Object.values(expectedLanguages)),...tools.map(page=>origin+'/'+page.slug),...information.map(page=>origin+'/'+page.slug),origin+'/blog',...posts.map(post=>origin+'/blog/'+post.slug)];
  assert.deepEqual(urls.map(url=>url.href).sort(),expectedUrls.sort(),'Preserve the exact canonical URL set');
  assert.equal(new Set(urls.map(url=>url.href)).size,37,'No duplicate sitemap URLs');
  assert.equal(/<(?:changefreq|priority)\b/i.test(sitemap),false,'No unused priority/frequency tags');
  const blocks=[...sitemap.matchAll(/<url>([\s\S]*?)<\/url>/g)].map(match=>match[1]);assert.equal(blocks.length,37);
  let datedArticles=0,alternateAnnotations=0;
  for(const block of blocks){
    const location=decode(block.match(/<loc>([^<]+)<\/loc>/)[1]),url=new URL(location);
    assert.equal(url.origin,origin);assert.equal(url.search,'');assert.equal(url.hash,'');assert.equal(url.username,'');assert.equal(url.password,'');
    assert.ok(!/^\/(?:admin|api|downloads?)(?:\/|$)/.test(url.pathname));
    const post=posts.find(post=>location===origin+'/blog/'+post.slug),lastmod=block.match(/<lastmod>([^<]+)<\/lastmod>/)?.[1];
    if(post){assert.match(post.updatedAt,/^\d{4}-\d{2}-\d{2}$/);assert.equal(new Date(post.updatedAt+'T00:00:00Z').toISOString().slice(0,10),post.updatedAt);assert.equal(lastmod,new Date(`${post.updatedAt}T00:00:00+05:30`).toISOString(),'Preserve the editorial date and timezone');assert.ok(Date.parse(lastmod)<=Date.now());datedArticles++;}
    else assert.equal(lastmod,undefined,'Do not fabricate static-page modification dates');
    const alternatives=Object.fromEntries([...block.matchAll(/<xhtml:link\b([^>]+)\/?\s*>/g)].map(match=>{const attrs=Object.fromEntries([...match[1].matchAll(/([\w-]+)="([^"]*)"/g)].map(attr=>[attr[1],decode(attr[2])]));assert.equal(attrs.rel,'alternate');return [attrs.hreflang,attrs.href];}));
    if(Object.values(expectedLanguages).includes(location)){assert.deepEqual(alternatives,expectedLanguages,'Every homepage must repeat the reciprocal, self-inclusive language cluster');alternateAnnotations+=Object.keys(alternatives).length;}
    else assert.deepEqual(alternatives,{},'Homepage language annotations must not leak to other pages');
  }
  assert.equal(datedArticles,15);assert.equal(alternateAnnotations,110);
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
    assert.ok(!/(?:^|[\s,;])(?:noindex|none)(?:$|[\s,;])/i.test(response.headers.get('x-robots-tag')||''),path+': HTTP indexing restriction');
    const htmlAlternates=Object.fromEntries([...html.matchAll(/<link\b[^>]*rel="alternate"[^>]*>/g)].filter(match=>/hrefLang=|hreflang=/.test(match[0])).map(match=>[match[0].match(/(?:hrefLang|hreflang)="([^"]+)"/)[1],new URL(decode(match[0].match(/\bhref="([^"]+)"/)[1])).href]));
    if(Object.values(homeAlternates).includes(path))assert.deepEqual(htmlAlternates,expectedLanguages,path+': HTML and XML reciprocal hreflang must agree');
    assert.match(html, /property="og:image"/, path);
    assert.match(html, /name="twitter:card"/, path);
    assert.match(html, /name="viewport"/, path);
    const schemas = [...html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)].map(match => JSON.parse(match[1]));
    assert.ok(schemas.length, path + ': schema missing');
    const nodes = schemas.flatMap(value => Array.isArray(value) ? value : value['@graph'] || [value]);
    if (Object.values(homeAlternates).includes(path) || tools.some(tool => path === '/' + tool.slug)) {
      const websites = nodes.filter(node => node['@type'] === 'WebSite');
      assert.equal(websites.length, 1, path + ': one authoritative WebSite node');
      assert.equal(websites[0].name, 'SaveFrame');
      assert.equal(websites[0].url, origin + '/');
      assert.equal(websites[0]['@id'], origin + '/#website');
      assert.ok(!nodes.some(node => node['@type'] === 'SearchAction' || node.potentialAction), 'No unsupported sitelinks search box');
      for (const tag of ['og:title', 'og:description']) assert.match(html, new RegExp(`property="${tag}" content="[^"]+"`), path + ': ' + tag);
      for (const tag of ['twitter:title', 'twitter:description']) assert.match(html, new RegExp(`name="${tag}" content="[^"]+"`), path + ': ' + tag);
      const rendered = html.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, '');
      const drawer = rendered.match(/<div\b[^>]*id="mobile-nav-drawer"[^>]*>([\s\S]*?)<\/header>/)?.[1];
      const footer = rendered.match(/<footer\b[^>]*>([\s\S]*?)<\/footer>/)?.[1];
      for (const tool of tools) {
        const anchor = new RegExp(`<a\\b[^>]*href="/${tool.slug}"[^>]*>[\\s\\S]*?</a>`);
        assert.match(drawer || '', anchor, path + ': mobile link to ' + tool.slug);
        assert.match(footer || '', anchor, path + ': footer link to ' + tool.slug);
      }
    }
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
  fs.writeFileSync('reports/seo-crawl.json', JSON.stringify({ scope: 'HTTP validation at '+base+'; not a Google indexing confirmation', sitemap:{urlCount:urls.length,localizedHomepages:10,tools:tools.length,informationPages:information.length,blogIndexes:1,articles:posts.length,lastModifiedArticles:datedArticles,reciprocalLanguageAnnotations:alternateAnnotations,priorityAndChangefreqAbsent:true}, pages: rows, internalDestinationsChecked: [...links].sort() }, null, 2));
  console.log(`PASS: 37 canonical sitemap URLs, 15 preserved editorial dates, 110 reciprocal XML/HTML language annotations including x-default; ${rows.length} indexable pages, ${links.size} internal destinations, robots sitemap reference, exclusions and 404.`);
}
main().catch(error => { console.error(error); process.exitCode = 1; });
