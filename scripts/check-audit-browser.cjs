const assert = require('node:assert/strict');
const fs = require('node:fs');
const {chromium} = require(process.env.TIKSAVE_PLAYWRIGHT_PATH || 'playwright');
const tools = require('../src/content/tools.json');
const base = process.env.TEST_BASE_URL || 'http://127.0.0.1:3115';
if (!['localhost','127.0.0.1'].includes(new URL(base).hostname)) throw Error('Use a local preview');

async function main() {
  const browser = await chromium.launch({headless:true,channel:'chrome'});
  try {
    const context = await browser.newContext({userAgent:'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36'});
    const errors = [];
    let googleLoads = 0;
    // Simulate a normal visitor on the canonical origin; every request stays local.
    await context.addInitScript(() => Object.defineProperty(navigator,'webdriver',{get:()=>false}));
    await context.route('**/*', async route => {
      const url = new URL(route.request().url());
      if (url.hostname === 'www.googletagmanager.com') {
        googleLoads++;
        return route.fulfill({contentType:'application/javascript',body:'/* local analytics loader fixture */'});
      }
      if (url.origin === 'https://tiksavemp4.online') {
        const response = await route.fetch({url:base + url.pathname + url.search});
        return route.fulfill({response});
      }
      return route.abort();
    });
    const page = await context.newPage();
    page.on('pageerror',error=>errors.push(error.message));
    await page.goto('https://tiksavemp4.online/');
    await page.waitForSelector('#downloader-form[data-saveframe-initialized=true]');
    await page.getByRole('heading',{name:'Optional analytics',exact:true}).waitFor();
    fs.mkdirSync('reports/audit-browser',{recursive:true});
    await page.setViewportSize({width:390,height:844});
    await page.screenshot({path:'reports/audit-browser/analytics-choice-390.png'});
    assert.equal(googleLoads,0,'No Google loader before consent for an unknown region');
    assert.equal(await page.locator('#tab-video').getAttribute('aria-selected'),'true');
    await page.getByRole('button',{name:'Decline analytics',exact:true}).click();
    await page.reload();
    await page.getByRole('button',{name:'Analytics settings',exact:true}).waitFor();
    assert.equal(await page.locator('#analytics-choice').count(),0,'Decline survives reload');
    assert.equal(googleLoads,0);
    await page.getByRole('button',{name:'Analytics settings',exact:true}).click();
    await page.getByRole('button',{name:'Allow analytics',exact:true}).click();
    await page.waitForFunction(()=>window.saveframeDataLayer?.some(args=>args[1]==='page_view'));
    await page.waitForFunction(()=>document.querySelector('script[src*="googletagmanager.com"]'));
    assert.equal(googleLoads,1);
    assert.equal(await page.evaluate(()=>Array.from(window.saveframeDataLayer).find(args=>args[1]==='page_view')[2].page_title),await page.title());
    await page.getByRole('button',{name:'Analytics settings',exact:true}).click();
    await page.getByRole('button',{name:'Decline analytics',exact:true}).click();
    assert.equal(await page.evaluate(()=>window['ga-disable-G-XP63QEZK1R']),true);
    assert.equal(await page.evaluate(()=>window.saveframeDataLayer.length),0,'Withdrawal clears the queue');
    for (const tool of tools) {
      await page.goto('https://tiksavemp4.online/'+tool.slug);
      await page.waitForSelector('#downloader-form[data-saveframe-initialized=true]');
      for (const [index,[question,answer]] of tool.faqs.entries()) {
        assert.equal((await page.locator('#faq-btn-'+(index+1)).innerText()).trim(),question);
        assert.equal((await page.locator('#faq-panel-'+(index+1)).textContent()).trim(),answer);
      }
      await page.locator('#faq-btn-2').click();
      assert.equal(await page.locator('#faq-btn-2').getAttribute('aria-expanded'),'true');
      for (const width of [390,1440]) {
        await page.setViewportSize({width,height:1000});
        assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'No horizontal overflow');
        await page.screenshot({path:`reports/audit-browser/${tool.tool}-${width}.png`,fullPage:true});
      }
      assert.equal(await page.locator('footer a[href="/photo-downloader"]').count(),1,'One photo/carousel navigation destination');
    }
    assert.deepEqual(errors,[]);
    await context.close();
    console.log('PASS: consent required in unknown regions, persistent decline, grant, withdrawal, actual page titles, tool FAQs, deduplicated navigation and mobile/desktop layouts. Google loader mocked; no Google requests sent.');
  } finally { await browser.close(); }
}
main().catch(error=>{console.error(error);process.exitCode=1;});
