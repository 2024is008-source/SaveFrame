// Baseline source is compiled in memory from an explicit local Git revision.
// No checkout, network access, credentials, or repository mutation is needed.
const assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path'),http=require('node:http'),cp=require('node:child_process'),Module=require('node:module'),ts=require('typescript');
process.env.NODE_ENV='test';process.env.SAVEFRAME_ANALYTICS_DISABLED='1';
const compile=source=>ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,esModuleInterop:true}}).outputText;
require.extensions['.ts']=(module,file)=>module._compile(compile(fs.readFileSync(file,'utf8')),file);
require('../src/security/url-validator.ts').assertSafeHostResolution=async()=>{};
const {YtDlpService}=require('../src/services/yt-dlp.service.ts');
const quantile=(values,p)=>[...values].sort((a,b)=>a-b)[Math.max(0,Math.ceil(values.length*p)-1)];
async function main(){
 const revision=process.argv[2]||'d8573dda69382476102b4f7688ba9ffc0ed2cfd8';
 assert.match(revision,/^[a-f0-9]{40}$/,'Supply an exact local baseline commit');
 const source=cp.spawnSync('git',['show',revision+':src/services/yt-dlp.service.ts'],{encoding:'utf8',windowsHide:true});assert.equal(source.status,0);
 const filename=path.resolve('src/services/yt-dlp.baseline.ts'),baselineModule=new Module(filename,module);
 baselineModule.filename=filename;baselineModule.paths=Module._nodeModulePaths(path.dirname(filename));baselineModule._compile(compile(source.stdout),filename);
 const directory=fs.mkdtempSync(path.join(os.tmpdir(),'saveframe-download-bench-'));
 const media=Buffer.concat([Buffer.from([0,0,0,24]),Buffer.from('ftypisom'),Buffer.alloc(65536)]);
 const server=http.createServer((_req,res)=>setTimeout(()=>{res.writeHead(200,{'Content-Type':'video/mp4','Content-Length':media.length});res.end(media);},20));
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 process.env.SAVEFRAME_FIXTURE_ORIGIN='http://127.0.0.1:'+server.address().port;
 const binary=path.join(directory,'download.js');
 fs.writeFileSync(binary,`const fs=require('node:fs'),args=process.argv.slice(2);const raw=JSON.parse(fs.readFileSync(args[args.indexOf('--load-info-json')+1],'utf8'));setTimeout(async()=>{try{const res=await fetch(raw.formats[0].url);fs.writeFileSync(args[args.indexOf('-o')+1],Buffer.from(await res.arrayBuffer()));}catch{process.exitCode=1;}},60);`,{mode:0o600});
 const report={baselineRevision:revision,environment:{node:process.version,platform:process.platform,liveInstagram:false,fixtureDownloadProcessDelayMs:60,fixtureHttpDelayMs:20},results:[],pythonStartup:[]};
 try{
  for(const [name,Service]of [['before',baselineModule.exports.YtDlpService],['after',YtDlpService]]){
   const service=new Service({ytDlpBinaryPath:binary});const run=service.runSubprocess.bind(service);let extracts=0,downloads=0;
   service.runSubprocess=async(binary,args,...rest)=>{
    if(args.includes('--dump-single-json')){extracts++;return{exitCode:0,stderr:'',stdout:JSON.stringify({id:'Download123',uploader_id:'fixture',formats:[{format_id:'combined',ext:'mp4',protocol:'https',url:process.env.SAVEFRAME_FIXTURE_ORIGIN+'/video',width:1080,height:1920,vcodec:'h264',acodec:'aac'}]})};}
    downloads++;return run(binary,args,...rest);
   };
   const url='https://www.instagram.com/reel/Download123/';await service.extractMetadata(url);
   const times=[];
   for(let i=0;i<20;i++){const start=performance.now();const artifact=await service.downloadMedia(url,{jobId:name+i,formatId:'combined',outputDir:directory});times.push(performance.now()-start);assert.deepEqual(fs.readFileSync(artifact.filePath),media);}
   report.results.push({name,samples:times.length,p50Ms:quantile(times,.5),p95Ms:quantile(times,.95),extractions:extracts,downloadSubprocesses:downloads,successRate:1,byteEquality:true});
  }
  const python=path.resolve('.runtime',process.platform==='win32'?'Scripts/python.exe':'bin/python');
  // Import only: measures interpreter/library startup without Instagram calls.
  for(let i=0;i<10;i++){
   const start=performance.now();const result=cp.spawnSync(python,['-I','-B','-c','import time,json; s=time.perf_counter(); from instagrapi import Client; print(json.dumps({"importMs":(time.perf_counter()-s)*1000}))'],{encoding:'utf8',windowsHide:true,timeout:15000,maxBuffer:1024*1024});
   assert.equal(result.status,0,'Installed instagrapi import benchmark failed');report.pythonStartup.push({totalMs:performance.now()-start,importMs:JSON.parse(result.stdout).importMs});
  }
  report.pythonSummary={samples:10,p50ProcessAndImportMs:quantile(report.pythonStartup.map(row=>row.totalMs),.5),p95ProcessAndImportMs:quantile(report.pythonStartup.map(row=>row.totalMs),.95),p50ImportMs:quantile(report.pythonStartup.map(row=>row.importMs),.5)};
  fs.writeFileSync('reports/download-preparation-benchmark.json',JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report,null,2));
 }finally{server.closeAllConnections();await new Promise(resolve=>server.close(resolve));assert.equal(path.dirname(path.resolve(directory)),path.resolve(os.tmpdir()));assert.ok(path.basename(directory).startsWith('saveframe-download-bench-'));fs.rmSync(directory,{recursive:true,force:true});}
}
main().catch(error=>{console.error(error);process.exitCode=1;});
