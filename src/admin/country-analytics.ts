import {db, cleanup} from './db';
import {AdminError} from './auth';
import {countryCode, countryName, countryCodes} from '../lib/country';

export const countryMediaKinds = ['audio', 'reel', 'video', 'photo', 'carousel', 'story', 'profile', 'zip', 'unknown'];
export const colomboDay = (time: number) => new Date(time + 19800000).toISOString().slice(0, 10);

export function rebuildCountryDay(time: number) {
  const day = colomboDay(time), start = Date.parse(day + 'T00:00:00+05:30');
  db().prepare('DELETE FROM daily_country_statistics WHERE day=?').run(day);
  db().prepare(`INSERT INTO daily_country_statistics
    SELECT ?, country_code, CASE WHEN is_zip=1 THEN 'zip' ELSE media_type END,
      COUNT(*), SUM(prepared_at IS NOT NULL), SUM(delivered_at IS NOT NULL),
      SUM(failed_at IS NOT NULL OR (delivery_failed_at IS NOT NULL AND delivered_at IS NULL))
    FROM download_requests WHERE requested_at>=? AND requested_at<? GROUP BY 2,3`).run(day, start, start + 86400000);
}

export interface CountryFilter {from?: string; to?: string; type?: string; country?: string}

function countryRange(input: CountryFilter) {
  const from = input.from || colomboDay(Date.now() - 29 * 86400000), to = input.to || colomboDay(Date.now());
  for (const day of [from, to]) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(day) || !Number.isFinite(Date.parse(day)) || new Date(Date.parse(day)).toISOString().slice(0, 10) !== day) {
      throw new AdminError(400, 'Use valid dates in YYYY-MM-DD format.');
    }
  }
  if (from > to || Date.parse(to) - Date.parse(from) > 729 * 86400000) throw new AdminError(400, 'Choose a date range of up to 730 days.');
  if (input.type && !countryMediaKinds.includes(input.type)) throw new AdminError(400, 'Unknown media type.');
  if (input.country && input.country !== 'XX' && countryCode(input.country) === 'XX') throw new AdminError(400, 'Unknown country code.');
  return {from, to, type: input.type || '', country: input.country || ''};
}

function selection(input: CountryFilter) {
  const range = countryRange(input);
  const where = 'day>=? AND day<=?' + (range.type ? ' AND media_type=?' : '') + (range.country ? ' AND country_code=?' : '');
  const values = [range.from, range.to, ...(range.type ? [range.type] : []), ...(range.country ? [range.country] : [])];
  return {range, where, values};
}

export function countryReports(input: CountryFilter = {}) {
  cleanup();
  const {range, where, values} = selection(input), connection = db();
  const sums = 'SUM(requests) requests,SUM(prepared) prepared,SUM(delivered) delivered,SUM(failed) failed';
  const totals = connection.prepare(`SELECT COALESCE(SUM(requests),0) requests,COALESCE(SUM(prepared),0) prepared,COALESCE(SUM(delivered),0) delivered,COALESCE(SUM(failed),0) failed FROM daily_country_statistics WHERE ${where}`).get(...values) as any;
  const countries = connection.prepare(`SELECT country_code,${sums} FROM daily_country_statistics WHERE ${where} GROUP BY country_code ORDER BY requests DESC,country_code`).all(...values).map(row => ({
    ...row, country_name: countryName(String(row.country_code)), share: totals.requests ? Number(row.requests) / totals.requests * 100 : 0,
  }));
  const daily = connection.prepare(`SELECT day,${sums} FROM daily_country_statistics WHERE ${where} GROUP BY day ORDER BY day`).all(...values);
  const distribution = connection.prepare(`SELECT media_type,SUM(requests) count FROM daily_country_statistics WHERE ${where} GROUP BY media_type ORDER BY count DESC`).all(...values);
  const countryOptions = [...countryCodes].map(code => ({code, name: countryName(code)})).sort((a, b) => a.name.localeCompare(b.name, 'en'));
  return {range, timezone: 'Asia/Colombo', totals, countries, daily, distribution, countryOptions};
}

export function countryCsv(input: CountryFilter = {}) {
  cleanup();
  const {where, values} = selection(input);
  const rows = db().prepare(`SELECT day,country_code,media_type,requests,prepared,delivered,failed FROM daily_country_statistics WHERE ${where} ORDER BY day,country_code,media_type`).all(...values);
  const quote = (value: unknown) => '"' + String(value).replace(/"/g, '""') + '"';
  return ['date,country_code,country_name,media_type,requests,prepared,delivered,failed', ...rows.map(row => [
    row.day, row.country_code, countryName(String(row.country_code)), row.media_type, row.requests, row.prepared, row.delivered, row.failed,
  ].map(quote).join(','))].join('\r\n');
}
