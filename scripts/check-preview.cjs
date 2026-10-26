const assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path'),ts=require('typescript');
require.extensions['.ts']=(module,file)=>module._compile(ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,esModuleInterop:true}}).outputText,file);
const {byteRange}=require('../src/api/byte-range.ts');
const typesPath=require.resolve('../src/types/media.types.ts');
const {DownloaderAppError:OldError}=require(typesPath);const oldError=new OldError('LOGIN_REQUIRED','Sign-in is required.',403);
delete require.cache[typesPath];const {DownloaderAppError:NewError}=require(typesPath);
assert.ok(oldError instanceof NewError,'Known errors must survive module reloads');
assert.equal(new Error('unexpected') instanceof NewError,false);
assert.equal({name:'DownloaderAppError',code:'LOGIN_REQUIRED',statusCode:403,userMessage:'untrusted',retryable:false} instanceof NewError,false);
assert.deepEqual(byteRange('bytes=0-3',10),{start:0,end:3});
assert.deepEqual(byteRange('bytes=4-',10),{start:4,end:9});
assert.deepEqual(byteRange('bytes=-4',10),{start:6,end:9});
assert.deepEqual(byteRange('bytes=2-999',10),{start:2,end:9});
for(const input of ['bytes=10-','bytes=5-2','bytes=-0','bytes=-','bytes=0-1,4-5','bytes=999999999999999999999-','invalid'])assert.equal(byteRange(input,10),null,input);
async function main(){
 const directory=fs.mkdtempSync(path.join(os.tmpdir(),'saveframe-preview-'));
 const file=path.join(directory,'video.mp4'),bytes=Buffer.from('0123456789');fs.writeFileSync(file,bytes);
 const events=[];let retained=0,released=0,downloadStarts=0;
 const job={jobId:'fixture',status:'completed',outputFilePath:file,mimeType:'video/mp4',safeFilename:'creator.mp4',shortcode:'Fixture123',category:'video',analyticsId:'fixture'};
 const singleton=require.resolve('../src/app/api/singleton.ts'),analytics=require.resolve('../src/admin/analytics.ts');
 require.cache[singleton]={id:singleton,filename:singleton,loaded:true,exports:{getApiContext:()=>({downloadManager:{getJob:()=>job,retainJobFile:()=>{retained++;let done=false;return()=>{if(!done){done=true;released++;}}}}})}};
 require.cache[analytics]={id:analytics,filename:analytics,loaded:true,exports:{jobEvent:(...args)=>events.push(args),beginDownload:()=>String(++downloadStarts),attachJob:()=>{},recoverInterruptedJobs:()=>{}}};
 const {NextRequest}=require('next/server'),{GET}=require('../src/app/api/media/download/[jobId]/route.ts');
 const context={params:Promise.resolve({jobId:'fixture'})};
 try{
  for(const [range,wanted,contentRange]of [['bytes=0-3','0123','bytes 0-3/10'],['bytes=5-','56789','bytes 5-9/10'],['bytes=-2','89','bytes 8-9/10']]){
   const response=await GET(new NextRequest('http://localhost/api/media/download/fixture?preview=1',{headers:{range}}),context);
   assert.equal(response.status,206);assert.equal(response.headers.get('content-range'),contentRange);assert.equal(response.headers.get('accept-ranges'),'bytes');assert.match(response.headers.get('content-disposition'),/^inline/);assert.equal(await response.text(),wanted);
  }
  const invalid=await GET(new NextRequest('http://localhost/api/media/download/fixture?preview=1',{headers:{range:'bytes=10-'}}),context);assert.equal(invalid.status,416);assert.equal(invalid.headers.get('content-range'),'bytes */10');
  const head=await GET(new NextRequest('http://localhost/api/media/download/fixture?preview=1',{method:'HEAD'}),context);assert.equal(head.status,200);assert.equal(await head.text(),'');assert.equal(head.headers.get('content-length'),'10');
  assert.equal(events.length,0,'Playback must not record file delivery');
  const download=await GET(new NextRequest('http://localhost/api/media/download/fixture'),context);assert.equal(download.status,200);assert.match(download.headers.get('content-disposition'),/^attachment/);assert.equal(await download.text(),'0123456789');assert.deepEqual(events.map(event=>event[1]),['delivery_started','delivery_completed']);
  assert.equal(retained,released,'All streams release file retention');
  job.mimeType='application/zip';const archive=await GET(new NextRequest('http://localhost/api/media/download/fixture?preview=1'),context);assert.equal(archive.status,400);
  const {DownloadManagerService}=require('../src/services/download-manager.service.ts');
  const manager=new DownloadManagerService({downloadMedia:async(_url,options)=>{const output=path.join(directory,options.jobId+'.mp4');fs.writeFileSync(output,bytes);return {filePath:output,safeFilename:'creator.mp4',mimeType:'video/mp4',filesizeBytes:bytes.length};},cancelDownload:()=>false},{tempDir:directory});
  manager.getStorageHealth=async()=>({ok:true});
  require.cache[singleton].exports.getApiContext=()=>({downloadManager:manager,redisStore:{checkRateLimit:async()=>({allowed:true})}});
  const {POST}=require('../src/app/api/media/download/route.ts');
  for(const preview of [true,false]){const response=await POST(new NextRequest('http://localhost/api/media/download',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({url:'https://www.instagram.com/reel/Fixture123/',preview})}));assert.equal(response.status,202);}
  for(let i=0;i<100&&manager.activeCount;i++)await new Promise(resolve=>setImmediate(resolve));
  assert.equal(downloadStarts,1,'Only the actual download should create an analytics request');
  console.log('PASS: inline video playback, byte-range seeking/suffixes/416/HEAD, active-file retention, unchanged attachment downloads, preview analytics isolation and archive rejection.');
 }finally{fs.rmSync(directory,{recursive:true,force:true});}
}
main().catch(error=>{console.error(error);process.exitCode=1;});
