const fs=require('node:fs');
const path=require('node:path');
const ts=require('typescript');
require.extensions['.ts']=(module,filename)=>module._compile(ts.transpileModule(fs.readFileSync(filename,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,esModuleInterop:true}}).outputText,filename);
const {TikTokHttpClient,parseTikTokPhotos}=require(path.resolve('src/services/tiktok.service.ts'));
(async()=>{
 const url='https://www.tiktok.com/@4kwallpaper026/photo/7692092340885851414';
 const os=require('node:os');
 const {YtDlpService}=require(path.resolve('src/services/yt-dlp.service.ts'));
 const sharp=require('sharp');
 const service=new YtDlpService();
 const media=await service.extractMetadata(url);
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'tiksave-reported-photo-'));
 try {
   const file=await service.downloadMedia(url,{jobId:'reported-photo-local-check',outputDir:root,itemIndex:0});
   const metadata=await sharp(file.filePath).metadata();
   await sharp(file.filePath).raw().toBuffer();
   console.log(JSON.stringify({photoCount:media.itemCount,mime:file.mimeType,bytes:file.filesizeBytes,decoded:true,width:metadata.width,height:metadata.height},null,2));
 } finally {
   if(path.dirname(root)!==path.resolve(os.tmpdir())||!path.basename(root).startsWith('tiksave-reported-photo-'))throw Error('Unsafe cleanup');
   fs.rmSync(root,{recursive:true,force:true});
 }
})().catch(error=>{console.log(JSON.stringify({failed:true,code:error.code,message:error.message}));process.exitCode=1;});
