const assert=require('node:assert/strict'),fs=require('node:fs'),ts=require('typescript');
process.env.SAVEFRAME_DISABLE_SEO_OVERRIDES='1';process.env.NEXT_PUBLIC_SITE_URL='https://saveframe.site';
require.extensions['.ts']=(module,file)=>module._compile(ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,esModuleInterop:true}}).outputText,file);
const {localizedHomepage}=require('../src/i18n/homepage.ts'),{locales}=require('../src/i18n/config.ts');
const {toolPageMarkup}=require('../src/lib/tool-page.ts'),{middleware}=require('../src/middleware.ts');
const {NextRequest}=require('next/server'),sitemap=require('../src/app/sitemap.ts').default;
const tools=require('../src/content/tools.json'),posts=require('../src/content/blog/posts.json').filter(post=>post.published);
const core=['/','/reels-downloader','/photo-downloader','/carousel-downloader','/audio-downloader','/video-downloader'];
function verify(html){
 assert.ok(!/<time\b|datePublished|dateModified|article:published_time|article:modified_time/.test(html),'Evergreen pages cannot inherit guide publication dates');
 assert.ok(!html.includes('data-main-tool-links'),'Do not add the removed list below the downloader');
 for(const route of core.slice(1))assert.ok(html.includes('href="'+route+'"'),'Existing navigation links all core tools');
 assert.ok(html.includes('href="/blog/'),'Dated guides stay linked');
}
for(const locale of locales)verify(localizedHomepage(locale));
for(const tool of tools)verify(toolPageMarkup(tool));
const entries=sitemap();for(const route of core){const entry=entries.find(entry=>entry.url==='https://saveframe.site'+route);assert.ok(entry);assert.equal(entry.lastModified,undefined);assert.equal(entry.priority,undefined);}
for(const post of posts){const entry=entries.find(entry=>entry.url.endsWith('/blog/'+post.slug));assert.equal(entry.lastModified.toISOString(),new Date(post.updatedAt+'T00:00:00+05:30').toISOString());}
const request=(url,headers={},method='GET')=>new NextRequest(url,{headers,method});
for(const path of core){const response=middleware(request('https://www.saveframe.site'+path+'?ref=test'));assert.equal(response.status,308);assert.equal(response.headers.get('location'),'https://saveframe.site'+path+'?ref=test');}
assert.equal(middleware(request('http://127.0.0.1:3107/photo-downloader',{host:'www.saveframe.site'})).headers.get('location'),'https://saveframe.site/photo-downloader');
assert.equal(middleware(request('https://www.saveframe.site/es?tool=photo')).headers.get('location'),'https://saveframe.site/es/?tool=photo');
for(const url of ['http://127.0.0.1:3107/photo-downloader','http://localhost:3107/','https://saveframe.site/photo-downloader','https://untrusted.example/photo-downloader','https://www.saveframe.site/admin/seo','https://www.saveframe.site/api/media/resolve']){
 assert.equal(middleware(request(url)).status,200,'Do not redirect previews, preferred host, unknown hosts, or private endpoints');
}
assert.equal(middleware(request('http://localhost:3107/photo-downloader',{'x-forwarded-host':'www.saveframe.site'})).status,200);
assert.equal(middleware(request('https://www.saveframe.site/photo-downloader',{},'POST')).status,200);
assert.equal(middleware(request('https://www.saveframe.site/story-downloader')).status,410);
console.log('PASS: date-free evergreen home/tools in all locales; existing navigation retained without the extra link list; genuine article dates retained; valid sitemap; www 308 consolidation; locale/query preservation; no local/admin/API/forwarded-host redirects; retired URLs remain Gone.');
