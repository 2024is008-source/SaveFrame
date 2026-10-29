import { NextResponse } from 'next/server';
import { revalidatePath } from 'next/cache';
import { resolveTxt } from 'node:dns/promises';
import { AdminError, authorize, loginChallenge, checkLoginChallenge, checkOrigin, verifyLoginCredentials, cookieName, challengeName, cookieOptions, readCookie, logout, manageTotp, adminOrigin } from '../../../../admin/auth';
import { beginEmailLogin,completeEmailLogin,emailChallengeName } from '../../../../admin/email-login';
import { db, settings, audit, cleanup } from '../../../../admin/db';
import { reports, reportCsv } from '../../../../admin/analytics';
import { countryReports, countryCsv } from '../../../../admin/country-analytics';
import { trafficReports } from '../../../../admin/traffic-analytics';
import { seoCatalog, approvedImages } from '../../../../admin/catalog';
import { seoEditor, saveSeo, restoreSeo, saveSettings } from '../../../../admin/seo-service';
import { saveVerification, verificationList, verificationFile, removeVerification, saveDnsRecord } from '../../../../admin/verification';
export const dynamic='force-dynamic';
export const runtime='nodejs';
type Context={params:Promise<{segments?:string[]}>};
const privateHeaders={ 'Cache-Control':'private, no-store, max-age=0', 'X-Robots-Tag':'noindex, nofollow, nosnippet', 'X-Content-Type-Options':'nosniff', 'X-Frame-Options':'DENY', 'Referrer-Policy':'no-referrer' };
const json=(value:any,status=200)=>NextResponse.json(value,{status,headers:privateHeaders});
async function body(request: Request) {
  if(!request.headers.get('content-type')?.startsWith('application/json')) throw new AdminError(415,'Send JSON data.');
  const reader=request.body?.getReader(); if(!reader) throw new AdminError(400,'Empty request.');
  let text='',size=0; const decoder=new TextDecoder();
  while(true) { const part=await reader.read(); if(part.done) break; size+=part.value.length; if(size>24576) {await reader.cancel();throw new AdminError(413,'The request is too large.');} text+=decoder.decode(part.value,{stream:true}); }
  try { const value=JSON.parse(text+decoder.decode()); if(!value || typeof value!=='object' || Array.isArray(value)) throw Error(); return value; } catch {throw new AdminError(400,'Invalid JSON data.');}
}
function query(request: Request) { return Object.fromEntries(new URL(request.url).searchParams.entries()); }
async function handler(request: Request,context: Context) {
  try {
    const action=((await context.params).segments || []).join('/');
    if(request.method==='GET' && action==='auth/csrf') {
      const challenge=loginChallenge(), response=json({csrf:challenge.csrf});
      response.cookies.set(challengeName(request),challenge.cookie,cookieOptions(request,900)); return response;
    }
    if(request.method==='POST' && action==='auth/login') {
      checkOrigin(request); const input=await body(request);
      checkLoginChallenge(input.csrf,readCookie(request,challengeName(request)));
      if(typeof input.email!=='string' || typeof input.password!=='string' || typeof(input.otp || '')!=='string') throw new AdminError(400,'Invalid login fields.');
      // Hashing buckets is handled by authenticate; raw IPs never enter analytics or audit records.
      const ip=request.headers.get('x-forwarded-for')?.split(',')[0].trim().slice(0,100) || 'local';
      const user=await verifyLoginCredentials(input.email,input.password,input.otp || '',ip);
      const challenge=await beginEmailLogin(user);
      const response=json({ok:true,emailRequired:true});response.cookies.set(emailChallengeName(request),challenge.token,cookieOptions(request,300));return response;
    }
    if(request.method==='POST' && action==='auth/email/verify') {
      checkOrigin(request);const input=await body(request);checkLoginChallenge(input.csrf,readCookie(request,challengeName(request)));
      const session=completeEmailLogin(readCookie(request,emailChallengeName(request)),input.code);
      const response=json({ok:true});response.cookies.set(cookieName(request),session.token,cookieOptions(request));
      response.cookies.set(emailChallengeName(request),'',cookieOptions(request,0));response.cookies.set(challengeName(request),'',cookieOptions(request,0));return response;
    }
    const session=authorize(request,request.method!=='GET');
    if(request.method==='GET') {
      const parameters=query(request);
      if(action==='session') return json({email:session.email,csrf:session.csrf_token,totpEnabled:Boolean(session.totp_enabled)});
      if(action==='reports') return json(reports(parameters));
      if(action==='reports/traffic') return json(trafficReports(parameters));
      if(action==='reports/countries') return json(countryReports(parameters));
      if(action==='reports/countries/export') {
        audit(session.user_id,'reports.exported','country-statistics');
        return new NextResponse(countryCsv(parameters),{headers:{...privateHeaders,'Content-Type':'text/csv; charset=utf-8','Content-Disposition':'attachment; filename="saveframe-country-report.csv"'}});
      }
      if(action==='reports/export') { audit(session.user_id,'reports.exported','daily-statistics'); return new NextResponse(reportCsv(parameters),{headers:{...privateHeaders,'Content-Type':'text/csv; charset=utf-8','Content-Disposition':'attachment; filename="saveframe-report.csv"'}}); }
      if(action==='seo') return json(parameters.route ? seoEditor(parameters.route) : {pages:seoCatalog(),images:approvedImages()});
      if(action==='verification') return json({files:verificationList()});
      if(action==='settings') return json({settings:settings(),images:approvedImages()});
      if(action==='audit') {
        const page=Math.max(1,Math.min(100000,parseInt(parameters.page || '1') || 1)), search=String(parameters.q || '').slice(0,100);
        const filter=search?' WHERE a.action LIKE ? OR a.target LIKE ?':'', values=search?['%'+search+'%','%'+search+'%']:[];
        const count=Number((db().prepare('SELECT COUNT(*) count FROM admin_audit_events a'+filter).get(...values) as any).count);
        const rows=db().prepare('SELECT a.id,a.action,a.target,a.detail,a.created_at,u.email actor FROM admin_audit_events a LEFT JOIN admin_users u ON a.actor_id=u.id'+filter+' ORDER BY a.id DESC LIMIT 30 OFFSET ?').all(...values,(page-1)*30);
        return json({rows,count,page,pages:Math.max(1,Math.ceil(count/30))});
      }
    }
    if(request.method==='POST') {
      if(action==='auth/logout') { logout(session); const response=json({ok:true}); response.cookies.set(cookieName(request),'',cookieOptions(request,0)); return response; }
      const input=await body(request);
      if(action.startsWith('auth/totp/')) return json(await manageTotp(session,action.split('/').at(-1)!,input.password,input.code || ''));
      if(action==='seo') {
        if(!['draft','publish','restore'].includes(input.action) || !Number.isInteger(input.version) || input.version<0) throw new AdminError(400,'Invalid SEO action or version.');
        const result=input.action==='restore' ? restoreSeo(input.route,Number(input.revision),session.user_id,input.version) : saveSeo(input.route,input.values,input.action,session.user_id,input.version);
        if(input.action==='publish') { revalidatePath(input.route); if(input.route.startsWith('/blog/')) revalidatePath('/blog'); }
        return json({...result,ok:true});
      }
      if(action==='settings') { saveSettings(input.settings,session.user_id); revalidatePath('/','layout'); return json({ok:true}); }
      if(action==='cleanup') { cleanup(true); audit(session.user_id,'analytics.cleanup','retention'); return json({ok:true}); }
      if(action==='verification') { const result=saveVerification(input.filename,input.content,session.user_id,input.version || 0); return json({...result,ok:true}); }
      if(action==='verification/delete') { removeVerification(input.filename,Number(input.version),session.user_id); return json({ok:true}); }
      if(action==='verification/check') {
        const file=verificationFile(input.filename); if(!file) throw new AdminError(404,'Verification file not found.');
        let verified=false;
        try { const response=await fetch(new URL('/'+file.filename,adminOrigin(request)),{cache:'no-store',redirect:'error',signal:AbortSignal.timeout(10000)}); verified=response.status===200 && await response.text()===file.content; } catch { /* Explicitly report an unavailable public origin. */ }
        db().prepare('UPDATE verification_files SET verified_at=? WHERE filename=?').run(verified?Date.now():null,file.filename);
        audit(session.user_id,'verification.checked',file.filename,verified?'Public URL matched':'Public URL did not match');
        return json({verified,url:new URL('/'+file.filename,adminOrigin(request)).href});
      }
      if(action==='verification/dns') { saveDnsRecord(input.token,session.user_id); return json({ok:true}); }
      if(action==='verification/dns-check') {
        const record=db().prepare("SELECT content FROM verification_files WHERE filename='dns:google' AND active=1").get() as any;
        if(!record) throw new AdminError(404,'Save the DNS TXT value first.');
        const hostname=new URL(process.env.NEXT_PUBLIC_SITE_URL || 'https://saveframe.site').hostname;
        let verified=false; try { const records=await resolveTxt(hostname); verified=records.some(parts=>parts.join('')===record.content); } catch { /* DNS may not have propagated. */ }
        db().prepare("UPDATE verification_files SET verified_at=? WHERE filename='dns:google'").run(verified?Date.now():null);
        audit(session.user_id,'verification.dns_checked',hostname,verified?'TXT value found':'TXT value not found'); return json({verified,hostname});
      }
    }
    throw new AdminError(404,'Admin endpoint not found.');
  } catch(error) {
    const known=error instanceof AdminError;
    if(!known) console.error('[SaveFrame admin] Request could not be completed.');
    return json({error:known?error.message:'Unable to complete this action. Check the server configuration.'},known?error.status:500);
  }
}
export const GET=handler;
export const POST=handler;
