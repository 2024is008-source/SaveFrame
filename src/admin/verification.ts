import { db, transaction, audit } from './db';
import { AdminError } from './auth';
import { isVerificationFilename } from './verification-patterns';
export function validateVerification(filename: string, content: string) {
  if(typeof filename!=='string' || !isVerificationFilename(filename) || typeof content!=='string' || Buffer.byteLength(content)>16384 || /\x00/.test(content)) throw new AdminError(400,'Unsupported filename or file larger than 16 KB.');
  content=content.replace(/^\uFEFF/,'').trim();
  if(filename.startsWith('google')) {
    if(content!==`google-site-verification: ${filename}`) throw new AdminError(400,'The Google file must contain its exact verification line.');
    return {content:content+'\n',mime:'text/html; charset=utf-8',kind:'Google Search Console'};
  }
  if(filename==='BingSiteAuth.xml') {
    if(!/^(?:<\?xml version="1\.0"(?: encoding="utf-8")?\?>\s*)?<users>\s*<user>[A-Fa-f0-9]{16,128}<\/user>\s*<\/users>$/.test(content)) throw new AdminError(400,'Use the original Bing verification XML without scripts, attributes or entities.');
    return {content:content+'\n',mime:'application/xml; charset=utf-8',kind:'Bing Webmaster Tools'};
  }
  const lines=content.split(/\r?\n/);
  if(!content || lines.length>200 || lines.some(line=>line.trim() && !line.trim().startsWith('#') && !/^[a-z0-9](?:[a-z0-9.-]*[a-z0-9])?\.[a-z]{2,63}\s*,\s*[a-zA-Z0-9_-]{1,120}\s*,\s*(DIRECT|RESELLER)(?:\s*,\s*[a-zA-Z0-9_-]{1,120})?\s*$/.test(line)) || /[<>\x00-\x08]/.test(content)) throw new AdminError(400,'ads.txt supports standard seller lines and plain comments only.');
  return {content:lines.map(line=>line.trim()).join('\n')+'\n',mime:'text/plain; charset=utf-8',kind:'Advertising sellers'};
}
export function saveVerification(filename: string, content: string, actor: string, expectedVersion=0) {
  const safe=validateVerification(filename,content);
  return transaction(()=> {
    const current=db().prepare('SELECT version FROM verification_files WHERE filename=?').get(filename) as any;
    if((current?.version || 0)!==expectedVersion) throw new AdminError(409,'This verification file changed. Reload its list before replacing it.');
    if(!current && Number((db().prepare('SELECT COUNT(*) count FROM verification_files').get() as any).count)>=100) throw new AdminError(400,'The verification file limit has been reached.');
    const now=Date.now();
    db().prepare('INSERT INTO verification_files(filename,content,mime_type,kind,created_at,updated_at) VALUES(?,?,?,?,?,?) ON CONFLICT(filename) DO UPDATE SET content=excluded.content,mime_type=excluded.mime_type,kind=excluded.kind,active=1,version=verification_files.version+1,updated_at=excluded.updated_at,verified_at=NULL').run(filename,safe.content,safe.mime,safe.kind,now,now);
    audit(actor,current?'verification.replaced':'verification.created',filename);
    return {filename};
  });
}
export function verificationFile(filename: string) { if(!isVerificationFilename(filename)) return null; return db().prepare('SELECT * FROM verification_files WHERE filename=? AND active=1').get(filename) as any || null; }
export function removeVerification(filename: string, version: number, actor: string) {
  if(!isVerificationFilename(filename)) throw new AdminError(400,'Unsupported filename.');
  transaction(()=> { const changed=db().prepare('UPDATE verification_files SET active=0,version=version+1,updated_at=? WHERE filename=? AND version=? AND active=1').run(Date.now(),filename,version); if(!changed.changes) throw new AdminError(409,'The file changed. Reload and try again.'); audit(actor,'verification.deleted',filename); });
}
export function verificationList() { return db().prepare('SELECT filename,kind,version,active,updated_at,verified_at,LENGTH(content) bytes FROM verification_files ORDER BY filename').all(); }
export function saveDnsRecord(token: string, actor: string) {
  if(typeof token!=='string' || !/^google-site-verification=[A-Za-z0-9_-]{10,200}$/.test(token)) throw new AdminError(400,'Use the Google DNS TXT value exactly as supplied.');
  db().prepare("INSERT INTO verification_files(filename,content,mime_type,kind,created_at,updated_at) VALUES('dns:google',?,'text/plain','DNS TXT',?,?) ON CONFLICT(filename) DO UPDATE SET content=excluded.content,active=1,version=verification_files.version+1,updated_at=excluded.updated_at,verified_at=NULL").run(token,Date.now(),Date.now());
  audit(actor,'verification.dns_instructions_saved','dns:google');
}
