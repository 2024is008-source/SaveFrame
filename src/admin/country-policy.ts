import {countryCode} from '../lib/country';

const consentRegions = new Set('AT BE BG HR CY CZ DK EE FI FR DE GR HU IS IE IT LV LI LT LU MT NL NO PL PT RO SK SI ES SE GB CH'.split(' '));
const list = (value?: string) => new Set((value || '').split(',').map(item => item.trim().toUpperCase()).filter(Boolean));

// Trust is a deployment boundary: only enable after verifying loopback binding
// and Nginx's unconditional header replacement from verified Cloudflare peers.
export function requestCountry(headers: Pick<Headers, 'get'>, env: Record<string, string | undefined> = process.env): string {
  if (env.SAVEFRAME_COUNTRY_ANALYTICS_ENABLED !== '1' || env.SAVEFRAME_TRUST_COUNTRY_HEADER !== '1') return 'XX';
  const country = countryCode(headers.get('x-saveframe-country'));
  if (country === 'XX' || headers.get('sec-gpc') === '1' || ['1', 'yes'].includes(headers.get('dnt') || '')) return 'XX';
  const preferences = (headers.get('cookie') || '').split(';').map(value => value.trim()).filter(value => value.startsWith('sf_analytics_preference='));
  if (preferences.length > 1) return 'XX';
  const preference = preferences[0]?.slice('sf_analytics_preference='.length);
  if (preference !== undefined && !['granted', 'denied'].includes(preference)) return 'XX';
  if (preference === 'denied') return 'XX';
  const additional = list(env.SAVEFRAME_COUNTRY_CONSENT_REQUIRED_COUNTRIES);
  if ((consentRegions.has(country) || additional.has(country) || additional.has('*')) && preference !== 'granted') return 'XX';
  const approved = list(env.SAVEFRAME_COUNTRY_ANALYTICS_COUNTRIES);
  return approved.has(country) || approved.has('*') ? country : 'XX';
}
