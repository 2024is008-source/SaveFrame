// Production HTTP regression checks for issues in the supplied PageSpeed reports.
const assert = require('node:assert/strict');
const base = process.env.TEST_BASE_URL || 'http://127.0.0.1:3000';
async function get(path) {
  const response = await fetch(new URL(path, base), { signal: AbortSignal.timeout(20000) });
  assert.equal(response.status, 200, path);
  return response;
}
async function main() {
  const html = await (await get('/')).text();
  assert.ok(!/https:\/\/fonts\.(googleapis|gstatic)\.com/.test(html), 'External font request remains');
  const fonts = [...html.matchAll(/href="([^"]+\.woff2)"/g)].map(match => match[1]);
  assert.ok(new Set(fonts).size >= 2, 'Local font preloads missing');
  for (const font of new Set(fonts)) {
    const response = await get(font);
    assert.match(response.headers.get('content-type') || '', /font\/woff2/);
    assert.match(response.headers.get('cache-control') || '', /immutable/);
    assert.equal(Buffer.from(await response.arrayBuffer()).toString('ascii', 0, 4), 'wOF2');
  }
  const script = require('../src/ui/client-asset.json').src;
  const asset = await get(script);
  assert.match(asset.headers.get('cache-control') || '', /max-age=31536000.*immutable/);
  const js = await asset.text();
  new (require('node:vm').Script)(js);
  assert.ok(js.length < require('node:fs').statSync('public/saveframe.js').size * .8, 'Client bundle is not minified');
  const images = require('../src/ui/card-assets.json');
  for (const cover of ['stories', 'photos', 'reels']) {
    const variants = images.filter(image => image.cover === cover);
    assert.deepEqual(variants.map(image => image.width), [360, 480, 640, 720, 960]);
    for (const image of variants) {
      assert.ok(html.includes(image.path), 'Responsive image missing from homepage: ' + image.path);
      const response = await get(image.path);
      assert.match(response.headers.get('cache-control') || '', /max-age=31536000.*immutable/);
      assert.match(response.headers.get('content-type') || '', /image\/webp/);
      assert.equal((await response.arrayBuffer()).byteLength, image.bytes);
    }
  }
  const groups = [...html.matchAll(/<div class="feature-definition">([\s\S]*?)<\/div>/g)];
  assert.equal(groups.length, 4);
  for (const [, group] of groups) assert.match(group, /^<dt\b[\s\S]*<\/dt>\s*<dd\b[\s\S]*<\/dd>$/);
  assert.equal((html.match(/aria-label="How to Download Instagram [^"]+" class="min-h-\[44px\]/g) || []).length, 3);
  const sitemap = await (await get('/sitemap.xml')).text();
  const pages = [...sitemap.matchAll(/<loc>([^<]+)<\/loc>/g)].map(match => new URL(match[1]).pathname);
  pages.push('/blog?page=2', '/admin/login');
  for (const page of pages) {
    const markup = await (await get(page)).text();
    assert.match(markup, /rel="icon" href="\/favicon.svg"/, page + ': favicon missing');
    assert.match(markup, /rel="apple-touch-icon" href="\/icon-180.png"/, page + ': Apple icon missing');
    assert.match(markup, /rel="manifest" href="\/site.webmanifest"/, page + ': manifest missing');
  }
  for (const path of ['/favicon.svg', '/favicon.ico', '/icon-16.png', '/icon-32.png', '/icon-48.png', '/icon-180.png', '/icon-192.png', '/icon-512.png', '/site.webmanifest']) {
    const response = await get(path);
    assert.ok((await response.arrayBuffer()).byteLength > 100, path + ': empty icon');
  }
  console.log(`PASS: local preloaded WOFF2 fonts, immutable minified script, ${images.length} responsive images, semantic definitions, specific guide names and shared favicon metadata on ${pages.length} routes.`);
}
main().catch(error => { console.error(error.message); process.exitCode = 1; });
