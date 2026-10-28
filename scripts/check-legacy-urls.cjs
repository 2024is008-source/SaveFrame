const assert = require('node:assert/strict');
const fs = require('node:fs');
const ts = require('typescript');

process.env.NEXT_PUBLIC_SITE_URL = 'https://tiksavemp4.online';
process.env.SAVEFRAME_DISABLE_SEO_OVERRIDES = '1';
require.extensions['.ts'] = (module, filename) => module._compile(ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true },
}).outputText, filename);

const { getPost, getPublishedPosts, getLegacyPosts } = require('../src/lib/blog.ts');
const sitemap = require('../src/app/sitemap.ts').default;
const information = require('../src/content/information.json');
const titles = require('../src/content/search-titles.json');
const redirects = [
  ['/blog/how-to-convert-tiktok-to-mp4', '/blog/how-to-download-tiktok-videos-mp4'],
  ['/blog/how-to-download-tiktok-images', '/blog/download-tiktok-photo-slideshows'],
  ['/blog/how-to-download-tiktok-videos-on-pc', '/blog/download-tiktok-videos-pc-mac'],
];
const preserved = ['/blog/how-to-convert-tiktok-to-mp3', '/responsible-use'];
const base = process.argv[2];
const decode = value => value.replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#x27;|&#39;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>');

async function main() {
  const config = require('../next.config.ts').default('phase-production-server');
  assert.deepEqual(await config.redirects(), redirects.map(([source, destination]) => ({ source, destination, statusCode: 301 })));
  assert.equal(getPublishedPosts().length, 12, 'The current article catalog stays unchanged');
  assert.equal(getLegacyPosts().length, 1);
  const audio = getPost('how-to-convert-tiktok-to-mp3');
  assert.ok(audio.wordCount > 350);
  assert.match(audio.content, /MP3 conversion and standalone audio downloading are not supported/);
  assert.match(audio.content, /Renaming a file from .mp4 to .mp3 does not convert/);
  assert.match(audio.content, /does not automatically improve its quality/);
  assert.doesNotMatch(audio.content, /choose (?:an available|the) MP3 format|select (?:the )?MP3/i);
  for (const [, href] of audio.content.matchAll(/\]\((\/[^)]+)\)/g)) {
    assert.ok(href.startsWith('/blog/') ? getPost(href.slice(6)) : ['/video-downloader', '/contact', '/copyright', '/responsible-use'].includes(href), href);
  }
  const responsible = information.find(page => page.slug === 'responsible-use');
  assert.equal(responsible.sections.length, 6);
  assert.match(responsible.sections[0][1], /A video being public does not mean every use of it is permitted/);
  assert.match(JSON.stringify(responsible), /Music and other material within a video can have separate rights/);
  assert.match(JSON.stringify(responsible), /Do not attempt to bypass technical access restrictions/);
  const urls = sitemap().map(entry => entry.url);
  assert.equal(urls.length, 24);
  assert.equal(new Set(urls).size, 24);
  assert.deepEqual(urls.sort(), Object.keys(titles).map(path => new URL(path, process.env.NEXT_PUBLIC_SITE_URL).href).sort());
  for (const [source] of redirects) assert.ok(!urls.includes(process.env.NEXT_PUBLIC_SITE_URL + source));
  for (const path of preserved) assert.ok(urls.includes(process.env.NEXT_PUBLIC_SITE_URL + path));

  if (base) {
    const local = new URL(base);
    assert.ok(['127.0.0.1', 'localhost'].includes(local.hostname), 'Use a local test server');
    for (const [source, destination] of redirects) {
      for (const suffix of ['', '/', '?utm_source=legacy&ref=guide']) {
        for (const method of ['GET', 'HEAD']) {
          const response = await fetch(base + source + suffix, { method, redirect: 'manual' });
          assert.equal(response.status, 301, method + ' ' + source + suffix);
          const location = new URL(response.headers.get('location'), base);
          assert.equal(location.origin, local.origin);
          assert.equal(location.pathname, destination);
          assert.equal(location.search, suffix.startsWith('?') ? suffix : '');
        }
      }
      const response = await fetch(base + destination, { redirect: 'manual' });
      assert.equal(response.status, 200, destination + ': no redirect chain');
    }
    for (const path of preserved) {
      const response = await fetch(base + path, { redirect: 'manual' });
      assert.equal(response.status, 200, path);
      const html = await response.text();
      assert.ok(!/noindex/.test(response.headers.get('x-robots-tag') || ''), path);
      assert.equal([...html.matchAll(/<title>([^<]*)<\/title>/g)].length, 1);
      assert.equal(decode(html.match(/<title>([^<]*)<\/title>/)[1]), titles[path]);
      assert.equal(decode(html.match(/<link[^>]*rel="canonical"[^>]*href="([^"]+)"/)[1]), process.env.NEXT_PUBLIC_SITE_URL + path);
      assert.match(html, /<meta name="robots" content="index, follow"/);
      if (path.endsWith('mp3')) assert.match(html, /MP3 conversion and standalone audio downloading are not supported/);
      else for (const [, paragraph] of responsible.sections) assert.ok(decode(html).includes(paragraph), 'Recovered original responsible-use text');
      assert.equal((await fetch(base + path, { method: 'HEAD', redirect: 'manual' })).status, 200);
    }
    const xml = await (await fetch(base + '/sitemap.xml')).text();
    const actual = [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map(match => decode(match[1]));
    assert.deepEqual(actual.sort(), urls);
  }
  console.log(`PASS: 5 legacy URLs, 3 exact 301 mappings, 2 indexable preserved pages, 24 sitemap URLs and unchanged 12-guide catalog${base ? '; live GET/HEAD, trailing slashes, query preservation, canonical metadata and sitemap verified' : ''}.`);
}
main().catch(error => { console.error(error); process.exitCode = 1; });
