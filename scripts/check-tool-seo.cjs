const assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path'),ts=require('typescript');
const directory=fs.mkdtempSync(path.join(os.tmpdir(),'saveframe-tool-seo-'));
process.env.NODE_ENV='test';process.env.SAVEFRAME_ADMIN_DATA_DIR=directory;process.env.NEXT_PUBLIC_SITE_URL='https://saveframe.site';
delete process.env.SAVEFRAME_DISABLE_SEO_OVERRIDES;
require.extensions['.ts']=(module,file)=>module._compile(ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,esModuleInterop:true}}).outputText,file);
const {db}=require('../src/admin/db.ts'),{pageMetadata}=require('../src/lib/seo.ts'),{pageDescription}=require('../src/admin/public-seo.ts');
const {seoEditor}=require('../src/admin/seo-service.ts'),{seoCatalog}=require('../src/admin/catalog.ts');
const {legacyToolSeo,isLegacyToolTitle,isLegacyToolDescription}=require('../src/lib/legacy-tool-seo.ts');
const {toolPageMarkup}=require('../src/lib/tool-page.ts');
const tools=require('../src/content/tools.json');
const expected={
 '/reels-downloader':'Instagram Reels Downloader – Free HD MP4 | SaveFrame',
 '/video-downloader':'Instagram Video Downloader – Free HD MP4 | SaveFrame',
 '/photo-downloader':'Instagram Photo Downloader – Free HD Images | SaveFrame',
 '/carousel-downloader':'Instagram Carousel Downloader – Photos & ZIP | SaveFrame',
 '/audio-downloader':'Instagram Audio Downloader – Reels to MP3 | SaveFrame',
};
try{
 const connection=db(),initialVersions=connection.prepare('SELECT * FROM schema_migrations ORDER BY version').all();
 const publish=(route,values)=>connection.prepare('INSERT INTO seo_overrides(route,published_json,version,updated_at) VALUES(?,?,1,?) ON CONFLICT(route) DO UPDATE SET published_json=excluded.published_json').run(route,JSON.stringify(values),Date.now());
 const render=tool=>pageMetadata('/'+tool.slug,tool.title+' | SaveFrame',tool.seoDescription||tool.description);
 const verify=(tool,metadata)=>{
  const route='/'+tool.slug;
  assert.equal(metadata.title,expected[route]);assert.equal(metadata.description,tool.description);
  assert.equal(metadata.openGraph.title,expected[route]);assert.equal(metadata.twitter.title,expected[route]);
  assert.equal(metadata.openGraph.description,tool.description);assert.equal(metadata.twitter.description,tool.description);
  assert.equal(metadata.alternates.canonical,'https://saveframe.site'+route);assert.equal(metadata.robots.index,true);
  assert.equal(pageDescription(route,tool.description),tool.description);
  assert.equal(seoCatalog().find(page=>page.route===route).title,expected[route]);
 };
 for(const [route,title]of Object.entries(expected)){
  const tool=tools.find(tool=>'/'+tool.slug===route);verify(tool,render(tool));
  assert.equal(isLegacyToolTitle(route,title),false);assert.equal(isLegacyToolDescription(route,tool.description),false);
  const html=toolPageMarkup(tool);
  assert.equal((html.match(/<h1\b/g)||[]).length,1);assert.ok(html.includes(tool.title));
  for(const oldTitle of legacyToolSeo[route].titles)for(const description of legacyToolSeo[route].descriptions){
   publish(route,{title:oldTitle+' | SaveFrame',ogTitle:oldTitle,description,ogDescription:description,contentDescription:description});
   const stored=connection.prepare('SELECT * FROM seo_overrides WHERE route=?').get(route);
   verify(tool,render(tool));
   const editor=seoEditor(route);assert.equal(editor.values.title,title);assert.equal(editor.values.ogTitle,'');
   assert.equal(editor.values.description,tool.description);assert.equal(editor.values.ogDescription,'');assert.equal(editor.values.contentDescription,'');
   assert.deepEqual(connection.prepare('SELECT * FROM seo_overrides WHERE route=?').get(route),stored,'Read/preview must preserve published data and history');
  }
  publish(route,{title:'Custom tool title | SaveFrame',description:'Custom supported-media description.',ogTitle:'Custom social title',ogDescription:'Custom social description.',contentDescription:'Custom introduction.'});
  const custom=render(tool);assert.equal(custom.title,'Custom tool title | SaveFrame');assert.equal(custom.description,'Custom supported-media description.');
  assert.equal(custom.openGraph.title,'Custom social title');assert.equal(custom.twitter.description,'Custom social description.');assert.equal(pageDescription(route,tool.description),'Custom introduction.');
  assert.equal(seoEditor(route).values.title,'Custom tool title | SaveFrame');
  publish(route,{title:'Custom tool title | SaveFrame',ogTitle:legacyToolSeo[route].titles[0],description:'Custom supported-media description.',ogDescription:legacyToolSeo[route].descriptions[0]});
  assert.equal(render(tool).openGraph.title,'Custom tool title | SaveFrame');assert.equal(render(tool).twitter.description,'Custom supported-media description.');
 }
 assert.equal(isLegacyToolTitle('/about',legacyToolSeo['/photo-downloader'].titles[0]),false);
 assert.equal(isLegacyToolDescription('/',legacyToolSeo['/photo-downloader'].descriptions[0]),false);
 assert.deepEqual(connection.prepare('SELECT * FROM schema_migrations ORDER BY version').all(),initialVersions);
 assert.equal(connection.prepare('SELECT COUNT(*) n FROM seo_revisions').get().n,0);
 console.log('PASS: five requested search titles/descriptions; consistent social metadata/canonicals/H1; retired published defaults and editor previews; custom overrides preserved; no record/history/migration mutation. Disposable database only.');
}finally{
 for(const connection of global.__saveframeAdminDbs?.values()||[])connection.close();
 assert.equal(path.dirname(path.resolve(directory)),path.resolve(os.tmpdir()));assert.ok(path.basename(directory).startsWith('saveframe-tool-seo-'));
 fs.rmSync(directory,{recursive:true,force:true});
}
