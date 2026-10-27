import { cookies } from 'next/headers';
import { redirect, notFound } from 'next/navigation';
import { findSession } from '../../../admin/auth';
import { db, settings } from '../../../admin/db';
import { reports } from '../../../admin/analytics';
import { countryReports } from '../../../admin/country-analytics';
import { seoCatalog, approvedImages } from '../../../admin/catalog';
import { seoEditor } from '../../../admin/seo-service';
import { verificationList } from '../../../admin/verification';
import { AdminDashboard } from '../../../components/admin/AdminDashboard';
export default async function AdminPage({params,searchParams}:{params:Promise<{section?:string[]}>;searchParams:Promise<Record<string,string>>}) {
  const jar=await cookies();
  const token=jar.get('__Host-sf_admin')?.value || ((process.env.ADMIN_ALLOW_LOCAL_HTTP==='1' || process.env.NODE_ENV!=='production') ? jar.get('sf_admin_local')?.value : '');
  const session=findSession(token || '');
  if(!session) redirect('/admin/login');
  const segments=(await params).section || [], section=segments[0] || 'overview';
  if(segments.length>1 || !['overview','analytics','countries','errors','seo','verification','settings','audit'].includes(section)) notFound();
  const query=await searchParams; let initial:any={};
  try {
    if(['overview','analytics','errors'].includes(section)) initial=reports(query);
    if(section==='countries') initial=countryReports(query);
    if(section==='seo') initial={pages:seoCatalog(),images:approvedImages(),editor:seoEditor(query.route || '/')};
    if(section==='verification') initial={files:verificationList(),origin:process.env.ADMIN_ORIGIN || process.env.NEXT_PUBLIC_SITE_URL || 'https://saveframe.site'};
    if(section==='settings') initial={settings:settings(),images:approvedImages()};
    if(section==='audit') {
      const page=Math.min(100000,Math.max(1,parseInt(query.page || '1') || 1)),q=String(query.q || '').slice(0,100),where=q?' WHERE a.action LIKE ? OR a.target LIKE ?':'',args=q?['%'+q+'%','%'+q+'%']:[];
      const count=Number((db().prepare('SELECT COUNT(*) count FROM admin_audit_events a'+where).get(...args) as any).count);
      initial={rows:db().prepare('SELECT a.*,u.email actor FROM admin_audit_events a LEFT JOIN admin_users u ON a.actor_id=u.id'+where+' ORDER BY a.id DESC LIMIT 30 OFFSET ?').all(...args,(page-1)*30),count,page,pages:Math.max(1,Math.ceil(count/30)),q};
    }
  } catch(error:any) { initial={loadError:error.status===400?error.message:'Unable to load this view. Check the database and server logs.'}; }
  return <AdminDashboard key={section+JSON.stringify(query)} section={section} initial={JSON.parse(JSON.stringify(initial))} user={{email:session.email,csrf:session.csrf_token,totpEnabled:Boolean(session.totp_enabled)}}/>;
}
