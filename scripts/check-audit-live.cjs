// Local production HTTP checks only. No Instagram, Gmail or live-site requests.
const assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path'),{spawn}=require('node:child_process');
const base='http://127.0.0.1:3113',directory=fs.mkdtempSync(path.join(os.tmpdir(),'saveframe-audit-live-'));
const env={...process.env,NODE_ENV:'production',SAVEFRAME_ADMIN_DATA_DIR:directory,SAVEFRAME_ANALYTICS_DISABLED:'1',ADMIN_ALLOW_LOCAL_HTTP:'1',ADMIN_ORIGIN:base,TEST_BASE_URL:base};
const delay=ms=>new Promise(resolve=>setTimeout(resolve,ms));let server;
async function script(file){await new Promise((resolve,reject)=>{const child=spawn(process.execPath,[file],{env,windowsHide:true,stdio:'inherit'});child.once('error',reject);child.once('exit',code=>code===0?resolve():reject(Error(file+' failed')));});}
(async()=>{try{
 server=spawn(process.execPath,['node_modules/next/dist/bin/next','start','-H','127.0.0.1','-p','3113'],{env,windowsHide:true,stdio:['ignore','pipe','pipe']});server.stdout.resume();server.stderr.resume();
 let ready=false;for(let i=0;i<100;i++){if(server.exitCode!==null)throw Error('Audit preview could not start; no existing server was stopped.');try{const response=await fetch(base+'/admin/login',{signal:AbortSignal.timeout(1000)});await response.arrayBuffer();if(response.ok){ready=true;break;}}catch{}await delay(200);}assert.ok(ready);
 for(const route of ['/api/admin/session','/api/media/jobs/not-a-real-job']){const response=await fetch(base+route);assert.ok([401,404].includes(response.status));assert.match(response.headers.get('cache-control')||'',/no-store/);assert.match(response.headers.get('x-content-type-options')||'',/nosniff/);await response.arrayBuffer();}
 for(const route of ['/.env.local','/.data/session.key','/.data/saveframe-admin.sqlite']){const response=await fetch(base+route);assert.equal(response.status,404);await response.arrayBuffer();}
 for(const file of ['scripts/check-styles.cjs','scripts/check-seo.cjs','scripts/check-i18n-live.cjs','scripts/check-blog-live.cjs','scripts/check-performance.cjs'])await script(file);
 fs.writeFileSync('reports/security-production-http.json',JSON.stringify({capturedAt:new Date().toISOString(),base,productionBuild:true,isolatedAdminData:true,noExternalMediaOrEmail:true,privateRoutesAndNoStore:true,privateFilesystemRoutes404:true,checks:['styles','SEO 38 pages','localization','blog','performance assets']},null,2)+'\n');
 console.log('PASS: isolated production HTTP audit; private routes, no-store headers, blocked private filesystem URLs and public regression scripts.');
 }finally{
  if(server&&server.exitCode===null){const exit=new Promise(resolve=>server.once('exit',resolve));server.kill('SIGTERM');await Promise.race([exit,delay(4000)]);if(server.exitCode===null){server.kill('SIGKILL');await Promise.race([exit,delay(2000)]);}}
  const resolved=path.resolve(directory);if(!resolved.startsWith(path.resolve(os.tmpdir())+path.sep)||!path.basename(resolved).startsWith('saveframe-audit-live-'))throw Error('Unsafe audit cleanup');fs.rmSync(resolved,{recursive:true,force:true});
 }
})().catch(error=>{console.error(error.message);process.exitCode=1;});
