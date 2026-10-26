const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),os=require('node:os'),ts=require('typescript'),cp=require('node:child_process');
process.env.NODE_ENV='test';process.env.SAVEFRAME_ANALYTICS_DISABLED='1';
require.extensions['.ts']=(module,file)=>module._compile(ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,esModuleInterop:true}}).outputText,file);
const validation=require('../src/security/url-validator.ts');validation.assertSafeHostResolution=async()=>{};
const {InstagrapiService,instagrapiEligible}=require('../src/services/instagrapi.service.ts');
const {DownloaderAppError}=require('../src/types/media.types.ts');
const {InstagramHttpClient}=require('../src/services/instagram-http.service.ts');
const {YtDlpService}=require('../src/services/yt-dlp.service.ts');
const key=Symbol.for('saveframe.instagrapi.workers'),state=globalThis[key];
const reset=()=>{assert.equal(state.active,0);state.cooldown=0;state.sessions.clear();};
const problem=()=>new DownloaderAppError('EXTRACTOR_FAILURE','Primary fixture failure.',502,true);
const url=validation.validateMediaInput('https://www.instagram.com/p/Example1/');
const media=(type='photo',id='1')=>({id,type,url:`https://scontent.cdninstagram.com/${id}.${type==='video'?'mp4':'jpg'}`,thumbnail:`https://scontent.cdninstagram.com/${id}.jpg`,width:1080,height:1350,hasAudio:type==='video'});
const reply=items=>({version:1,status:'ok',username:'owner',items});
let probes=0;
const http=new InstagramHttpClient();http.probe=async source=>{probes++;return{mime:source.endsWith('.mp4')?'video/mp4':'image/jpeg',bytes:1234};};
async function rejects(operation,code){await assert.rejects(operation,error=>error instanceof DownloaderAppError&&error.code===code);}
async function main(){
 const directory=fs.mkdtempSync(path.join(os.tmpdir(),'saveframe-instagrapi-tests-'));
 const spawn=cp.spawn;
 try{
  process.env.INSTAGRAPI_FALLBACK_ENABLED='1';
  let calls=0;
  const service=new InstagrapiService(http);service.runWorker=async()=>{calls++;return reply([media()]);};
  for(const code of ['LOGIN_REQUIRED','PRIVATE_CONTENT','DELETED_CONTENT','EXPIRED_STORY','RATE_LIMITED','SSRF_BLOCKED','INVALID_URL','JOB_CANCELLED','FILE_TOO_LARGE','UNSUPPORTED_MEDIA_TYPE']){
   const error=new DownloaderAppError(code,'Restriction.',403,true);assert.equal(instagrapiEligible(error),false);
   await assert.rejects(service.afterPrimaryFailure(url,error),e=>e===error);
  }
  assert.equal(calls,0);
  process.env.INSTAGRAPI_FALLBACK_ENABLED='0';await rejects(service.afterPrimaryFailure(url,problem()),'EXTRACTOR_FAILURE');assert.equal(calls,0);
  process.env.INSTAGRAPI_FALLBACK_ENABLED='1';
  const result=await service.afterPrimaryFailure(url,problem());assert.equal(calls,1);assert.equal(result.extractorSource,'instagrapi');assert.equal(result.items[0].formats[0].directUrl,media().url);reset();
  for(const [category,items]of [['reel',[media('video')]],['photo',[media(),media('video','2')]],['profile',[media()]],['story',[media('video','4016120619302180887')]]]){
   const target=category==='story'?validation.validateMediaInput('https://www.instagram.com/stories/owner/4016120619302180887/'):category==='profile'?validation.validateMediaInput('https://www.instagram.com/owner/'):category==='reel'?validation.validateMediaInput('https://www.instagram.com/reel/Example1/'):url;
   service.runWorker=async()=>reply(items);const data=await service.afterPrimaryFailure(target,problem());assert.equal(data.itemCount,items.length);assert.deepEqual(data.items.map(i=>i.itemId),items.map(i=>i.id));reset();
  }
  service.runWorker=async()=>reply([media(),{...media('photo','2'),url:'https://127.0.0.1/private'}]);probes=0;
  await rejects(service.afterPrimaryFailure(url,problem()),'SSRF_BLOCKED');assert.equal(probes,0,'validate all URLs before any fetch');reset();
  service.runWorker=async()=>({version:1,status:'error',code:'LOGIN_REQUIRED',message:'cookie=SECRET'});
  await assert.rejects(service.afterPrimaryFailure(url,problem()),e=>e.code==='LOGIN_REQUIRED'&&!e.message.includes('SECRET'));reset();
  service.runWorker=async()=>reply([media()]);
  await rejects(service.afterPrimaryFailure(url,problem(),undefined,{requesterId:'owner',ownerUsername:'owner',ownerUserId:'123',sessionKey:'../secret',allowedCanonicalUrls:[url.canonicalUrl]}),'PRIVATE_CONTENT');reset();
  process.env.INSTAGRAPI_AUTH_ENABLED='1';
  process.env.INSTAGRAPI_SESSION_DIR=directory;
  fs.writeFileSync(path.join(directory,'owner.json'),'{}',{mode:0o600});
  const access={requesterId:'owner',ownerUsername:'owner',ownerUserId:'123',sessionKey:'owner',allowedCanonicalUrls:[url.canonicalUrl]};
  await rejects(service.afterPrimaryFailure(url,problem(),undefined,access),'PRIVATE_CONTENT');reset();
  // Public extraction cannot pick up a globally configured operator session.
  service.runWorker=async input=>{assert.equal(input.access,undefined);return reply([media()]);};
  await service.afterPrimaryFailure(url,problem());reset();
  const external=fs.mkdtempSync(path.join(os.homedir(),'.saveframe-session-fixture-'));
  try{
   fs.chmodSync(external,0o700);fs.writeFileSync(path.join(external,'owner.json'),'{}',{mode:0o600});
   process.env.INSTAGRAPI_SESSION_DIR=external;
   service.runWorker=async input=>{assert.equal(input.access.ownerUsername,'owner');assert.equal(input.access.sessionKey,'owner');assert.equal(input.access.allowedCanonicalUrls,undefined);return reply([media()]);};
   await service.afterPrimaryFailure(url,problem(),undefined,access);reset();
   await rejects(service.afterPrimaryFailure(url,problem(),undefined,{...access,allowedCanonicalUrls:[]}),'PRIVATE_CONTENT');reset();
   const scoped=new YtDlpService();scoped.extractPrimaryMetadata=async()=>{throw problem();};scoped.adapters.extractPublicPhotoPost=async()=>{throw problem();};
   scoped.instagrapi.afterPrimaryFailure=async()=>result;await scoped.extractOperatorMetadata(url.canonicalUrl,access);
   assert.equal(scoped.metadataCache.has(url.canonicalUrl),false,'Operator fallback must never populate public metadata cache');
  }finally{fs.rmSync(external,{recursive:true,force:true});delete process.env.INSTAGRAPI_SESSION_DIR;delete process.env.INSTAGRAPI_AUTH_ENABLED;}
  // Full orchestration: successful primary never invokes fallback; all suitable photo methods precede it.
  const primary=new YtDlpService();let fallbackCalls=0;
  primary.extractPrimaryMetadata=async()=>result;primary.instagrapi.afterPrimaryFailure=async()=>{fallbackCalls++;return result;};
  await primary.extractMetadata(url.canonicalUrl);assert.equal(fallbackCalls,0);
  const fallback=new YtDlpService();const order=[];
  fallback.extractPrimaryMetadata=async()=>{order.push('yt-dlp');throw problem();};
  fallback.adapters.extractPublicPhotoPost=async()=>{order.push('photo');throw problem();};
  fallback.instagrapi.afterPrimaryFailure=async()=>{order.push('instagrapi');return result;};
  await fallback.extractMetadata(url.canonicalUrl);assert.deepEqual(order,['yt-dlp','photo','instagrapi']);
  // Direct fallback downloads use the existing guarded transport, never yt-dlp.
  const download=new YtDlpService();download.extractMetadata=async()=>({...result,items:[{...result.items[0],mediaType:'video',formats:[{...result.items[0].formats[0],ext:'mp4',directUrl:media('video').url}]}]});
  download.runSubprocess=async()=>{throw Error('yt-dlp must not run');};
  download.stories.http.download=async(source,destination,mime)=>{assert.equal(source,media('video').url);fs.writeFileSync(destination,'fixture');return{bytesWritten:7,mimeType:mime};};
  const artifact=await download.downloadMedia(url.canonicalUrl,{jobId:'fixture',outputDir:directory});assert.equal(artifact.mimeType,'video/mp4');assert.ok(fs.existsSync(artifact.filePath));
  // Actual OS subprocesses with an offline Python fixture substituted at spawn boundary.
  const python=path.resolve('.runtime',process.platform==='win32'?'Scripts/python.exe':'bin/python');
  assert.ok(fs.existsSync(python),'Install documented Python requirements before running these checks');
  process.env.INSTAGRAPI_PYTHON_PATH=python;
  const fixture=path.join(directory,'worker.py');
  let mode='sleep';const children=[];
  cp.spawn=(binary,args,options)=>{assert.equal(binary,python);assert.equal(options.shell,false);assert.equal(options.env.ADMIN_SMTP_PASSWORD,undefined);const child=spawn(binary,['-I','-B',fixture,mode],options);children.push(child);return child;};
  fs.writeFileSync(fixture,"import sys,time,json\ndata=json.load(sys.stdin)\nif sys.argv[1]=='overflow': sys.stdout.write('x'*1100000);sys.stdout.flush();time.sleep(60)\nelif sys.argv[1]=='bad': print('cookie=DO_NOT_EXPOSE')\nelse: time.sleep(60)\n");
  const bounded=new InstagrapiService(http),abort=new AbortController();
  const pending=bounded.afterPrimaryFailure(url,problem(),abort.signal);
  await rejects(bounded.afterPrimaryFailure(url,problem()),'RATE_LIMITED');assert.equal(state.active,1);
  abort.abort();await rejects(pending,'JOB_CANCELLED');assert.equal(state.active,0);assert.ok(children.at(-1).exitCode!==null||children.at(-1).signalCode);reset();
  mode='overflow';await rejects(bounded.afterPrimaryFailure(url,problem()),'EXTRACTOR_FAILURE');assert.equal(state.active,0);reset();
  mode='bad';await assert.rejects(bounded.afterPrimaryFailure(url,problem()),e=>e.code==='EXTRACTOR_FAILURE'&&!e.message.includes('DO_NOT_EXPOSE'));reset();
  mode='sleep';process.env.INSTAGRAPI_TIMEOUT_MS='5000';const started=Date.now();await rejects(bounded.afterPrimaryFailure(url,problem()),'DOWNLOAD_TIMEOUT');assert.ok(Date.now()-started<8000);assert.equal(state.active,0);reset();
  cp.spawn=spawn;
  // Real installed worker invalid-input smoke test; no extraction/network.
  const smoke=cp.spawnSync(python,['-I','-B','python/instagrapi_worker.py'],{input:JSON.stringify({version:1,url:'https://evil.example/',category:'photo'}),encoding:'utf8',timeout:5000});
  assert.equal(smoke.status,0);assert.deepEqual(JSON.parse(smoke.stdout),{version:1,status:'error',code:'INVALID_URL'});
  const pythonTests=cp.spawnSync(python,['-I','-B','python/test_instagrapi_worker.py'],{encoding:'utf8',timeout:15000});
  assert.equal(pythonTests.status,0,pythonTests.stderr);console.log(pythonTests.stderr.trim());
  console.log('PASS: primary ordering, disabled flag, access restrictions, media mapping, URL validation, direct download compatibility, safe errors, bounded concurrency, real subprocess cancellation/timeout/output cap, worker protocol and Python security fixtures. No Instagram requests.');
 }finally{cp.spawn=spawn;reset();fs.rmSync(directory,{recursive:true,force:true});}
}
main().catch(error=>{console.error(error);process.exitCode=1;});
