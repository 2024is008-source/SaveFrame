#!/usr/bin/env node
const fs=require('node:fs');const ts=require('typescript');const readline=require('node:readline');
require.extensions['.ts']=(module,file)=>module._compile(ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,esModuleInterop:true}}).outputText,file);
// Load local server configuration without putting credentials on the command line.
require('@next/env').loadEnvConfig(process.cwd(),process.env.NODE_ENV!=='production');
const {db,audit,cleanup,transaction}=require('../src/admin/db.ts');
const {createAdmin,passwordHash}=require('../src/admin/auth.ts');
async function prompt(text){const rl=readline.createInterface({input:process.stdin,output:process.stdout});try{return await new Promise(resolve=>rl.question(text,resolve));}finally{rl.close();}}
async function secret(text){
 if(!process.stdin.isTTY)throw Error('Use an interactive terminal, or supply SAVEFRAME_ADMIN_PASSWORD through your protected environment.');
 process.stdout.write(text);readline.emitKeypressEvents(process.stdin);process.stdin.setRawMode(true);process.stdin.resume();
 return new Promise((resolve,reject)=>{let value='';const finish=()=>{process.stdin.off('keypress',key);process.stdin.setRawMode(false);process.stdin.pause();process.stdout.write('\n');};function key(char,info){if(info?.ctrl&&info.name==='c'){finish();reject(Error('Cancelled'));}else if(info?.name==='return'){finish();resolve(value);}else if(info?.name==='backspace')value=value.slice(0,-1);else if(char&&!info?.ctrl&&!info?.meta&&!char.startsWith('\x1b'))value+=char.replace(/[\r\n]/g,'');}process.stdin.on('keypress',key);});
}
async function main(){
 const command=process.argv[2]||'status';
 if(command==='migrate'){db();console.log('Admin migrations applied.');return;}
 if(command==='cleanup'){cleanup(true);audit(null,'analytics.cleanup','retention','CLI');console.log('Retention cleanup completed.');return;}
 if(command==='status'){console.log('Administrators:',db().prepare('SELECT COUNT(*) count FROM admin_users').get().count);console.log('Schema version:',db().prepare('SELECT MAX(version) version FROM schema_migrations').get().version);return;}
 if(!['create','reset-password','disable-totp'].includes(command))throw Error('Commands: create, status, migrate, cleanup, reset-password, disable-totp');
 const email=(process.env.SAVEFRAME_ADMIN_EMAIL||await prompt('Admin email: ')).trim().toLowerCase();
 if(command==='create'){const password=process.env.SAVEFRAME_ADMIN_PASSWORD||await secret('Password (12+ characters; hidden): ');await createAdmin(email,password);console.log('Administrator created. No default credentials are used.');return;}
 const user=db().prepare('SELECT id FROM admin_users WHERE email=?').get(email);if(!user)throw Error('Administrator not found.');
 if(command==='reset-password'){const password=process.env.SAVEFRAME_ADMIN_PASSWORD||await secret('New password (hidden): ');if(password.length<12||password.length>256)throw Error('Use 12–256 characters.');const encoded=await passwordHash(password);transaction(()=>{db().prepare('UPDATE admin_users SET password_hash=? WHERE id=?').run(encoded,user.id);db().prepare('DELETE FROM admin_sessions WHERE user_id=?').run(user.id);db().prepare('DELETE FROM admin_email_challenges WHERE user_id=?').run(user.id);audit(user.id,'admin.password_reset','admin','CLI recovery');});console.log('Password reset; all sessions revoked.');}
 if(command==='disable-totp'){transaction(()=>{db().prepare('UPDATE admin_users SET totp_enabled=0,totp_secret=NULL,totp_pending=NULL,totp_last_step=-1 WHERE id=?').run(user.id);db().prepare('DELETE FROM admin_sessions WHERE user_id=?').run(user.id);db().prepare('DELETE FROM admin_email_challenges WHERE user_id=?').run(user.id);audit(user.id,'admin.totp_recovery','admin','CLI recovery');});console.log('Authenticator reset; all sessions revoked.');}
}
main().catch(error=>{console.error(error.message);process.exitCode=1;});
