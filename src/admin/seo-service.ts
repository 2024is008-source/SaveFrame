import { db, transaction, audit, settingDefaults } from './db';
import { AdminError } from './auth';
import { seoCatalog, approvedImages } from './catalog';
import {isLegacyToolTitle, isLegacyToolDescription} from '../lib/legacy-tool-seo';
export interface SeoValues { title?:string; description?:string; targetKeyword?:string; ogTitle?:string; ogDescription?:string; image?:string; contentDescription?:string }
export function validateSeo(route: string, values: SeoValues): SeoValues {
  const page=seoCatalog().find(page=>page.route===route);
  if(!page) throw new AdminError(400,'Choose an existing public page.');
  if(!values || typeof values!=='object' || Array.isArray(values)) throw new AdminError(400,'Invalid SEO fields.');
  const limits:Record<string,number>={title:120,description:320,targetKeyword:200,ogTitle:160,ogDescription:500,image:250,contentDescription:1000};
  const result:SeoValues={};
  for(const [key,value] of Object.entries(values)) {
    if(!Object.hasOwn(limits,key) || typeof value!=='string' || value.length>limits[key] || /[<>\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(value)) throw new AdminError(400,'Invalid '+key+' field. Use plain text within the displayed limits.');
    if(key==='contentDescription' && value && !page.contentEditable) throw new AdminError(400,'This page description is not editable.');
    if(key==='image' && value && !approvedImages().includes(value)) throw new AdminError(400,'Choose an approved social image.');
    result[key]=value.trim();
  }
  return result;
}
export function seoEditor(route: string) {
  const page=seoCatalog().find(page=>page.route===route);
  if(!page) throw new AdminError(404,'Page not found.');
  const record=db().prepare('SELECT * FROM seo_overrides WHERE route=?').get(route) as any;
  const baseline={title:page.title,description:page.description,targetKeyword:page.keyword,ogTitle:page.title,ogDescription:page.description,image:page.image,contentDescription:page.contentEditable ? page.description : ''};
  const values=record?.draft_json ? JSON.parse(record.draft_json) : record?.published_json ? JSON.parse(record.published_json) : {...baseline};
  for(const key of ['title','ogTitle'] as const) if(isLegacyToolTitle(route,values[key])) values[key]=baseline[key];
  for(const key of ['description','ogDescription','contentDescription'] as const) if(isLegacyToolDescription(route,values[key])) values[key]=baseline[key];
  return {page,values,version:record?.version || 0,draft:Boolean(record?.draft_json),published:record?.published_json ? JSON.parse(record.published_json) : null,history:db().prepare('SELECT id,action,created_at FROM seo_revisions WHERE route=? ORDER BY id DESC LIMIT 100').all(route)};
}
export function saveSeo(route: string, values: SeoValues, action: 'draft'|'publish', actor: string, version: number) {
  const validated=validateSeo(route,values);
  return transaction(()=> {
    const current=db().prepare('SELECT * FROM seo_overrides WHERE route=?').get(route) as any;
    if((current?.version || 0)!==version) throw new AdminError(409,'This page changed in another tab. Reload before saving.');
    if(!current) {
      const baseline=seoEditor(route).values;
      db().prepare("INSERT INTO seo_revisions(route,data_json,action,created_at,actor_id) VALUES(?,?,'baseline',?,?)").run(route,JSON.stringify(baseline),Date.now(),actor);
    }
    const json=JSON.stringify(validated), now=Date.now(), next=version+1;
    db().prepare('INSERT INTO seo_overrides(route,draft_json,published_json,version,updated_at,updated_by) VALUES(?,?,?,?,?,?) ON CONFLICT(route) DO UPDATE SET draft_json=excluded.draft_json,published_json=excluded.published_json,version=excluded.version,updated_at=excluded.updated_at,updated_by=excluded.updated_by').run(route,action==='draft'?json:null,action==='publish'?json:current?.published_json || null,next,now,actor);
    db().prepare('INSERT INTO seo_revisions(route,data_json,action,created_at,actor_id) VALUES(?,?,?,?,?)').run(route,json,action,now,actor);
    audit(actor,'seo.'+action,route,'Revision '+next);
    return {version:next};
  });
}
export function restoreSeo(route: string, revision: number, actor: string, version: number) {
  const row=db().prepare('SELECT data_json FROM seo_revisions WHERE id=? AND route=?').get(revision,route) as any;
  if(!row) throw new AdminError(404,'Revision not found.');
  const result=saveSeo(route,JSON.parse(row.data_json),'draft',actor,version);
  audit(actor,'seo.restore_draft',route,'From history '+revision);
  return result;
}
export function saveSettings(input: Record<string,string>, actor: string) {
  if(!input || typeof input!=='object' || Array.isArray(input)) throw new AdminError(400,'Invalid settings.');
  for(const [key,value] of Object.entries(input)) {
    if(!Object.hasOwn(settingDefaults,key) || typeof value!=='string' || value.length>500 || /[<>\x00-\x1f]/.test(value)) throw new AdminError(400,'Unsupported setting.');
    if(key==='site_name' && (!value.trim() || value.length>60)) throw new AdminError(400,'Use a site name of 1–60 characters.');
    if(key==='contact_email' && (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value) || value.length>200)) throw new AdminError(400,'Enter a valid contact email.');
    if(key==='analytics_retention_days' && (!/^\d+$/.test(value) || Number(value)<7 || Number(value)>180)) throw new AdminError(400,'Analytics retention must be 7–180 days.');
    if(key==='default_tool' && !['photo','reels','video','audio','profile'].includes(value)) throw new AdminError(400,'Choose an existing tool.');
    if(key==='default_social_image' && !approvedImages().includes(value)) throw new AdminError(400,'Choose an approved image.');
    if(key==='default_description' && value.length>320) throw new AdminError(400,'Use a description of at most 320 characters.');
  }
  transaction(()=> { for(const [key,value] of Object.entries(input)) db().prepare('INSERT INTO public_settings VALUES(?,?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value,updated_at=excluded.updated_at').run(key,value.trim(),Date.now()); audit(actor,'settings.updated','website',Object.keys(input).join(', ')); });
}
