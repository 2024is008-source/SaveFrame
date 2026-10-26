// Read-only Git history scan. Never print secret values or diff contents.
const fs=require('node:fs'),{execFileSync}=require('node:child_process');
require('@next/env').loadEnvConfig(process.cwd());
const git=(args,options={})=>execFileSync('git',args,{windowsHide:true,maxBuffer:64*1024*1024,...options});
const objects=git(['rev-list','--objects','--all'],{encoding:'utf8'}).trim().split('\n').map(line=>{const split=line.indexOf(' ');return {sha:line.slice(0,split),file:line.slice(split+1)};}).filter(row=>row.sha&&/\.(?:[cm]?[jt]sx?|json|ya?ml|md|sh|conf|txt|toml|ini|env|pem|key)$|(?:^|\/)\.env(?:\.[^/]+)?$/.test(row.file)&&!row.file.includes('node_modules/'));
const known=Object.entries(process.env).filter(([key,value])=>/(PASSWORD|SECRET|TOKEN|PRIVATE_KEY)/i.test(key)&&!key.startsWith('NEXT_PUBLIC_')&&value&&value.length>=8);
const blob=git(['cat-file','--batch'],{input:objects.map(row=>row.sha).join('\n')+'\n'});let cursor=0,scanned=0;const leads=[],exact=[],privateFiles=[];
const rules=[['private_key',/-----BEGIN (?:RSA |EC |OPENSSH |DSA )?PRIVATE KEY-----/],['provider_key',/\b(?:AKIA[0-9A-Z]{16}|gh[pousr]_[A-Za-z0-9_]{30,}|sk_(?:live|test)_[A-Za-z0-9]{20,})\b/],['literal_credential',/\b[A-Z_]*(?:PASSWORD|SECRET|TOKEN|PRIVATE_KEY)[A-Z_]*\s*[:=]\s*['"][A-Za-z0-9_./+=:@$%-]{12,}['"]/]];
for(const row of objects){
 const end=blob.indexOf(10,cursor),header=blob.subarray(cursor,end).toString().split(' '),size=Number(header[2]);cursor=end+1;
 if(!Number.isSafeInteger(size))throw Error('Unexpected Git object response');const data=blob.subarray(cursor,cursor+size);cursor+=size+1;
 if(header[1]!=='blob'||size>2000000||data.subarray(0,1024).includes(0))continue;scanned++;
 if(/(?:^|\/)(?:\.data\/|session\.key$|[^/]+\.pem$|\.env\.local$)/.test(row.file))privateFiles.push({file:row.file,blob:row.sha});
 const text=data.toString('utf8');for(const [variable,value]of known)if(text.includes(value))exact.push({file:row.file,blob:row.sha,variable});
 text.split('\n').forEach((line,index)=>{for(const [rule,pattern]of rules)if(pattern.test(line))leads.push({file:row.file,blob:row.sha,line:index+1,rule});});
}
const report={capturedAt:new Date().toISOString(),commits:Number(git(['rev-list','--count','--all'],{encoding:'utf8'})),scannedTextBlobs:scanned,configuredSecretMatches:exact,privateFiles,patternLeads:leads,limitation:'Pattern and configured-value scan of reachable Git text blobs <=2 MiB; not gitleaks, not provider validation, and cannot prove absence of all secrets.'};
fs.writeFileSync('reports/security-git-history.json',JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify({...report,patternLeads:leads.length}));
if(exact.length||privateFiles.length)process.exitCode=1;
