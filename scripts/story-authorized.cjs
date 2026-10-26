// Operator-only entry point; no public HTTP endpoint accepts session credentials.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),os=require('node:os'),ts=require('typescript');
require('@next/env').loadEnvConfig(process.cwd());
async function main(){
 if(process.env.STORY_AUTH_ENABLED!=='1')throw Error('Authorized story extraction is disabled.');
 const args=process.argv.slice(2),values={};
 for(let i=0;i<args.length;i+=2){if(!['--url','--output'].includes(args[i])||!args[i+1]||values[args[i]])throw Error('Usage: npm run story:authorized -- --url <direct-story-url> --output <private-directory>');values[args[i]]=args[i+1];}
 if(!values['--url']||!values['--output']||!process.env.STORY_AUTH_COOKIE_FILE||!process.env.STORY_AUTH_ALLOWED_USERNAMES)throw Error('A direct URL, private output directory, external session file and explicit account allowlist are required.');
 const root=fs.realpathSync(process.cwd()),output=path.resolve(values['--output']);
 const outside=target=>{const relative=path.relative(root,target);return relative.startsWith('..'+path.sep)||path.isAbsolute(relative);};
 if(!outside(output))throw Error('Authorized story files must be stored outside the application checkout.');
 await fs.promises.mkdir(output,{recursive:true,mode:0o700});
 const real=fs.realpathSync(output);if(!outside(real)||(process.platform!=='win32'&&(fs.statSync(real).mode&0o077)!==0))throw Error('Use a private output directory outside the application checkout.');
 require.extensions['.ts']=(module,file)=>module._compile(ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,esModuleInterop:true}}).outputText,file);
 const {YtDlpService}=require('../src/services/yt-dlp.service.ts');
 const access={requesterId:'local-'+os.userInfo().username.replace(/[^a-zA-Z0-9@._-]/g,'_').slice(0,100),allowedUsernames:process.env.STORY_AUTH_ALLOWED_USERNAMES.split(',').map(value=>value.trim()).filter(Boolean),cookieFile:process.env.STORY_AUTH_COOKIE_FILE};
 const service=new YtDlpService(),jobId='authorized_'+crypto.randomBytes(8).toString('hex');
 const stop=()=>service.cancelDownload(jobId);process.once('SIGINT',stop);process.once('SIGTERM',stop);
 let artifact;try{artifact=await service.downloadAuthorizedStory(values['--url'],access,{jobId,outputDir:real});}finally{process.removeListener('SIGINT',stop);process.removeListener('SIGTERM',stop);}
 console.log(JSON.stringify({saved:artifact.filePath,bytes:artifact.filesizeBytes,type:artifact.mimeType}));
}
main().catch(error=>{console.error(error.name==='DownloaderAppError'?error.userMessage:error.message&&/^(Authorized|Usage:|A direct|Use a private)/.test(error.message)?error.message:'Authorized story extraction failed.');process.exitCode=1;});
