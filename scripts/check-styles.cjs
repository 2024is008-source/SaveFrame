// Check assets over HTTP: an HTML route returning 200 alone cannot detect missing CSS.
const assert=require('node:assert/strict');
const base=process.env.TEST_BASE_URL || 'http://localhost:3000';
async function check(path){
 const response=await fetch(base+path,{signal:AbortSignal.timeout(20000)});assert.equal(response.status,200,path);
 const html=await response.text();
 const styles=[...html.matchAll(/<link\b[^>]*rel="stylesheet"[^>]*>/g)].map(match=>match[0].match(/href="([^"]+)"/)?.[1]).filter(href=>href?.startsWith('/'));
 assert.ok(styles.length,path+': local CSS links missing');
 let combined='';for(const href of new Set(styles)){const css=await fetch(new URL(href.replaceAll('&amp;','&'),base),{signal:AbortSignal.timeout(15000)});assert.equal(css.status,200,path+': '+href);assert.match(css.headers.get('content-type')||'',/text\/css/,href+': returned non-CSS content');const content=await css.text();assert.ok(content.length>100,href+': empty CSS');combined+=content;}
 if(path.startsWith('/admin')){assert.ok(combined.includes('.sf-admin'),path+': admin scope missing');assert.ok(combined.includes('.admin-login-panel'),path+': login styles missing');assert.ok(combined.includes('.admin-shell'),path+': dashboard styles missing');assert.ok(combined.includes('.admin-button.primary'),path+': primary button styles missing');}
 else {assert.ok(combined.includes('.bg-canvas'),path+': Tailwind utilities missing');assert.ok(combined.includes('.blog-container'),path+': public blog styles missing');}
 console.log('PASS: '+path+' linked CSS returns HTTP 200/text/css with expected styles.');
}
(async()=>{for(const path of ['/admin/login','/','/blog'])await check(path);})().catch(error=>{console.error(error.message);process.exitCode=1;});
