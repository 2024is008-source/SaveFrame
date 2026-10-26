// Server-side deployment policy. Country is never inferred from browser language,
// timezone, IP lookup services or an untrusted public Cloudflare header.
const required = new Set('AT BE BG HR CY CZ DK EE FI FR DE GR HU IS IE IT LV LI LT LU MT NL NO PL PT RO SK SI ES SE GB CH'.split(' '));
const countryCodes = new Set('AD AE AF AG AI AL AM AO AQ AR AS AT AU AW AX AZ BA BB BD BE BF BG BH BI BJ BL BM BN BO BQ BR BS BT BV BW BY BZ CA CC CD CF CG CH CI CK CL CM CN CO CR CU CV CW CX CY CZ DE DJ DK DM DO DZ EC EE EG EH ER ES ET FI FJ FK FM FO FR GA GB GD GE GF GG GH GI GL GM GN GP GQ GR GS GT GU GW GY HK HM HN HR HT HU ID IE IL IM IN IO IQ IR IS IT JE JM JO JP KE KG KH KI KM KN KP KR KW KY KZ LA LB LC LI LK LR LS LT LU LV LY MA MC MD ME MF MG MH MK ML MM MN MO MP MQ MR MS MT MU MV MW MX MY MZ NA NC NE NF NG NI NL NO NP NR NU NZ OM PA PE PF PG PH PK PL PM PN PR PS PT PW PY QA RE RO RS RU RW SA SB SC SD SE SG SH SI SJ SK SL SM SN SO SR SS ST SV SX SY SZ TC TD TF TG TH TJ TK TL TM TN TO TR TT TV TW TZ UA UG UM US UY UZ VA VC VE VG VI VN VU WF WS YE YT ZA ZM ZW'.split(' '));
const split=(value:string|undefined)=>new Set((value||'').split(',').map(item=>item.trim().toUpperCase()).filter(Boolean));
export function analyticsPolicy(headers:Pick<Headers,'get'>,env:Record<string,string|undefined>=process.env){
  const country=env.GA4_TRUST_REGION_HEADER==='1'?(headers.get('x-saveframe-country')||'').toUpperCase():'';
  const allowed=split(env.GA4_AUTOMATIC_COUNTRIES),additional=split(env.GA4_CONSENT_REQUIRED_COUNTRIES);
  const automaticAllowed=countryCodes.has(country)&&!required.has(country)&&!additional.has(country)&&!additional.has('*')&&(allowed.has('*')||allowed.has(country));
  const labels=(value:string|undefined,defaults:string[])=>[...new Set([...defaults,...(value||'').split(',').map(item=>item.trim())])].filter(item=>/^[A-Za-z][A-Za-z0-9_-]{0,63}$/.test(item));
  return {automaticAllowed,campaigns:{
    source:labels(env.GA4_CAMPAIGN_SOURCES,['google','bing','duckduckgo','yahoo','instagram','facebook','linkedin','youtube','tiktok','twitter','x','newsletter']),
    medium:labels(env.GA4_CAMPAIGN_MEDIUMS,['organic','referral','social','email','cpc','paid_social','display','affiliate']),
    name:labels(env.GA4_CAMPAIGN_NAMES,[]),content:labels(env.GA4_CAMPAIGN_CONTENT,[]),term:labels(env.GA4_CAMPAIGN_TERMS,[]),
  }};
}
