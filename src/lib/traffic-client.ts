import { analyticsPath, analyticsCampaign, consentKey, type AnalyticsOptions } from './analytics';

export function trafficReferrer(value: string, origin: string): string {
  try {
    const url=new URL(value);
    if(url.origin===origin)return 'internal';
    const host=url.hostname.replace(/^www\./,'');
    for(const source of ['google','bing','duckduckgo','yahoo','instagram','facebook','linkedin','youtube','tiktok','twitter']) {
      if(host===source+'.com'||host.endsWith('.'+source+'.com')||(source==='google'&&/^google\.[a-z.]{2,10}$/.test(host)))return source;
    }
    return 'other';
  } catch { return 'direct'; }
}

/** No visitor identity or storage: only SPA transitions, once per committed path.
 * Initial document requests are counted by the server, including without JS. */
export function createTrafficTracker(browser: Window, enabled: boolean, options: AnalyticsOptions) {
  const win=browser as Window & {__tiksaveTraffic?:{path:string|null}};
  const path=()=>analyticsPath(browser.location.pathname,browser.location.search);
  const state=win.__tiksaveTraffic ||= {path:path()};
  const campaign=analyticsCampaign(browser.location.search,options);
  return {page:()=>{
    const current=path(), previous=state.path;
    if(current===previous)return;
    state.path=current;
    let optedOut=false;
    try { optedOut=browser.localStorage.getItem(consentKey)==='denied'; } catch {}
    if(!enabled||!current||optedOut||/(?:^|;\s*)sf_analytics_preference=denied(?:;|$)/.test(browser.document.cookie)||['1','yes'].includes(browser.navigator.doNotTrack)||(browser.navigator as Navigator & {globalPrivacyControl?:boolean}).globalPrivacyControl||browser.navigator.webdriver||/bot|crawler|spider|headless|lighthouse/i.test(browser.navigator.userAgent))return;
    void browser.fetch('/api/analytics/page-view',{
      method:'POST',headers:{'Content-Type':'application/json'},credentials:'same-origin',keepalive:true,
      body:JSON.stringify({path:current,referrer:previous?'internal':trafficReferrer(browser.document.referrer,browser.location.origin),source:campaign.campaign_source||'',medium:campaign.campaign_medium||''}),
    }).catch(()=>{/* Statistics must not affect navigation; no retry that could duplicate counts. */});
  }};
}
