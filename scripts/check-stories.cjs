const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const ts = require('typescript');
process.env.SAVEFRAME_ANALYTICS_DISABLED='1';
require.extensions['.ts'] = (module, filename) => module._compile(ts.transpileModule(fs.readFileSync(filename, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, esModuleInterop: true } }).outputText, filename);
const validation = require('../src/security/url-validator.ts');
validation.assertSafeHostResolution = async () => {};
const { YtDlpService } = require('../src/services/yt-dlp.service.ts');
const { DownloadManagerService } = require('../src/services/download-manager.service.ts');
const url = 'https://www.instagram.com/stories/creator/123456789/?utm_source=share';
const direct = validation.validateMediaInput(url,'story');
assert.equal(direct.canonicalUrl,'https://www.instagram.com/stories/creator/123456789/');
assert.equal(validation.validateMediaInput('https://www.instagram.com/creator/','profile').category,'profile');
for(const value of ['@creator','https://www.instagram.com/creator/','https://www.instagram.com/stories/creator/','https://www.instagram.com/stories/highlights/123456789/']) {
 assert.throws(()=>validation.validateMediaInput(value,'story'),error=>error.code==='INVALID_STORY_LINK');
}
async function main() {
 const service = new YtDlpService();
 const raw = {id:'123456789',channel:'creator',thumbnail:'https://scontent.cdninstagram.com/story.jpg',formats:[{format_id:'video',url:'https://video.cdninstagram.com/story.mp4',width:720,height:1280,vcodec:'h264',acodec:'aac'}]};
 let extractions = 0;
 service.runSubprocess = async (_binary,args) => {
  extractions++;
  assert.ok(args.includes('--no-playlist'));
  assert.ok(!args.includes('--yes-playlist') && !args.includes('--cookies'));
  assert.equal(args.at(-1),direct.canonicalUrl);
  return {exitCode:0,stdout:JSON.stringify(raw),stderr:''};
 };
 const media=await service.extractMetadata(url,'story');
 assert.equal(media.category,'story');
 assert.equal(media.items.length,1);
 assert.equal(media.items[0].mediaType,'video');
 assert.equal(media.isCarousel,false);
 assert.equal(media.supportsZipDownload,false);
 await service.extractMetadata(url,'story');
 assert.equal(extractions,1);
 assert.throws(()=>service.normalizeYtDlpOutput({_type:'playlist',entries:[raw,raw]},direct),error=>error.code==='UNSUPPORTED_OPERATION');
 assert.throws(()=>service.normalizeYtDlpOutput({_type:'playlist',entries:[]},direct),error=>error.code==='NO_ACTIVE_STORIES');
 const blocked=new YtDlpService();
 blocked.runSubprocess=async()=>({exitCode:1,stdout:'',stderr:'This content is unreachable. You need to log in to access this content.'});
 await assert.rejects(blocked.extractMetadata(url,'story'),error=>error.code==='LOGIN_REQUIRED');
 const temp=fs.mkdtempSync(path.join(os.tmpdir(),'saveframe-story-check-'));
 try{
  const manager=new DownloadManagerService(service,{tempDir:temp});
  await assert.rejects(manager.createJob({url:direct.canonicalUrl,zipCarousel:true}),error=>error.code==='UNSUPPORTED_OPERATION');
  await assert.rejects(manager.createJob({url:'https://www.instagram.com/stories/creator/'}),error=>error.code==='INVALID_STORY_LINK');
 }finally{fs.rmdirSync(temp);}
 console.log('PASS: direct story video URLs, one-item extraction/cache, profile/bulk rejection, no cookies/paid APIs and correct login-required errors. Extraction responses are offline fixtures.');
}
main().catch(error=>{console.error(error);process.exitCode=1;});
