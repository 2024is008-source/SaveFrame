const assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path'),ts=require('typescript');
const directory=fs.mkdtempSync(path.join(os.tmpdir(),'tiksave-traffic-test-'));
Object.assign(process.env,{NODE_ENV:'production',SAVEFRAME_ADMIN_DATA_DIR:directory,NEXT_PUBLIC_SITE_URL:'https://tiksavemp4.online',GA4_TRUST_REGION_HEADER:'1',GA4_AUTOMATIC_COUNTRIES:'*',INTERNAL_TRAFFIC_ENABLED:'1'});
require.extensions['.ts']=(module,file)=>module._compile(ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,esModuleInterop:true}}).outputText,file);
const {db}=require('../src/admin/db.ts');
const {recordPageView,recordDocumentView,trafficReports}=require('../src/admin/traffic-analytics.ts');
const {createTrafficTracker}=require('../src/lib/traffic-client.ts');
const {middleware}=require('../src/middleware.ts');
const {NextRequest}=require('next/server');
const {POST}=require('../src/app/api/analytics/page-view/route.ts');
const headers=country=>new Headers({'user-agent':'Mozilla/5.0 Mobile','x-saveframe-country':country});
const count=()=>Number(db().prepare('SELECT COALESCE(SUM(views),0) count FROM daily_page_statistics').get().count);
async function main(){
  const connection=db();
  for(const country of ['LK','DE','GB','XX'])assert.equal(recordPageView(headers(country),{path:'/blog',referrer:'google',source:'newsletter',medium:'email'}),true);
  const report=trafficReports();assert.equal(report.total,4);assert.equal(report.ga4Policy.find(row=>row.ga4_policy==='restricted').views,3);
  assert.equal(report.countries.find(row=>row.country_code==='XX').views,1);assert.equal(report.devices[0].device,'mobile');
  for(const values of [{dnt:'1'},{'sec-gpc':'1'},{cookie:'sf_analytics_preference=denied'},{'user-agent':'Googlebot'}]){
    const h=headers('LK');for(const [key,value]of Object.entries(values))h.set(key,value);
    assert.equal(recordPageView(h,{path:'/'}),false);
  }
  for(const route of ['/admin','/api/media/resolve','/private-user','/?url=private','/blog?q=private'])assert.equal(recordPageView(headers('LK'),{path:route}),false);
  const h=headers('LK');h.set('x-tiksave-document','1');h.set('x-tiksave-page','/photo-downloader');h.set('referer','https://example.com/private?token=secret');
  recordDocumentView(h,'https://tiksavemp4.online');assert.equal(count(),5);
  h.set('x-tiksave-document','0');recordDocumentView(h,'https://tiksavemp4.online');assert.equal(count(),5);
  for(const extra of [{},{rsc:'1'},{'next-router-prefetch':'1'},{purpose:'prefetch'},{'sec-purpose':'prefetch'}]){
    const req=new NextRequest('https://tiksavemp4.online/?url=secret&utm_source=newsletter&utm_medium=email',{headers:{accept:'text/html','x-tiksave-page':'/admin',...extra}});
    const result=middleware(req);assert.equal(result.headers.get('x-middleware-request-x-tiksave-document'),Object.keys(extra).length?'0':'1');
    assert.equal(result.headers.get('x-middleware-request-x-tiksave-page'),'/');
  }
  const admin=middleware(new NextRequest('https://tiksavemp4.online/admin/login',{headers:{accept:'text/html','x-tiksave-document':'1','x-tiksave-page':'/'}}));
  assert.equal(admin.headers.get('x-middleware-request-x-tiksave-document'),'0','Admin requests cannot spoof public traffic');
  const payload={path:'/video-downloader',referrer:'internal',source:'newsletter',medium:'email'};
  const request=(body,extra={})=>new Request('https://tiksavemp4.online/api/analytics/page-view',{method:'POST',headers:{origin:'https://tiksavemp4.online','content-type':'application/json','x-saveframe-country':'DE',...extra},body:typeof body==='string'?body:JSON.stringify(body)});
  assert.equal((await POST(request(payload))).status,204);assert.equal(count(),6);
  for(const signal of [{dnt:'1'},{'sec-gpc':'1'},{cookie:'sf_analytics_preference=denied'}])assert.equal((await POST(request(payload,signal))).status,204);
  assert.equal((await POST(request(payload,{origin:'https://evil.example'}))).status,403);
  assert.equal((await POST(request({...payload,url:'submitted-secret'}))).status,400);
  assert.equal((await POST(request('x'.repeat(1025)))).status,413);assert.equal(count(),6);
  const rows=JSON.stringify(connection.prepare('SELECT * FROM daily_page_statistics').all());
  for(const privateValue of ['private-user','secret','token=','example.com'])assert.ok(!rows.includes(privateValue));
  assert.deepEqual(connection.prepare('PRAGMA table_info(daily_page_statistics)').all().map(row=>row.name),['day','path','country_code','device','referrer','source','medium','ga4_policy','views']);
  const columns=['ip','visitor','session','cookie','url','identifier'];for(const column of connection.prepare('PRAGMA table_info(daily_page_statistics)').all())assert.ok(!columns.includes(column.name));
  const sent=[];const browser={location:{pathname:'/',search:'',origin:'https://tiksavemp4.online'},navigator:{userAgent:'Mozilla/5.0'},document:{cookie:'',referrer:''},localStorage:{getItem:()=>null},fetch:async(url,init)=>sent.push(JSON.parse(init.body))};
  let tracker=createTrafficTracker(browser,true,{});tracker.page();assert.equal(sent.length,0,'Initial document counted on server');
  browser.location.pathname='/blog';tracker.page();tracker.page();assert.equal(sent.length,1);
  tracker=createTrafficTracker(browser,true,{});tracker.page();assert.equal(sent.length,1,'Remount deduplication');
  browser.location.pathname='/';tracker.page();assert.equal(sent.length,2,'Back navigation counts');
  browser.navigator.globalPrivacyControl=true;browser.location.pathname='/photo-downloader';tracker.page();assert.equal(sent.length,2);
  process.env.GA4_TRUST_REGION_HEADER='0';assert.equal(recordPageView(headers('US'),{path:'/'}),true);assert.ok(trafficReports().countries.find(row=>row.country_code==='XX'));
  console.log('PASS: additive SQLite migration, worldwide/unknown counters, restricted GA4 policy separation, opt-outs/DNT/GPC/bots, no raw IPs/identifiers/URLs, bounded validated endpoint, spoof/prefetch rejection, document/SPA/remount/back deduplication. Isolated test DB only.');
}
main().catch(error=>{console.error(error);process.exitCode=1;}).finally(()=>{for(const connection of global.__saveframeAdminDbs?.values()||[])connection.close();});
