import crypto from 'node:crypto';
import nodemailer from 'nodemailer';
import { db,serverKey,audit,transaction } from './db';
import { AdminError,digest,randomToken,newSession,localHttp,ownerEmail } from './auth';

export const emailChallengeName=(request:Request)=>localHttp(request)?'sf_email_local':'__Host-sf_email';
const codeHash=(token:string,code:string)=>crypto.createHmac('sha256',serverKey()).update('email-login:'+token+':'+code).digest('hex');
export async function deliverLoginCode(email:string,code:string) {
  const host=process.env.ADMIN_SMTP_HOST || 'smtp.gmail.com',port=Number(process.env.ADMIN_SMTP_PORT || '587');
  const local=['127.0.0.1','localhost','::1'].includes(host)&&process.env.ADMIN_ALLOW_LOCAL_HTTP==='1';
  const user=process.env.ADMIN_SMTP_USER,password=process.env.ADMIN_SMTP_PASSWORD,from=process.env.ADMIN_MAIL_FROM || user || '';
  if(!/^[^\s<>@]+@[^\s<>@]+\.[^\s<>@]+$/.test(from) || (!local&&(!user||!password)) || !Number.isInteger(port)||port<1||port>65535) throw new AdminError(503,'Email sign-in is not configured. Ask the site owner to configure the server mail settings.');
  const transport=nodemailer.createTransport({host,port,secure:port===465,requireTLS:!local&&port!==465,ignoreTLS:local,auth:user&&password?{user,pass:password}:undefined,connectionTimeout:10000,greetingTimeout:10000,socketTimeout:15000,tls:{minVersion:'TLSv1.2',rejectUnauthorized:true}});
  try { const result=await transport.sendMail({from:{name:'SaveFrame Admin',address:from},to:email,subject:'Your SaveFrame admin sign-in code',text:`Your SaveFrame admin sign-in code is: ${code}\n\nIt expires in 5 minutes and works once. Do not share this code. If you did not request this sign-in, ignore this email and review your account password.`,disableFileAccess:true,disableUrlAccess:true});if(!result.accepted?.length)throw Error('Not accepted'); }
  catch {throw new AdminError(503,'The sign-in email could not be sent. Check the server mail configuration and try again.');}
  finally {transport.close();}
}
export async function beginEmailLogin(user:{id:string;email:string},deliver=deliverLoginCode) {
  if(!ownerEmail()||user.email!==ownerEmail())throw new AdminError(401,'Sign-in is not allowed.');
  const now=Date.now();
  const recent=db().prepare('SELECT created_at FROM admin_email_challenges WHERE user_id=? ORDER BY created_at DESC LIMIT 1').get(user.id) as any;
  if(recent&&recent.created_at>now-60000)throw new AdminError(429,'A code was already sent. Wait one minute before requesting another.');
  const token=randomToken(),code=String(crypto.randomInt(0,1000000)).padStart(6,'0');
  transaction(()=>{db().prepare('DELETE FROM admin_email_challenges WHERE user_id=? OR expires_at<?').run(user.id,now);db().prepare('INSERT INTO admin_email_challenges(token_hash,user_id,code_hash,created_at,expires_at) VALUES(?,?,?,?,?)').run(digest(token),user.id,codeHash(token,code),now,now+300000);});
  try {await deliver(user.email,code);} catch(error){db().prepare('DELETE FROM admin_email_challenges WHERE token_hash=?').run(digest(token));audit(user.id,'auth.email_delivery_failed','admin');throw error;}
  audit(user.id,'auth.email_code_sent','admin');return {token};
}
export function completeEmailLogin(token:string,code:string) {
  if(!/^[A-Za-z0-9_-]{43}$/.test(token||'') || typeof code!=='string' || !/^\d{6}$/.test(code))throw new AdminError(401,'The email code is incorrect or expired.');
  const result=transaction(()=>{
    const row=db().prepare('SELECT * FROM admin_email_challenges WHERE token_hash=?').get(digest(token)) as any;
    if(!row)return null;
    const user=db().prepare('SELECT email FROM admin_users WHERE id=?').get(row.user_id) as any;
    if(!ownerEmail()||user?.email!==ownerEmail()){db().prepare('DELETE FROM admin_email_challenges WHERE token_hash=?').run(row.token_hash);return null;}
    if(row.expires_at<=Date.now()||row.attempts>=5){db().prepare('DELETE FROM admin_email_challenges WHERE token_hash=?').run(row.token_hash);return null;}
    const matches=crypto.timingSafeEqual(Buffer.from(row.code_hash,'hex'),Buffer.from(codeHash(token,code),'hex'));
    if(!matches){db().prepare('UPDATE admin_email_challenges SET attempts=attempts+1 WHERE token_hash=?').run(row.token_hash);audit(row.user_id,'auth.email_code_failed','admin');return null;}
    db().prepare('DELETE FROM admin_email_challenges WHERE token_hash=?').run(row.token_hash);return row.user_id as string;
  });
  if(!result)throw new AdminError(401,'The email code is incorrect or expired.');
  return newSession(result);
}
