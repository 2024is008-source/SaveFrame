const assert=require('node:assert/strict'),fs=require('node:fs'),ts=require('typescript');
process.env.NODE_ENV='test';
require.extensions['.ts']=(module,file)=>module._compile(ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,esModuleInterop:true}}).outputText,file);
const {DownloaderAppError}=require('../src/types/media.types.ts');
const singleton=require.resolve('../src/app/api/singleton.ts'),analytics=require.resolve('../src/admin/analytics.ts');
let mode='restricted',events=[];
const context={redisStore:{checkRateLimit:async()=>({allowed:mode!=='rate'})},ytDlpService:{extractMetadata:async()=>{throw new DownloaderAppError('LOGIN_REQUIRED','Fixture restriction.',403);}},downloadManager:{createJob:async()=>{throw new DownloaderAppError('EXTRACTOR_FAILURE','Fixture failure.',502);}}};
require.cache[singleton]={id:singleton,filename:singleton,loaded:true,exports:{getApiContext:()=>{if(mode==='context')throw Error('Secret internal error');return context;}}};
require.cache[analytics]={id:analytics,filename:analytics,loaded:true,exports:{beginResolution:(...args)=>{events.push(['started',...args]);return'resolution';},resolveEvent:(...args)=>events.push(['resolve',...args]),beginDownload:(...args)=>{events.push(['download-request',...args]);return'download';},jobEvent:(...args)=>events.push(['job',...args]),apiFailure:(...args)=>events.push(['api',...args])}};
const {NextRequest}=require('next/server'),resolve=require('../src/app/api/media/resolve/route.ts').POST,download=require('../src/app/api/media/download/route.ts').POST;
const request=(body,route='resolve')=>new NextRequest('http://localhost/api/media/'+route,{method:'POST',headers:{'content-type':'application/json'},body:typeof body==='string'?body:JSON.stringify(body)});
(async()=>{
 for(const [url,type]of [['p/Example1/','photo'],['reel/Example1/','reel'],['creator/','profile']]){
  events=[];mode='restricted';const response=await resolve(request({url:'https://www.instagram.com/'+url}));assert.equal(response.status,403);assert.deepEqual(events.at(-1).slice(0,5),['resolve','resolution',false,type,'LOGIN_REQUIRED']);assert.equal(events.filter(e=>e[0]==='resolve').length,1);
 }
 for(const scenario of ['rate','context','invalid']){mode=scenario;events=[];const response=await resolve(request('not-json'));assert.equal(response.status,scenario==='rate'?429:scenario==='context'?500:400);assert.equal(events.filter(e=>e[0]===(scenario==='invalid'?'resolve':'api')).length,1);assert.ok(!JSON.stringify(events).includes('Secret'));}
 for(const scenario of ['rate','context','invalid']){mode=scenario;events=[];const response=await download(request('not-json','download'));assert.equal(response.status,scenario==='rate'?429:scenario==='context'?500:400);assert.equal(events.filter(e=>e[0]==='api').length,1);assert.equal(events.filter(e=>e[0]==='download-request').length,0);}
 mode='restricted';events=[];const retired=await resolve(request({url:'https://www.instagram.com/stories/creator/12345/'}));assert.equal(retired.status,410);const retiredDownload=await download(request({url:'https://www.instagram.com/stories/creator/12345/'},'download'));assert.equal(retiredDownload.status,410);
 events=[];await download(request({url:'https://www.instagram.com/p/Example1/'}));assert.equal(events.at(-1)[4],'photo');assert.equal(events.filter(e=>e[0]==='job').length,1);assert.equal(events.filter(e=>e[0]==='api').length,0);
 events=[];await download(request({url:'https://www.instagram.com/p/Example1/',preview:true}));assert.equal(events.length,0,'Playback failures must not create download analytics');
 Object.assign(process.env,{SAVEFRAME_COUNTRY_ANALYTICS_ENABLED:'1',SAVEFRAME_TRUST_COUNTRY_HEADER:'1',SAVEFRAME_COUNTRY_ANALYTICS_COUNTRIES:'LK,US'});
 for(const [extra,country]of [[{'x-saveframe-country':'LK'},'LK'],[{'cf-ipcountry':'US'},'XX'],[{'x-saveframe-country':'US','sec-gpc':'1'},'XX']]){
  events=[];const req=request({url:'https://www.instagram.com/p/Example1/',country:'US'},'download');for(const [key,value]of Object.entries(extra))req.headers.set(key,value);await download(req);
  assert.equal(events.find(event=>event[0]==='download-request')[2],country,'Only policy-approved proxy header country reaches initial recording');
 }
 events=[];const inspection=request({url:'https://www.instagram.com/p/Example1/'});inspection.headers.set('x-saveframe-country','LK');await resolve(inspection);assert.equal(events.find(event=>event[0]==='started')[1],'LK');
 console.log('PASS: photo/Reel/story/profile error classification, rate limits, malformed requests, internal errors, one failure event per rejection, safe diagnostics and preview isolation.');
})().catch(error=>{console.error(error);process.exitCode=1;});
