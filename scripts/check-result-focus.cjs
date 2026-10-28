const assert = require('node:assert/strict');
const { chromium } = require(process.argv[2] || process.env.TIKSAVE_PLAYWRIGHT_PATH || 'playwright');
const base = process.env.TEST_BASE_URL || 'http://127.0.0.1:3000';
if (!['localhost', '127.0.0.1'].includes(new URL(base).hostname)) throw Error('Use a local preview.');
const id = '7170520270497680683';
function fixture(type) {
  return { id, shortcode:id, canonicalUrl:`https://www.tiktok.com/@fixture/${type === 'photo' ? 'photo' : 'video'}/${id}`, category:type, title:'Result focus fixture', uploader:{username:'fixture'}, itemCount:1, isCarousel:false, supportsZipDownload:false, extractorSource:'fixture', items:[{index:0,itemId:id+'_1',shortcode:id,mediaType:type,title:'Result focus fixture',thumbnailUrl:'',width:720,height:1280,formats:[{formatId:type==='photo'?'photo-original':'mp4',label:'Original',ext:type==='photo'?'jpg':'mp4',Container:type==='photo'?'JPEG':'MP4',resolution:'720x1280',filesizeFormatted:'Size unavailable',hasVideo:type==='video',hasAudio:type==='video',needsMerge:false}]}] };
}
async function main() {
  const browser = await chromium.launch({ headless:true, channel:'chrome' });
  try {
    for (const reducedMotion of ['reduce','no-preference']) {
    for (const [width,height] of [[390,900],[768,900],[1440,900],[1464,547]]) {
      const page = await browser.newPage({ viewport:{width,height}, reducedMotion });
      await page.route('https://**/*', route => route.abort());
      for (const type of ['video','photo']) {
        const media = fixture(type);
        await page.route('**/api/media/resolve', route => route.fulfill({json:{status:'ok',data:media}}));
        await page.goto(base + (type==='photo'?'/photo-downloader':'/video-downloader'));
        await page.waitForSelector('#downloader-form[data-saveframe-initialized=true]');
        await page.locator('#tiktok-url-input').fill(media.canonicalUrl);
        await page.getByRole('button',{name:type==='photo'?'Download Photo':'Download Video',exact:true}).click();
        await page.waitForFunction(() => document.activeElement?.id === 'result-dynamic-content');
        const result = page.locator('#result-dynamic-content');
        assert.equal(await result.getAttribute('tabindex'),'-1');
        assert.equal(await result.getAttribute('role'),'region');
        const box = await result.boundingBox();
        assert.ok(box && box.y >= 0 && box.y < 180, `Results must already be visible when focused at ${width}x${height}, ${reducedMotion}`);
        assert.equal(new URL(page.url()).pathname,type==='photo'?'/photo-downloader':'/video-downloader');
        await page.unroute('**/api/media/resolve');
      }
      await page.close();
    }
    }
    console.log('PASS: video/photo results are immediately visible and focused at 390, 768, 1440 and 1464x547, with normal/reduced motion and no page navigation. Inert fixtures only.');
  } finally { await browser.close(); }
}
main().catch(error => { console.error(error); process.exitCode=1; });
