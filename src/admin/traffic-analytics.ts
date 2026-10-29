import {db, cleanup} from './db';
import {analyticsPath, analyticsCampaign} from '../lib/analytics';
import {analyticsPolicy} from '../lib/analytics-policy';
import {trafficReferrer} from '../lib/traffic-client';
import {countryCode} from '../lib/country';
import {colomboDay} from './country-analytics';
import {reportRange} from './analytics';

const referrers=new Set(['direct','internal','other','google','bing','duckduckgo','yahoo','instagram','facebook','linkedin','youtube','tiktok','twitter']);
export function trafficPermitted(headers: Pick<Headers,'get'>) {
  return headers.get('sec-gpc')!=='1'&&!['1','yes'].includes(headers.get('dnt')||'')&&!/(?:^|;\s*)sf_analytics_preference=denied(?:;|$)/.test(headers.get('cookie')||'')&&!/bot|crawler|spider|headless|lighthouse/i.test(headers.get('user-agent')||'');
}
export function trafficEnabled() { return process.env.NODE_ENV==='production'&&process.env.INTERNAL_TRAFFIC_ENABLED!=='0'; }

export function recordPageView(headers: Pick<Headers,'get'>, input: {path:string;referrer?:string;source?:string;medium?:string}) {
  if(!trafficEnabled()||!trafficPermitted(headers))return false;
  const [pathname,query='']=input.path.split('?');
  const path=analyticsPath(pathname,query);
  if(!path||path!==input.path)return false;
  const policy=analyticsPolicy(headers);
  const country=process.env.GA4_TRUST_REGION_HEADER==='1'?countryCode((headers.get('x-saveframe-country')||'').trim().toUpperCase()):'XX';
  const campaign=analyticsCampaign(new URLSearchParams({utm_source:input.source||'',utm_medium:input.medium||''}).toString(),policy);
  const ua=headers.get('user-agent')||'';
  const device=/ipad|tablet/i.test(ua)?'tablet':/mobile|iphone|android/i.test(ua)?'mobile':'desktop';
  // Coarse dimensions only, directly incremented; do not create a visitor/event log.
  db().prepare(`INSERT INTO daily_page_statistics(day,path,country_code,device,referrer,source,medium,ga4_policy,views)
    VALUES(?,?,?,?,?,?,?,?,1) ON CONFLICT DO UPDATE SET views=views+1`).run(colomboDay(Date.now()),path,country,device,referrers.has(input.referrer||'')?input.referrer!:'direct',campaign.campaign_source||'',campaign.campaign_medium||'',policy.automaticAllowed?'eligible':'restricted');
  cleanup();
  return true;
}

let warned=false;
export function recordDocumentView(headers: Pick<Headers,'get'>, origin: string) {
  if(headers.get('x-tiksave-document')!=='1')return;
  try {
    recordPageView(headers,{path:headers.get('x-tiksave-page')||'',referrer:trafficReferrer(headers.get('referer')||'',origin),source:headers.get('x-tiksave-source')||'',medium:headers.get('x-tiksave-medium')||''});
  } catch { if(!warned){warned=true;console.warn('[TikSaveMP4] Aggregate traffic storage unavailable.');} }
}

export function trafficReports(input: {from?:string;to?:string}={}) {
  const {from,to}=reportRange({from:input.from||colomboDay(Date.now()-29*86400000),to:input.to||colomboDay(Date.now())});
  const select=(columns:string,group:string)=>db().prepare(`SELECT ${columns},SUM(views) views FROM daily_page_statistics WHERE day>=? AND day<=? GROUP BY ${group} ORDER BY views DESC`).all(from,to);
  const total=db().prepare('SELECT COALESCE(SUM(views),0) views FROM daily_page_statistics WHERE day>=? AND day<=?').get(from,to);
  return {range:{from,to},timezone:'Asia/Colombo',source:'Internal aggregate page views (independent of Google Analytics)',total:Number(total?.views||0),daily:select('day','day'),pages:select('path','path'),countries:select('country_code','country_code'),devices:select('device','device'),referrers:select('referrer','referrer'),campaigns:select('source,medium','source,medium'),ga4Policy:select('ga4_policy','ga4_policy')};
}
