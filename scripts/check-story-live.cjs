// An explicitly requested live test on a disposable local production server.
// It never restarts existing services or opens the real administrator database.
const fs=require('node:fs'),path=require('node:path'),os=require('node:os'),crypto=require('node:crypto'),{spawn}=require('node:child_process');
const delay=ms=>new Promise(resolve=>setTimeout(resolve,ms));
async function runLive(input){
 const ts=require('typescript');require.extensions['.ts']||=(module,file)=>module._compile(ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,esModuleInterop:true}}).outputText,file);
 const validated=require('../src/security/url-validator.ts').validateMediaInput(input,'story');
 const directory=fs.mkdtempSync(path.join(os.tmpdir(),'saveframe-story-live-')),base='http://127.0.0.1:3111';let server;
 const report={capturedAt:new Date().toISOString(),url:validated.canonicalUrl,authenticated:false,paidProvider:false,liveDownloadSucceeded:false};
 try{
  server=spawn(process.execPath,['node_modules/next/dist/bin/next','start','-H','127.0.0.1','-p','3111'],{cwd:process.cwd(),windowsHide:true,stdio:['ignore','pipe','pipe'],env:{...process.env,NODE_ENV:'production',SAVEFRAME_ADMIN_DATA_DIR:directory,SAVEFRAME_ANALYTICS_DISABLED:'1',STORY_AUTH_ENABLED:'0'}});
  // Drain logs, but never copy raw provider output or environment values into reports.
  server.stdout.resume();server.stderr.resume();
  let ready=false;
  for(let i=0;i<100;i++){
   if(server.exitCode!==null)throw Error('Disposable production server could not start; no existing process was stopped.');
   try{const response=await fetch(base+'/admin/login',{signal:AbortSignal.timeout(1000)});await response.arrayBuffer();if(response.status===200){ready=true;break;}}catch{}
   await delay(250);
  }
  if(!ready)throw Error('Disposable production server did not become ready.');
  const started=Date.now();
  const response=await fetch(base+'/api/media/resolve',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({url:validated.canonicalUrl,tool:'story'}),signal:AbortSignal.timeout(70000)});
  const result=await response.json();Object.assign(report,{status:response.status,elapsedMs:Date.now()-started,errorCode:result.error?.code,errorMessage:result.error?.message});
  if(result.error?.code==='INTERNAL_ERROR')throw Error('Live story returned an unexpected internal error.');
  if(response.ok&&result.data?.items?.length===1){
   const item=result.data.items[0],format=item.formats[0];report.mediaType=item.mediaType;report.width=format.width;report.height=format.height;report.extractor=result.data.extractorSource;
   const creation=await fetch(base+'/api/media/download',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({url:validated.canonicalUrl,itemIndex:0,formatId:format.formatId}),signal:AbortSignal.timeout(70000)});
   const created=await creation.json();if(!creation.ok)throw Error('Live story job creation failed: '+(created.error?.code||creation.status));
   const deadline=Date.now()+180000;let completed=false;
   while(Date.now()<deadline){
    const status=await(await fetch(base+'/api/media/jobs/'+encodeURIComponent(created.jobId),{signal:AbortSignal.timeout(10000)})).json();
    if(status.job?.status==='completed'){completed=true;break;}
    if(['failed','cancelled'].includes(status.job?.status)){report.downloadError=status.job.error?.code;break;}
    await delay(700);
   }
   if(completed){
    const file=await fetch(base+'/api/media/download/'+encodeURIComponent(created.jobId),{signal:AbortSignal.timeout(180000)});
    let bytes=0,prefix=Buffer.alloc(0);const digest=crypto.createHash('sha256');
    for await(const chunk of file.body){bytes+=chunk.length;digest.update(chunk);if(prefix.length<32)prefix=Buffer.concat([prefix,Buffer.from(chunk).subarray(0,32-prefix.length)]);}
    const mime=file.headers.get('content-type');new(require('../src/services/instagram-http.service.ts').InstagramHttpClient)().verifySignature(prefix,mime);
    Object.assign(report,{liveDownloadSucceeded:file.ok,downloadStatus:file.status,bytes,mime,sha256:digest.digest('hex')});
   }
  }
  fs.mkdirSync('reports',{recursive:true});fs.writeFileSync('reports/hybrid-story-live.json',JSON.stringify(report,null,2)+'\n');
  console.log('LIVE STORY RESULT: '+JSON.stringify(report));return report;
 }finally{
  if(server&&server.exitCode===null){const exit=new Promise(resolve=>server.once('exit',resolve));server.kill('SIGTERM');await Promise.race([exit,delay(5000)]);if(server.exitCode===null){server.kill('SIGKILL');await Promise.race([exit,delay(3000)]);}}
  const resolved=path.resolve(directory),expected=path.resolve(os.tmpdir())+path.sep;if(!resolved.startsWith(expected)||!path.basename(resolved).startsWith('saveframe-story-live-'))throw Error('Unsafe fixture cleanup target');
  fs.rmSync(resolved,{recursive:true,force:true});
 }
}
module.exports={runLive};
if(require.main===module)runLive(process.argv[2]||'').catch(error=>{console.error(error.message);process.exitCode=1;});
