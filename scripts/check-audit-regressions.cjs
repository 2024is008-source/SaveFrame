const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),os=require('node:os'),http=require('node:http'),ts=require('typescript'),{spawnSync}=require('node:child_process');
process.env.NODE_ENV='test';process.env.SAVEFRAME_ANALYTICS_DISABLED='1';
require.extensions['.ts']=(module,file)=>module._compile(ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,esModuleInterop:true}}).outputText,file);
const {InstagramAuthorizedAdapters}=require('../src/services/instagram-adapters.service.ts');
const {DownloadManagerService}=require('../src/services/download-manager.service.ts');
const {YtDlpService}=require('../src/services/yt-dlp.service.ts');
const delay=ms=>new Promise(resolve=>setTimeout(resolve,ms));
async function fixture(run){
 const photo=fs.readFileSync('public/images/blog/photos-480.webp');
 const server=http.createServer((request,response)=>{
  response.setHeader('Content-Type','image/webp');
  if(request.url==='/broken'){response.write(photo.subarray(0,32));setTimeout(()=>response.destroy(),10);}
  else if(request.url==='/drip'){let count=0;const timer=setInterval(()=>{response.write(Buffer.from('x'));if(++count===35){clearInterval(timer);response.end();}},10);response.once('close',()=>clearInterval(timer));}
  else response.end(photo);
 });
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 const origin=`http://127.0.0.1:${server.address().port}`;process.env.SAVEFRAME_FIXTURE_ORIGIN=origin;
 try{return await run(origin);}finally{delete process.env.SAVEFRAME_FIXTURE_ORIGIN;server.closeAllConnections();await new Promise(resolve=>server.close(resolve));}
}
if(process.argv.includes('--aborted-response-child')){
 fixture(async origin=>{await assert.rejects(new InstagramAuthorizedAdapters().fetchBuffer(origin+'/broken'),error=>error.code==='EXTRACTOR_FAILURE');}).then(()=>process.exit(0)).catch(()=>process.exit(2));
}else{
 const directory=fs.mkdtempSync(path.join(os.tmpdir(),'saveframe-audit-')),results=[];
 async function check(name,fn){try{await fn();results.push({name,passed:true});}catch(error){results.push({name,passed:false,evidence:error.message.slice(0,220)});}}
 (async()=>{try{
  await check('Aborted upstream image response rejects without hanging or crashing Node',()=>{
   const child=spawnSync(process.execPath,[__filename,'--aborted-response-child'],{timeout:5000,windowsHide:true,stdio:'pipe'});assert.equal(child.status,0,`isolated fixture process exit=${child.status}, signal=${child.signal}`);
  });
  await check('Image HTTP wall-clock deadline stops a continuously dripping response',()=>fixture(async origin=>{
   const start=Date.now();await assert.rejects(new InstagramAuthorizedAdapters({timeoutMs:60}).fetchBuffer(origin+'/drip'),error=>error.code==='DOWNLOAD_TIMEOUT');assert.ok(Date.now()-start<250);
  }));
  await check('Image HTTP cancellation stops the transfer',()=>fixture(async origin=>{
   const controller=new AbortController();setTimeout(()=>controller.abort(),25);await assert.rejects(new InstagramAuthorizedAdapters({timeoutMs:1000}).fetchBuffer(origin+'/drip',1000,controller.signal),error=>error.code==='JOB_CANCELLED');
  }));
  await check('Photo delivery preserves a pre-existing output',()=>fixture(async origin=>{
   const filename=path.join(directory,'owned-by-someone-else.webp');fs.writeFileSync(filename,'preserve-me');await assert.rejects(new InstagramAuthorizedAdapters().downloadImageToFile(origin+'/photo',filename));assert.equal(fs.readFileSync(filename,'utf8'),'preserve-me');
  }));
  await check('Downloader cannot place private temporary files under public',()=>{
   const target=path.join(process.cwd(),'public','.saveframe-audit-'+path.basename(directory));let manager;
   try{assert.throws(()=>{manager=new DownloadManagerService({}, {tempDir:target});},error=>error.code==='INTERNAL_ERROR');}finally{if(manager)clearInterval(manager.cleanupTimer);if(fs.existsSync(target))fs.rmdirSync(target);}
  });
  await check('Cancelled Reel metadata cannot start a later media transfer',async()=>{
   const service=new YtDlpService();let metadataSignal,release,transfers=0;
   service.extractMetadata=(_url,_tool,signal)=>{metadataSignal=signal;return new Promise(resolve=>{release=resolve;});};
   service.adapters.downloadImageToFile=async()=>{transfers++;return {bytesWritten:1,mimeType:'image/jpeg'};};
   const promise=service.downloadMedia('https://www.instagram.com/reel/Audit123/',{jobId:'audit-cancel',outputDir:directory});
   for(let i=0;i<50&&!release;i++)await delay(2);
   const cancelled=service.cancelDownload('audit-cancel');release({uploader:{username:'fixture'},shortcode:'Audit123',items:[{mediaType:'photo',formats:[{formatId:'photo',ext:'jpg',directUrl:'https://cdninstagram.com/photo.jpg'}]}]});
   await assert.rejects(promise,error=>error.code==='JOB_CANCELLED');assert.equal(cancelled,true);assert.equal(metadataSignal.aborted,true);assert.equal(transfers,0);
  });
  await check('GA consent withdrawal preserves the Google-patched dataLayer identity',()=>{
   const {createAnalytics}=require('../src/lib/analytics.ts'),events=new Map(),stored=new Map();
   const win={location:{origin:'https://saveframe.site',hostname:'saveframe.site',pathname:'/'},navigator:{},document:{cookie:''},localStorage:{getItem:key=>stored.get(key),setItem:(key,value)=>stored.set(key,value)},addEventListener:(key,fn)=>events.set(key,fn),removeEventListener:key=>events.delete(key)};
   const active=createAnalytics(win,'G-0EYTT0CW4Z','https://saveframe.site',true,()=>{});win.SaveFrameAnalytics.setConsent('granted');const original=win.saveframeDataLayer;let forwarded=0;original.push=function(...args){forwarded++;return Array.prototype.push.apply(this,args);};
   win.SaveFrameAnalytics.setConsent('denied');assert.equal(win.saveframeDataLayer,original);const before=forwarded;win.SaveFrameAnalytics.setConsent('granted');assert.ok(forwarded>before);active.dispose();
  });
  await check('Nginx resolution timeout exceeds the default metadata budget',()=>{for(const file of ['nginx/saveframe.conf','nginx/saveframe-tls.conf.example']){const text=fs.readFileSync(file,'utf8'),block=text.match(/location = \/api\/media\/resolve\s*\{([^}]+)/)[1];assert.ok(Number(block.match(/proxy_read_timeout (\d+)s/)[1])>=75,file);}});
  await check('Invalid worker configuration retains finite size and time bounds',()=>{
   const service=new YtDlpService({metadataTimeoutMs:NaN,downloadTimeoutMs:Infinity,maxFileSizeBytes:Infinity});
   assert.ok(Number.isFinite(service.metadataTimeoutMs)&&service.metadataTimeoutMs>0);assert.ok(Number.isFinite(service.downloadTimeoutMs)&&service.downloadTimeoutMs>0);assert.ok(Number.isFinite(service.maxFileSizeBytes)&&service.maxFileSizeBytes<=1024*1024*1024);
  });
  await check('Private environment variants are ignored while public examples remain trackable',()=>{
   const ignored=spawnSync('git',['check-ignore','--no-index','.env','.env.staging','.env.local'],{encoding:'utf8',windowsHide:true});assert.equal(ignored.status,0);assert.deepEqual(ignored.stdout.trim().split(/\r?\n/),['.env','.env.staging','.env.local']);
   for(const file of ['.env.example','.env.production'])assert.equal(spawnSync('git',['check-ignore','--no-index',file],{windowsHide:true}).status,1);
  });
  fs.mkdirSync('reports',{recursive:true});fs.writeFileSync('reports/security-regressions'+(process.argv.includes('--baseline')?'-before':'-after')+'.json',JSON.stringify(results,null,2)+'\n');
  for(const result of results)console.log(`${result.passed?'PASS':'FAIL'}: ${result.name}${result.evidence?' — '+result.evidence:''}`);
  if(results.some(result=>!result.passed))process.exitCode=1;
 }finally{const target=path.resolve(directory);if(!target.startsWith(path.resolve(os.tmpdir())+path.sep)||!path.basename(target).startsWith('saveframe-audit-'))throw Error('Unsafe cleanup');fs.rmSync(target,{recursive:true,force:true});}})().catch(error=>{console.error(error.message);process.exitCode=1;});
}
