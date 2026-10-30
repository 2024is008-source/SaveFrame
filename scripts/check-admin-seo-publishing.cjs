const assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path'),ts=require('typescript');
const directory=fs.mkdtempSync(path.join(os.tmpdir(),'saveframe-seo-publishing-'));
Object.assign(process.env,{NODE_ENV:'test',SAVEFRAME_ADMIN_DATA_DIR:directory,NEXT_PUBLIC_SITE_URL:'https://saveframe.site'});
delete process.env.SAVEFRAME_DISABLE_SEO_OVERRIDES;
const compilerOptions={module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,esModuleInterop:true,jsx:ts.JsxEmit.ReactJSX};
for(const extension of ['.ts','.tsx'])require.extensions[extension]=(module,file)=>module._compile(ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions}).outputText,file);
const {db}=require('../src/admin/db.ts'),seo=require('../src/admin/seo-service.ts');
const {pageMetadata}=require('../src/lib/seo.ts'),{pageDescription}=require('../src/admin/public-seo.ts');
const {changeSeoField,defaultSeoFields,seoEditorVersionKey}=require('../src/lib/seo-editor-values.ts');
const {legacyToolSeo}=require('../src/lib/legacy-tool-seo.ts');
const {SeoManager}=require('../src/components/admin/SeoManager.tsx');
const {createElement}=require('react'),{renderToStaticMarkup}=require('react-dom/server');
try{
 const connection=db(),actor='seo-test-owner';
 connection.prepare('INSERT INTO admin_users(id,email,password_hash,created_at) VALUES(?,?,?,?)').run(actor,'seo-fixture@example.test','unused-test-hash',Date.now());
 const versions=connection.prepare('SELECT * FROM schema_migrations ORDER BY version').all();
 for(const route of Object.keys(legacyToolSeo)){
  const original=seo.seoEditor(route),page=original.page,base=()=>pageMetadata(route,page.title,page.description);
  let version=original.version;
  assert.equal(original.values.ogTitle,'');assert.equal(original.values.ogDescription,'');assert.equal(original.values.contentDescription,'');
  const title='Updated '+route.slice(1)+' title | SaveFrame',description='Updated public media description for '+route.slice(1)+'.';
  const values={...original.values,title,description};
  seo.saveSeo(route,values,'draft',actor,version++);
  assert.equal(base().title,page.title);assert.equal(seo.seoEditor(route).values.title,title);
  seo.saveSeo(route,values,'publish',actor,version++);
  const result=base();assert.equal(result.title,title);assert.equal(result.description,description);
  assert.equal(result.openGraph.title,title);assert.equal(result.twitter.title,title);
  assert.equal(result.openGraph.description,description);assert.equal(result.twitter.description,description);
  assert.equal(pageDescription(route,page.description),description,'Visible copy inherits the published meta description');
  const stored=JSON.parse(connection.prepare('SELECT published_json FROM seo_overrides WHERE route=?').get(route).published_json);
  assert.equal(stored[seoEditorVersionKey],1);assert.ok(!(seoEditorVersionKey in seo.seoEditor(route).values));
  assert.throws(()=>seo.validateSeo(route,{...values,[seoEditorVersionKey]:1}),error=>error.status===400,'Client cannot forge the server-owned marker');
  // A deliberate edit matching retired copy must not be silently changed.
  const deliberate={...values,title:legacyToolSeo[route].titles[0],description:legacyToolSeo[route].descriptions[0]};
  seo.saveSeo(route,deliberate,'publish',actor,version++);
  assert.equal(base().title,deliberate.title);assert.equal(base().description,deliberate.description);
  assert.equal(seo.seoEditor(route).values.title,deliberate.title);assert.equal(seo.seoEditor(route).values.description,deliberate.description);
  // Restoring a new marked revision creates a draft, then can be republished.
  const publishedRevision=seo.seoEditor(route).history.find(row=>row.action==='publish'&&row.id!==seo.seoEditor(route).history[0].id);
  seo.restoreSeo(route,publishedRevision.id,actor,version++);assert.equal(base().title,deliberate.title);
  seo.saveSeo(route,seo.seoEditor(route).values,'publish',actor,version++);assert.equal(base().title,title);
  const independent={...values,ogTitle:'Independent social title',ogDescription:'Independent social description.',contentDescription:'Independent introduction.'};
  seo.saveSeo(route,independent,'publish',actor,version++);
  assert.equal(base().openGraph.title,independent.ogTitle);assert.equal(base().twitter.description,independent.ogDescription);assert.equal(pageDescription(route,page.description),independent.contentDescription);
  const cleared={...values,title:'',description:'',ogTitle:'',ogDescription:'',contentDescription:''};
  seo.saveSeo(route,cleared,'publish',actor,version++);assert.equal(base().title,page.title);assert.equal(base().description,page.description);assert.equal(pageDescription(route,page.description),page.description);
  assert.throws(()=>seo.saveSeo(route,values,'publish',actor,0),error=>error.status===409);
  assert.equal(seo.seoEditor(route).overridesEnabled,true);
 }
 const linked={title:'Previous title',description:'Previous description',ogTitle:'Previous title',ogDescription:'Previous description',contentDescription:'Previous description'};
 const home=seo.seoEditor('/'),homeTitle='SaveFrame — Instagram Downloader for Photos, Reels, Videos & Audio';
 seo.saveSeo('/',{...home.values,title:homeTitle,description:'Edited supported public media homepage description.'},'publish',actor,home.version);
 const homeResult=pageMetadata('/',home.page.title,home.page.description);assert.equal(homeResult.title,homeTitle);assert.equal(homeResult.openGraph.title,homeTitle);assert.equal(homeResult.description,'Edited supported public media homepage description.');
 let changed=changeSeoField(linked,'title','New\ntitle',true);assert.equal(changed.title,'New title');assert.equal(changed.ogTitle,'');
 changed=changeSeoField(linked,'description','New description',true);assert.equal(changed.ogDescription,'');assert.equal(changed.contentDescription,'');
 const custom={...linked,ogTitle:'Independent social title',ogDescription:'Independent social description',contentDescription:'Independent introduction'};
 assert.equal(changeSeoField(custom,'title','New title',true).ogTitle,custom.ogTitle);
 assert.equal(changeSeoField(custom,'description','New description',true).contentDescription,custom.contentDescription);
 assert.equal(changeSeoField(custom,'description','New description',true).ogDescription,custom.ogDescription);
 const editor=seo.seoEditor('/reels-downloader');
 const markup=renderToStaticMarkup(createElement(SeoManager,{initial:{editor,pages:[editor.page],images:['/social/saveframe.png']},csrf:'test-csrf'}));
 assert.ok(markup.includes('Search metadata preview'));assert.ok(markup.includes('Use page defaults'));assert.ok(markup.includes('Free HD MP4'));
 assert.ok(markup.includes('Use SEO text for social previews'));assert.ok(markup.includes('Google can choose different titles and snippets'));
 const unchanged=connection.prepare('SELECT published_json FROM seo_overrides WHERE route=?').get('/reels-downloader').published_json;
 process.env.SAVEFRAME_DISABLE_SEO_OVERRIDES='1';assert.equal(seo.seoEditor('/reels-downloader').overridesEnabled,false);
 assert.throws(()=>seo.saveSeo('/reels-downloader',defaultSeoFields(editor.page),'publish',actor,editor.version),error=>error.status===503);
 assert.equal(connection.prepare('SELECT published_json FROM seo_overrides WHERE route=?').get('/reels-downloader').published_json,unchanged);
 const disabled=renderToStaticMarkup(createElement(SeoManager,{initial:{editor:{...editor,overridesEnabled:false},pages:[],images:[]},csrf:'test-csrf'}));assert.ok(disabled.includes('Public SEO overrides are disabled'));
 assert.deepEqual(connection.prepare('SELECT * FROM schema_migrations ORDER BY version').all(),versions);
 console.log('PASS: all five tools draft/publish/restore/defaults, exact deliberate legacy-text edits, linked and independent social/visible descriptions, marker rejection, stale versions, disabled publishing, and real admin component rendering. Isolated database only.');
}finally{
 for(const connection of global.__saveframeAdminDbs?.values()||[])connection.close();
 assert.equal(path.dirname(path.resolve(directory)),path.resolve(os.tmpdir()));assert.ok(path.basename(directory).startsWith('saveframe-seo-publishing-'));
 fs.rmSync(directory,{recursive:true,force:true});
}
