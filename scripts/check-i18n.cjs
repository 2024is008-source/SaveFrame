const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');
require.extensions['.ts'] = (module, filename) => module._compile(ts.transpileModule(fs.readFileSync(filename, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, esModuleInterop: true } }).outputText, filename);
const { locales, localePath, languageTag } = require('../src/i18n/config.ts');
const { localizedHomepage } = require('../src/i18n/homepage.ts');
const { getDictionary, translate, homepageMetadata } = require('../src/i18n/server.ts');
const english = require('../src/i18n/dictionaries/en.json');
const variables = text => [...text.matchAll(/\{(\w+)\}/g)].map(match => match[1]).sort();
const original = require('../src/ui/saveframe.json').markup;
const normalize = text => text.replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>');
for (const locale of locales) {
  const dictionary = require(`../src/i18n/dictionaries/${locale}.json`);
  assert.deepEqual(Object.keys(dictionary).sort(), Object.keys(english).sort(), locale + ' has missing or extra keys');
  for (const key of Object.keys(english)) {
    assert.ok(typeof dictionary[key] === 'string' && dictionary[key].trim(), locale + ': ' + key);
    assert.deepEqual(variables(dictionary[key]), variables(key), locale + ': interpolation ' + key);
  }
  const markup = localizedHomepage(locale);
  assert.ok(markup.includes('id="downloader-form"'));
  assert.ok(markup.includes('How to Download Instagram Stories by Link'), 'Article titles must stay English');
  assert.ok(!markup.includes('I18N ='));
  const client = JSON.parse(markup.match(/<script type="application\/json" id="home-i18n">([\s\S]*?)<\/script>/)[1]);
  assert.equal(client.locale, locale);
  assert.equal(client.home, localePath(locale));
  assert.deepEqual(Object.keys(client.dictionary).sort(), Object.keys(english).sort());
  assert.equal((markup.match(/<option /g) || []).length, 10);
  assert.ok(markup.includes(`value="${locale}" selected`));
  assert.ok(markup.includes('lang="en" dir="ltr"'), 'English editorial copy must be marked');
  const metadata = homepageMetadata(locale);
  assert.ok(metadata.alternates.canonical.endsWith(localePath(locale)));
  assert.equal(Object.keys(metadata.alternates.languages).length, 11);
  assert.equal(metadata.alternates.languages['pt-BR'].endsWith('/pt-br/'), true);
  assert.ok(metadata.title === dictionary['SaveFrame — Instagram Downloader for Photos, Reels, Videos & Stories']);
  assert.ok(!translate(dictionary, 'Preparing download… {progress}%', { progress: 42 }).includes('{progress}'));
  const ids = value => [...value.matchAll(/\bid="([^"]+)"/g)].map(match => match[1]).filter(id => id !== 'home-i18n' && !id.startsWith('blog-'));
  for (const id of ids(original)) assert.ok(ids(markup).includes(id), 'Lost interaction element: ' + id);
  // Run the production client in an isolated DOM stub; expose private functions only in this test copy.
  const elements = new Map();
  const element = id => {
    if (!elements.has(id)) elements.set(id, { style: {}, textContent: '', value: '', innerHTML: '', disabled: false, className: '', classList: { add() {}, remove() {}, toggle() {}, contains() { return true; } }, setAttribute() {}, getAttribute() { return null; }, addEventListener() {}, querySelector() { return null; }, querySelectorAll() { return []; }, replaceChildren() {}, focus() {} });
    return elements.get(id);
  };
  element('home-i18n').textContent = JSON.stringify(client);
  const document = { getElementById: element, querySelectorAll: () => [], addEventListener() {}, createTreeWalker: () => ({ nextNode: () => null }) };
  const window = { location: { search: '', origin: 'http://localhost:3000' }, scrollTo() {} };
  let script = fs.readFileSync('public/saveframe.js', 'utf8');
  const boundary = script.lastIndexOf('    };');
  script = script.slice(0, boundary) + '\nwindow.__test = { t, TOOL_CONFIG, parseInstagramInput, apiError, localError, formatLabel };\n' + script.slice(boundary);
  vm.runInNewContext(script, { window, document, URL, URLSearchParams, AbortController, NodeFilter: { SHOW_TEXT: 4 }, setTimeout: () => 0, clearTimeout() {} });
  window.initializeSaveFrame();
  const hooks = window.__test;
  assert.equal(hooks.TOOL_CONFIG.reels.ctaLabel, dictionary['Download Reel']);
  assert.equal(hooks.apiError({ code: 'RATE_LIMITED', message: 'English backend message' }, 'Unable to inspect this link.'), dictionary['Instagram is limiting requests. Please wait and try again.']);
  assert.equal(hooks.localError({ message: 'Unexpected unlocalized exception' }, 'Unable to inspect this link.'), dictionary['Unable to inspect this link.']);
  const parsed = hooks.parseInstagramInput('https://malicious.example/test');
  assert.equal(parsed.valid, false);
  assert.equal(hooks.t(parsed.message), dictionary['Only instagram.com or instagr.am links are supported. Please copy a link directly from Instagram.']);
  assert.equal(hooks.parseInstagramInput('@creator').detectedTab, 'profile');
  assert.ok(hooks.formatLabel('Original (1080×1350)').startsWith(dictionary.Original));
  assert.equal(hooks.t('Preparing download… {progress}%', { progress: 42 }), translate(dictionary, 'Preparing download… {progress}%', { progress: 42 }));
}
const japanese = getDictionary('ja');
assert.equal(translate({ ...japanese, 'Download Photo': undefined }, 'Download Photo'), 'Download Photo', 'Missing translations fall back to English');
assert.equal(languageTag('pt-br'), 'pt-BR');
console.log(`PASS: ${locales.length} complete dictionaries × ${Object.keys(english).length} keys; interpolation, SSR UI preservation, English articles, metadata, switcher, localized client errors, tabs, formats and progress.`);
