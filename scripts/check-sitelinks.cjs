const assert = require('node:assert/strict');
const fs = require('node:fs');
const ts = require('typescript');

// Render real public templates without opening or modifying the admin database.
process.env.SAVEFRAME_DISABLE_SEO_OVERRIDES = '1';
process.env.NEXT_PUBLIC_SITE_URL = 'https://saveframe.site';
require.extensions['.ts'] = (module, file) => module._compile(ts.transpileModule(fs.readFileSync(file, 'utf8'), {
  compilerOptions: {module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true},
}).outputText, file);
const {localizedHomepage} = require('../src/i18n/homepage.ts');
const {homepageMetadata, getDictionary, languageAlternates} = require('../src/i18n/server.ts');
const {locales, localePath} = require('../src/i18n/config.ts');
const {toolPaths} = require('../src/lib/navigation.ts');
const {toolPageMarkup} = require('../src/lib/tool-page.ts');
const {pageMetadata} = require('../src/lib/seo.ts');
const tools = require('../src/content/tools.json');
const sitemap = require('../src/app/sitemap.ts').default;
const robots = require('../src/app/robots.ts').default;
const strip = value => value.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, '');
const text = value => value.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
const anchors = value => [...value.matchAll(/<a\b([^>]*)>([\s\S]*?)<\/a>/g)].map(match => ({
  attrs: match[1], href: match[1].match(/\bhref="([^"]*)"/)?.[1], name: text(match[2]),
}));
const origin = 'https://saveframe.site';

function validateGraph(html, path) {
  const graphs = [...html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)].map(match => JSON.parse(match[1]));
  const nodes = graphs.flatMap(graph => graph['@graph'] || [graph]);
  const website = nodes.filter(node => node['@type'] === 'WebSite');
  assert.equal(website.length, 1, path + ': exactly one WebSite');
  assert.equal(website[0].name, 'SaveFrame');
  assert.equal(website[0].url, origin + '/');
  assert.equal(website[0]['@id'], origin + '/#website');
  const organizations = nodes.filter(node => node['@type'] === 'Organization');
  assert.equal(organizations.length, 1); assert.equal(organizations[0]['@id'], website[0].publisher['@id']);
  for (const node of nodes) {
    assert.ok(!node.potentialAction && node['@type'] !== 'SearchAction', 'No unsupported search-box schema');
    assert.ok(!node.aggregateRating && !node.review, 'No invented reviews');
    if (node.url) assert.equal(new URL(node.url).origin, origin);
  }
}

const metadataTitles = new Set(), metadataDescriptions = new Set();
function validateMetadata(metadata, path) {
  assert.equal(metadata.alternates.canonical, origin + path);
  assert.equal(metadata.robots.index, true); assert.equal(metadata.robots.follow, true);
  assert.ok(metadata.title && !metadataTitles.has(metadata.title)); metadataTitles.add(metadata.title);
  assert.ok(metadata.description && !metadataDescriptions.has(metadata.description)); metadataDescriptions.add(metadata.description);
  assert.equal(metadata.openGraph.url, origin + path);
  assert.ok(metadata.openGraph.title && metadata.openGraph.description && metadata.openGraph.images.length);
  assert.equal(metadata.twitter.card, 'summary_large_image');
  assert.ok(metadata.twitter.title && metadata.twitter.description && metadata.twitter.images.length);
}

const destinations = new Set(Object.values(toolPaths));
assert.equal(destinations.size, 6);
const allPaths = new Set(sitemap().map(entry => new URL(entry.url).pathname));
for (const path of destinations) assert.ok(allPaths.has(path));
assert.equal(robots().sitemap, origin + '/sitemap.xml');
assert.equal(robots().rules.allow, '/');
assert.ok(!robots().rules.disallow.some(path => destinations.has(path)));
for (const locale of locales) {
  const html = localizedHomepage(locale), body = strip(html), dictionary = getDictionary(locale);
  const links = anchors(body);
  assert.equal((body.match(/<h1\b/g) || []).length, 1);
  assert.equal((body.match(/id="downloader-form"/g) || []).length, 1);
  assert.ok(!/<button\b[^>]*data-route-tab/.test(body), 'Route navigation must be anchors');
  // The five media switches intentionally remain keyboard-operable widget buttons.
  assert.equal((body.match(/role="tab"/g) || []).length, 5);
  assert.equal((body.match(/aria-controls="downloader-panel"/g) || []).length, 5);
  for (const link of links.filter(link => link.attrs.includes('data-route-tab'))) {
    assert.ok(destinations.has(link.href), locale + ': route has a canonical tool destination');
    assert.ok(link.name, locale + ': link has an accessible text name');
    assert.ok(!/role="button"|tabindex="-1"/.test(link.attrs));
  }
  const drawer = body.match(/<div\b[^>]*id="mobile-nav-drawer"[^>]*>([\s\S]*?)<\/header>/)[1];
  const footer = body.match(/<footer\b[^>]*>([\s\S]*?)<\/footer>/)[1];
  for (const target of destinations) {
    assert.equal(anchors(drawer).filter(link => link.href === target).length, 1, locale + ': each tool once in mobile navigation');
    assert.equal(anchors(footer).filter(link => link.href === target).length, 1, locale + ': each tool once in footer');
  }
  for (const menu of ['downloader', 'viewer']) {
    assert.match(body, new RegExp(`id="nav-${menu}-menu"\\s*role="group" aria-labelledby="nav-${menu}-btn"`));
    assert.match(body, new RegExp(`id="nav-${menu}-btn"[\\s\\S]*?aria-expanded="false"[\\s\\S]*?aria-controls="nav-${menu}-menu"`));
  }
  const carousel = anchors(drawer).find(link => link.href === toolPaths.carousel);
  assert.ok(carousel.name.includes(dictionary['Instagram Carousel Downloader']));
  validateMetadata(homepageMetadata(locale), localePath(locale));
  assert.deepEqual(homepageMetadata(locale).alternates.languages, languageAlternates());
  validateGraph(html, localePath(locale));
}
for (const tool of tools) {
  const path = '/' + tool.slug, html = toolPageMarkup(tool), body = strip(html);
  const headings = [...body.matchAll(/<h1\b[^>]*>([\s\S]*?)<\/h1>/g)].map(match => text(match[1]));
  assert.deepEqual(headings, [tool.title]);
  for (const destination of destinations) assert.ok(anchors(body).some(link => link.href === destination && link.name));
  assert.ok(body.includes('Choose the tool for your link:'), 'Existing useful cross-tool links retained');
  assert.ok(body.includes('Related guides'), 'Existing editorial links retained');
  validateMetadata(pageMetadata(path, tool.title + ' | SaveFrame', tool.description), path);
  validateGraph(html, path);
}
console.log('PASS: SSR anchors for all six tools in desktop/mobile/footer navigation, 10 localized homepages, named native links/disclosure groups/widget tabs, existing cross-tool/guide links, unique metadata/canonicals/social tags, sitemap/robots and one valid SaveFrame WebSite per page. No database accessed.');
