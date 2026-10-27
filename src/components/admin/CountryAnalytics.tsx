import {Download} from 'lucide-react';

interface Counts {requests: number; prepared: number; delivered: number; failed: number}
interface CountryData {
  range: {from: string; to: string; type: string; country: string};
  totals: Counts;
  countries: (Counts & {country_code: string; country_name: string; share: number})[];
  daily: (Counts & {day: string})[];
  distribution: {media_type: string; count: number}[];
  countryOptions: {code: string; name: string}[];
}
const number = (value: number) => new Intl.NumberFormat('en-US').format(value);
const mediaLabels: Record<string, string> = {reel: 'Reels', video: 'Videos', photo: 'Photos', carousel: 'Carousels', story: 'Stories', profile: 'Profiles', zip: 'ZIP archives', unknown: 'Unclassified'};

export function CountryAnalytics({data}: {data: CountryData}) {
  const metrics: [string, number, string][] = [
    ['Download requests', data.totals.requests, 'Each original request counts once'],
    ['Prepared files', data.totals.prepared, 'Preparation finished on the server'],
    ['Response handoffs', data.totals.delivered, 'Server stream completed'],
    ['Failed downloads', data.totals.failed, 'Preparation or delivery failed'],
  ];
  const byDay = new Map(data.daily.map(row => [row.day, row.requests]));
  const points: {day: string; requests: number}[] = [];
  for (let date = Date.parse(data.range.from); date <= Date.parse(data.range.to); date += 86400000) {
    const day = new Date(date).toISOString().slice(0, 10);
    points.push({day, requests: byDay.get(day) || 0});
  }
  const maximum = Math.max(1, ...points.map(point => point.requests));
  const x = (index: number) => 44 + index / Math.max(1, points.length - 1) * 560;
  const y = (count: number) => 146 - count / maximum * 118;
  const line = points.map((point, index) => `${index ? 'L' : 'M'}${x(index).toFixed(1)},${y(point.requests).toFixed(1)}`).join(' ');
  const exportUrl = '/api/admin/reports/countries/export?' + new URLSearchParams(data.range);
  // Use server-provided labels; browser and Node ICU versions can name countries differently.
  const selectedCountry = data.range.country === 'XX' ? 'Unknown location' : data.countryOptions.find(country => country.code === data.range.country)?.name || 'All countries';

  return <>
    <form className="admin-filter" action="/admin/countries" method="get">
      <label>From<input type="date" name="from" defaultValue={data.range.from} required/></label>
      <label>To<input type="date" name="to" defaultValue={data.range.to} required/></label>
      <label>Media type<select name="type" defaultValue={data.range.type}><option value="">All media</option>{Object.entries(mediaLabels).map(([code, name]) => <option key={code} value={code}>{name}</option>)}</select></label>
      <label>Country<select name="country" defaultValue={data.range.country}><option value="">All countries</option><option value="XX">Unknown location · XX</option>{data.countryOptions.map(country => <option key={country.code} value={country.code}>{country.name} · {country.code}</option>)}</select></label>
      <button className="admin-button">Apply filters</button>
    </form>
    <p className="admin-muted">Request dates use Asia/Colombo (UTC+05:30). Handoffs do not confirm a browser save. Unknown includes historical, unavailable and privacy-excluded locations.</p>
    <div className="admin-metrics">{metrics.map(([title, count, note]) => <section key={title}><p>{title}</p><strong>{number(count)}</strong><small>{note}</small></section>)}</div>
    <div className="admin-chart-grid">
      <section className="admin-panel activity-panel">
        <div className="admin-panel-heading"><div><h2>Country download trend</h2><p>{selectedCountry} · Asia/Colombo</p></div><span className="admin-legend"><i/> Requests</span></div>
        <svg className="admin-chart" viewBox="0 0 640 180" role="img" aria-label={`${number(data.totals.requests)} requests from ${data.range.from} to ${data.range.to} in Asia/Colombo`}>
          <title>Download requests by Sri Lanka reporting date</title>
          {[0, .5, 1].map(fraction => <g key={fraction}><line x1="44" x2="610" y1={y(maximum * fraction)} y2={y(maximum * fraction)} stroke="#eaeaf0"/><text x="34" y={y(maximum * fraction) + 4} textAnchor="end">{number(Math.round(maximum * fraction))}</text></g>)}
          <path d={line} fill="none" stroke="#7c3aed" strokeWidth="2.4" strokeLinejoin="round"/>
          {[0, Math.floor((points.length - 1) / 2), points.length - 1].filter((value, index, array) => array.indexOf(value) === index).map(index => <text key={index} x={x(index)} y="170" textAnchor={index === 0 ? 'start' : index === points.length - 1 ? 'end' : 'middle'}>{points[index].day.slice(5)}</text>)}
        </svg>
        {!data.totals.requests && <p className="admin-chart-note">No country download activity in this range.</p>}
      </section>
      <section className="admin-panel">
        <div className="admin-panel-heading"><h2>Media distribution</h2><span className="admin-muted">{number(data.totals.requests)} requests</span></div>
        {data.distribution.length ? <div className="admin-breakdown">{data.distribution.map(row => <div key={row.media_type}><div><span>{mediaLabels[row.media_type] || row.media_type}</span><strong>{number(row.count)}</strong></div><div className="admin-bar-track"><span style={{width: row.count / Math.max(1, data.totals.requests) * 100 + '%'}}/></div></div>)}</div> : <div className="admin-empty">Media types appear after a download request.</div>}
      </section>
    </div>
    <section className="admin-panel">
      <div className="admin-panel-heading"><div><h2>Downloads by country</h2><p>Share is based on requests in the current filters. ZIP archives count as one request.</p></div><a className="admin-button" href={exportUrl}><Download size={14} aria-hidden="true"/> Export CSV</a></div>
      <div className="admin-table-scroll" tabIndex={0} role="region" aria-label="Country download statistics">
        <table className="admin-country-table"><thead><tr><th scope="col">Country</th><th scope="col">Code</th>{['Requests', 'Prepared', 'Handed off', 'Failed', 'Share'].map(title => <th scope="col" className="numeric" key={title}>{title}</th>)}</tr></thead>
          <tbody>{data.countries.map(row => <tr key={row.country_code}><th scope="row">{row.country_name}</th><td className="admin-code">{row.country_code}</td><td className="numeric">{number(row.requests)}</td><td className="numeric">{number(row.prepared)}</td><td className="numeric">{number(row.delivered)}</td><td className="numeric">{number(row.failed)}</td><td className="numeric">{row.share.toFixed(1)}%</td></tr>)}</tbody>
        </table>
      </div>
      {!data.countries.length && <div className="admin-empty">No requests match these filters.</div>}
      <p className="admin-muted">Prepared and failed counts can overlap when delivery fails after preparation. A later successful handoff resolves a delivery failure. Operational country reports are independent of Google Analytics.</p>
    </section>
  </>;
}
