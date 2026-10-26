// Deterministic transport/provider fixtures. No Instagram credentials or public traffic.
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),os=require('node:os'),http=require('node:http'),dns=require('node:dns'),ts=require('typescript');
process.env.NODE_ENV='test';process.env.SAVEFRAME_ANALYTICS_DISABLED='1';
require.extensions['.ts']=(module,file)=>module._compile(ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,esModuleInterop:true}}).outputText,file);
const validation=require('../src/security/url-validator.ts');validation.assertSafeHostResolution=async()=>{};
const {DownloaderAppError}=require('../src/types/media.types.ts');
const {InstagramHttpClient}=require('../src/services/instagram-http.service.ts');
const {StoryExtractionPipeline,ytDlpStoryCandidates,authorizedStoryCookie,parseStoryJson}=require('../src/services/story-extraction.service.ts');
const {YtDlpService}=require('../src/services/yt-dlp.service.ts');
const url='https://www.instagram.com/stories/creator/123456789/',validated=validation.validateMediaInput(url,'story');
const rejected=code=>error=>error.code===code;
const failed=()=>new DownloaderAppError('EXTRACTOR_FAILURE','Fixture extraction failed.',502,true);
async function main(){
 assert.equal(parseStoryJson('{"pk":4016120619302180887}').pk,'4016120619302180887');
 const directory=fs.mkdtempSync(path.join(os.tmpdir(),'saveframe-hybrid-story-'));
 const jpeg=await require('sharp')({create:{width:16,height:32,channels:3,background:'#7c3aed'}}).jpeg().toBuffer();
 const video=Buffer.concat([Buffer.from([0,0,0,24]),Buffer.from('ftypisom0000'),Buffer.alloc(1024,1)]);
 let origin,metadataCalls=0,mediaCookies=0,metadataCookie=false,server;
 const candidate=(photo=false)=>({pk:'123456789_42',media_type:photo?1:2,user:{username:'creator'},image_versions2:{candidates:[{url:origin+'/image',width:16,height:32}]},...(photo?{}:{video_versions:[{url:origin+'/video',width:720,height:1280}],video_duration:2,has_audio:true})});
 server=http.createServer((request,response)=>{
  const route=request.url;
  if(route.startsWith('/metadata/')){
   metadataCalls++;metadataCookie ||= Boolean(request.headers.cookie);
   const mode=route.slice(10);
   if(mode==='login'){response.writeHead(401);response.end();return;}
   if(mode==='denied'){response.writeHead(403);response.end();return;}
   if(mode==='deleted'){response.writeHead(404);response.end();return;}
   if(mode==='redirect'){response.writeHead(302,{location:'http://127.0.0.1:1/private'});response.end();return;}
   if(mode==='big'){response.writeHead(200,{'content-type':'application/json','content-length':3*1024*1024});response.end('{}');return;}
   let item=candidate(mode==='photo');
   if(mode==='expired')item.expiring_at=Math.floor(Date.now()/1000)-1;
   if(mode==='unrelated')item.pk='987654321_42';
   const payload=JSON.stringify({reels:{'42':{items:[item]}}});
   response.setHeader('content-type',mode==='html'?'text/html':'application/json');
   response.end(mode==='html'?'<script type="application/json">'+payload+'</script>':payload);return;
  }
  mediaCookies+=request.headers.cookie?1:0;
  if(route==='/slow'){
   response.writeHead(200,{'content-type':'video/mp4'});response.write(video);
   const timer=setInterval(()=>response.write(Buffer.alloc(8192)),10);request.on('close',()=>clearInterval(timer));return;
  }
  const bytes=route==='/image'?jpeg:route==='/wrong'?Buffer.from('not an actual video file'):video;
  const type=route==='/image'?'image/jpeg':'video/mp4';
  if(route==='/big-media'){response.writeHead(200,{'content-type':type,'content-length':99999});response.end(video);return;}
  if(request.headers.range){const match=/bytes=(\d+)-(\d+)/.exec(request.headers.range),start=Number(match[1]),end=Math.min(Number(match[2]),bytes.length-1);response.writeHead(206,{'content-type':type,'content-range':`bytes ${start}-${end}/${bytes.length}`,'content-length':end-start+1});response.end(bytes.subarray(start,end+1));}
  else{response.writeHead(200,{'content-type':type,'content-length':bytes.length});response.end(bytes);}
 });
 try{
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));origin='http://127.0.0.1:'+server.address().port;process.env.SAVEFRAME_FIXTURE_ORIGIN=origin;
  class FixtureHttp extends InstagramHttpClient{
   constructor(mode='video'){super();this.mode=mode;}
   metadata(target,options){assert.equal(target,url);return super.metadata(origin+'/metadata/'+this.mode,options);}
  }
  const raw={id:'123456789',channel:'creator',thumbnail:origin+'/image',formats:[{format_id:'video',url:origin+'/video',width:720,height:1280,vcodec:'h264',acodec:'aac'}]};
  const transport=new FixtureHttp();
  let primaryCalls=0,galleryCalls=0;
  const options={primary:async()=>{primaryCalls++;return ytDlpStoryCandidates(raw,validated);},runner:async()=>{galleryCalls++;throw Error('Unexpected gallery call');},mapError:()=>failed(),http:transport,galleryEnabled:false};
  const primary=new StoryExtractionPipeline(options),first=await primary.extract(validated);
  assert.equal(first.extractorSource,'yt-dlp');assert.equal(first.items[0].mediaType,'video');assert.equal(first.items[0].width,720);assert.equal(metadataCalls,0);
  const fallback=await new StoryExtractionPipeline({...options,primary:async()=>{throw failed();}}).extract(validated);
  assert.equal(fallback.extractorSource,'story-http');assert.equal(fallback.items.length,1);assert.equal(fallback.supportsZipDownload,false);
  for(const mode of ['photo','html']){
   const media=await new StoryExtractionPipeline({...options,http:new FixtureHttp(mode),primary:async()=>{throw failed();}}).extract(validated);
   assert.equal(media.items[0].mediaType,mode==='photo'?'photo':'video');assert.equal(media.items[0].formats[0].needsMerge,false);
  }
  const imageRaw={id:'123456789',media_type:1,image_versions2:candidate(true).image_versions2};
  const image=await new StoryExtractionPipeline({...options,primary:async()=>ytDlpStoryCandidates(imageRaw,validated)}).extract(validated);assert.equal(image.items[0].mediaType,'photo');
  const graphImage=await new StoryExtractionPipeline({...options,primary:async()=>ytDlpStoryCandidates({id:'123456789',__typename:'GraphImage',display_url:origin+'/image',dimensions:{width:16,height:32}},validated)}).extract(validated);assert.equal(graphImage.items[0].mediaType,'photo');
  const unknown=await new StoryExtractionPipeline({...options,primary:async()=>[{id:'123456789',url:origin+'/video',mediaType:'video'}]}).extract(validated);
  assert.equal(unknown.items[0].width,undefined);assert.equal(unknown.items[0].height,undefined);assert.equal(unknown.items[0].durationSeconds,undefined);assert.equal(unknown.items[0].formats[0].resolution,'Source resolution');assert.ok(!unknown.items[0].formats[0].label.includes('HD'));
  const beforeDenied=metadataCalls;
  for(const code of ['LOGIN_REQUIRED','PRIVATE_CONTENT','EXPIRED_STORY','DELETED_CONTENT','RATE_LIMITED']){
   await assert.rejects(new StoryExtractionPipeline({...options,primary:async()=>{throw new DownloaderAppError(code,'Fixture restriction.',code==='RATE_LIMITED'?429:403);}}).extract(validated),rejected(code));
  }
  assert.equal(metadataCalls,beforeDenied,'Restrictions must not trigger HTTP retries');assert.equal(galleryCalls,0);
  for(const [mode,code]of [['login','LOGIN_REQUIRED'],['denied','PRIVATE_CONTENT'],['deleted','DELETED_CONTENT'],['expired','EXPIRED_STORY'],['redirect','SSRF_BLOCKED'],['big','FILE_TOO_LARGE'],['unrelated','EXTRACTOR_FAILURE']]){
   await assert.rejects(new StoryExtractionPipeline({...options,http:new FixtureHttp(mode),primary:async()=>{throw failed();}}).extract(validated),rejected(code));
  }
  const unavailable=new StoryExtractionPipeline({...options,galleryEnabled:true,galleryBinary:path.join(directory,'missing')});assert.deepEqual(await unavailable.galleryAvailability(),{enabled:true,available:false});
  const galleryFile=path.join(directory,'gallery-fixture.js');
  const galleryJson=[[3,origin+'/image',{type:'story',media_id:'123456789',username:'creator',extension:'jpg',width:16,height:32}]];
  fs.writeFileSync(galleryFile,'process.stdout.write('+JSON.stringify(JSON.stringify(galleryJson))+');');
  const execution=new YtDlpService({storyHttp:transport});
  const gallery=new StoryExtractionPipeline({...options,primary:async()=>{throw failed();},http:new FixtureHttp('unrelated'),galleryEnabled:true,galleryBinary:galleryFile,runner:async(...args)=>{galleryCalls++;assert.ok(args[1].includes('--config-ignore'));assert.ok(!args[1].includes('--cookies'));assert.equal(args[1].at(-1),url);return execution.runSubprocess(...args);}});
  assert.equal((await gallery.extract(validated)).extractorSource,'gallery-dl');assert.equal(galleryCalls,1);
  const disabled=new StoryExtractionPipeline({...options,primary:async()=>{throw failed();},http:new FixtureHttp('unrelated'),galleryEnabled:false,galleryBinary:galleryFile});assert.deepEqual(await disabled.galleryAvailability(),{enabled:false,available:true});await assert.rejects(disabled.extract(validated),rejected('EXTRACTOR_FAILURE'));assert.equal(galleryCalls,1);
  const clock=Date.now;let offset=0;Date.now=()=>clock()+offset;
  try{await assert.rejects(new StoryExtractionPipeline({...options,timeoutMs:5000,primary:async()=>{offset=6000;throw failed();}}).extract(validated),rejected('DOWNLOAD_TIMEOUT'));}finally{Date.now=clock;}
  const realHttp=new InstagramHttpClient();
  for(const target of ['http://127.0.0.1/private','https://cdninstagram.com.evil.example/x','https://user:pass@cdninstagram.com/x','https://cdninstagram.com:444/x'])assert.throws(()=>realHttp.validateUrl(target,true),rejected('SSRF_BLOCKED'));
  const lookup=dns.lookup;dns.lookup=(_host,_options,callback)=>callback(null,[{address:'127.0.0.1',family:4}]);
  try{await assert.rejects(realHttp.probe('https://video.cdninstagram.com/private',{timeoutMs:1000}),rejected('SSRF_BLOCKED'));}finally{dns.lookup=lookup;}
  await assert.rejects(realHttp.probe(origin+'/wrong',{timeoutMs:1000}),rejected('UNSUPPORTED_MEDIA_TYPE'));
  const photoPath=path.join(directory,'story.jpg');const photo=await realHttp.download(origin+'/image',photoPath,'image/jpeg',100000,{timeoutMs:1000});assert.equal(photo.bytesWritten,jpeg.length);assert.deepEqual(fs.readFileSync(photoPath),jpeg);
  await assert.rejects(realHttp.download(origin+'/image',photoPath,'image/jpeg',100000,{timeoutMs:1000}));assert.deepEqual(fs.readFileSync(photoPath),jpeg,'Existing output must not be deleted or overwritten');
  const badPath=path.join(directory,'bad.mp4');await assert.rejects(realHttp.download(origin+'/wrong',badPath,'video/mp4',100000,{timeoutMs:1000}),rejected('UNSUPPORTED_MEDIA_TYPE'));assert.equal(fs.existsSync(badPath),false);
  await assert.rejects(realHttp.download(origin+'/big-media',badPath,'video/mp4',1000,{timeoutMs:1000}),rejected('FILE_TOO_LARGE'));assert.equal(fs.existsSync(badPath),false);
  const controller=new AbortController();await assert.rejects(realHttp.download(origin+'/slow',badPath,'video/mp4',1000000,{timeoutMs:5000,signal:controller.signal},()=>controller.abort()),rejected('JOB_CANCELLED'));assert.equal(fs.existsSync(badPath),false);
  await realHttp.probe(origin+'/video',{timeoutMs:1000,cookie:'sessionid=fixture-secret'});assert.equal(mediaCookies,0,'Session credentials must never reach a media CDN');
  const service=new YtDlpService({storyHttp:transport});let dumps=0;
  assert.equal(service.mapYtDlpStderrToAppError('Story expired','story').code,'EXPIRED_STORY');assert.equal(service.mapYtDlpStderrToAppError('HTTP Error 404: not found','story').code,'DELETED_CONTENT');assert.equal(service.mapYtDlpStderrToAppError('HTTP Error 403: access denied','story').code,'PRIVATE_CONTENT');
  service.runSubprocess=async()=>{dumps++;await new Promise(resolve=>setTimeout(resolve,30));return {exitCode:0,stdout:JSON.stringify(raw),stderr:''};};
  const cancelled=new AbortController(),one=service.extractMetadata(url,'story',cancelled.signal),two=service.extractMetadata(url+'?utm_source=test');cancelled.abort();await assert.rejects(one,rejected('JOB_CANCELLED'));await two;assert.equal(dumps,1);assert.equal(service.pendingMetadata.size,0);
  const denied=new YtDlpService({storyHttp:transport});let deniedCalls=0;denied.runSubprocess=async()=>{deniedCalls++;return {exitCode:1,stdout:'',stderr:'You need to log in to access this content.'};};await assert.rejects(denied.extractMetadata(url,'story'),rejected('LOGIN_REQUIRED'));await assert.rejects(denied.extractMetadata(url),rejected('LOGIN_REQUIRED'));assert.equal(deniedCalls,1);
  const artifact=await service.downloadMedia(url,{jobId:'fixture-download',outputDir:directory,itemIndex:0});assert.equal(artifact.mimeType,'video/mp4');assert.deepEqual(fs.readFileSync(artifact.filePath),video);assert.equal(dumps,1);
  const audioMetadata=await service.extractMetadata(url);assert.ok(audioMetadata.items[0].formats.some(format=>format.formatId==='story-audio'));
  service.runSubprocess=async(_binary,args)=>{assert.ok(args.includes('-nostdin'));assert.ok(args.includes('-vn'));const input=args[args.indexOf('-i')+1];assert.deepEqual(fs.readFileSync(input),video);fs.writeFileSync(args.at(-1),video);return {exitCode:0,stdout:'',stderr:''};};
  const audio=await service.downloadMedia(url,{jobId:'fixture-audio',outputDir:directory,formatId:'story-audio'});assert.equal(audio.mimeType,'audio/mp4');assert.ok(audio.safeFilename.endsWith('_audio.m4a'));assert.equal(fs.existsSync(audio.filePath+'.source.mp4'),false);
  await assert.rejects(service.downloadMedia(url,{jobId:'fixture-audio',outputDir:directory,formatId:'story-audio'}));assert.deepEqual(fs.readFileSync(audio.filePath),video);assert.equal(fs.existsSync(audio.filePath+'.source.mp4'),false);
  service.runSubprocess=async()=>({exitCode:1,stdout:'',stderr:'fixture conversion error'});
  await assert.rejects(service.downloadMedia(url,{jobId:'fixture-audio-fail',outputDir:directory,formatId:'story-audio'}),rejected('FFMPEG_ERROR'));assert.equal(fs.readdirSync(directory).some(file=>file.startsWith('fixture-audio-fail')),false);
  await assert.rejects(service.downloadMedia(url,{jobId:'wrong-index',outputDir:directory,itemIndex:1}),rejected('UNSUPPORTED_OPERATION'));
  const abortService=new YtDlpService({storyHttp:transport});let inspecting=false;
  abortService.runSubprocess=(_binary,_args,_timeout,_job,_progress,signal)=>new Promise((_resolve,reject)=>{inspecting=true;signal.addEventListener('abort',()=>reject(new DownloaderAppError('JOB_CANCELLED','Fixture cancelled.',499)),{once:true});});
  const interrupted=abortService.downloadMedia(url,{jobId:'metadata-cancel',outputDir:directory});
  for(let i=0;i<100&&!inspecting;i++)await new Promise(resolve=>setImmediate(resolve));assert.equal(inspecting,true);assert.equal(abortService.cancelDownload('metadata-cancel'),true);await assert.rejects(interrupted,rejected('JOB_CANCELLED'));assert.equal(abortService.activeTransfers.size,0);
  const sleeper=path.join(directory,'sleep-fixture.js');fs.writeFileSync(sleeper,'setTimeout(()=>console.log("done"),10000);');
  const stop=new AbortController(),running=execution.runSubprocess(sleeper,[],5000,undefined,undefined,stop.signal,1024);setTimeout(()=>stop.abort(),50);await assert.rejects(running,rejected('JOB_CANCELLED'));
  const noisy=path.join(directory,'output-fixture.js');fs.writeFileSync(noisy,'process.stdout.write("x".repeat(4096));');await assert.rejects(execution.runSubprocess(noisy,[],5000,undefined,undefined,undefined,1024),rejected('FILE_TOO_LARGE'));
  const cookieFile=path.join(directory,'operator.cookies.txt');fs.writeFileSync(cookieFile,'.instagram.com\tTRUE\t/\tTRUE\t0\tsessionid\tfixture-session-never-log\n',{mode:0o600});
  const access={requesterId:'fixture-operator',allowedUsernames:['creator'],cookieFile};
  delete process.env.STORY_AUTH_ENABLED;assert.throws(()=>authorizedStoryCookie(validated,access),rejected('PRIVATE_CONTENT'));
  process.env.STORY_AUTH_ENABLED='1';assert.throws(()=>authorizedStoryCookie(validated,{...access,allowedUsernames:['different']}),rejected('PRIVATE_CONTENT'));assert.ok(authorizedStoryCookie(validated,access).startsWith('sessionid='));
  assert.throws(()=>authorizedStoryCookie(validated,{...access,cookieFile:path.join(process.cwd(),'src','session.cookies')}));
  const cookiesBefore=metadataCookie;let publicNoCredentials=false;
  await new StoryExtractionPipeline({...options,primary:async(_url,context)=>{publicNoCredentials=context.cookie===undefined&&context.access===undefined;return ytDlpStoryCandidates(raw,validated);}}).extract(validated);assert.equal(publicNoCredentials,true);assert.equal(metadataCookie,cookiesBefore);
  const authService=new YtDlpService({storyHttp:transport});let disposableCookie;
  authService.runSubprocess=async(_binary,args)=>{assert.ok(args.includes('--cookies'));disposableCookie=args[args.indexOf('--cookies')+1];assert.notEqual(disposableCookie,cookieFile);assert.ok(fs.existsSync(disposableCookie));assert.ok(!args.join(' ').includes('fixture-session-never-log'));return {exitCode:0,stdout:JSON.stringify(raw),stderr:''};};
  const privateArtifact=await authService.downloadAuthorizedStory(url,access,{jobId:'operator-fixture',outputDir:directory});assert.equal(privateArtifact.mimeType,'video/mp4');assert.equal(authService.metadataCache.size,0,'Authorized media must not enter the public cache');
  assert.equal(fs.existsSync(disposableCookie),false);assert.ok(fs.readFileSync(cookieFile,'utf8').includes('fixture-session-never-log'));
  for(const value of ['https://www.instagram.com/stories/creator/00000/','https://www.instagram.com/stories/../123456789/','https://www.instagram.com/stories/HIGHLIGHTS/123456789/','https://www.instagram.com/stories/creator/','@creator'])assert.throws(()=>validation.validateMediaInput(value,'story'));
  console.log('PASS: exact-story video/image metadata, yt-dlp/HTTP/gallery fixture fallback order, terminal access restrictions, honest unknown dimensions, SSRF/DNS/redirect rejection, signatures, streaming/limits/cancellation/cleanup, bounded subprocesses, coalesced requests, public-cache isolation and explicitly scoped operator sessions. No live extraction success is implied.');
 }finally{
  delete process.env.STORY_AUTH_ENABLED;delete process.env.SAVEFRAME_FIXTURE_ORIGIN;
  server.closeAllConnections();await new Promise(resolve=>server.close(resolve));
  const expected=path.resolve(os.tmpdir())+path.sep;if(!path.resolve(directory).startsWith(expected)||!path.basename(directory).startsWith('saveframe-hybrid-story-'))throw Error('Unsafe fixture cleanup target');
  fs.rmSync(directory,{recursive:true,force:true});
 }
}
main().then(async()=>{const live=process.argv.find(value=>value.startsWith('--live-url='));if(live)await require('./check-story-live.cjs').runLive(live.slice(11));}).catch(error=>{console.error(error);process.exitCode=1;});
