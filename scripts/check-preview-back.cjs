const assert = require('node:assert/strict');
const { chromium } = require(process.argv[2] || process.env.TIKSAVE_PLAYWRIGHT_PATH || 'playwright');
const base = process.env.TEST_BASE_URL || 'http://127.0.0.1:3000';
if (!['localhost', '127.0.0.1'].includes(new URL(base).hostname)) throw Error('Use a local test server.');
const id = '7170520270497680683';
const image = { index:0, itemId:id+'_1', shortcode:id, mediaType:'photo', title:'Fixture photo', thumbnailUrl:'https://p16.tiktokcdn.com/fixture.jpg', width:720,height:1280,formats:[{formatId:'photo-original',label:'Original image',ext:'jpg',Container:'JPEG',resolution:'720x1280',filesizeFormatted:'Size unavailable',hasVideo:false,hasAudio:false,needsMerge:false}] };
const media = { id,shortcode:id,canonicalUrl:`https://www.tiktok.com/@fixture/video/${id}`,category:'video',title:'Fixture video preview',uploader:{username:'fixture'},itemCount:1,isCarousel:false,supportsZipDownload:false,items:[{...image,mediaType:'video',durationSeconds:5,formats:[{formatId:'mp4',label:'720p MP4',ext:'mp4',Container:'MP4',resolution:'720x1280',filesizeFormatted:'Size unavailable',hasVideo:true,hasAudio:true,needsMerge:false}]}],extractorSource:'fixture' };
async function main(){
 const browser=await chromium.launch({headless:true,channel:'chrome'});
 try{
  const page=await browser.newPage({viewport:{width:390,height:844}});
  const errors=[]; page.on('pageerror',error=>errors.push(error.message));
  await page.route('https://**/*',route=>route.abort());
  await page.route('**/api/media/resolve',route=>route.fulfill({json:{status:'ok',data:media}}));
  await page.route('**/api/media/download',route=>route.fulfill({status:202,json:{status:'ok',jobId:'preview-fixture'}}));
  await page.route('**/api/media/jobs/preview-fixture',route=>route.fulfill({json:{status:'ok',job:{status:'processing',progress:0}}}));
  await page.goto(base+'/video-downloader');
  await page.waitForSelector('#downloader-form[data-saveframe-initialized=true]');
  await page.locator('#tiktok-url-input').fill(media.canonicalUrl);
  await page.locator('#submit-download-btn').click();
  await page.waitForSelector('.media-open-btn').catch(async error=>{console.error(JSON.stringify({errors,message:await page.locator('#validation-message').textContent(),result:await page.locator('#result-dynamic-content').textContent()}));throw error;});
  const marker=await page.evaluate(()=>{window.previewBackRegression=crypto.randomUUID();return window.previewBackRegression;});
  const before=page.url();
  for(const action of ['back','close','escape']){
   await page.locator('.media-open-btn').first().click();
   await page.waitForSelector('dialog[open]');
   if(action==='back')await page.goBack();
   else if(action==='close')await page.getByRole('button',{name:'Close dialog',exact:true}).click();
   else await page.keyboard.press('Escape');
   await page.waitForSelector('dialog',{state:'detached'});
   await page.waitForFunction(()=>!history.state?.tiksavePreview);
   assert.equal(page.url(),before);
   assert.equal(await page.evaluate(()=>window.previewBackRegression),marker,'Closing a preview must not reload the page');
   assert.equal(await page.locator('#tiktok-url-input').inputValue(),media.canonicalUrl);
   assert.ok(await page.locator('.trigger-download-btn').count());
  }
  console.log('PASS: mobile video preview Back, Close and Escape preserve the same document, URL, input and download results. Transport is an inert fixture.');
 }finally{await browser.close();}
}
main().catch(error=>{console.error(error);process.exitCode=1;});
