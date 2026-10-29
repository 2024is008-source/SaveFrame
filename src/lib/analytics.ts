import tools from '../content/tools.json';
import information from '../content/information.json';
import posts from '../content/blog/posts.json';
import { locales } from '../i18n/config';

export const consentKey = 'saveframe.analytics.consent';
const routes = new Set(['/', '/blog', ...locales.filter(locale=>locale!=='en').map(locale=>`/${locale}`), ...tools.map(tool=>`/${tool.slug}`), ...information.map(page=>`/${page.slug}`), ...posts.filter(post=>post.published).map(post=>`/blog/${post.slug}`)]);
const categories = new Set(['audio','reel','reels','video','photo','carousel','zip','profile','unknown']);
const codes = new Set(['INVALID_URL','UNSUPPORTED_OPERATION','UNSUPPORTED_MEDIA_TYPE','LOGIN_REQUIRED','PRIVATE_CONTENT','DELETED_CONTENT','RATE_LIMITED','EXTRACTOR_FAILURE','DOWNLOAD_TIMEOUT','FILE_TOO_LARGE','JOB_CANCELLED','INTERNAL_ERROR','YTDLP_NOT_INSTALLED','FFMPEG_ERROR','INSUFFICIENT_DISK_SPACE','PROCESS_RESTARTED','DELIVERY_STREAM_ERROR']);
export function analyticsPath(pathname:string,search=''):string|null {
  const clean=pathname.length>1?pathname.replace(/\/+$/,''):pathname;
  if(!routes.has(clean))return null;
  const page=new URLSearchParams(search).get('page');
  return clean==='/blog'&&page&&/^[1-9][0-9]{0,3}$/.test(page)&&Number(page)>1?clean+'?page='+Number(page):clean;
}
export interface AnalyticsOptions {automaticAllowed?:boolean;campaigns?:Partial<Record<'source'|'medium'|'name'|'content'|'term',string[]>>}
export function analyticsReferrer(value:string,origin:string){
  try{
    const url=new URL(value);
    if(!['http:','https:'].includes(url.protocol)||url.username||url.password||url.port||!url.hostname.includes('.')||/^[\d.]+$/.test(url.hostname)||url.hostname.includes(':')||/\.(?:local|internal|localhost)$/.test(url.hostname))return '';
    if(url.origin===origin){const page=analyticsPath(url.pathname,url.search);return page?origin+page:'';}
    return url.origin+'/';
  }catch{return '';}
}
export function analyticsCampaign(search:string,options:AnalyticsOptions={}){
  const params=new URLSearchParams(search),result:Record<string,string>={};
  for(const key of ['source','medium','name','content','term'] as const){
    const query='utm_'+(key==='name'?'campaign':key),values=params.getAll(query);
    if(values.length===1&&/^[A-Za-z][A-Za-z0-9_-]{0,63}$/.test(values[0])&&options.campaigns?.[key]?.includes(values[0]))result['campaign_'+key]=values[0];
  }
  // Do not create partial campaigns that obscure an otherwise valid referral.
  return result.campaign_source&&result.campaign_medium?result:{};
}
export function analyticsEvent(name:unknown, input:Record<string,unknown>={}) {
  if(!['audio_conversion_started','download_started','download_prepared','download_delivered','media_previewed','media_resolved','download_failed'].includes(String(name)))return null;
  if(!input||typeof input!=='object')input={};
  const category=categories.has(String(input.media_type))?String(input.media_type):'unknown';
  const params:Record<string,string>={media_type:category==='reels'?'reel':category};
  if (name !== 'media_resolved') {
    const format = String(input.download_format).toLowerCase();
    params.download_format = ['mp3','mp4','m4a','jpg','jpeg','png','webp','zip'].includes(format) ? format === 'jpeg' ? 'jpg' : format : 'unknown';
    params.download_method = name === 'media_previewed' ? 'preview' : input.download_method === 'bulk' ? 'bulk' : 'single';
    params.download_status = name === 'audio_conversion_started' ? 'converting' : name === 'download_started' ? 'requested' : name === 'download_prepared' ? 'prepared' : name === 'download_delivered' ? 'handed_off' : name === 'media_previewed' ? 'viewed' : ['JOB_CANCELLED','DELIVERY_CANCELLED'].includes(String(input.error_code)) ? 'cancelled' : 'failed';
    params.source_page = typeof input.source_page === 'string' ? analyticsPath(input.source_page) || 'unknown' : 'unknown';
  }
  if(name==='download_failed'){
    params.failure_stage=input.failure_stage==='resolve'?'resolve':input.failure_stage==='handoff'?'handoff':'download';
    params.error_code=codes.has(String(input.error_code)) || ['DELIVERY_CANCELLED','FILE_UNAVAILABLE'].includes(String(input.error_code)) ? String(input.error_code) : 'UNKNOWN';
  }
  return {name:String(name),params};
}

