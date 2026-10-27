// Optional browser QA. Supply an external Playwright module; no application dependency is added.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const {chromium} = require(process.env.SAVEFRAME_PLAYWRIGHT_PATH || 'playwright');
const base = process.env.TEST_BASE_URL || 'http://127.0.0.1:3125';
const origin = new URL(base).origin;
if (!['127.0.0.1', 'localhost'].includes(new URL(base).hostname)) throw Error('Use an isolated loopback test server');
const paths = require('../src/content/tools.json').map(tool => '/' + tool.slug);
const homepages = ['/', '/es/', '/pt-br/', '/de/', '/fr/', '/ja/', '/id/', '/tr/', '/hi/', '/ar/'];

async function main() {
  const browser = await chromium.launch({headless: true, ...(process.env.SAVEFRAME_BROWSER_CHANNEL ? {channel: process.env.SAVEFRAME_BROWSER_CHANNEL} : {})});
  const errors = [];
  let extractionRequests = 0;
  try {
    const context = await browser.newContext({viewport: {width: 1365, height: 900}});
    await context.route('**/*', route => {
      const url = new URL(route.request().url());
      if (url.pathname === '/api/media/resolve') extractionRequests++;
      return url.origin === origin ? route.continue() : route.abort();
    });
    const page = await context.newPage();
    page.on('pageerror', error => errors.push(error.message));
    const ready = async path => {
      await page.goto(base + path, {waitUntil: 'domcontentloaded'});
      await page.waitForFunction(() => document.querySelector('#downloader-form')?.getAttribute('data-saveframe-initialized') === 'true');
    };
    await ready('/');
    await page.locator('#nav-viewer-btn').click();
    const desktopLink = page.locator('#nav-carousel-inspector-btn');
    assert.equal(await desktopLink.getAttribute('href'), '/carousel-downloader');
    await desktopLink.focus();
    await desktopLink.press('Enter');
    await page.waitForURL(origin + '/carousel-downloader');
    await page.locator('#hero-heading').waitFor();
    assert.equal((await page.locator('#hero-heading').textContent()).trim(), 'Instagram Carousel Downloader');

    await ready('/');
    await page.locator('#tab-reels').click();
    assert.equal(await page.locator('#tab-reels').getAttribute('aria-selected'), 'true');
    assert.equal(new URL(page.url()).pathname, '/', 'Home widget switching remains in-place');
    await page.locator('#tab-reels').press('ArrowRight');
    assert.equal(await page.locator('#tab-video').getAttribute('aria-selected'), 'true');
    await ready('/');
    await page.screenshot({path: 'reports/sitelinks-home-desktop.png', fullPage: true});

    await page.setViewportSize({width: 390, height: 844});
    for (const path of homepages) {
      await ready(path);
      await page.locator('#mobile-menu-btn').click();
      assert.equal(await page.locator('#mobile-menu-btn').getAttribute('aria-expanded'), 'true');
      for (const tool of paths) {
        const link = page.locator('#mobile-nav-drawer a[href="' + tool + '"]');
        assert.equal(await link.count(), 1, path + ': one mobile tool link');
        assert.equal(await link.isVisible(), true);
        assert.ok((await link.innerText()).trim());
        assert.equal(await page.locator('footer a[href="' + tool + '"]').count(), 1);
      }
      const width = await page.evaluate(() => ({page: document.documentElement.scrollWidth, viewport: innerWidth}));
      assert.ok(width.page <= width.viewport, path + ': no page overflow');
      if (path === '/') await page.screenshot({path: 'reports/sitelinks-mobile-menu.png', fullPage: false});
    }
    const carousel = page.locator('#mobile-nav-drawer a[href="/carousel-downloader"]');
    await carousel.focus();
    await carousel.press('Enter');
    await page.waitForURL(origin + '/carousel-downloader');
    await page.waitForFunction(() => document.querySelector('#downloader-form')?.getAttribute('data-saveframe-initialized') === 'true');
    assert.equal(await page.locator('#tab-photo').getAttribute('aria-selected'), 'true');
    await page.locator('#tab-reels').click();
    await page.waitForURL(origin + '/reels-downloader');

    // Core tool discovery and native navigation work with JavaScript disabled.
    const noJs = await browser.newContext({javaScriptEnabled: false, viewport: {width: 390, height: 844}});
    const plain = await noJs.newPage();
    await plain.goto(base + '/', {waitUntil: 'domcontentloaded'});
    for (const tool of paths) assert.equal(await plain.locator('footer a[href="' + tool + '"]').count(), 1);
    await plain.locator('footer a[href="/carousel-downloader"]').click();
    await plain.waitForURL(origin + '/carousel-downloader');
    assert.equal((await plain.locator('#hero-heading').textContent()).trim(), 'Instagram Carousel Downloader');
    const duplicate = await page.request.get(base + '/es/carousel-downloader');
    assert.equal(duplicate.status(), 404, 'No untranslated localized tool clones');
    assert.equal(extractionRequests, 0, 'Navigation must not start extraction');
    assert.deepEqual(errors, [], 'No browser runtime/hydration errors');
    const result = {passed: true, base, automatedBrowser: true, productionDeployed: false, checks: [
      'desktop native anchor/keyboard navigation', 'homepage widget click and arrow switching',
      'all 10 mobile homepages and all six named tool links', 'mobile native keyboard route navigation',
      'tool-to-tool switching', 'no horizontal page overflow', 'JavaScript-disabled footer discovery/navigation',
      'no duplicate localized tool page', 'no extraction requests', 'no runtime/hydration errors',
    ]};
    fs.writeFileSync('reports/sitelinks-browser.json', JSON.stringify(result, null, 2) + '\n');
    console.log('PASS: ' + result.checks.join('; ') + '. Isolated local server only.');
  } finally {
    await browser.close();
  }
}
main().catch(error => {console.error(error); process.exitCode = 1;});
