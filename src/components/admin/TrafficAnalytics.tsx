import type {trafficReports} from '../../admin/traffic-analytics';
import {countryName} from '../../lib/country';

export function TrafficAnalytics({data}:{data:ReturnType<typeof trafficReports>}) {
  const number=(value:unknown)=>Number(value||0).toLocaleString('en-US');
  const table=(title:string,rows:Record<string,unknown>[],name:(row:Record<string,unknown>)=>string)=><section className="admin-panel"><div className="admin-panel-heading"><h2>{title}</h2></div><div className="admin-table-scroll" tabIndex={0} role="region" aria-label={title}><table><thead><tr><th scope="col">{title}</th><th scope="col" className="numeric">Page views</th></tr></thead><tbody>{rows.map((row,index)=><tr key={index}><td>{name(row)}</td><td className="numeric">{number(row.views)}</td></tr>)}</tbody></table></div>{!rows.length&&<p className="admin-muted">No page views in this date range.</p>}</section>;
  return <>
    <form className="admin-filter" action="/admin/traffic" method="get"><label>From<input type="date" name="from" defaultValue={data.range.from} required/></label><label>To<input type="date" name="to" defaultValue={data.range.to} required/></label><button className="admin-button">Apply filters</button></form>
    <section className="admin-panel"><div className="admin-panel-heading"><h2>Internal aggregate page views</h2><strong>{number(data.total)}</strong></div><p>Independent of Google Analytics. Includes eligible and restricted regions, with unknown locations shown separately. Counts page loads and client navigation, not unique visitors or sessions. Refreshing counts a new page view. Browser privacy signals and opt-outs are excluded.</p><p className="admin-muted">No visitor IDs, raw IP addresses, full referrers or submitted media links are stored. Automated traffic is filtered on a best-effort basis. Country and device classifications may be unavailable or approximate.</p></section>
    <div className="admin-two-panels">{table('Pages',data.pages,row=>String(row.path))}{table('Countries',data.countries,row=>countryName(String(row.country_code)))}</div>
    <div className="admin-two-panels">{table('Devices',data.devices,row=>String(row.device))}{table('Referral sources',data.referrers,row=>String(row.referrer))}</div>
    <div className="admin-two-panels">{table('Approved campaigns',data.campaigns,row=>row.source?String(row.source)+' / '+String(row.medium):'No approved campaign')}{table('Regional GA4 policy',data.ga4Policy,row=>row.ga4_policy==='eligible'?'Automatically eligible (receipt not verified)':'Restricted or unknown (internal counts only)')}</div>
    {table('Daily views · Asia/Colombo',[...data.daily].sort((a,b)=>String(a.day).localeCompare(String(b.day))),row=>String(row.day))}
  </>;
}
