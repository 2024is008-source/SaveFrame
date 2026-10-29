const assert = require('node:assert/strict');
const fs = require('node:fs');
const { chromium } = require(process.env.TIKSAVE_PLAYWRIGHT_PATH || 'playwright');
const posts = require('../src/content/blog/posts.json');
const base = process.env.TEST_BASE_URL || 'http://127.0.0.1:3002';
if (!['127.0.0.1', 'localhost'].includes(new URL(base).hostname)) throw Error('Use a local preview for browser checks.');
async function main() {
  const browser = await chromium.launch({headless:true,channel:'chrome'});
  const errors = [];
  try {
    const page = await browser.newPage({viewport:{width:1440,height:1000}});
    page.on('pageerror', error => errors.push(error.message));
    fs.mkdirSync('reports/tiktok-blog', {recursive:true});
    for (const path of ['/blog','/blog/' + posts[0].slug]) {
      const response = await page.goto(base + path);
      assert.equal(response.status(), 200);
      await page.evaluate(() => document.fonts.ready);
      for (const width of [1440,768,390]) {
        await page.setViewportSize({width,height:1000});
        assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),path + ' overflow at ' + width);
        for (const image of await page.locator('img').all()) {
          await image.scrollIntoViewIfNeeded();
          await image.evaluate(element => element.complete && element.naturalWidth > 0 ? true : new Promise((resolve,reject) => { element.addEventListener('load',()=>resolve(true),{once:true}); element.addEventListener('error',()=>reject(new Error('Article cover failed to load')),{once:true}); }));
        }
        await page.evaluate(() => scrollTo({top:0,behavior:'instant'}));
        await page.screenshot({path:`reports/tiktok-blog/${path === '/blog' ? 'index' : 'article'}-${width}.png`,fullPage:true});
      }
    }
    await page.goto(base + '/blog?category=TikTok%20Photos');
    assert.equal(await page.locator('.guide-card').count(),2);
    assert.match(await page.locator('meta[name="robots"]').getAttribute('content'),/noindex/);
    await page.goto(base + '/blog?q=watermarks');
    assert.equal(await page.locator('.guide-card').count(),1);
    await page.goto(base + '/blog?q=no-matching-guide-xyz');
    assert.equal(await page.locator('.blog-empty').count(),1);
    await page.goto(base + '/blog?page=2');
    assert.equal(await page.locator('.blog-catalog .guide-card').count(),13);
    assert.equal(await page.locator('link[rel=canonical]').getAttribute('href'),'https://tiksavemp4.online/blog');
    for (const post of posts) {
      assert.equal((await page.goto(base + '/blog/' + post.slug)).status(),200);
      assert.equal(await page.locator('h1').count(),1);
      assert.equal(await page.locator('h1').textContent(),post.title);
      assert.equal((await page.locator('body').textContent()).includes('Instagram'),false);
      assert.equal(await page.locator('.article-cta>a').getAttribute('href'),post.tool === 'photo' ? '/photo-downloader' : '/video-downloader');
      assert.equal(await page.locator('.related-guides .guide-card').count(),3);
      assert.equal(await page.locator('.article-toc a').evaluateAll(links=>links.every(link=>document.getElementById(link.hash.slice(1)))),true);
      const schema=await page.locator('script[type="application/ld+json"]').evaluateAll(scripts=>scripts.flatMap(script=>JSON.parse(script.textContent)));
      assert.ok(schema.some(item=>item['@type']==='BlogPosting'&&item.headline===post.title&&item.publisher.name==='TikSaveMP4'));
      assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
    }
    assert.equal((await page.goto(base+'/blog/how-to-download-instagram-reels-mp4')).status(),404);
    await page.goto(base+'/');
    assert.equal(await page.locator('#blog-section article').count(),3);
    assert.ok(await page.locator('a[href="/blog"]').count()>=2);
    const sitemap=await (await page.request.get(base+'/sitemap.xml')).text();
    for(const post of posts)assert.ok(sitemap.includes('/blog/'+post.slug));
    assert.ok(!sitemap.includes('instagram'));
    assert.deepEqual(errors,[]);
    console.log('PASS: 12 article pages, original blog templates, desktop/tablet/mobile layouts, search, categories, pagination, table of contents, tool links, related articles, BlogPosting schema, homepage preview, sitemap and retired article URLs.');
  } finally { await browser.close(); }
}
main().catch(error=>{console.error(error);process.exitCode=1;});
