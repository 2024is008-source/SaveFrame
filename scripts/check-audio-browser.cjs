// Explicitly opt in with an authorized public test URL; use an isolated local server.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const {chromium} = require(process.env.SAVEFRAME_PLAYWRIGHT_PATH || 'playwright');
const base = process.env.TEST_BASE_URL || 'http://127.0.0.1:3125';
const mediaUrl = process.env.SAVEFRAME_AUDIO_TEST_URL;
if (!mediaUrl || !['localhost', '127.0.0.1'].includes(new URL(base).hostname)) throw Error('Set an authorized SAVEFRAME_AUDIO_TEST_URL and isolated loopback TEST_BASE_URL');
async function main() {
  const browser = await chromium.launch({headless: true, ...(process.env.SAVEFRAME_BROWSER_CHANNEL ? {channel: process.env.SAVEFRAME_BROWSER_CHANNEL} : {})});
  const errors = [], downloads = [];
  let googleRequests = 0;
  try {
    const context = await browser.newContext({viewport: {width: 1365, height: 900}, acceptDownloads: true});
    await context.route('**/*', route => {
      const url = new URL(route.request().url());
      if (/google-analytics|googletagmanager/.test(url.hostname)) googleRequests++;
      const image = route.request().resourceType() === 'image' && /(?:^|\.)(?:cdninstagram\.com|fbcdn\.net)$/.test(url.hostname);
      return url.origin === new URL(base).origin || image ? route.continue() : route.abort();
    });
    const page = await context.newPage();
    page.on('pageerror', error => errors.push(error.message));
    const ready = async path => {
      await page.goto(base + path, {waitUntil: 'domcontentloaded'});
      await page.waitForFunction(() => document.querySelector('#downloader-form')?.getAttribute('data-saveframe-initialized') === 'true');
    };
    for (const locale of ['en', 'es', 'pt-br', 'de', 'fr', 'ja', 'id', 'tr', 'hi', 'ar']) {
      await ready(locale === 'en' ? '/' : '/' + locale + '/');
      assert.equal(await page.locator('#tab-story').count(), 0);
      await page.locator('#tab-audio').click();
      const dictionary = require('../src/i18n/dictionaries/' + locale + '.json');
      assert.equal((await page.locator('#panel-tool-title').textContent()).trim(), dictionary['Instagram Audio Downloader']);
      assert.equal(await page.locator('#instagram-url-input').getAttribute('placeholder'), dictionary['Paste Instagram Reel or video URL here']);
    }
    for (const [width, quality] of [[1365, 1], [390, 2]]) {
      await page.setViewportSize({width, height: 900});
      await ready('/audio-downloader');
      assert.equal(await page.title(), 'Instagram Audio Downloader – Download Reels MP3');
      assert.equal((await page.locator('#hero-heading').textContent()).trim(), 'Instagram Audio Downloader');
      await page.locator('#instagram-url-input').fill(mediaUrl);
      await page.locator('#submit-download-btn').click();
      await page.locator('[data-quality-idx="2"]').waitFor({timeout: 90000});
      assert.equal(await page.locator('[data-quality-idx]').count(), 3);
      assert.equal(await page.locator('#media-preview-frame').count(), 0, 'Audio has no full-size preview');
      const thumb = page.locator('.audio-result-thumb');
      assert.equal(await thumb.count(), 1);
      const size = await thumb.boundingBox();
      assert.ok(size.width <= 56 && size.height <= 56, 'Audio thumbnail stays compact');
      await page.locator(`[data-quality-idx="${quality}"]`).click();
      const pending = page.waitForEvent('download', {timeout: 300000});
      await page.locator('.trigger-download-btn').click();
      const download = await pending;
      assert.ok(download.suggestedFilename().endsWith('.mp3'));
      const stream = await download.createReadStream();
      const chunks = []; let bytes = 0;
      for await (const chunk of stream) {bytes += chunk.length; assert.ok(bytes < 32 * 1024 * 1024); chunks.push(chunk);}
      const data = Buffer.concat(chunks);
      assert.equal(data.toString('ascii', 0, 3), 'ID3');
      assert.equal(await download.failure(), null);
      downloads.push({viewport: width, requestedBitrate: quality === 1 ? 192 : 320, bytes, mp3: true});
      await page.waitForFunction(() => !document.querySelector('.trigger-download-btn')?.disabled, undefined, {timeout: 10000});
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth > innerWidth);
      assert.equal(overflow, false);
      await page.screenshot({path: width === 390 ? 'reports/audio-mobile.png' : 'reports/audio-desktop.png', fullPage: false});
    }
    assert.deepEqual(errors, []);
    assert.equal(googleRequests, 0);
    fs.writeFileSync('reports/audio-browser.json', JSON.stringify({passed: true, downloads, allTenLanguages: true, productionDeployed: false, googleRequests}, null, 2) + '\n');
    console.log('PASS: ten translated Audio widgets; desktop 192 kbps and mobile 320 kbps actual MP3 browser downloads; quality choices; no overflow/runtime errors; no Google requests. Production was not deployed.');
  } finally { await browser.close(); }
}
main().catch(error => {console.error(error); process.exitCode = 1;});
