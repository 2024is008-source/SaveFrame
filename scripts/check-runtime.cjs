const fs=require('node:fs'),os=require('node:os'),path=require('node:path'),{spawnSync}=require('node:child_process'),assert=require('node:assert/strict'),ts=require('typescript');
require('@next/env').loadEnvConfig(process.cwd());
require.extensions['.ts']=(module,file)=>module._compile(ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,esModuleInterop:true}}).outputText,file);
const {YtDlpService}=require('../src/services/yt-dlp.service.ts'),service=new YtDlpService(),directory=fs.mkdtempSync(path.join(os.tmpdir(),'saveframe-runtime-check-'));
const environment={PATH:process.env.PATH,SystemRoot:process.env.SystemRoot,TEMP:os.tmpdir(),TMP:os.tmpdir()};
function ffmpeg(args){const result=spawnSync(service.ffmpegPath,['-hide_banner','-nostdin',...args],{windowsHide:true,timeout:15000,maxBuffer:1024*1024,encoding:'utf8',env:environment});assert.equal(result.status,0,'FFmpeg fixture operation failed');return result.stderr;}
(async()=>{const health=await service.checkHealth();assert.equal(health.ytDlp.ok,true,'yt-dlp missing');assert.equal(health.ffmpeg.ok,true,'FFmpeg missing');
 const video=path.join(directory,'video.mp4'),wave=path.join(directory,'tone.wav'),combined=path.join(directory,'combined.mp4'),audio=path.join(directory,'audio.m4a');
 ffmpeg(['-f','lavfi','-i','color=c=black:s=64x64:r=10','-t','1','-c:v','libx264','-an',video]);
 ffmpeg(['-f','lavfi','-i','sine=frequency=440:sample_rate=44100','-t','1',wave]);
 ffmpeg(['-i',video,'-i',wave,'-c:v','copy','-c:a','aac','-shortest',combined]);
 ffmpeg(['-i',combined,'-vn','-c:a','copy',audio]);
 const volume=ffmpeg(['-i',audio,'-af','volumedetect','-f','null','-']);const mean=Number(volume.match(/mean_volume:\s*(-?[\d.]+) dB/)?.[1]);assert.ok(Number.isFinite(mean)&&mean>-80,'Extracted fixture audio must be non-silent');
 const result={node:process.version,ytDlp:health.ytDlp.version,ffmpeg:health.ffmpeg.version,tests:['real binary readiness','local video encoding','local AAC/video mux','M4A extraction','non-silent decoded audio'],combinedBytes:fs.statSync(combined).size,audioBytes:fs.statSync(audio).size,meanVolumeDb:mean,instagramNetworkExtractionTested:false};
 fs.writeFileSync('reports/final-runtime.json',JSON.stringify(result,null,2)+'\n');console.log(JSON.stringify(result,null,2));
})().catch(error=>{console.error(error.message);process.exitCode=1;}).finally(()=>fs.rmSync(directory,{recursive:true,force:true}));
