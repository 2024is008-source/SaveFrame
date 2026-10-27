import crypto from 'node:crypto';
import { db, transaction, cleanup } from './db';
import { AdminError } from './auth';
import { countryCode } from '../lib/country';
import { rebuildCountryDay } from './country-analytics';
export const mediaKinds = ['audio','reel','video','photo','carousel','story','profile','unknown'];
// Expected access restrictions, input rejections and visitor cancellations are not system faults.
export const systemFailureCodes=['INTERNAL_ERROR','YTDLP_NOT_INSTALLED','FFMPEG_ERROR','INSUFFICIENT_DISK_SPACE','PROCESS_RESTARTED','DELIVERY_STREAM_ERROR'];
const systemFailureCondition="error_code IN ('"+systemFailureCodes.join("','")+"')";
const events = new Set(['request_received','media_resolution_started','media_resolution_succeeded','media_resolution_failed','download_requested','download_started','audio_conversion_started','media_prepared','download_failed','delivery_started','delivery_completed','delivery_failed']);
declare global { var __saveframeAnalyticsRuntime: string | undefined; }
const runtime = () => global.__saveframeAnalyticsRuntime ||= crypto.randomUUID();
const kind = (value: string) => mediaKinds.includes(value) ? value : 'unknown';
const errorCode = (value?: string) => /^[A-Z_]{2,60}$/.test(value || '') ? value : 'EXTRACTOR_FAILURE';
function dayOf(time: number) { return new Date(time).toISOString().slice(0,10); }
function rebuildDay(time: number) {
  const day=dayOf(time), start=Date.parse(day+'T00:00:00Z');
  db().prepare('DELETE FROM daily_statistics WHERE day=?').run(day);
  db().prepare(`INSERT INTO daily_statistics SELECT ?,media_type,COUNT(*),SUM(prepared_at IS NOT NULL),SUM(failed_at IS NOT NULL),SUM(delivered_at IS NOT NULL),COALESCE(SUM(CASE WHEN prepared_at IS NOT NULL THEN duration_ms ELSE 0 END),0),SUM(prepared_at IS NOT NULL) FROM download_requests WHERE requested_at>=? AND requested_at<? GROUP BY media_type`).run(day,start,start+86400000);
}
export function recordEvent(id: string, event: string, type='unknown', jobId: string|null=null, code: string|null=null, duration: number|null=null, country='XX', zip=false) {
  if(!events.has(event)) throw Error('Unknown analytics event');
  const now=Date.now(); type=kind(type);
  transaction(()=> {
    const original=db().prepare('SELECT country_code FROM download_requests WHERE id=?').get(id) || db().prepare('SELECT country_code FROM download_events WHERE correlation_id=? ORDER BY id LIMIT 1').get(id);
    country=countryCode(original?.country_code ?? country);
    const inserted=db().prepare('INSERT OR IGNORE INTO download_events(correlation_id,job_id,event_type,media_type,error_code,duration_ms,created_at,country_code) VALUES(?,?,?,?,?,?,?,?)').run(id,jobId,event,type,code ? errorCode(code) : null,duration,now,country);
    if(!inserted.changes) return;
    if(event==='download_requested') db().prepare('INSERT OR IGNORE INTO download_requests(id,runtime_id,media_type,requested_at,country_code,is_zip) VALUES(?,?,?,?,?,?)').run(id,runtime(),type,now,country,zip?1:0);
    const request=db().prepare('SELECT * FROM download_requests WHERE id=?').get(id) as any;
    if(!request) return;
    if(event==='download_started') db().prepare("UPDATE download_requests SET status='processing',started_at=?,job_id=COALESCE(?,job_id) WHERE id=?").run(now,jobId,id);
    if(event==='media_prepared') db().prepare("UPDATE download_requests SET status='prepared',prepared_at=?,duration_ms=? WHERE id=? AND prepared_at IS NULL").run(now,duration ?? Math.max(0,now-(request.started_at || request.requested_at)),id);
    if(event==='download_failed' && !request.prepared_at) db().prepare("UPDATE download_requests SET status='failed',failed_at=?,error_code=? WHERE id=?").run(now,errorCode(code || ''),id);
    if(event==='delivery_completed') db().prepare("UPDATE download_requests SET status='delivered',delivered_at=COALESCE(delivered_at,?) WHERE id=?").run(now,id);
    if(event==='delivery_failed') db().prepare('UPDATE download_requests SET delivery_failed_at=COALESCE(delivery_failed_at,?) WHERE id=?').run(now,id);
    rebuildDay(request.requested_at);
    rebuildCountryDay(request.requested_at);
  });
}
let warned=false;
function bestEffort(operation:()=>void) {
  if(process.env.SAVEFRAME_ANALYTICS_DISABLED==='1' || process.env.NODE_ENV==='test') return;
  try { operation(); cleanup(); } catch { if(!warned) { warned=true; console.warn('[SaveFrame] Operational analytics storage is unavailable.'); } }
}
export function beginDownload(type='unknown', country='XX', zip=false) { const id=crypto.randomUUID(); bestEffort(()=>recordEvent(id,'download_requested',type,null,null,null,country,zip)); return id; }
export function beginResolution(country='XX') { const id=crypto.randomUUID(); bestEffort(()=>{recordEvent(id,'request_received','unknown',null,null,null,country);recordEvent(id,'media_resolution_started');}); return id; }
export function resolveEvent(id: string, success: boolean, type: string, code?: string, duration?: number) { bestEffort(()=>recordEvent(id,success?'media_resolution_succeeded':'media_resolution_failed',type,null,code || null,duration ?? null)); }
/** API rejections before a download job exists; never retain submitted input. */
const rejectedRateSamples=new Map<string,number>();
export function apiFailure(event: 'media_resolution_failed' | 'download_failed', type: string, code: string, country='XX') {
  // Record the reason without turning rejected traffic into unbounded SQLite writes.
  if(code==='RATE_LIMITED'){
    const key=event+':'+kind(type),now=Date.now();
    if(now-(rejectedRateSamples.get(key)||0)<60000)return;
    rejectedRateSamples.set(key,now);
  }
  bestEffort(()=>recordEvent(crypto.randomUUID(),event,type,null,code,null,country));
}
export function attachJob(id: string, jobId: string, type: string, zip?: boolean) {
  bestEffort(()=>transaction(()=> {
    const row=db().prepare('SELECT requested_at FROM download_requests WHERE id=?').get(id) as any;
    if(!row) return;
    db().prepare("UPDATE download_requests SET job_id=?,media_type=?,status=CASE WHEN status='received' THEN 'queued' ELSE status END,runtime_id=? WHERE id=?").run(jobId,kind(type),runtime(),id);
    db().prepare('UPDATE download_events SET job_id=?,media_type=? WHERE correlation_id=?').run(jobId,kind(type),id);
    if(zip !== undefined) db().prepare('UPDATE download_requests SET is_zip=? WHERE id=?').run(zip?1:0,id);
    rebuildDay(row.requested_at);
    rebuildCountryDay(row.requested_at);
  }));
}
export function jobEvent(id: string|undefined, event: string, jobId: string|null, type: string, code?: string, duration?: number) { if(id) bestEffort(()=>recordEvent(id,event,type,jobId,code || null,duration ?? null)); }
export function recoverInterruptedJobs() {
  bestEffort(()=> {
    const interrupted=db().prepare("SELECT id,job_id,media_type FROM download_requests WHERE status IN ('queued','processing') AND runtime_id<>?").all(runtime()) as any[];
    for(const row of interrupted) recordEvent(row.id,'download_failed',row.media_type,row.job_id,'PROCESS_RESTARTED');
  });
}
export interface ReportFilter { from?:string; to?:string; type?:string; status?:string; page?:string|number }
export function reportRange(input: ReportFilter={}) {
  const today=dayOf(Date.now()), defaultFrom=dayOf(Date.now()-29*86400000);
  const from=input.from || defaultFrom, to=input.to || today;
  for(const day of [from,to]) if(!/^\d{4}-\d{2}-\d{2}$/.test(day) || !Number.isFinite(Date.parse(day)) || dayOf(Date.parse(day))!==day) throw new AdminError(400,'Use valid dates in YYYY-MM-DD format.');
  if(from>to || Date.parse(to)-Date.parse(from)>729*86400000) throw new AdminError(400,'Choose a date range of up to 730 days.');
  if(input.type && !mediaKinds.includes(input.type)) throw new AdminError(400,'Unknown media type.');
  if(input.status && !['received','queued','processing','prepared','failed','delivered'].includes(input.status)) throw new AdminError(400,'Unknown status.');
  return {from,to,start:Date.parse(from),end:Date.parse(to)+86400000,type:input.type || '',status:input.status || '',page:Math.min(100000,Math.max(1,parseInt(String(input.page || 1)) || 1))};
}
export function reports(input: ReportFilter={}) {
  cleanup(); const range=reportRange(input), connection=db();
  const filter=range.type ? ' AND media_type=?' : '', values:any[]=[range.from,range.to,...(range.type?[range.type]:[])];
  const totals=connection.prepare(`SELECT COALESCE(SUM(requests),0) requests,COALESCE(SUM(prepared),0) prepared,COALESCE(SUM(failed),0) failed,COALESCE(SUM(delivered),0) delivered,COALESCE(SUM(processing_ms),0) processing_ms,COALESCE(SUM(processing_samples),0) samples FROM daily_statistics WHERE day>=? AND day<=?${filter}`).get(...values) as any;
  const daily=connection.prepare(`SELECT day,SUM(requests) requests,SUM(prepared) prepared,SUM(failed) failed FROM daily_statistics WHERE day>=? AND day<=?${filter} GROUP BY day ORDER BY day`).all(...values) as any[];
  const distribution=connection.prepare(`SELECT media_type,SUM(requests) count FROM daily_statistics WHERE day>=? AND day<=?${filter} GROUP BY media_type ORDER BY count DESC`).all(...values);
  const errors=connection.prepare(`SELECT error_code,COUNT(*) count FROM download_events WHERE created_at>=? AND created_at<? AND ${systemFailureCondition}${filter} GROUP BY error_code ORDER BY count DESC LIMIT 30`).all(range.start,range.end,...(range.type?[range.type]:[]));
  const errorCount=Number((connection.prepare(`SELECT COUNT(*) count FROM download_events WHERE created_at>=? AND created_at<? AND error_code IS NOT NULL${filter}`).get(range.start,range.end,...(range.type?[range.type]:[])) as any).count);
  const issueReasons=connection.prepare(`SELECT error_code,COUNT(*) count FROM download_events WHERE created_at>=? AND created_at<? AND error_code IS NOT NULL${filter} GROUP BY error_code ORDER BY count DESC,error_code`).all(range.start,range.end,...(range.type?[range.type]:[]));
  const errorPages=Math.max(1,Math.ceil(errorCount/25)),errorPage=Math.min(range.page,errorPages);
  const recentErrors=connection.prepare(`SELECT event_type,media_type,error_code,created_at,job_id FROM download_events WHERE created_at>=? AND created_at<? AND error_code IS NOT NULL${filter} ORDER BY id DESC LIMIT 25 OFFSET ?`).all(range.start,range.end,...(range.type?[range.type]:[]),(errorPage-1)*25);
  const where=`requested_at>=? AND requested_at<?${filter}${range.status?' AND status=?':''}`;
  const recentValues:any[]=[range.start,range.end,...(range.type?[range.type]:[]),...(range.status?[range.status]:[])];
  const count=Number((connection.prepare(`SELECT COUNT(*) count FROM download_requests WHERE ${where}`).get(...recentValues) as any).count);
  const page=Math.min(range.page,Math.max(1,Math.ceil(count/25)));
  const recent=connection.prepare(`SELECT id,job_id,media_type,status,requested_at,prepared_at,delivered_at,error_code,duration_ms FROM download_requests WHERE ${where} ORDER BY requested_at DESC LIMIT 25 OFFSET ?`).all(...recentValues,(page-1)*25);
  const active=Number((connection.prepare("SELECT COUNT(*) count FROM download_requests WHERE status IN ('queued','processing')").get() as any).count);
  const periods=Object.fromEntries([['today',0],['week',6],['month',29]].map(([label,days])=>[label,Number((connection.prepare('SELECT COALESCE(SUM(requests),0) count FROM daily_statistics WHERE day>=? AND day<=?').get(dayOf(Date.now()-Number(days)*86400000),dayOf(Date.now())) as any).count)]));
  return {range:{...range,page},totals:{...totals,systemFailures:errors.reduce<number>((sum,row)=>sum+Number(row.count),0),success:totals.prepared+totals.failed ? totals.prepared/(totals.prepared+totals.failed)*100 : null,average:totals.samples ? totals.processing_ms/totals.samples : null,active},daily,distribution,errors,issueReasons,recentErrors,errorCount,errorPages,errorPage,recent,count,pages:Math.max(1,Math.ceil(count/25)),periods};
}
export function reportCsv(input: ReportFilter={}) {
  const {from,to,type}=reportRange(input);
  const rows=db().prepare(`SELECT day,media_type,requests,prepared,failed,delivered,processing_ms,processing_samples FROM daily_statistics WHERE day>=? AND day<=?${type?' AND media_type=?':''} ORDER BY day,media_type`).all(from,to,...(type?[type]:[])) as any[];
  const headers=['day','media_type','requests','prepared','failed','delivered','processing_ms','processing_samples'];
  return [headers.join(','),...rows.map(row=>headers.map(key=>'"'+String(row[key]).replace(/"/g,'""')+'"').join(','))].join('\r\n');
}
