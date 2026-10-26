// Build manifests describe deployable code/assets, never mutable private state.
// Next 15's trace exclusion glob handling differs on Windows, so enforce the
// same boundary on normalized resolved paths after its tracer completes.
const fs=require('node:fs'),path=require('node:path');
const root=process.cwd(),output=path.join(root,'.next');let traces=0,removed=0;
function privateFile(filename){
 const relative=path.relative(root,filename).replace(/\\/g,'/');
 return relative==='.data'||relative.startsWith('.data/')||/^\.env(?:\.|$)/.test(relative)||relative.startsWith('.runtime/downloads/')||/(?:^|\/)saveframe-story-session-[^/]+(?:\/|$)/.test(filename.replace(/\\/g,'/'));
}
function walk(directory){
 for(const entry of fs.readdirSync(directory,{withFileTypes:true})){
  const filename=path.join(directory,entry.name);
  if(entry.isDirectory())walk(filename);
  else if(entry.isFile()&&entry.name.endsWith('.nft.json')){
   const trace=JSON.parse(fs.readFileSync(filename,'utf8'));
   if(!Array.isArray(trace.files))throw Error('Invalid Next build trace');
   const kept=trace.files.filter(file=>!privateFile(path.resolve(directory,file)));
   removed+=trace.files.length-kept.length;traces++;
   if(kept.length!==trace.files.length)fs.writeFileSync(filename,JSON.stringify({...trace,files:kept}));
   if(kept.some(file=>privateFile(path.resolve(directory,file))))throw Error('Private file remained in build trace');
  }
 }
}
walk(output);console.log(`Build privacy: verified ${traces} manifests; removed ${removed} private-state references. Original files untouched.`);
