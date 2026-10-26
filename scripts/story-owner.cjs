// Local OS/operator authorization only. No HTTP endpoint or shared web queue.
const fs=require('node:fs'),path=require('node:path'),os=require('node:os'),ts=require('typescript');
require('@next/env').loadEnvConfig(process.cwd());
// Private operator jobs must never write public analytics or touch admin state.
process.env.SAVEFRAME_ANALYTICS_DISABLED='1';
require.extensions['.ts']=(module,file)=>module._compile(ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,esModuleInterop:true}}).outputText,file);
async function main(){
 if(process.env.INSTAGRAPI_AUTH_ENABLED!=='1')throw Error('Owner story extraction is disabled.');
 const args=process.argv.slice(2),values={};
 for(let i=0;i<args.length;i+=2){if(!['--url','--output'].includes(args[i])||!args[i+1]||values[args[i]])throw Error('Usage: npm run story:owner -- --url <own exact story URL> --output <external private directory>');values[args[i]]=args[i+1];}
 if(!values['--url']||!values['--output'])throw Error('An exact story URL and external private output directory are required.');
 const {validateMediaInput}=require('../src/security/url-validator.ts');
 const validated=validateMediaInput(values['--url'],'story');
 const ownerUsername=process.env.INSTAGRAPI_OWNER_USERNAME||'',ownerUserId=process.env.INSTAGRAPI_OWNER_USER_ID||'';
 if(!/^[A-Za-z0-9._]{1,30}$/.test(ownerUsername)||!/^\d{1,30}$/.test(ownerUserId)||validated.username.toLowerCase()!==ownerUsername.toLowerCase())throw Error('Configure the matching owner identity; only that account’s stories are authorized.');
 const {YtDlpService}=require('../src/services/yt-dlp.service.ts');
 const {DownloadManagerService}=require('../src/services/download-manager.service.ts');
 const output=path.resolve(values['--output']),root=fs.realpathSync(process.cwd());
 const inside=(base,target)=>{const relative=path.relative(base,target);return !relative||(!relative.startsWith('..'+path.sep)&&!path.isAbsolute(relative));};
 if(inside(root,output)||fs.realpathSync(path.dirname(output))!==path.dirname(output))throw Error('Use a private directory outside the checkout, without symlinks.');
 const access={requesterId:'local-'+os.userInfo().username.replace(/[^A-Za-z0-9@._-]/g,'_').slice(0,100),ownerUsername,ownerUserId,sessionKey:'owner',allowedCanonicalUrls:[validated.canonicalUrl]};
 const service=new YtDlpService();
 // Only this separate CLI manager instance delegates to authenticated extraction.
 const manager=new DownloadManagerService({downloadMedia:(url,options)=>service.downloadOperatorStory(url,access,options),cancelDownload:id=>service.cancelDownload(id)},{tempDir:output,maxConcurrentDownloads:1,maxQueuedJobs:1});
 let job;
 const cancel=()=>{if(job)manager.cancelJob(job.jobId);};
 process.once('SIGINT',cancel);process.once('SIGTERM',cancel);
 try{
  job=await manager.createJob({url:validated.canonicalUrl,itemIndex:0,trackAnalytics:false});
  const deadline=Date.now()+180000;
  while(!['completed','failed','cancelled'].includes(job.status)&&Date.now()<deadline)await new Promise(resolve=>setTimeout(resolve,100));
  if(job.status!=='completed'){cancel();const safe=job.error;throw Error(safe?`${safe.code}: ${safe.message}`:'Owner download timed out.');}
  const stat=fs.statSync(job.outputFilePath);
  if(!stat.size||stat.size!==job.filesizeBytes)throw Error('Verified delivery size mismatch.');
  console.log('Owner story file downloaded and validated.');
  console.log('File:',job.outputFilePath);console.log('MIME:',job.mimeType);console.log('Bytes:',stat.size);
  console.log('The file is private to this operator; it is not registered in the public server.');
 }finally{process.removeListener('SIGINT',cancel);process.removeListener('SIGTERM',cancel);if(manager.cleanupTimer)clearInterval(manager.cleanupTimer);}
}
if(require.main===module)main().catch(error=>{console.error(error.message);process.exitCode=1;});
module.exports={main};
