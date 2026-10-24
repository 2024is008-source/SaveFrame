const assert = require('node:assert/strict');
const fs = require('node:fs');
const ts = require('typescript');
const sharp = require('sharp');
require.extensions['.ts'] = (module, filename) => module._compile(ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, esModuleInterop: true },
}).outputText, filename);
const { getPublishedPosts, getPost, filterPosts, relatedPosts, tableOfContents, homepageBlogMarkup } = require('../src/lib/blog.ts');
async function main() {
  const posts = getPublishedPosts();
  assert.equal(posts.length, 15);
  const slugs = new Set(posts.map(post => post.slug));
  assert.equal(slugs.size, posts.length);
  assert.equal(new Set(posts.map(post => post.cover)).size, posts.length, 'Every article must have a unique cover');
  const crypto = require('node:crypto');
  assert.equal(new Set(posts.map(post => crypto.createHash('sha256').update(fs.readFileSync(`public/images/blog/${post.cover}-960.webp`)).digest('hex'))).size, posts.length, 'Cover files must contain different images');
  for (const post of posts) {
    assert.ok(post.wordCount >= 900 && post.wordCount <= 1300, `${post.slug}: ${post.wordCount} words`);
    assert.ok(post.description.length < 190);
    assert.equal(post.author, 'SaveFrame');
    const headings = tableOfContents(post.content);
    assert.ok(headings.length >= 6);
    assert.equal(new Set(headings.map(heading => heading.id)).size, headings.length);
    assert.ok((post.content.match(/^### /gm) || []).length >= 3, post.slug + ' needs FAQs');
    for (const [, href] of post.content.matchAll(/\]\((\/[^)]+)\)/g)) {
      if (href.startsWith('/blog/')) assert.ok(slugs.has(href.slice(6)), `Broken article link: ${href}`);
      else assert.match(href, /^\/\?tool=(photo|reels|story|video|profile)#main-tool$/);
    }
    const related = relatedPosts(post);
    assert.equal(related.length, 3);
    assert.ok(related.every(item => item.slug !== post.slug));
    for (const width of [480, 960, 1200]) {
      const image = await sharp(`public/images/blog/${post.cover}-${width}.webp`).metadata();
      assert.equal(image.width, width);
      assert.equal(image.format, 'webp');
    }
  }
  assert.equal(getPost('missing-article'), undefined);
  assert.ok(filterPosts(posts, 'audio', '').some(post => post.slug === 'download-instagram-reels-with-audio'));
  assert.ok(filterPosts(posts, '', 'Instagram Photos').every(post => post.category === 'Instagram Photos'));
  assert.equal(filterPosts(posts, 'unmatched-query-xyz', '').length, 0);
  const homepage = homepageBlogMarkup();
  assert.ok(homepage.includes('How to Download Instagram Stories by Link'));
  assert.ok(homepage.includes('View All Guides'));
  assert.ok(!homepage.includes('open-blog-btn'));
  console.log(`PASS: ${posts.length} full articles, ${posts.reduce((sum, post) => sum + post.wordCount, 0)} words, working filters, related links, table-of-contents IDs, and optimized covers.`);
}
main().catch(error => { console.error(error); process.exitCode = 1; });
