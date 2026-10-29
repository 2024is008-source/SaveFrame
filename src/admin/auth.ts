import crypto from 'node:crypto';
import { hash, verify } from '@node-rs/argon2';
import { db, serverKey, transaction, audit, cleanup } from './db';

export class AdminError extends Error {
  constructor(public status: number, message: string) { super(message); }
}
export const digest = (value: string) => crypto.createHash('sha256').update(value).digest('hex');
export const randomToken = () => crypto.randomBytes(32).toString('base64url');
export function ownerEmail() {return (process.env.SAVEFRAME_ADMIN_EMAIL || '').trim().toLowerCase();}
function same(a: string, b: string) { const x=Buffer.from(typeof a==='string'?a:''), y=Buffer.from(typeof b==='string'?b:''); return x.length === y.length && x.length > 0 && crypto.timingSafeEqual(x,y); }
const signature = (value: string) => crypto.createHmac('sha256', serverKey()).update(value).digest('base64url');
export function loginChallenge() {
  const csrf = randomToken(); const body = `${Date.now()+900000}.${csrf}`;
  return { csrf, cookie: `${body}.${signature(body)}` };
}
export function checkLoginChallenge(csrf: string, cookie: string) {
  const [expires, token, mac] = (cookie || '').split('.');
  if (!same(csrf,token) || !same(mac,signature(`${expires}.${token}`)) || Number(expires)<Date.now() || !Number.isFinite(Number(expires))) throw new AdminError(403,'The login form expired. Reload and try again.');
}
export function localHttp(request: Request) {
  const host=new URL(request.url).hostname;
  return ['localhost','127.0.0.1','[::1]'].includes(host) && (process.env.ADMIN_ALLOW_LOCAL_HTTP === '1' || process.env.NODE_ENV !== 'production');
}
export function adminOrigin(request: Request) { return process.env.ADMIN_ORIGIN || (localHttp(request) ? new URL(request.url).origin : process.env.NEXT_PUBLIC_SITE_URL || 'https://tiksavemp4.online'); }
export function checkOrigin(request: Request) {
  if (request.headers.get('origin') !== new URL(adminOrigin(request)).origin) throw new AdminError(403,'This request must come from the admin site.');
  if (request.headers.get('sec-fetch-site') === 'cross-site') throw new AdminError(403,'Cross-site request rejected.');
}
export function cookieName(request: Request) { return localHttp(request) ? 'sf_admin_local' : '__Host-sf_admin'; }
export function challengeName(request: Request) { return localHttp(request) ? 'sf_login_local' : '__Host-sf_login'; }
export function cookieOptions(request: Request, age = 28800) { return { httpOnly: true, secure: !localHttp(request), sameSite: 'strict' as const, path: '/', maxAge: age }; }
export function readCookie(request: Request, name: string) {
  return (request.headers.get('cookie') || '').split(';').map(item=>item.trim()).find(item=>item.startsWith(name+'='))?.slice(name.length+1) || '';
}
function consumeRate(name: string, limit: number) {
  const bucket = signature('login:' + name), now=Date.now();
  transaction(() => {
    const row=db().prepare('SELECT attempts,reset_at FROM login_limits WHERE bucket=?').get(bucket) as any;
    if (!row || row.reset_at < now) db().prepare('INSERT INTO login_limits VALUES(?,1,?) ON CONFLICT(bucket) DO UPDATE SET attempts=1,reset_at=excluded.reset_at').run(bucket, now+900000);
    else {
      if (row.attempts >= limit) throw new AdminError(429,'Too many attempts. Wait 15 minutes and try again.');
      db().prepare('UPDATE login_limits SET attempts=attempts+1 WHERE bucket=?').run(bucket);
    }
  });
}
// Argon2id is algorithm 2 in the native library; literal avoids its ambient const enum in isolatedModules.
export const passwordHash = (password: string) => hash(password,{ algorithm: 2, memoryCost: 19456, timeCost: 3, parallelism: 1, outputLen: 32 });
export async function createAdmin(email: string, password: string) {
  email=email.trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length>200) throw new AdminError(400,'Enter a valid email.');
  if (password.length<12 || password.length>256) throw new AdminError(400,'Use a password with 12–256 characters.');
  if(!ownerEmail())throw new AdminError(503,'Configure SAVEFRAME_ADMIN_EMAIL privately before creating the owner account.');
  if(email!==ownerEmail())throw new AdminError(403,'Only the configured owner account is allowed.');
  if (Number((db().prepare('SELECT COUNT(*) AS count FROM admin_users').get() as any).count)>=20) throw new AdminError(400,'The administrator limit has been reached.');
  const id=crypto.randomUUID(), encoded=await passwordHash(password);
  transaction(()=> { db().prepare('INSERT INTO admin_users(id,email,password_hash,created_at) VALUES(?,?,?,?)').run(id,email,encoded,Date.now()); audit(id,'admin.created',id); });
  return id;
}
let dummyHash: Promise<string> | undefined;
let activeVerifications=0;
export async function verifyLoginCredentials(email: string, password: string, otp: string, client: string) {
  cleanup(); email=String(email || '').trim().toLowerCase();
  consumeRate('global',100); consumeRate('ip:'+client,8); consumeRate('email:'+email,10);
  if (email.length>200 || typeof password!=='string' || password.length>1024) throw new AdminError(401,'Email, password or verification code is incorrect.');
  const user=ownerEmail()&&email===ownerEmail()?db().prepare('SELECT * FROM admin_users WHERE email=?').get(email) as any:null;
  dummyHash ||= passwordHash(randomToken());
  if(activeVerifications>=2) throw new AdminError(429,'Sign-in is busy. Try again shortly.');
  activeVerifications++;
  let valid=false;
  try { valid=await verify(user?.password_hash || await dummyHash,password).catch(()=>false); }
  finally { activeVerifications--; }
  if (!valid || !user || (user.totp_enabled && !consumeTotp(user,otp))) {
    audit(user?.id || null,'auth.login_failed','admin');
    throw new AdminError(401,'Email, password or verification code is incorrect.');
  }
  return user as {id:string;email:string};
}
export async function authenticate(email: string,password:string,otp:string,client:string) { const user=await verifyLoginCredentials(email,password,otp,client);return newSession(user.id); }
export function newSession(userId: string) {
  const token=randomToken(), csrf=randomToken(), now=Date.now();
  db().prepare('INSERT INTO admin_sessions VALUES(?,?,?,?,?,?)').run(digest(token),userId,csrf,now,now,now+28800000);
  // Bound concurrent sessions per administrator.
  db().prepare('DELETE FROM admin_sessions WHERE user_id=? AND token_hash NOT IN (SELECT token_hash FROM admin_sessions WHERE user_id=? ORDER BY created_at DESC LIMIT 5)').run(userId,userId);
  audit(userId,'auth.login','admin');
  return { token, csrf, userId };
}
export function findSession(token: string) {
  if(!ownerEmail())return null;
  if (!/^[A-Za-z0-9_-]{43}$/.test(token || '')) return null;
  const now=Date.now();
  const row=db().prepare('SELECT s.*,u.email,u.totp_enabled FROM admin_sessions s JOIN admin_users u ON u.id=s.user_id WHERE token_hash=? AND expires_at>? AND last_seen>? AND u.email=?').get(digest(token),now,now-1800000,ownerEmail()) as any;
  if (!row) return null;
  if (now-row.last_seen>60000) db().prepare('UPDATE admin_sessions SET last_seen=? WHERE token_hash=?').run(now,row.token_hash);
  return row;
}
export function authorize(request: Request, mutation=false) {
  const session=findSession(readCookie(request,cookieName(request)));
  if (!session) throw new AdminError(401,'Sign in to continue.');
  if (mutation) { checkOrigin(request); if (!same(request.headers.get('x-csrf-token') || '',session.csrf_token)) throw new AdminError(403,'Security token is invalid. Reload the page.'); }
  return session;
}
export function logout(session: any) { db().prepare('DELETE FROM admin_sessions WHERE token_hash=?').run(session.token_hash); audit(session.user_id,'auth.logout','admin'); }
const alphabet='ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
export function totpSecret() { const bytes=crypto.randomBytes(20); let bits='',out=''; for(const b of bytes) bits+=b.toString(2).padStart(8,'0'); for(let n=0;n<bits.length;n+=5) out+=alphabet[parseInt(bits.slice(n,n+5).padEnd(5,'0'),2)]; return out; }
export function totpCode(secret: string, step=Math.floor(Date.now()/30000)) {
  let bits=''; for(const c of secret) { const value=alphabet.indexOf(c); if(value<0) throw new AdminError(400,'Invalid authenticator secret.'); bits+=value.toString(2).padStart(5,'0'); }
  const key=Buffer.from(bits.match(/.{8}/g)!.map(byte=>parseInt(byte,2)));
  const counter=Buffer.alloc(8); counter.writeBigUInt64BE(BigInt(step));
  const mac=crypto.createHmac('sha1',key).update(counter).digest(), offset=mac[19]&15;
  return String((mac.readUInt32BE(offset)&0x7fffffff)%1000000).padStart(6,'0');
}
function encrypt(secret: string) { const iv=crypto.randomBytes(12),cipher=crypto.createCipheriv('aes-256-gcm',serverKey(),iv); const text=Buffer.concat([cipher.update(secret,'utf8'),cipher.final()]); return [iv,cipher.getAuthTag(),text].map(b=>b.toString('base64url')).join('.'); }
function decrypt(value: string) { const [iv,tag,text]=value.split('.').map(part=>Buffer.from(part,'base64url')); const cipher=crypto.createDecipheriv('aes-256-gcm',serverKey(),iv); cipher.setAuthTag(tag); return Buffer.concat([cipher.update(text),cipher.final()]).toString('utf8'); }
function matchedStep(secret: string, code: string) { if(!/^\d{6}$/.test(code || '')) return -1; const now=Math.floor(Date.now()/30000); for(const step of [now,now-1,now+1]) if(same(totpCode(secret,step),code)) return step; return -1; }
function consumeTotp(user: any, code: string) { const step=matchedStep(decrypt(user.totp_secret),code); return step>user.totp_last_step && db().prepare('UPDATE admin_users SET totp_last_step=? WHERE id=? AND totp_last_step<?').run(step,user.id,step).changes===1; }
export async function manageTotp(session: any, action: string, password: string, code='') {
  consumeRate('reauth:'+session.user_id,8);
  const user=db().prepare('SELECT * FROM admin_users WHERE id=?').get(session.user_id) as any;
  if (typeof password!=='string' || password.length>1024 || !await verify(user.password_hash,password).catch(()=>false)) throw new AdminError(401,'Current password is incorrect.');
  if(action==='setup') {
    if(user.totp_enabled) throw new AdminError(409,'Two-factor authentication is already enabled.');
    const secret=totpSecret(); db().prepare('UPDATE admin_users SET totp_pending=? WHERE id=?').run(encrypt(secret),user.id);
    audit(user.id,'auth.totp_setup','admin');
    return { secret, uri:`otpauth://totp/SaveFrame:${encodeURIComponent(user.email)}?secret=${secret}&issuer=SaveFrame&digits=6&period=30` };
  }
  if(action==='enable') {
    const step=user.totp_pending ? matchedStep(decrypt(user.totp_pending),code) : -1;
    if(step<0) throw new AdminError(400,'Enter the current code from your authenticator.');
    db().prepare('UPDATE admin_users SET totp_secret=totp_pending,totp_pending=NULL,totp_enabled=1,totp_last_step=? WHERE id=?').run(step,user.id);
  } else if(action==='disable') {
    if(!user.totp_enabled || !consumeTotp(user,code)) throw new AdminError(400,'Enter a fresh authenticator code.');
    db().prepare('UPDATE admin_users SET totp_secret=NULL,totp_pending=NULL,totp_enabled=0,totp_last_step=-1 WHERE id=?').run(user.id);
  } else throw new AdminError(400,'Unknown security action.');
  db().prepare('DELETE FROM admin_sessions WHERE user_id=? AND token_hash<>?').run(user.id,session.token_hash);
  db().prepare('DELETE FROM admin_email_challenges WHERE user_id=?').run(user.id);
  audit(user.id,'auth.totp_'+action,'admin');
  return { enabled: action==='enable' };
}
