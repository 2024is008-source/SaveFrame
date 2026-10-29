const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),os=require('node:os'),{spawn}=require('node:child_process');
const delay=ms=>new Promise(resolve=>setTimeout(resolve,ms));
async function run(){
 const directory=fs.mkdtempSync(path.join(os.tmpdir(),'saveframe-ga-production-')),base='http://127.0.0.1:3114';let server;
 try{
  server=spawn(process.execPath,['node_modules/next/dist/bin/next','start','-H','127.0.0.1','-p','3114'],{windowsHide:true,stdio:['ignore','pipe','pipe'],env:{...process.env,NODE_ENV:'production',SAVEFRAME_ADMIN_DATA_DIR:directory,SAVEFRAME_ANALYTICS_DISABLED:'1',GA4_ENABLED:'1',GA4_TRUST_REGION_HEADER:'1',GA4_AUTOMATIC_COUNTRIES:'*'}});server.stdout.resume();server.stderr.resume();
  let ready=false;for(let i=0;i<100;i++){if(server.exitCode!==null)throw Error('GA preview could not start; no existing server was stopped.');try{const response=await fetch(base+'/admin/login',{signal:AbortSignal.timeout(1000)});await response.arrayBuffer();if(response.status===200){ready=true;break;}}catch{}await delay(200);}assert.ok(ready);
  const rows=[];
  for(const [route,country,automatic]of [['/','US',true],['/fr/','US',true],['/photo-downloader','US',true],['/blog','US',true],['/privacy','US',true],['/','DE',false],['/','GB',false],['/','XX',false]]){
   const response=await fetch(base+route,{headers:{'x-saveframe-country':country}});assert.equal(response.status,200);
   const html=(await response.text()).replace(/\\"/g,'"');assert.ok(html.includes('"automaticAllowed":'+automatic),route+' '+country);assert.ok(html.includes('"production":true'));assert.ok(html.includes('G-XP63QEZK1R'));assert.match(response.headers.get('cache-control')||'',/no-store/);
   assert.equal(/<script[^>]+src="https:\/\/www\.googletagmanager\.com/.test(html),false,'No server-side Google request/script execution');
   rows.push({route,country,automatic,ssrStatus:response.status});
  }
  fs.writeFileSync('reports/analytics-production-check.json',JSON.stringify({passed:true,liveGoogleReceiptVerified:false,rows},null,2));console.log('PASS: real production SSR, measurement ID, public routes, country policy and no-store cache isolation. Google receipt not tested.');
 }finally{
  if(server&&server.exitCode===null){const exit=new Promise(resolve=>server.once('exit',resolve));server.kill('SIGTERM');await Promise.race([exit,delay(4000)]);if(server.exitCode===null){server.kill('SIGKILL');await Promise.race([exit,delay(2000)]);}}
  const target=path.resolve(directory);if(!target.startsWith(path.resolve(os.tmpdir())+path.sep)||!path.basename(target).startsWith('saveframe-ga-production-'))throw Error('Unsafe preview cleanup');fs.rmSync(target,{recursive:true,force:true});
 }
}
module.exports={run};if(require.main===module)run().catch(error=>{console.error(error.message);process.exitCode=1;});