// This controller has no dependency on React or the downloader's private data.
export function createAnalytics(browser:Window, id:string, origin:string, production:boolean, load:()=>void,options:AnalyticsOptions={}, onConsentRequired:(required:boolean)=>void=()=>{}) {
  const win=browser as Window & {saveframeDataLayer?:unknown[];SaveFrameAnalytics?:{setConsent:(value:'granted'|'denied')=>void};[key:`ga-disable-${string}`]:boolean};
  type Runtime={configured:boolean;lastPath:string|null;referrer:string;entryReferrer:string;campaign:Record<string,string>;operations?:WeakMap<object,Set<string>>;stop?:()=>void};
  const runtimeWindow=win as typeof win & {__saveframeGa4?:Runtime};
  const state=runtimeWindow.__saveframeGa4 ||= {configured:false,lastPath:null,referrer:'',entryReferrer:analyticsReferrer(browser.document.referrer||'',origin),campaign:analyticsCampaign(browser.location.search,options)};
  state.stop?.();
  let consent:'granted'|'denied'|'unset'='unset', disposed=false;
  const tag=function(..._args:unknown[]){win.saveframeDataLayer ||= [];win.saveframeDataLayer.push(arguments);};
  const preferenceDenied=()=>['1','yes'].includes(browser.navigator.doNotTrack)||(browser.navigator as Navigator & {globalPrivacyControl?:boolean}).globalPrivacyControl===true;
  const currentPath=()=>analyticsPath(browser.location.pathname,browser.location.search);
  const permitted=()=>consent==='granted'||(consent==='unset'&&options.automaticAllowed===true);
  const allowed=()=>!disposed&&production&&/^G-[A-Z0-9]+$/.test(id)&&browser.location.origin===origin&&origin==='https://saveframe.site'&&permitted()&&!preferenceDenied()&&!browser.navigator.webdriver&&!/bot|crawler|spider|lighthouse|headless/i.test(browser.navigator.userAgent||'')&&currentPath()!==null;
  const fields=()=>({page_location:origin+currentPath(),page_referrer:state.referrer,page_title:'SaveFrame',send_to:id});
  const updateConsentPrompt=()=>onConsentRequired(production&&/^G-[A-Z0-9]+$/.test(id)&&browser.location.origin===origin&&origin==='https://saveframe.site'&&consent==='unset'&&!options.automaticAllowed&&!preferenceDenied()&&!browser.navigator.webdriver&&!/bot|crawler|spider|lighthouse|headless/i.test(browser.navigator.userAgent||'')&&currentPath()!==null);
  const page=()=>{
    updateConsentPrompt();
    if(browser.location.pathname==='/privacy'&&new URLSearchParams(browser.location.search).get('analytics')==='off'&&consent!=='denied'){setConsent('denied');return;}
    if(!allowed()){win[`ga-disable-${id}`]=true;state.lastPath=null;return;}
    win[`ga-disable-${id}`]=false;
    const path=currentPath();
    if(path!==state.lastPath)state.referrer=state.lastPath?origin+state.lastPath:state.entryReferrer;
    if(!state.configured){
      tag('consent','default',{analytics_storage:'denied',ad_storage:'denied',ad_user_data:'denied',ad_personalization:'denied'});
      tag('consent','update',{analytics_storage:'granted',ad_storage:'denied',ad_user_data:'denied',ad_personalization:'denied'});
      tag('js',new Date());
      tag('set',{...fields(),send_page_view:false,allow_google_signals:false,allow_ad_personalization_signals:false,ads_data_redaction:true,url_passthrough:false});
      tag('config',id,{...fields(),...state.campaign,send_page_view:false,allow_google_signals:false,allow_ad_personalization_signals:false,cookie_expires:15552000,cookie_update:false,cookie_flags:'SameSite=Lax;Secure'});
      state.configured=true;load();
    }
    if(path===state.lastPath)return;
    tag('set',fields());tag('event','page_view',fields());state.lastPath=path;
  };
  const eraseCookies=()=>{
    for(const cookie of browser.document.cookie.split(';')){
      const name=cookie.trim().split('=')[0];if(!/^_ga(?:_|$)/.test(name))continue;
      for(const domain of ['',`; Domain=${browser.location.hostname}`,`; Domain=.${browser.location.hostname}`])browser.document.cookie=`${name}=; Max-Age=0; Path=/${domain}; SameSite=Lax; Secure`;
    }
  };
  const apply=()=>{
    updateConsentPrompt();
    // Preference only, without a visitor identifier. Internal country reporting
    // can respect the same opt-out without depending on GA enablement or receipt.
    const preference=preferenceDenied()?'denied':consent;
    browser.document.cookie=`sf_analytics_preference=${preference==='unset'?'':preference}; Max-Age=${preference==='unset'?0:15552000}; Path=/; SameSite=Lax; Secure`;
    if(!permitted()||preferenceDenied()){
      win[`ga-disable-${id}`]=true;
      if(state.configured)tag('consent','update',{analytics_storage:'denied',ad_storage:'denied',ad_user_data:'denied',ad_personalization:'denied'});
      // Google patches this array's push method. Preserve its identity across
      // withdrawal/regrant, clearing queued commands without disconnecting it.
      if(win.saveframeDataLayer)win.saveframeDataLayer.length=0;
      state.configured=false;state.lastPath=null;eraseCookies();return;
    }
    page();
  };
  const setConsent=(value:'granted'|'denied')=>{
    consent=value==='granted'?'granted':'denied';
    try{browser.localStorage.setItem(consentKey,consent);}catch{}
    apply();
  };
  const readPreference=()=>{
    let value:string|null=null;
    try{value=browser.localStorage.getItem(consentKey);}catch{ /* Preserve an existing opt-out cookie when storage is unavailable. */ }
    const denied=browser.document.cookie.split(';').some(value=>value.trim()==='sf_analytics_preference=denied');
    return value==='granted'?'granted':value==='denied'||denied?'denied':'unset';
  };
  const onStorage=(event:StorageEvent)=>{if(event.key===consentKey||event.key===null){consent=readPreference();apply();}};
  const onConsent=(event:Event)=>setConsent((event as CustomEvent).detail?.analytics==='granted'?'granted':'denied');
  const onEvent=(event:Event)=>{
    if(!allowed()){page();return;}
    const detail=(event as CustomEvent).detail;
    const safe=analyticsEvent(detail?.name,detail?.params);
    if(safe){
      const operation=detail?.operation;
      if(operation && typeof operation==='object'){
        state.operations ||= new WeakMap();
        const sent=state.operations.get(operation) || new Set<string>();
        if(sent.has(safe.name))return;
        sent.add(safe.name);state.operations.set(operation,sent);
      }
      page();tag('event',safe.name,{...safe.params,...fields()});
    }
  };
  consent=readPreference();
  if(browser.location.pathname==='/privacy'&&new URLSearchParams(browser.location.search).get('analytics')==='off'){consent='denied';try{browser.localStorage.setItem(consentKey,'denied');}catch{}}
  const api={setConsent};win.SaveFrameAnalytics=api;
  browser.addEventListener('storage',onStorage);browser.addEventListener('saveframe:analytics-consent',onConsent);browser.addEventListener('saveframe:analytics-event',onEvent);
  if(state.configured&&allowed())load();
  apply();
  const dispose=()=>{if(disposed)return;disposed=true;win[`ga-disable-${id}`]=true;browser.removeEventListener('storage',onStorage);browser.removeEventListener('saveframe:analytics-consent',onConsent);browser.removeEventListener('saveframe:analytics-event',onEvent);if(win.SaveFrameAnalytics===api)delete win.SaveFrameAnalytics;if(state.stop===dispose)state.stop=undefined;};
  state.stop=dispose;
  return {page,dispose};
}
