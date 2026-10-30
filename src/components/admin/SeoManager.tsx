'use client';
/* eslint-disable @next/next/no-img-element -- Approved local social preview images. */
import Link from 'next/link';
import {useState} from 'react';
import {ArrowUpRight} from 'lucide-react';
import {changeSeoField, defaultSeoFields} from '../../lib/seo-editor-values';
import {formatAdminTime} from '../../lib/admin-time';

async function requestSeo(path: string, csrf: string, input?: unknown) {
  const response=await fetch('/api/admin/'+path,input===undefined ? {cache:'no-store'} : {
    method:'POST',headers:{'Content-Type':'application/json','X-CSRF-Token':csrf},body:JSON.stringify(input),
  });
  const data=await response.json();
  if(!response.ok) throw Error(data.error || 'Unable to save SEO changes.');
  return data;
}

export function SeoManager({initial,csrf}:{initial:any;csrf:string}) {
  const [editor,setEditor]=useState(initial.editor);
  const [values,setValues]=useState<Record<string,string>>(initial.editor.values);
  const [search,setSearch]=useState(''),[busy,setBusy]=useState(false);
  const [notice,setNotice]=useState(''),[error,setError]=useState('');
  const publishingEnabled=editor.overridesEnabled!==false;
  async function save(action:string,revision?:number) {
    if(busy)return;
    setBusy(true);setError('');setNotice('');
    try {
      await requestSeo('seo',csrf,{action,route:editor.page.route,values,version:editor.version,revision});
      const latest=await requestSeo('seo?route='+encodeURIComponent(editor.page.route),csrf);
      setEditor(latest);setValues(latest.values);
      setNotice(action==='publish'
        ? 'Published to your website. Google search results update separately after recrawling.'
        : action==='restore' ? 'Restored as a draft. Review and publish to update the website.'
        : 'Draft saved. Your published website metadata is unchanged.');
    } catch(error:any){setError(error.message);}finally{setBusy(false);}
  }
  function changeField(key:string,value:string) {
    setValues(current=>changeSeoField(current,key,value,Boolean(editor.page.contentEditable)));
    setNotice('');
  }
  const field=(key:string,title:string,limit:number,multiline=false,placeholder='')=><label key={key}>
    {title}<small>{(values[key]||'').length}/{limit} characters</small>
    {multiline ? <textarea id={'seo-'+key} value={values[key]||''} placeholder={placeholder} maxLength={limit} rows={3} disabled={busy}
      ref={element=>{if(element && ['title','ogTitle'].includes(key)){element.style.height='auto';element.style.height=element.scrollHeight+'px';}}}
      onChange={event=>changeField(key,event.target.value)}/>
      : <input id={'seo-'+key} value={values[key]||''} maxLength={limit} disabled={busy} onChange={event=>changeField(key,event.target.value)}/>}
  </label>;
  return <>
    {notice && <p role="status" className="admin-notice">{notice}</p>}
    {error && <p role="alert" className="admin-error">{error}</p>}
    {!publishingEnabled && <p role="alert" className="admin-error">Public SEO overrides are disabled in this environment. You can save drafts, but publishing requires enabling public SEO overrides on the server.</p>}
    <div className="admin-seo-layout">
      <aside className="admin-page-list">
        <label>Find a page<input type="search" placeholder="Search title or route" value={search} onChange={event=>setSearch(event.target.value)}/></label>
        <nav aria-label="Public pages">{initial.pages.filter((page:any)=>(page.route+' '+page.title+' '+page.kind).toLowerCase().includes(search.toLowerCase())).map((page:any)=><Link key={page.route} href={'/admin/seo?route='+encodeURIComponent(page.route)} aria-current={editor.page.route===page.route?'page':undefined}><strong>{page.route}</strong><small>{page.kind}</small></Link>)}</nav>
      </aside>
      <div className="admin-editor" aria-busy={busy}>
        <div className="admin-panel-heading"><div><h2>{editor.page.route}</h2><p>{editor.draft?'Unpublished draft':editor.published?'Published website metadata':'Original page defaults'} · Revision {editor.version}</p></div><a className="admin-text-link" href={editor.page.route} target="_blank" rel="noreferrer">Open page <ArrowUpRight size={14}/></a></div>
        <div className="admin-form two-columns">
          {field('title','SEO title',120,true,editor.page.title)}
          {field('targetKeyword','Target keyword · internal planning only',200)}
          {field('description','Meta description',320,true,editor.page.description)}
          {field('ogTitle','Open Graph title · optional',160,true,values.title || editor.page.title)}
          {field('ogDescription','Open Graph description · optional',500,true,values.description || editor.page.description)}
          <label>Approved social image<select value={values.image||''} disabled={busy} onChange={event=>changeField('image',event.target.value)}><option value="">Original page image</option>{initial.images.map((image:string)=><option key={image}>{image}</option>)}</select></label>
          {editor.page.contentEditable && <div className="admin-wide">{field('contentDescription','Visible page description · optional',1000,true,values.description || editor.page.description)}</div>}
        </div>
        <p className="admin-muted">Empty Open Graph fields follow your SEO title and meta description. An empty visible description follows your meta description. Customized fields stay independent.</p>
        <div className="admin-metadata-preview"><small>Search metadata preview · your current edits</small><p>saveframe.site{editor.page.route}</p><h3>{values.title || editor.page.title}</h3><p>{values.description || editor.page.description}</p></div>
        {values.image && <div className="admin-social-preview"><img src={values.image} alt="Selected social preview"/><div><small>Social preview</small><strong>{values.ogTitle || values.title || editor.page.title}</strong><p>{values.ogDescription || values.description || editor.page.description}</p></div></div>}
        <p className="admin-muted">This preview is not a live Google result. Publishing updates the website; Google can choose different titles and snippets. Canonicals, language alternatives and sitemap URLs remain controlled by the application.</p>
        <div className="admin-actions">
          <button disabled={busy} className="admin-button" onClick={()=>save('draft')}>Save draft</button>
          <button disabled={busy || !publishingEnabled} className="admin-button primary" onClick={()=>save('publish')}>{busy?'Saving…':'Publish changes'}</button>
          <button disabled={busy} className="admin-button" onClick={()=>{setValues(current=>({...current,ogTitle:'',ogDescription:''}));setNotice('Social previews will follow the SEO title and meta description. Publish changes to apply them.');}}>Use SEO text for social previews</button>
          <button disabled={busy} className="admin-button" onClick={()=>{setValues(defaultSeoFields(editor.page));setNotice('Page defaults loaded into the preview. Publish changes to apply them.');setError('');}}>Use page defaults</button>
        </div>
        <section className="admin-history"><h2>Edit history</h2>{editor.history.length ? <ul>{editor.history.map((row:any)=><li key={row.id}><div><strong>{row.action}</strong><small>{formatAdminTime(row.created_at)}</small></div><button className="admin-button" disabled={busy} onClick={()=>save('restore',row.id)}>Restore as draft</button></li>)}</ul> : <div className="admin-empty">The first saved change creates a restorable baseline.</div>}</section>
      </div>
    </div>
  </>;
}
