// Offline orchestration benchmark: real Node subprocesses and loopback HTTP;
// controlled delays are fixtures, never claims about Instagram latency.
const fs = require('node:fs'), os = require('node:os'), path = require('node:path');
const http = require('node:http'), ts = require('typescript'), assert = require('node:assert/strict');
process.env.NODE_ENV = 'test'; process.env.SAVEFRAME_ANALYTICS_DISABLED = '1';
require.extensions['.ts'] = (module, file) => module._compile(ts.transpileModule(fs.readFileSync(file, 'utf8'), {
  compilerOptions: {module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true},
}).outputText, file);
require('../src/security/url-validator.ts').assertSafeHostResolution = async () => {};
let {YtDlpService} = require('../src/services/yt-dlp.service.ts');
const {withMediaTiming, mediaStage, mediaStageSync, mediaCount} = require('../src/services/media-timing.ts');
const baselineRef = process.argv.find(value => value.startsWith('--baseline-ref='))?.split('=')[1];
if (baselineRef) {
  assert.match(baselineRef,/^[a-f0-9]{40}$/);
  const source = require('node:child_process').spawnSync('git',['show',baselineRef+':src/services/yt-dlp.service.ts'],{encoding:'utf8',windowsHide:true});
  assert.equal(source.status,0);
  const Module=require('node:module'),filename=path.resolve('src/services/yt-dlp.baseline.ts'),baseline=new Module(filename,module);
  baseline.filename=filename;baseline.paths=Module._nodeModulePaths(path.dirname(filename));
  baseline._compile(ts.transpileModule(source.stdout,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,esModuleInterop:true}}).outputText,filename);
  YtDlpService=baseline.exports.YtDlpService;
}
const types = ['photo', 'reel', 'video', 'carousel', 'audio', 'profile'];
const url = (type, id) => `https://www.instagram.com/${type === 'profile' ? 'profile' + id : (['reel', 'audio'].includes(type) ? 'reel' : type === 'video' ? 'tv' : 'p') + '/' + type + id}/`;
const tool = type => type === 'reel' ? 'reels' : type === 'carousel' ? 'photo' : type;
const quantile = (values, percentile) => [...values].sort((a,b)=>a-b)[Math.max(0,Math.ceil(values.length*percentile)-1)] || 0;
async function main() {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'saveframe-resolution-bench-'));
  let httpRequests = 0, subprocesses = 0;
  const server = http.createServer((req, res) => {
    httpRequests++;
    const id = req.url.split('/').filter(Boolean).at(req.url.includes('/embed/') ? 1 : 0);
    const body = req.url.includes('/embed/') ? {__typename: 'GraphImage', shortcode: id, is_video: false,
      image_versions2: {candidates: [{url:'https://scontent.cdninstagram.com/source.jpg',width:1080,height:1350}]}, user:{username:'fixture'}}
      : {username:id, full_name:'Fixture',profile_pic_url_hd:'https://scontent.cdninstagram.com/avatar.jpg'};
    setTimeout(()=>{res.writeHead(200,{'Content-Type':'application/json'});res.end(JSON.stringify(body));},20);
  });
  await new Promise(resolve => server.listen(0,'127.0.0.1',resolve));
  process.env.SAVEFRAME_FIXTURE_ORIGIN = `http://127.0.0.1:${server.address().port}`;
  process.env.INSTAGRAM_PUBLIC_EMBED_BASE = process.env.SAVEFRAME_FIXTURE_ORIGIN;
  const binary = path.join(directory, 'extractor.js');
  fs.writeFileSync(binary, `const url=process.argv.at(-1); const id=url.split('/').filter(Boolean).at(-1);
    setTimeout(()=>{
      if(id.startsWith('photo')){console.error('There is no video in this post');process.exitCode=1;return;}
      const video={id,title:'Fixture',uploader_id:'fixture',thumbnail:'https://scontent.cdninstagram.com/preview.jpg',
        formats:[{format_id:'combined',url:'https://scontent.cdninstagram.com/source.mp4',width:1080,height:1920,vcodec:'h264',acodec:'aac'}]};
      console.log(JSON.stringify(id.startsWith('carousel')?{_type:'playlist',id,channel:'fixture',entries:[video,{id:id+'2',thumbnails:[{url:'https://scontent.cdninstagram.com/image.jpg',width:1080,height:1350}]}]}:video));
    },60);`, {mode:0o600});
  const create = () => {
    const service = new YtDlpService({ytDlpBinaryPath: binary});
    const original = service.runSubprocess.bind(service);
    service.runSubprocess = (...args) => {subprocesses++; return baselineRef ? mediaStage('subprocess',()=>original(...args)) : original(...args);};
    if (baselineRef) {
      const extract=service.extractPrimaryMetadata.bind(service),photo=service.adapters.extractPublicPhotoPost.bind(service.adapters),normalize=service.normalizeYtDlpOutput.bind(service);
      service.extractPrimaryMetadata=(...args)=>mediaStage('extraction',()=>extract(...args));
      service.adapters.extractPublicPhotoPost=(...args)=>{mediaCount('fallback');return mediaStage('fallback',()=>photo(...args));};
      service.normalizeYtDlpOutput=(...args)=>mediaStageSync('normalization',()=>normalize(...args));
    }
    return service;
  };
  const rows = [];
  async function sample(service, type, id, variant = tool(type)) {
    let snapshot, success = false;
    await withMediaTiming(async trace => {
      if (baselineRef) {
        const cached=service.metadataCache.get(url(type,id));
        mediaCount(cached&&cached.expiresAt>Date.now()?'cache_hit':'cache_miss');
        if(service.pendingMetadata.has(url(type,id)+':'+(variant==='audio'?'':variant||'')))mediaCount('shared');
      }
      try {const result = await service.extractMetadata(url(type,id),variant); assert.ok(result.items.every(item=>item.formats.length));success=true;}
      finally {snapshot=trace.snapshot();}
    });
    return {type,success,...snapshot};
  }
  try {
    for (const type of types) for (let i=0;i<10;i++) rows.push({scenario:'cold',...await sample(create(),type,'Cold'+i)});
    const shared = create();
    for (let round=0;round<3;round++) for(let i=0;i<4;i++) for(const type of types) rows.push({scenario:'working_set_24',...await sample(shared,type,'Warm'+i)});
    const concurrent = [];
    for(const type of types) {
      const service = create(), before = subprocesses, beforeHttp = httpRequests;
      const results = await Promise.all([sample(service,type,'Concurrent',tool(type)),sample(service,type,'Concurrent','')]);
      concurrent.push({type,subprocesses:subprocesses-before,httpRequests:httpRequests-beforeHttp,shared:results.reduce((sum,row)=>sum+(row.counters.shared||0),0),p95Ms:quantile(results.map(row=>row.totalMs),.95)});
    }
    const summaries=[];
    for(const scenario of ['cold','working_set_24'])for(const type of types){
      const group=rows.filter(row=>row.scenario===scenario&&row.type===type),times=group.map(row=>row.totalMs);
      const meanStages={};for(const row of group)for(const [stage,ms]of Object.entries(row.stages))meanStages[stage]=(meanStages[stage]||0)+ms/group.length;
      summaries.push({scenario,type,samples:group.length,p50Ms:quantile(times,.5),p95Ms:quantile(times,.95),successRate:group.filter(row=>row.success).length/group.length,
        cacheHitRate:group.filter(row=>row.counters.cache_hit).length/group.length,fallbackFrequency:group.filter(row=>row.counters.fallback).length/group.length,
        meanStagesMs:Object.fromEntries(Object.entries(meanStages).map(([stage,ms])=>[stage,Math.round(ms*100)/100]))});
    }
    const report={environment:{node:process.version,platform:process.platform,fixtureSubprocessDelayMs:60,fixtureHttpDelayMs:20,liveInstagram:false,...(baselineRef?{baselineRef}:{})},summaries,concurrent,totals:{httpRequests,subprocesses},samples:rows};
    const output = process.argv.slice(2).find(value=>!value.startsWith('--')) || 'reports/resolution-benchmark-after.json';
    fs.writeFileSync(output,JSON.stringify(report,null,2)+'\n');
    console.log(JSON.stringify({output,summaries,concurrent,totals:report.totals},null,2));
  } finally {server.closeAllConnections();await new Promise(resolve=>server.close(resolve));assert.equal(path.dirname(path.resolve(directory)),path.resolve(os.tmpdir()));assert.ok(path.basename(directory).startsWith('saveframe-resolution-bench-'));fs.rmSync(directory,{recursive:true,force:true});}
}
main().catch(error=>{console.error(error);process.exitCode=1;});
