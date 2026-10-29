const assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path'),http=require('node:http'),ts=require('typescript');
process.env.NODE_ENV='test';process.env.SAVEFRAME_ANALYTICS_DISABLED='1';
require.extensions['.ts']=(module,file)=>module._compile(ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,esModuleInterop:true}}).outputText,file);
require('../src/security/url-validator.ts').assertSafeHostResolution=async()=>{};
const {YtDlpService}=require('../src/services/yt-dlp.service.ts');
const {DownloaderAppError}=require('../src/types/media.types.ts');
const {metadataCachePolicy}=require('../src/services/metadata-cache-policy.ts');
const {withMediaTiming}=require('../src/services/media-timing.ts');
const delay=ms=>new Promise(resolve=>setTimeout(resolve,ms));
const url=id=>'https://www.instagram.com/reel/'+id+'/';
const raw=(id='Fixture123')=>({id,uploader_id:'fixture',formats:[{format_id:'combined',url:'https://scontent.cdninstagram.com/source.mp4',width:1080,height:1920,vcodec:'h264',acodec:'aac'}]});
const fixture=()=>{const service=new YtDlpService();let calls=0;service.runSubprocess=async()=>{calls++;await delay(5);return{exitCode:0,stdout:JSON.stringify(raw()),stderr:''};};return{service,calls:()=>calls};};
async function main(){
 const directory=fs.mkdtempSync(path.join(os.tmpdir(),'saveframe-resolution-check-'));
 let server;
 try{
  // Different tool views share anonymous source extraction, including MP3.
  let test=fixture();
  const results=await Promise.all(['photo','reels','video','audio',undefined].map(tool=>test.service.extractMetadata(url('Fixture123'),tool)));
  assert.equal(test.calls(),1);assert.equal(results[3].category,'audio');assert.equal(results[0].category,'reel');
  assert.deepEqual(results[3].items[0].formats.map(f=>f.formatId),['mp3-128','mp3-192','mp3-320']);
  for(let i=0;i<24;i++)await test.service.extractMetadata(url('WorkingSet'+i));
  const before=test.calls();for(let i=0;i<24;i++)await test.service.extractMetadata(url('WorkingSet'+i));assert.equal(test.calls(),before);
  process.env.METADATA_CACHE_MAX_ENTRIES='2';test=fixture();
  for(const id of ['CacheA1','CacheB1','CacheA1','CacheC1'])await test.service.extractMetadata(url(id));
  assert.equal(test.service.metadataCache.size,2);assert.ok(test.service.metadataCache.has(url('CacheA1')));assert.ok(!test.service.metadataCache.has(url('CacheB1')));
  delete process.env.METADATA_CACHE_MAX_ENTRIES;
  process.env.METADATA_CACHE_MAX_BYTES='1800';test=fixture();
  for(let i=0;i<10;i++)await test.service.extractMetadata(url('ByteLimit'+i));
  assert.ok(test.service.metadataCacheBytes<=1800);
  delete process.env.METADATA_CACHE_MAX_BYTES;
  const now=Date.now();
  assert.equal(metadataCachePolicy({}, {http_headers:{Cookie:'private'}},60000,now).eligible,false);
  assert.equal(metadataCachePolicy({}, {is_private:true},60000,now).eligible,false);
  assert.equal(metadataCachePolicy({}, {url:'https://cdninstagram.com/a?oe=1'},60000,now).eligible,false);
  assert.equal(metadataCachePolicy({}, {url:'https://cdninstagram.com/a?signature=unknown'},60000,now).eligible,false);
  const expiry=Math.floor(now/1000)+25;
  assert.equal(metadataCachePolicy({}, {url:'https://cdninstagram.com/a?oe='+expiry.toString(16)},60000,now).expiresAt,expiry*1000-10000);
  assert.equal(metadataCachePolicy({}, {url:'https://cdninstagram.com/a?expires='+expiry},60000,now).expiresAt,expiry*1000-10000);
  process.env.METADATA_CACHE_TTL_MS='20';test=fixture();await test.service.extractMetadata(url('Expire123'));await delay(40);
  assert.equal(test.service.metadataCache.size,0,'Expired signed metadata is removed even while idle');
  await test.service.extractMetadata(url('Expire123'));assert.equal(test.calls(),2);delete process.env.METADATA_CACHE_TTL_MS;

  // One visitor's cancellation must not cancel another visitor's shared work.
  test=fixture();const a=new AbortController(),b=new AbortController();
  const first=test.service.extractMetadata(url('Cancel123'),'reels',a.signal);
  const second=test.service.extractMetadata(url('Cancel123'),'video',b.signal);
  a.abort();await assert.rejects(first,e=>e.code==='JOB_CANCELLED');assert.ok(await second);assert.equal(test.calls(),1);
  // Final subscriber cancels; immediate replacement waits for teardown, then retries.
  test=fixture();let attempts=0;
  test.service.extractMetadataInternal=async(_url,_tool,signal)=>{
   attempts++;
   if(attempts===1)return new Promise((resolve,reject)=>signal.addEventListener('abort',()=>setTimeout(()=>reject(new DownloaderAppError('JOB_CANCELLED','Cancelled',499)),5),{once:true}));
   return test.service.normalizeYtDlpOutput(raw(),{canonicalUrl:url('Replace123'),category:'reel',shortcode:'Replace123'});
  };
  const controller=new AbortController();const old=test.service.extractMetadata(url('Replace123'),'reels',controller.signal);controller.abort();
  const replacement=test.service.extractMetadata(url('Replace123'),'video');await assert.rejects(old,e=>e.code==='JOB_CANCELLED');assert.ok(await replacement);assert.equal(attempts,2);
  test=fixture();const releases=[];test.service.extractMetadataInternal=()=>new Promise(resolve=>{releases.push(resolve);});
  const waiting=[1,2,3].map(i=>test.service.extractMetadata(url('Bounded'+i)));
  await assert.rejects(test.service.extractMetadata(url('Bounded4')),e=>e.code==='RATE_LIMITED');
  releases.forEach(resolve=>resolve({}));await Promise.all(waiting);
  test=fixture();let failing=true;test.service.runSubprocess=async()=>{if(failing)throw new DownloaderAppError('LOGIN_REQUIRED','Restricted',403);return{exitCode:0,stdout:JSON.stringify(raw()),stderr:''};};
  await assert.rejects(test.service.extractMetadata(url('Recover123')),e=>e.code==='LOGIN_REQUIRED');assert.equal(test.service.metadataCache.size,0);
  failing=false;assert.ok(await test.service.extractMetadata(url('Recover123')));

  // Operator calls never consult or populate an anonymous cache, even on primary success.
  test=fixture();await test.service.extractMetadata(url('Operator123'));const entries=test.service.metadataCache.size;
  await test.service.extractOperatorMetadata(url('Operator123'),{});assert.equal(test.calls(),2);assert.equal(test.service.metadataCache.size,entries);

  // Real bounded local transfer: selected complete MP4 bypasses a second process.
  let requests=0,connections=0;
  const bytes=Buffer.concat([Buffer.from([0,0,0,24]),Buffer.from('ftypisom'),Buffer.alloc(24)]);
  server=http.createServer((req,res)=>{requests++;assert.equal(req.headers['user-agent'],'FixtureAgent/1.0');assert.equal(req.headers.referer,'https://www.instagram.com/');assert.equal(req.headers.cookie,undefined);res.writeHead(200,{'Content-Type':'video/mp4','Content-Length':bytes.length});res.end(bytes);});
  server.on('connection',()=>connections++);
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  process.env.SAVEFRAME_FIXTURE_ORIGIN='http://127.0.0.1:'+server.address().port;
  test=fixture();let extracts=0,downloads=0;
  test.service.runSubprocess=async(_binary,args)=>{
   if(args.includes('--dump-single-json')){extracts++;return{exitCode:0,stderr:'',stdout:JSON.stringify({...raw(),http_headers:{'User-Agent':'FixtureAgent/1.0',Referer:'https://www.instagram.com/'},formats:[{...raw().formats[0],ext:'mp4',url:process.env.SAVEFRAME_FIXTURE_ORIGIN+'/video'}]})};}
   downloads++;assert.ok(args.includes('--load-info-json'));fs.writeFileSync(args[args.indexOf('-o')+1],bytes);return{exitCode:0,stdout:'',stderr:''};
  };
  for(let i=0;i<2;i++){
   const artifact=await test.service.downloadMedia(url('Direct123'),{jobId:'direct'+i,outputDir:directory});
   assert.deepEqual(fs.readFileSync(artifact.filePath),bytes);assert.equal(artifact.mimeType,'video/mp4');
  }
  assert.equal(extracts,1);assert.equal(downloads,0);assert.equal(requests,2);assert.equal(connections,1,'Checked connection is reused');
  const download=test.service.http.download.bind(test.service.http);
  test.service.http.download=async()=>{throw new DownloaderAppError('EXTRACTOR_FAILURE','Transport failure',502,true);};
  await test.service.downloadMedia(url('Direct123'),{jobId:'fallback',outputDir:directory});assert.equal(downloads,1);
  test.service.http.download=async()=>{throw new DownloaderAppError('PRIVATE_CONTENT','Restricted',403);};
  await assert.rejects(test.service.downloadMedia(url('Direct123'),{jobId:'restricted',outputDir:directory}),e=>e.code==='PRIVATE_CONTENT');assert.equal(downloads,1);
  test.service.http.download=download;
  const normalized=test.service.normalizeYtDlpOutput({...raw(),formats:[{...raw().formats[0],ext:'mp4',url:'https://127.0.0.1/private'}]}, {canonicalUrl:url('Blocked123'),category:'reel',shortcode:'Blocked123'});
  assert.equal(normalized.items[0].formats[0].directUrl,undefined);
  const authenticated=test.service.normalizeYtDlpOutput({...raw(),http_headers:{Cookie:'private-session'},formats:[{...raw().formats[0],ext:'mp4'}]}, {canonicalUrl:url('Blocked123'),category:'reel',shortcode:'Blocked123'});
  assert.equal(authenticated.items[0].formats[0].directUrl,undefined,'Credential-dependent streams cannot use anonymous transport');
  const thumbSource={...raw(),thumbnails:[96,640,1080].map(width=>({url:'https://scontent.cdninstagram.com/preview'+width+'.jpg',width,height:width*16/9}))};
  const preview=test.service.normalizeYtDlpOutput(thumbSource,{canonicalUrl:url('Preview123'),category:'reel',shortcode:'Preview123'});
  assert.ok(preview.items[0].thumbnailUrl.includes('640'));assert.ok(preview.items[0].thumbnailSmallUrl.includes('96'));assert.ok(preview.items[0].imagePreviewUrl.includes('1080'));

  // Actual Next route: hit reporting and rate limits remain accurate on cache hits.
  test=fixture();let limits=0;const singleton=require.resolve('../src/app/api/singleton.ts');
  require.cache[singleton]={exports:{getApiContext:()=>({ytDlpService:test.service,redisStore:{checkRateLimit:async()=>({allowed:++limits<3})}})}};
  const {POST}=require('../src/app/api/media/resolve/route.ts');
  const request=()=>new Request('http://localhost/api/media/resolve',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({url:url('Route12345'),tool:'video'})});
  let response=await POST(request());assert.equal(response.status,200);assert.equal((await response.json()).cached,false);
  response=await POST(request());const payload=await response.json();assert.equal(payload.cached,true);assert.equal(test.calls(),1);
  assert.ok(payload.data.items.every(item=>item.formats.every(format=>!('directUrl'in format))));
  assert.equal((await POST(request())).status,429);assert.equal(test.calls(),1);

  // Log output cannot contain the input, error, creator identity or direct URL.
  const logs=[],original=console.info;process.env.SAVEFRAME_MEDIA_TIMING='1';console.info=(...args)=>logs.push(args);
  try{await withMediaTiming(async()=>{throw new Error('https://instagram.com/p/private 192.0.2.1 cookie=secret');}).catch(()=>{});}
  finally{console.info=original;delete process.env.SAVEFRAME_MEDIA_TIMING;}
  assert.equal(logs[0][1].outcome,'error');for(const value of ['instagram.com','192.0.2.1','cookie','secret','private'])assert.ok(!JSON.stringify(logs).includes(value));
  console.log('PASS: cross-tool/MP3 coalescing; 24-link LRU; byte and signed-expiry limits; idle eviction; independent cancellation/replacement; concurrency cap; failure recovery; operator isolation; direct MP4 transfer/connection reuse; extractor fallback and restriction preservation; safe timings.');
 }finally{
  delete process.env.METADATA_CACHE_TTL_MS;delete process.env.METADATA_CACHE_MAX_ENTRIES;delete process.env.METADATA_CACHE_MAX_BYTES;
  if(server){server.closeAllConnections();await new Promise(resolve=>server.close(resolve));}
  assert.equal(path.dirname(path.resolve(directory)),path.resolve(os.tmpdir()));assert.ok(path.basename(directory).startsWith('saveframe-resolution-check-'));
  fs.rmSync(directory,{recursive:true,force:true});
 }
}
main().catch(error=>{console.error(error);process.exitCode=1;});
