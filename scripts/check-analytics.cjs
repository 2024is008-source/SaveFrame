const assert=require('node:assert/strict'),fs=require('node:fs'),ts=require('typescript');
require.extensions['.ts']=(module,file)=>module._compile(ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,esModuleInterop:true}}).outputText,file);
const {createAnalytics,analyticsPath,analyticsEvent,analyticsReferrer,analyticsCampaign,consentKey}=require('../src/lib/analytics.ts');
const {analyticsPolicy}=require('../src/lib/analytics-policy.ts');
const id='G-0EYTT0CW4Z',origin='https://saveframe.site';
function fixture(options={}){
 const events=new Map(),stored=new Map();if(options.consent)stored.set(consentKey,options.consent);
 const win={location:{origin,hostname:'saveframe.site',pathname:'/',search:'?instagramUrl=https://instagram.com/private-user',hash:'#private'},navigator:{},document:{cookie:''},localStorage:{getItem:key=>stored.get(key),setItem:(key,value)=>stored.set(key,value)},addEventListener:(name,fn)=>events.set(name,fn),removeEventListener:(name,fn)=>{if(events.get(name)===fn)events.delete(name);}};
 Object.assign(win.navigator,options.navigator);if(options.path)win.location.pathname=options.path;
 if(options.referrer)win.document.referrer=options.referrer;if(options.search!==undefined)win.location.search=options.search;
 let loads=0;const controller=createAnalytics(win,options.id||id,options.origin||origin,options.production!==false,()=>loads++,options.policy);
 return {win,controller,events,loads:()=>loads,emit:(name,detail)=>events.get(name)?.({detail}),commands:()=>Array.from(win.saveframeDataLayer||[],args=>Array.from(args)),stored};
}
assert.equal(analyticsPath('/admin/login'),null);assert.equal(analyticsPath('/api/media/download/secret'),null);assert.equal(analyticsPath('/someone-private'),null);assert.equal(analyticsPath('/fr/'),'/fr');
for(const locale of require('../src/i18n/config.ts').locales)assert.notEqual(analyticsPath(locale==='en'?'/':`/${locale}/`),null);
for(const post of require('../src/content/blog/posts.json'))if(post.published)assert.notEqual(analyticsPath('/blog/'+post.slug),null);
for(const page of [...require('../src/content/tools.json'),...require('../src/content/information.json')])assert.notEqual(analyticsPath('/'+page.slug),null);
let test=fixture();assert.equal(test.loads(),0);assert.deepEqual(test.commands(),[]);
test.emit('saveframe:analytics-event',{name:'media_resolved',params:{media_type:'photo'}});assert.deepEqual(test.commands(),[]);
test.win.SaveFrameAnalytics.setConsent('granted');assert.equal(test.loads(),1);assert.equal(test.commands().filter(c=>c[1]==='page_view').length,1);
test.controller.page();test.controller.page();assert.equal(test.commands().filter(c=>c[1]==='page_view').length,1,'No duplicate route views');
test.win.location.pathname='/blog';test.controller.page();assert.equal(test.commands().filter(c=>c[1]==='page_view').length,2);
test.emit('saveframe:analytics-event',{name:'download_failed',params:{media_type:'photo',failure_stage:'resolve',error_code:'LOGIN_REQUIRED',url:'secret-url',username:'private-user',cookies:'secret-cookie',message:'private-error',job_id:'secret-job'}});
const failure=test.commands().at(-1);assert.deepEqual(failure,['event','download_failed',{media_type:'photo',download_format:'unknown',download_method:'single',download_status:'failed',source_page:'unknown',failure_stage:'resolve',error_code:'LOGIN_REQUIRED',page_location:origin+'/blog',page_referrer:origin+'/',page_title:'SaveFrame',send_to:id}]);
const serialized=JSON.stringify(test.commands());for(const secret of ['instagramUrl','private-user','secret-cookie','private-error','secret-job','?','#private'])assert.equal(serialized.includes(secret),false);
assert.equal(test.commands().find(c=>c[0]==='config')[2].send_page_view,false);
assert.equal(test.commands().find(c=>c[0]==='config')[2].allow_google_signals,false);
const before=test.commands().length;test.win.location.pathname='/admin/audit';test.controller.page();test.emit('saveframe:analytics-event',{name:'download_started'});assert.equal(test.commands().length,before);assert.equal(test.win['ga-disable-'+id],true);
test.win.location.pathname='/blog';test.controller.page();assert.equal(test.win['ga-disable-'+id],false);assert.equal(test.commands().filter(c=>c[1]==='page_view').length,3,'Return from an excluded route is a new public view');
test.emit('saveframe:analytics-consent',{analytics:'denied'});assert.equal(test.win['ga-disable-'+id],true);assert.deepEqual(test.commands(),[]);test.emit('saveframe:analytics-event',{name:'media_resolved'});assert.deepEqual(test.commands(),[]);assert.equal(test.stored.get(consentKey),'denied');
test.controller.dispose();assert.equal(test.events.size,0);assert.equal(test.win.SaveFrameAnalytics,undefined);
for(const options of [{consent:'denied'},{consent:'granted',navigator:{doNotTrack:'1'}},{consent:'granted',navigator:{globalPrivacyControl:true}},{consent:'granted',path:'/admin/login'},{consent:'granted',production:false},{consent:'granted',id:'bad'},{consent:'granted',origin:'http://localhost:3000'}]){test=fixture(options);assert.equal(test.loads(),0);assert.deepEqual(test.commands(),[]);test.controller.dispose();}
test=fixture({consent:'granted'});assert.equal(test.loads(),1);test.stored.set(consentKey,'denied');test.events.get('storage')({key:consentKey});assert.equal(test.win['ga-disable-'+id],true);assert.deepEqual(test.commands(),[]);test.controller.dispose();
assert.deepEqual(analyticsEvent('download_failed',{error_code:'https://instagram.com/private',media_type:'username',failure_stage:'secret'}),{name:'download_failed',params:{media_type:'unknown',download_format:'unknown',download_method:'single',download_status:'failed',source_page:'unknown',failure_stage:'download',error_code:'UNKNOWN'}});assert.equal(analyticsEvent('arbitrary_private_event'),null);assert.ok(analyticsEvent('media_resolved',null));
const layout=fs.readFileSync('src/app/layout.tsx','utf8');assert.equal((layout.match(/<Analytics /g)||[]).length,1);
const policyEnv={GA4_TRUST_REGION_HEADER:'1',GA4_AUTOMATIC_COUNTRIES:'*'};
for(const country of ['DE','FR','GB','CH','IS','NO','XX','T1','ZZ','EU',''])assert.equal(analyticsPolicy(new Headers({'x-saveframe-country':country}),policyEnv).automaticAllowed,false,country);
for(const country of ['US','LK','AU','JP'])assert.equal(analyticsPolicy(new Headers({'x-saveframe-country':country}),policyEnv).automaticAllowed,true,country);
assert.equal(analyticsPolicy(new Headers({'cf-ipcountry':'US'}),policyEnv).automaticAllowed,false);
assert.equal(analyticsPolicy(new Headers({'x-saveframe-country':'US'}),{...policyEnv,GA4_TRUST_REGION_HEADER:'0'}).automaticAllowed,false);
assert.equal(analyticsPolicy(new Headers({'x-saveframe-country':'US'}),{...policyEnv,GA4_CONSENT_REQUIRED_COUNTRIES:'*'}).automaticAllowed,false);
const automatic={automaticAllowed:true};test=fixture({policy:automatic,referrer:'https://www.google.com/search?q=secret-person'});assert.equal(test.loads(),1);assert.equal(test.stored.has(consentKey),false,'Automatic eligibility must not fabricate a saved grant');assert.equal(test.commands().find(c=>c[1]==='page_view')[2].page_referrer,'https://www.google.com/');
const state=test.win.__saveframeGa4;test.controller.dispose();const remount=createAnalytics(test.win,id,origin,true,()=>{},automatic);assert.equal(test.commands().filter(c=>c[1]==='page_view').length,1,'Remount must not duplicate views');assert.equal(test.win.__saveframeGa4,state);remount.dispose();
for(const referrer of ['https://www.bing.com/search?q=person','https://l.instagram.com/?u=private-media','https://example.com/private/account?token=secret']){test=fixture({policy:automatic,referrer});assert.equal(test.commands().find(c=>c[1]==='page_view')[2].page_referrer,new URL(referrer).origin+'/');test.controller.dispose();}
for(const value of ['javascript:alert(1)','https://user:secret@example.com/private','http://127.0.0.1/private','https://intranet.local/private',origin+'/admin/audit'])assert.equal(analyticsReferrer(value,origin),'');
for(const options of [{consent:'denied'},{navigator:{doNotTrack:'1'}},{navigator:{globalPrivacyControl:true}},{navigator:{webdriver:true}},{navigator:{userAgent:'HeadlessChrome'}},{production:false},{path:'/admin/audit'}]){test=fixture({...options,policy:automatic});assert.equal(test.loads(),0);test.controller.dispose();}
test=fixture({policy:automatic,path:'/privacy',search:'?analytics=off'});assert.equal(test.loads(),0);assert.equal(test.stored.get(consentKey),'denied');test.controller.dispose();
test=fixture({policy:automatic});test.win.location.pathname='/privacy';test.win.location.search='?analytics=off';test.controller.page();assert.equal(test.stored.get(consentKey),'denied');assert.equal(test.win['ga-disable-'+id],true);test.controller.dispose();
const campaigns={campaigns:{source:['google','newsletter'],medium:['organic','email'],name:['launch'],content:['guide'],term:[]}};
assert.deepEqual(analyticsCampaign('?utm_source=newsletter&utm_medium=email&utm_campaign=launch&utm_content=guide&instagramUrl=private&gclid=token',campaigns),{campaign_source:'newsletter',campaign_medium:'email',campaign_name:'launch',campaign_content:'guide'});
assert.deepEqual(analyticsCampaign('?utm_source=private_user&utm_medium=email&utm_campaign=secret',campaigns),{});
assert.deepEqual(analyticsCampaign('?utm_source=google&utm_source=newsletter&utm_medium=email',campaigns),{});
test=fixture({policy:{...automatic,...campaigns},search:'?utm_source=newsletter&utm_medium=email&utm_campaign=launch&instagramUrl=https://instagram.com/private'});assert.equal(test.commands().find(c=>c[0]==='config')[2].campaign_name,'launch');assert.equal(JSON.stringify(test.commands()).includes('instagram.com'),false);test.controller.dispose();
test=fixture({policy:automatic,path:'/blog',search:'?page=2&q=private'});assert.equal(test.commands().find(c=>c[1]==='page_view')[2].page_location,origin+'/blog?page=2');test.controller.page();assert.equal(test.commands().filter(c=>c[1]==='page_view').length,1);test.win.location.search='?page=3';test.controller.page();assert.equal(test.commands().filter(c=>c[1]==='page_view').length,2);test.win.location.search='?page=2';test.controller.page();assert.equal(test.commands().filter(c=>c[1]==='page_view').length,3);test.controller.dispose();
assert.ok(fs.readFileSync('.env.production','utf8').includes('NEXT_PUBLIC_GA_ID='+id));
for(const [options,expected] of [[{consent:'granted'},'granted'],[{consent:'denied'},'denied'],[{consent:'granted',navigator:{globalPrivacyControl:true}},'denied']]){
 test=fixture(options);assert.ok(test.win.document.cookie.includes('sf_analytics_preference='+expected));assert.ok(test.win.document.cookie.includes('SameSite=Lax; Secure'));test.controller.dispose();
}
test=fixture();assert.ok(test.win.document.cookie.includes('sf_analytics_preference=; Max-Age=0'));test.controller.dispose();
fs.writeFileSync('reports/analytics-automatic-tests.json',JSON.stringify({passed:true,googleRequestsSent:false,verified:['regional policy','unknown region denial','opt-out','DNT/GPC/bots','automatic views without fabricated saved consent','referral origins','approved campaigns','pagination/back navigation','remount deduplication','public route allowlist','safe downloader events','production measurement ID']},null,2));
console.log('PASS: regional/automatic/explicit-consent modes, opt-out/DNT/GPC/bots, referrals/campaign allowlists, all public routes, pagination/navigation/remount deduplication and privacy-safe downloader events. No Google requests were sent.');
