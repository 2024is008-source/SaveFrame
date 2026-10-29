const assert = require('node:assert/strict');
const fs = require('node:fs');
const ts = require('typescript');
process.env.SAVEFRAME_DISABLE_SEO_OVERRIDES = '1';
require.extensions['.ts'] = (module, file) => module._compile(ts.transpileModule(fs.readFileSync(file, 'utf8'), {compilerOptions: {module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true}}).outputText, file);
const {validateMediaInput, validatePublicMediaInput} = require('../src/security/url-validator.ts');
const unsupported = error => error.code === 'UNSUPPORTED_MEDIA_TYPE' && error.statusCode === 400;
for (const url of ['https://www.instagram.com/stories/creator/123456789/', 'https://www.instagram.com/stories/creator/', 'https://www.instagram.com/stories/highlights/123456789/', 'https://www.instagram.com/highlights/123456789/']) {
  assert.throws(() => validateMediaInput(url), unsupported);
  assert.throws(() => validatePublicMediaInput(url), unsupported);
}
assert.throws(() => validateMediaInput('https://www.instagram.com/reel/Example123/', 'story'), unsupported);
for (const [url, category] of [['https://www.instagram.com/reel/Example123/', 'reel'], ['https://www.instagram.com/tv/Example123/', 'video'], ['https://www.instagram.com/p/Example123/', 'photo'], ['https://www.instagram.com/creator/', 'profile']]) assert.equal(validateMediaInput(url).category, category);
const {locales} = require('../src/i18n/config.ts');
const {localizedHomepage} = require('../src/i18n/homepage.ts');
const {homepageMetadata} = require('../src/i18n/server.ts');
const removedCopy = /\bstor(?:y|ies)\b|historias|ストーリー|स्टोरी|قصص|قصة|hikaye|cerita/i;
for (const locale of locales) {
  const dictionary = require(`../src/i18n/dictionaries/${locale}.json`);
  for (const [key, value] of Object.entries(dictionary)) assert.ok(!removedCopy.test(key + ' ' + value), locale + ': removed copy ' + key);
  assert.ok(!removedCopy.test(localizedHomepage(locale)), locale + ': rendered homepage');
  assert.ok(!removedCopy.test(JSON.stringify(homepageMetadata(locale))), locale + ': metadata');
}
const {getPublishedPosts} = require('../src/lib/blog.ts');
const posts = getPublishedPosts();
assert.equal(posts.length, 13);
assert.ok(posts.every(post => !removedCopy.test(JSON.stringify(post))));
assert.ok(!fs.existsSync('src/services/story-extraction.service.ts'));
const {analyticsEvent} = require('../src/lib/analytics.ts');
assert.equal(analyticsEvent('media_resolved', {media_type: 'story'}).params.media_type, 'unknown');
assert.equal(analyticsEvent('download_failed', {error_code: 'EXPIRED_STORY'}).params.error_code, 'UNKNOWN');
const {NextRequest} = require('next/server');
const {middleware} = require('../src/middleware.ts');
for (const path of ['/story-downloader', '/stories-downloader', '/story-viewer', '/public-story-viewer', '/blog/how-to-download-instagram-stories-by-link', '/blog/how-to-download-instagram-story-videos']) {
  for (const suffix of ['', '/']) {
    const response = middleware(new NextRequest('https://saveframe.site' + path + suffix));
    assert.equal(response.status, 410);
    assert.match(response.headers.get('x-robots-tag'), /noindex/);
  }
}
console.log('PASS: unsupported media rejected at validation; supported inputs preserved; 10 locale homepages/metadata and 13 guides contain no retired feature copy; analytics excludes retired categories/codes; removed URLs return 410/noindex.');
