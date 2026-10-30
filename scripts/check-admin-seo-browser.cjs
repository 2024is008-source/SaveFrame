// Run check-admin-live.cjs --keep first. Uses only disposable local credentials.
const assert=require('node:assert/strict'),fs=require('node:fs');
const {chromium}=require(process.env.SAVEFRAME_PLAYWRIGHT_PATH||'playwright');
const credential=JSON.parse(fs.readFileSync('.runtime/admin-preview.json','utf8'));
const base=credential.base;
if(!['127.0.0.1','localhost'].includes(new URL(base).hostname))throw Error('Use an isolated loopback admin fixture');
const titles=require('../src/content/search-titles.json');
let stage='launch';
const decode=value=>value.replace(/&amp;/g,'&').replace(/&quot;/g,'"').replace(/&#39;/g,"'");
async function main(){
 const browser=await chromium.launch({headless:true,...(process.env.SAVEFRAME_BROWSER_CHANNEL?{channel:process.env.SAVEFRAME_BROWSER_CHANNEL}:{})});
 const checks=[],errors=[];
 try{
  const context=await browser.newContext({viewport:{width:1440,height:1000}});
  await context.route('**/*',route=>new URL(route.request().url()).origin===base?route.continue():route.abort());
  const page=await context.newPage();page.on('pageerror',()=>errors.push('browser_runtime_error'));
  stage='password and local email OTP';
  await page.goto(base+'/admin/login');
  await page.getByLabel('Email address',{exact:true}).fill(credential.email);
  await page.getByLabel('Password',{exact:true}).fill(credential.password);
  const send=page.getByRole('button',{name:'Send sign-in code',exact:true});await send.click();
  await page.locator('input[name=emailCode]').waitFor();
  const code=fs.readFileSync('.runtime/admin-preview-mail.txt','utf8').match(/code is: (\d{6})/)?.[1];assert.ok(code);
  await page.locator('input[name=emailCode]').fill(code);
  await page.getByRole('button',{name:'Verify code and sign in',exact:true}).click();await page.waitForURL(base+'/admin');
  const open=async route=>{await page.goto(base+'/admin/seo?route='+encodeURIComponent(route));await page.locator('#seo-title').waitFor();};
  const status=async text=>page.getByRole('status').filter({hasText:text}).waitFor();
  const published=async route=>{
   const response=await context.request.get(base+route);assert.equal(response.status(),200);const html=await response.text();
   const meta={};for(const [tag]of html.matchAll(/<meta\b[^>]*>/g)){const key=tag.match(/(?:name|property)="([^"]+)"/)?.[1],value=tag.match(/content="([^"]*)"/)?.[1];if(key&&value!==undefined)meta[key]=decode(value);}
   return {title:decode(html.match(/<title>(.*?)<\/title>/s)?.[1]||''),meta,html};
  };
  stage='draft and publish';await open('/reels-downloader');
  const title='Instagram Reels Downloader – Free HD MP4 Online | SaveFrame';
  const description='Download public Instagram Reels as MP4. Choose available video quality and save your file. No login required.';
  await page.locator('#seo-title').fill(title);await page.locator('#seo-description').fill(description);
  assert.equal(await page.locator('.admin-metadata-preview h3').textContent(),title);
  await page.getByRole('button',{name:'Save draft',exact:true}).click();await status('Draft saved.');
  assert.equal((await published('/reels-downloader')).title,titles['/reels-downloader']);
  await page.getByRole('button',{name:'Publish changes',exact:true}).click();await status('Published to your website.');
  let result=await published('/reels-downloader');assert.equal(result.title,title);
  for(const key of ['description','og:description','twitter:description'])assert.equal(result.meta[key],description);
  for(const key of ['og:title','twitter:title'])assert.equal(result.meta[key],title);
  assert.ok(result.html.includes(description));checks.push('browser draft isolation and publish matches actual search/social HTML');
  await page.reload();await page.locator('#seo-title').waitFor();assert.equal(await page.locator('#seo-title').inputValue(),title);assert.equal(await page.locator('#seo-description').inputValue(),description);
  stage='defaults';await page.getByRole('button',{name:'Use page defaults',exact:true}).click();
  assert.equal(await page.locator('#seo-title').inputValue(),titles['/reels-downloader']);assert.equal((await published('/reels-downloader')).title,title);
  await page.getByRole('button',{name:'Publish changes',exact:true}).click();await status('Published to your website.');assert.equal((await published('/reels-downloader')).title,titles['/reels-downloader']);checks.push('reload persistence and explicit default reset');
  stage='independent social fields and route navigation';
  await page.locator('.admin-page-list a[href="/admin/seo?route=%2Fphoto-downloader"]').click();
  await page.waitForURL(url=>url.searchParams.get('route')==='/photo-downloader');
  await page.waitForFunction(()=>document.querySelector('.admin-editor .admin-panel-heading h2')?.textContent==='/photo-downloader');
  stage='custom social field edit';
  await page.locator('#seo-ogTitle').fill('Independent photo social title');await page.locator('#seo-ogDescription').fill('Independent photo social description.');
  await page.locator('#seo-title').fill('Updated photo title');await page.locator('#seo-description').fill('Updated public photo description.');
  assert.equal(await page.locator('#seo-ogTitle').inputValue(),'Independent photo social title');
  stage='social inheritance reset';await page.getByRole('button',{name:'Use SEO text for social previews',exact:true}).click();assert.equal(await page.locator('#seo-ogTitle').inputValue(),'');
  stage='photo publish';
  await page.getByRole('button',{name:'Publish changes',exact:true}).click();await status('Published to your website.');result=await published('/photo-downloader');assert.equal(result.title,'Updated photo title');assert.equal(result.meta['og:title'],result.title);
  stage='photo reset';await page.getByRole('button',{name:'Use page defaults',exact:true}).click();await page.getByRole('button',{name:'Publish changes',exact:true}).click();await status('Published to your website.');checks.push('page switching, independent social edits, and inheritance reset');
  stage='responsive form';fs.mkdirSync('reports/admin-seo-ui',{recursive:true});
  for(const width of [1440,768,390]){
   await page.setViewportSize({width,height:1000});
   await page.evaluate(async()=>{scrollTo(0,0);await document.fonts.ready;await new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)));});
   assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),true);
   await page.screenshot({path:'reports/admin-seo-ui/'+width+'.png',fullPage:true});
  }
  checks.push('responsive 1440/768/390 screenshots without page overflow');
  const homePage=await context.newPage();
  for(const width of [1440,390]){
   await homePage.setViewportSize({width,height:1000});await homePage.goto(base+'/');
   await homePage.locator('#downloader-form').waitFor();await homePage.evaluate(()=>document.fonts.ready);
   assert.equal(await homePage.locator('[data-main-tool-links]').count(),0);
   assert.equal(await homePage.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),true);
   await homePage.screenshot({path:'reports/admin-seo-ui/home-'+width+'.png'});
  }
  stage='evergreen SEO';
  for(const route of ['/','/reels-downloader','/photo-downloader','/carousel-downloader','/audio-downloader','/video-downloader']){
   result=await published(route);assert.ok(!/<time\b|datePublished|dateModified/.test(result.html));assert.ok(!result.html.includes('data-main-tool-links'));
   if(route!=='/')assert.equal(result.title,titles[route]);
  }
  const redirect=await context.request.get(base+'/photo-downloader?ref=check',{headers:{host:'www.saveframe.site'},maxRedirects:0});assert.equal(redirect.status(),308);assert.equal(redirect.headers().location,'https://saveframe.site/photo-downloader?ref=check');
  assert.equal(errors.length,0);checks.push('date-free evergreen pages, canonical tool defaults, and www permanent redirect');
  fs.writeFileSync('reports/admin-seo-browser.json',JSON.stringify({checks,errors,externalRequestsAllowed:false,disposableDatabase:true},null,2)+'\n');
  console.log('PASS: '+checks.join('; ')+'. Local test account and SMTP only.');
 }finally{await browser.close();}
}
main().catch(()=>{console.error('Admin SEO browser check failed during: '+stage);process.exitCode=1;});
