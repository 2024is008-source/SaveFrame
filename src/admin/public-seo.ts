import type { Metadata } from 'next';
import { unstable_noStore as noStore } from 'next/cache';
import { db, publicSettings } from './db';
import { absoluteUrl } from '../lib/site';
import { searchTitle } from '../lib/search-title';
export function publishedSeo(route: string): any {
  noStore();
  if(process.env.SAVEFRAME_DISABLE_SEO_OVERRIDES==='1') return null;
  try { const row=db().prepare('SELECT published_json FROM seo_overrides WHERE route=?').get(route) as any; return row?.published_json ? JSON.parse(row.published_json) : null; }
  catch { return null; }
}
export function pageDescription(route: string, original: string) { return publishedSeo(route)?.contentDescription || original; }
export function applySeo(route: string, base: Metadata): Metadata {
  const value=publishedSeo(route) || {}, site=publicSettings();
  const originalTitle=typeof base.title==='string' ? searchTitle(route,base.title) : '';
  const title=value.title || (originalTitle ? site.siteName!=='TikSaveMP4' ? originalTitle.replace(/TikSaveMP4/g,site.siteName) : originalTitle : base.title);
  const description=value.description || base.description || site.defaultDescription;
  const graph:any=base.openGraph || {}, twitter:any=base.twitter || {};
  const chosen=value.image || (site.defaultSocialImage!=='/social/tiksave.png' && (!graph.images || JSON.stringify(graph.images).includes('/social/tiksave.png')) ? site.defaultSocialImage : null);
  const image=chosen ? {url:absoluteUrl(chosen),width:1200,height:chosen.startsWith('/images/blog/')?900:630} : null;
  return {...base,title,description,openGraph:{...graph,siteName:site.siteName,title:value.ogTitle || title,description:value.ogDescription || description,...(image?{images:[image]}:{})},twitter:{...twitter,title:value.ogTitle || title,description:value.ogDescription || description,...(image?{images:[image.url]}:{})}};
}
export function publicBrandMarkup(markup: string) {
  const site=publicSettings();
  if(site.siteName==='TikSaveMP4') return markup;
  const escaped=site.siteName.replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]!));
  return markup.split(/(<script\b[\s\S]*?<\/script>)/gi).map(part=>part.startsWith('<script') ? part : part.replace(/>([^<]*)</g,(_,text)=>'>'+text.replace(/TikSaveMP4/g,escaped)+'<')).join('');
}
