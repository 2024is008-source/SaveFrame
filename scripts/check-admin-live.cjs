// Runs against an isolated database and loopback-only production preview. Never seeds site analytics.
const assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path'),crypto=require('node:crypto'),{spawn}=require('node:child_process'),ts=require('typescript');
const directory=fs.mkdtempSync(path.join(os.tmpdir(),'saveframe-admin-live-')),base='http://127.0.0.1:3107';
Object.assign(process.env,{SAVEFRAME_ADMIN_DATA_DIR:directory,SAVEFRAME_ADMIN_EMAIL:'preview@example.test',ADMIN_ALLOW_LOCAL_HTTP:'1',ADMIN_ORIGIN:base,NODE_ENV:'production',ADMIN_SMTP_HOST:'127.0.0.1',ADMIN_SMTP_PORT:'3108',ADMIN_MAIL_FROM:'sender@example.test'});
delete process.env.ADMIN_SMTP_USER;delete process.env.ADMIN_SMTP_PASSWORD;
delete process.env.SAVEFRAME_DISABLE_SEO_OVERRIDES;
require.extensions['.ts']=(module,file)=>module._compile(ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,esModuleInterop:true}}).outputText,file);
const auth=require('../src/admin/auth.ts'),store=require('../src/admin/db.ts');
const email='preview@example.test',password=crypto.randomBytes(24).toString('base64url'),cookies=new Map();let server,log='',csrf='';
const preview=path.join(process.cwd(),'.runtime','admin-preview.json');
const previewMail=path.join(process.cwd(),'.runtime','admin-preview-mail.txt');let lastMail='';
// A test-only loopback SMTP sink: no email leaves this machine and production has no mail bypass.
const smtp=require('node:net').createServer(socket=>{socket.write('220 localhost test SMTP\r\n');let buffer='',dataMode=false,mail=[];socket.on('data',chunk=>{buffer+=chunk.toString();let index;while((index=buffer.indexOf('\r\n'))>=0){const line=buffer.slice(0,index);buffer=buffer.slice(index+2);if(dataMode){if(line==='.'){lastMail=mail.join('\n');if(process.argv.includes('--keep')){fs.mkdirSync(path.dirname(previewMail),{recursive:true});fs.writeFileSync(previewMail,lastMail,{mode:0o600});}mail=[];dataMode=false;socket.write('250 queued\r\n');}else mail.push(line);continue;}if(/^EHLO|^HELO/.test(line))socket.write('250 localhost\r\n');else if(/^MAIL|^RCPT|^RSET/.test(line))socket.write('250 OK\r\n');else if(line==='DATA'){dataMode=true;socket.write('354 End with dot\r\n');}else if(line==='QUIT'){socket.end('221 bye\r\n');}else socket.write('250 OK\r\n');}});});
const delay=ms=>new Promise(resolve=>setTimeout(resolve,ms));
async function request(route,body,extra={}) {
 const headers={cookie:[...cookies].map(([k,v])=>k+'='+v).join('; '),...(body!==undefined?{'content-type':'application/json',origin:base,'x-csrf-token':csrf}:{}),...extra};
 const response=await fetch(base+route,{method:body===undefined?'GET':'POST',headers,body:body===undefined?undefined:JSON.stringify(body),redirect:'manual'});
 for(const value of response.headers.getSetCookie()){const [pair]=value.split(';'),index=pair.indexOf('=');cookies.set(pair.slice(0,index),pair.slice(index+1));}
 return response;
}
async function json(route,body,status=200,headers){const response=await request(route,body,headers);assert.equal(response.status,status,route+': '+await response.clone().text());return response.json();}
function privateResponse(response){assert.match(response.headers.get('x-robots-tag')||'',/noindex/);assert.match(response.headers.get('cache-control')||'',/no-store/);}
async function styledResponse(response){const html=await response.text();const links=[...html.matchAll(/<link\b[^>]*rel="stylesheet"[^>]*>/g)].map(match=>match[0].match(/href="([^"]+)"/)?.[1]).filter(href=>href?.startsWith('/'));assert.ok(links.length,'Admin CSS links missing');let styles='';for(const href of new Set(links)){const asset=await fetch(new URL(href.replaceAll('&amp;','&'),base));assert.equal(asset.status,200,href);assert.match(asset.headers.get('content-type')||'',/text\/css/);styles+=await asset.text();}assert.ok(styles.includes('.sf-admin')&&styles.includes('.admin-shell')&&styles.includes('.admin-login-panel'),'Admin styles missing');}
async function stop(){if(server&&!server.killed){server.kill();await Promise.race([new Promise(resolve=>server.once('exit',resolve)),delay(3000)]);}smtp.close();for(const connection of globalThis.__saveframeAdminDbs?.values?.()||[])connection.close();try{fs.rmSync(preview,{force:true});fs.rmSync(previewMail,{force:true});fs.rmSync(directory,{recursive:true,force:true});}catch{} }
async function main(){
 await auth.createAdmin(email,password);
 await new Promise((resolve,reject)=>{smtp.once('error',reject);smtp.listen(3108,'127.0.0.1',resolve);});
 server=spawn(process.execPath,['node_modules/next/dist/bin/next','start','-H','127.0.0.1','-p','3107'],{cwd:process.cwd(),env:process.env,windowsHide:true,stdio:['ignore','pipe','pipe']});
 server.stdout.on('data',data=>{log=(log+data).slice(-5000)});server.stderr.on('data',data=>{log=(log+data).slice(-5000)});
 let last='';for(let attempt=0;attempt<100;attempt++){try{const response=await fetch(base+'/admin/login');last=String(response.status)+' '+(await response.text()).slice(0,150);if(response.status===200)break;}catch(error){last=error.message+' '+error.cause?.message;}if(attempt===99)throw Error('Preview failed to start: '+last+' '+log);await delay(300);}
 for(const route of ['/admin','/admin/analytics','/admin/countries','/admin/errors','/admin/seo','/admin/verification','/admin/settings','/admin/audit']){const response=await request(route);assert.ok([303,307].includes(response.status),route);assert.match(response.headers.get('location'),/\/admin\/login/);privateResponse(response);}
 const login=await request('/admin/login');privateResponse(login);await styledResponse(login.clone());assert.match(await login.text(),/name="robots" content="noindex, nofollow, nocache"/);
 for(const route of ['reports','reports/countries','reports/countries/export','seo','verification','settings','audit']){const response=await request('/api/admin/'+route);assert.equal(response.status,401);privateResponse(response);}
 const sitemap=await(await fetch(base+'/sitemap.xml')).text();assert.ok(!sitemap.includes('/admin'));
 const robots=await(await fetch(base+'/robots.txt')).text();assert.match(robots,/Disallow: \/admin/);
 const challenge=await json('/api/admin/auth/csrf');
 const pending=await json('/api/admin/auth/login',{email,password,csrf:challenge.csrf});assert.equal(pending.emailRequired,true);await json('/api/admin/session',undefined,401);
 assert.match(lastMail,/To: preview@example.test/);assert.ok(!lastMail.includes(password));const code=lastMail.match(/code is: (\d{6})/)[1];
 await json('/api/admin/auth/email/verify',{csrf:challenge.csrf,code:code==='000000'?'000001':'000000'},401);
 await json('/api/admin/auth/email/verify',{csrf:challenge.csrf,code});
 const session=await json('/api/admin/session');csrf=session.csrf;assert.equal(session.email,email);
 await json('/api/admin/settings',{settings:{site_name:'Bad CSRF'}},403,{'x-csrf-token':'wrong'});
 await json('/api/admin/settings',{settings:{site_name:'Wrong origin'}},403,{origin:'https://other.example'});
 for(const route of ['/admin','/admin/analytics','/admin/countries','/admin/errors','/admin/seo','/admin/verification','/admin/settings','/admin/audit']){const response=await request(route);assert.equal(response.status,200);privateResponse(response);await styledResponse(response.clone());}
 const countries=await json('/api/admin/reports/countries');assert.equal(countries.totals.requests,0);assert.equal(countries.timezone,'Asia/Colombo');
 const countryCsv=await request('/api/admin/reports/countries/export');assert.equal(countryCsv.status,200);privateResponse(countryCsv);assert.ok((await countryCsv.text()).startsWith('date,country_code,country_name,media_type,requests,prepared,delivered,failed'));
 const report=await json('/api/admin/reports');assert.equal(report.totals.requests,0);assert.equal(report.totals.prepared,0);
 const csv=await request('/api/admin/reports/export');assert.equal(csv.status,200);privateResponse(csv);assert.match(csv.headers.get('content-type'),/text\/csv/);
 const route='/photo-downloader',editor=await json('/api/admin/seo?route='+encodeURIComponent(route));
 const values={...editor.values,title:'Private preview SEO title',targetKeyword:'editorial-preview-keyword'};
 await json('/api/admin/seo',{route,values,action:'draft',version:editor.version});
 let html=await(await fetch(base+route)).text();assert.ok(!html.includes('<title>'+values.title+'</title>'));
 await json('/api/admin/seo',{route,values,action:'publish',version:editor.version+1});
 html=await(await fetch(base+route)).text();assert.ok(html.includes('<title>'+values.title+'</title>'));assert.match(html,/rel="canonical" href="https:\/\/saveframe.site\/photo-downloader"/);assert.ok(!html.includes('name="keywords"'));assert.ok(!html.includes(values.targetKeyword));
 const history=(await json('/api/admin/seo?route='+encodeURIComponent(route))).history;
 await json('/api/admin/seo',{route,action:'restore',revision:history.find(item=>item.action==='baseline').id,version:editor.version+2});
 await json('/api/admin/seo',{route,values:editor.values,action:'publish',version:editor.version+3});
 html=await(await fetch(base+route)).text();assert.ok(!html.includes('<title>'+values.title+'</title>'));
 const catalog=await json('/api/admin/seo');
 for(const pathToCheck of ['/es/',catalog.pages.find(page=>page.route.startsWith('/blog/')).route]){
  const page=await json('/api/admin/seo?route='+encodeURIComponent(pathToCheck));
  await json('/api/admin/seo',{route:pathToCheck,values:{...page.values,title:'SSR integration preview'},action:'publish',version:page.version});
  assert.ok((await(await fetch(base+pathToCheck)).text()).includes('<title>SSR integration preview</title>'),pathToCheck+': published metadata');
  await json('/api/admin/seo',{route:pathToCheck,values:page.values,action:'publish',version:page.version+1});
 }
 for(const [filename,content] of [['google1234567890abcdef.html','google-site-verification: google1234567890abcdef.html'],['ads.txt','google.com, pub-1234567890123456, DIRECT, f08c47fec0942fa0'],['BingSiteAuth.xml','<?xml version="1.0"?><users><user>1234567890abcdef</user></users>']]){
  await json('/api/admin/verification',{filename,content});const publicFile=await fetch(base+'/'+filename);assert.equal(publicFile.status,200);assert.equal((await publicFile.text()).trim(),content);
  assert.equal((await json('/api/admin/verification/check',{filename})).verified,true);
  const file=(await json('/api/admin/verification')).files.find(item=>item.filename===filename);await json('/api/admin/verification/delete',{filename,version:file.version});assert.equal((await fetch(base+'/'+filename)).status,404);
 }
 await json('/api/admin/verification',{filename:'../evil.html',content:'x'},400);
 await json('/api/admin/verification',{filename:'google1234567890abcdef.html',content:'<script>alert(1)</script>'},400);
 await json('/api/admin/verification',{filename:'ads.txt',content:'x'.repeat(26000)},413);
 const original=(await json('/api/admin/settings')).settings;
 await json('/api/admin/settings',{settings:{contact_email:'preview-contact@example.test'}});
 assert.ok((await(await fetch(base+'/contact')).text()).includes('preview-contact@example.test'));
 await json('/api/admin/settings',{settings:{contact_email:original.contact_email}});
 await json('/api/admin/settings',{settings:{password:'secret'}},400);
 const audit=await json('/api/admin/audit');assert.ok(audit.count>10);assert.ok(!JSON.stringify(audit).includes(password));
 await json('/api/admin/auth/logout',{});await json('/api/admin/session',undefined,401);
 console.log('PASS: owner-only login, required email OTP via local SMTP fixture, no session before code verification, private routes/headers, robots/sitemap exclusion, CSRF/origin, all eight sections, empty analytics, CSV, draft/publish/restore SSR including localized homepage/article, verification root files/check/delete/rejection, settings, audit and logout. No external email sent. Isolated database only.');
 if(process.argv.includes('--keep')){fs.mkdirSync(path.dirname(preview),{recursive:true});fs.writeFileSync(preview,JSON.stringify({base,email,password}),{mode:0o600});console.log('Isolated browser preview ready on '+base+'; temporary credentials stored privately in .runtime/admin-preview.json.');await new Promise(resolve=>{process.once('SIGINT',resolve);process.once('SIGTERM',resolve);});}
}
main().catch(error=>{console.error(error.message);process.exitCode=1;}).finally(stop);
