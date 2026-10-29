const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');
const source = ts.transpileModule(fs.readFileSync('src/lib/site.ts', 'utf8'), {compilerOptions: {module: ts.ModuleKind.CommonJS}}).outputText;
function site(env) {
  const context = {exports: {}, process: {env}, URL};
  vm.runInNewContext(source, context);
  return context.exports;
}
for (const value of [undefined, '', '   ']) {
  const production = site({NODE_ENV: 'production', NEXT_PUBLIC_SITE_URL: value});
  assert.equal(production.siteUrl, 'https://saveframe.site');
  assert.equal(production.hasPublicSiteUrl, true);
  assert.equal(production.absoluteUrl('/sitemap.xml'), 'https://saveframe.site/sitemap.xml');
}
assert.equal(site({NODE_ENV: 'development'}).hasPublicSiteUrl, false);
for (const url of ['http://localhost:3000', 'http://127.0.0.1:3125', 'http://[::1]:3000']) assert.equal(site({NODE_ENV: 'production', NEXT_PUBLIC_SITE_URL: url}).hasPublicSiteUrl, false);
assert.equal(site({NODE_ENV: 'production', NEXT_PUBLIC_SITE_URL: 'https://preview.example.test/base'}).siteUrl, 'https://preview.example.test');
assert.throws(() => site({NEXT_PUBLIC_SITE_URL: 'ftp://saveframe.site'}), /HTTP or HTTPS/);
console.log('PASS: production URL fallback, development/explicit loopback noindex, configured origin and protocol validation.');
