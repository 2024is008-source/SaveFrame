const assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path'),{spawn}=require('node:child_process');
const {chromium}=require(process.env.TIKSAVE_PLAYWRIGHT_PATH||'playwright');
const {DatabaseSync}=require('node:sqlite');
const live=process.argv.includes('--live-ga');
const directory=fs.mkdtempSync(path.join(os.tmpdir(),'tiksave-browser-analytics-'));
const base='http://127.0.0.1:3115',origin='https://tiksavemp4.online';
const delay=ms=>new Promise(resolve=>setTimeout(resolve,ms));
const until=async(fn,message)=>{for(let i=0;i<60;i++){if(await fn())return;await delay(250);}throw Error(message);};
const normalUA='Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36';
let server,browser,db;const failures=[],results=[],network=[];
async function main(){
 server=spawn(process.execPath,['node_modules/next/dist/bin/next','start','-H','127.0.0.1','-p','3115'],{windowsHide:true,stdio:['ignore','pipe','pipe'],env:{...process.env,NODE_ENV:'production',SAVEFRAME_ADMIN_DATA_DIR:directory,SAVEFRAME_ANALYTICS_DISABLED:'1',NEXT_PUBLIC_SITE_URL:origin,NEXT_PUBLIC_GA_ID:'G-XP63QEZK1R',GA_MEASUREMENT_ID:'G-XP63QEZK1R',GA4_ENABLED:'1',GA4_TRUST_REGION_HEADER:'1',GA4_AUTOMATIC_COUNTRIES:'*',INTERNAL_TRAFFIC_ENABLED:'1'}});
 let log='';server.stdout.on('data',chunk=>log=(log+chunk).slice(-2000));server.stderr.on('data',chunk=>log=(log+chunk).slice(-2000));
 await until(async()=>{if(server.exitCode!==null)throw Error('Isolated server failed: '+log);try{return(await fetch(base+'/api/health')).ok;}catch{return false;}},'Server did not start');
 browser=await chromium.launch({headless:true,channel:'chrome'});
 const errors=[];
 async function session(country,{privacy='',optout=false,mobile=false,javascript=true}={}){
  const context=await browser.newContext({javaScriptEnabled:javascript,userAgent:normalUA,viewport:mobile?{width:390,height:844}:{width:1440,height:1000}});
  await context.addInitScript(({privacy,optout})=>{Object.defineProperty(navigator,'webdriver',{get:()=>false});if(privacy==='gpc')Object.defineProperty(navigator,'globalPrivacyControl',{get:()=>true});if(privacy==='dnt')Object.defineProperty(navigator,'doNotTrack',{get:()=> '1'});if(optout)localStorage.setItem('saveframe.analytics.consent','denied');},{privacy,optout});
  if(optout)await context.addCookies([{name:'sf_analytics_preference',value:'denied',url:origin,secure:true,sameSite:'Lax'}]);
  let tagLoads=0;const collects=[],firstParty=[];
  context.on('request',req=>{if(req.url().includes('/api/analytics/page-view'))firstParty.push(req);});
  context.on('response',async response=>{
   const u=new URL(response.url());
   if(u.hostname==='www.googletagmanager.com'){network.push({kind:'loader',status:response.status()});return;}
   if(/(?:^|\.)(?:google-analytics\.com|analytics\.google\.com)$/.test(u.hostname)&&u.pathname.includes('collect')){
    const request=response.request(),baseParams=new URLSearchParams(u.search);
    for(const line of (request.postData()||'').split('\n')){
     const params=new URLSearchParams(baseParams);for(const [k,v]of new URLSearchParams(line))params.set(k,v);
     if(params.get('en')){const row={event:params.get('en'),location:params.get('dl'),title:params.get('dt'),referrer:params.get('dr'),source:params.get('cs'),medium:params.get('cm'),measurementId:params.get('tid'),status:response.status()};collects.push(row);network.push(row);}
    }
   }
  });
  await context.route('**/*',async route=>{
   const req=route.request(),url=new URL(req.url());
   if(url.origin===origin){
    const headers={...req.headers(),'x-saveframe-country':country};if(privacy==='gpc')headers['sec-gpc']='1';if(privacy==='dnt')headers.dnt='1';
    const response=await route.fetch({url:base+url.pathname+url.search,headers});return route.fulfill({response});
   }
   if(url.hostname==='www.googletagmanager.com'){tagLoads++;return live?route.continue():route.fulfill({contentType:'application/javascript',body:'/* deterministic local fixture */'});}
   if(/(?:^|\.)(?:google-analytics\.com|analytics\.google\.com)$/.test(url.hostname))return live?route.continue():route.abort();
   return route.abort();
  });
  const page=await context.newPage();page.on('pageerror',error=>errors.push(error.message));
  return {context,page,collects,firstParty,loads:()=>tagLoads};
 }
 const allowed=await session('LK');let page=allowed.page;
 await page.goto(origin+'/?utm_source=newsletter&utm_medium=email',{referer:'https://www.google.com/search?q=private-search'});
 await page.waitForSelector('#downloader-form[data-saveframe-initialized=true]');
 await page.waitForFunction(()=>window.__tiksaveTraffic);
 assert.equal(await page.getByText('Optional analytics',{exact:true}).count(),0);assert.equal(await page.getByRole('button',{name:/Allow analytics|Decline analytics/}).count(),0);
 await until(()=>allowed.loads()===1,'Allowed region did not load Google');
 db=new DatabaseSync(path.join(directory,'saveframe-admin.sqlite'));
 const total=()=>Number(db.prepare('SELECT COALESCE(SUM(views),0) n FROM daily_page_statistics').get().n);
 await until(()=>total()===1,'Initial HTML view not counted exactly once');
 if(live){await until(()=>allowed.collects.some(row=>row.event==='page_view'&&row.status<300),'No successful real Google page_view response');const first=allowed.collects.find(row=>row.event==='page_view');assert.equal(first.referrer,'https://www.google.com/');assert.equal(first.source,'newsletter');assert.equal(first.medium,'email');}
 results.push('homepage has no popup; automatic allowed-region loader; exactly one initial internal view');
 await page.goto(origin+'/blog');await page.waitForFunction(()=>window.__tiksaveTraffic);
 await until(()=>total()===2,'Second document view not counted');
 const before=total();await page.locator('.blog-catalog .guide-card a').first().click();await page.waitForURL('**/blog/how-to-download-tiktok-videos-mp4');
 await until(()=>allowed.firstParty.length===1,'Next Link did not send exactly one SPA counter');await until(()=>total()===before+1,'SPA view was not counted');
 await delay(500);assert.equal(allowed.firstParty.length,1,'No duplicate SPA counters');
 const location=page.url();
 assert.equal(await page.evaluate(url=>Array.from(window.saveframeDataLayer||[]).filter(args=>args[1]==='page_view'&&args[2].page_location===url).length,location),1);
 if(live){await until(()=>allowed.collects.some(row=>row.event==='page_view'&&row.location===location),'No real Google SPA view');await delay(1000);assert.equal(allowed.collects.filter(row=>row.event==='page_view'&&row.location===location).length,1,'Google history measurement duplicates the manual page_view; disable it in the property');}
 results.push('Next.js navigation: one GA4 command and one internal counter per route');
 await page.evaluate(()=>{const operation={};for(let i=0;i<2;i++)window.dispatchEvent(new CustomEvent('saveframe:analytics-event',{detail:{name:'download_started',operation,params:{media_type:'video',download_format:'mp4',download_method:'single',source_page:'/video-downloader'}}}));});
 assert.equal(await page.evaluate(()=>Array.from(window.saveframeDataLayer||[]).filter(args=>args[1]==='download_started').length),1);
 if(live)await until(()=>allowed.collects.some(row=>row.event==='download_started'&&row.status<300),'No successful real Google download event');
 results.push('duplicate download operations submit one sanitized event');
 await allowed.context.close();
 for(const [country,options]of [['DE',{}],['XX',{}],['LK',{privacy:'gpc'}],['LK',{privacy:'dnt'}],['LK',{optout:true}]]){
  const test=await session(country,options),before=total();await test.page.goto(origin+'/');await test.page.waitForFunction(()=>window.__tiksaveTraffic);await delay(700);
  assert.equal(test.loads(),0,country+' must not load Google');
  assert.equal(await test.page.locator('#analytics-choice').count(),0);
  const expected=options.privacy||options.optout?before:before+1;await until(()=>total()===expected,'Restricted/optout internal count mismatch');
  await test.context.close();
 }
 results.push('restricted/unknown: zero Google requests; internal counts remain available; opt-outs/GPC/DNT excluded');
 const nojs=await session('XX',{javascript:false}),beforeNoJs=total();
 assert.equal((await nojs.page.goto(origin+'/photo-downloader')).status(),200);await until(()=>total()===beforeNoJs+1,'No-JavaScript document missing from internal counts');assert.equal(nojs.loads(),0);await nojs.context.close();results.push('HTML requests counted with JavaScript disabled');
 const mobile=await session('XX',{mobile:true});await mobile.page.goto(origin+'/');await mobile.page.waitForSelector('#downloader-form[data-saveframe-initialized=true]');
 assert.ok(await mobile.page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
 fs.mkdirSync('reports/analytics-browser',{recursive:true});await mobile.page.screenshot({path:'reports/analytics-browser/home-no-popup-390.png',fullPage:false});
 await mobile.context.close();
 assert.deepEqual(errors,[]);results.push('mobile layout and browser console clean');
 assert.ok(!JSON.stringify(db.prepare('SELECT * FROM daily_page_statistics').all()).includes('utm_'));
 console.log('PASS: '+results.join('; ')+(live?'; successful real Google collection responses observed.':'; Google mocked (use --live-ga for network verification).'));
}
main().catch(error=>{failures.push(error.message);console.error(error);process.exitCode=1;}).finally(async()=>{
 if(browser)await browser.close();if(db)db.close();
 if(server&&server.exitCode===null){const exit=new Promise(resolve=>server.once('exit',resolve));server.kill();await Promise.race([exit,delay(4000)]);}
 fs.mkdirSync('reports/analytics-browser',{recursive:true});fs.writeFileSync('reports/analytics-browser/'+(live?'live-network':'offline')+'.json',JSON.stringify({passed:failures.length===0,liveGoogleRequests:live,propertyRealtimeVerified:false,results,failures,network},null,2)+'\n');
 // Keep this isolated test database; never remove or change a user's database.
});
