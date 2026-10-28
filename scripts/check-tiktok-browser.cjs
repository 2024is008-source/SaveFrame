const assert = require('node:assert/strict');
const fs = require('node:fs');
const { chromium } = require(process.env.TIKSAVE_PLAYWRIGHT_PATH || 'playwright');
const base = process.env.TEST_BASE_URL || 'http://127.0.0.1:3000';
if(!['127.0.0.1','localhost'].includes(new URL(base).hostname)) throw Error('Browser fixtures must run on a local preview.');
const output = 'reports/tiktok-browser';
fs.mkdirSync(output,{recursive:true});
const id='7170520270497680683';
const image='https://p16.tiktokcdn.com/fixture.jpg';
const photo=index=>({index,itemId:'photo-'+index,shortcode:id,mediaType:'photo',title:'Photo '+(index+1),thumbnailUrl:image,width:1080,height:1440,aspectRatio:'3:4',formats:[{formatId:'photo-original',label:'Original image',ext:'jpg',Container:'JPEG',resolution:'1080x1440',hasVideo:false,hasAudio:false,needsMerge:false,filesizeFormatted:'Size unavailable'}]});
const photos={id,shortcode:id,canonicalUrl:`https://www.tiktok.com/@creator/photo/${id}`,category:'carousel',title:'Browser test photo post',uploader:{username:'creator'},itemCount:2,isCarousel:true,supportsZipDownload:true,items:[photo(0),photo(1)],extractorSource:'tiktok-web'};
const video={...photos,canonicalUrl:`https://www.tiktok.com/@creator/video/${id}`,category:'video',itemCount:1,isCarousel:false,supportsZipDownload:false,items:[{...photo(0),mediaType:'video',durationSeconds:5,formats:[{formatId:'mp4',label:'720×1280 MP4',ext:'mp4',Container:'MP4',resolution:'720x1280',hasVideo:true,hasAudio:true,needsMerge:false,filesizeFormatted:'Size unavailable'}]}]};
async function main(){
  const browser=await chromium.launch({headless:true,channel:process.env.TIKSAVE_BROWSER_CHANNEL||'chrome'});
  const errors=[],requests=[];
  try{
    const page=await browser.newPage({viewport:{width:1440,height:1000},acceptDownloads:true});
    page.on('pageerror',error=>errors.push(error.message));
    await page.route('https://p16.tiktokcdn.com/**',route=>route.fulfill({contentType:'image/png',body:Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jY1cAAAAASUVORK5CYII=','base64')}));
    const ready=async path=>{await page.goto(base+path);await page.waitForSelector('#downloader-form[data-saveframe-initialized=true]');};
    await ready('/');
    assert.match(await page.title(),/TikTok.*TikSaveMP4/);
    assert.equal(await page.locator('[role=tab]').count(),2);
    assert.equal(await page.locator('body').evaluate(element=>element.textContent.includes('Instagram')),false);
    assert.equal(await page.locator('#downloader-panel').evaluate(element=>getComputedStyle(element).borderRadius),'20px');
    assert.equal(await page.locator('#main-tool>section').first().evaluate(element=>getComputedStyle(element).backgroundColor),'rgb(255, 255, 255)','The requested theme is white');
    assert.equal(await page.locator('h1').evaluate(element=>getComputedStyle(element).fontFamily.includes('TikTok Sans')),true);
    for(const width of [1440,768,390,375,844]){
      await page.setViewportSize({width,height:width===844?390:900});
      assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'No horizontal page overflow at '+width);
      await page.screenshot({path:`${output}/${width}.png`,fullPage:true});
    }
    await page.setViewportSize({width:390,height:844});
    await page.locator('#mobile-menu-btn').click();
    assert.equal(await page.locator('#mobile-menu-btn').getAttribute('aria-expanded'),'true');
    await page.keyboard.press('Escape');
    assert.equal(await page.locator('#mobile-menu-btn').getAttribute('aria-expanded'),'false');
    await page.locator('#faq-btn-2').click();
    assert.equal(await page.locator('#faq-btn-2').getAttribute('aria-expanded'),'true');
    await page.locator('#tiktok-url-input').fill('https://instagram.com/p/ABC123/');
    await page.locator('#submit-download-btn').click();
    assert.match(await page.locator('#validation-message').textContent(),/TikTok/);
    await page.route('**/api/media/resolve',async route=>{const body=route.request().postDataJSON();requests.push(body);await route.fulfill({json:{status:'ok',data:body.url.includes('/video/')?video:photos}});});
    await page.route('**/api/media/download',async route=>{requests.push(route.request().postDataJSON());await route.fulfill({status:202,json:{status:'ok',jobId:'fixture-job'}});});
    await page.route('**/api/media/jobs/fixture-job',route=>route.fulfill({json:{status:'ok',job:{status:'completed',progress:100,safeFilename:'tiksave-fixture.zip',deliveryStatus:'handed_off'}}}));
    await page.route('**/api/media/download/fixture-job',route=>route.fulfill({status:200,headers:{'Content-Type':'application/zip','Content-Disposition':'attachment; filename="tiksave-fixture.zip"'},body:Buffer.from('test download')}));
    await page.locator('#tiktok-url-input').fill(photos.canonicalUrl);
    await page.locator('#submit-download-btn').click();
    await page.waitForSelector('[data-download-all]');
    assert.match(await page.locator('#result-dynamic-content').textContent(),/creator/);
    const allDownload=page.waitForEvent('download');await page.locator('[data-download-all]').click();await allDownload;
    assert.ok(requests.some(request=>request.zipCarousel===true),'ZIP action submitted');
    const individualDownload=page.waitForEvent('download');await page.locator('.trigger-download-btn[data-item-index]').first().click();await individualDownload;
    assert.ok(requests.some(request=>request.itemIndex===0&&!request.zipCarousel),'Individual image action submitted');
    await page.locator('#tiktok-url-input').fill(video.canonicalUrl);
    await page.locator('#submit-download-btn').click();
    await page.waitForSelector('#tab-video[aria-selected=true]');
    await page.waitForSelector('.trigger-download-btn');
    const videoDownload=page.waitForEvent('download');await page.locator('.trigger-download-btn').first().click();await videoDownload;
    assert.ok(requests.some(request=>request.formatId==='mp4'),'MP4 action submitted');
    await ready('/photo-downloader');assert.match(await page.locator('#hero-heading').textContent(),/Photo/);
    await ready('/video-downloader');assert.match(await page.locator('#hero-heading').textContent(),/Video/);
    await page.emulateMedia({reducedMotion:'reduce'});
    await page.setViewportSize({width:375,height:812});
    await page.evaluate(()=>document.documentElement.style.fontSize='24px');
    assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
    for(const path of ['/about','/contact','/privacy','/terms','/copyright']){const response=await page.goto(base+path);assert.equal(response.status(),200);assert.equal(await page.locator('h1').count(),1);}
    const sitemap=await (await page.request.get(base+'/sitemap.xml')).text();
    assert.ok(sitemap.includes('https://tiksavemp4.online/'));assert.ok(!sitemap.includes('instagram'));
    assert.deepEqual(errors,[]);
    console.log('PASS: restored page styling, responsive widths, mobile menu, FAQ, URL rejection, photo slideshow, individual image and ZIP downloads, MP4 download, dedicated routes, information pages, reduced motion/text scaling, domain sitemap; no browser exceptions. Media responses are explicit test fixtures.');
  }finally{await browser.close();}
}
main().catch(error=>{console.error(error);process.exitCode=1;});
