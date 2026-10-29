// Print only public analytics settings and booleans, never the complete environment.
const {loadEnvConfig}=require('@next/env');
const loaded=loadEnvConfig(process.cwd(),false);
const id=(process.env.GA_MEASUREMENT_ID||process.env.NEXT_PUBLIC_GA_ID||'').trim();
const site=process.env.NEXT_PUBLIC_SITE_URL||'';
const enabled=process.env.GA4_ENABLED!=='0';
const validId=/^G-[A-Z0-9]+$/.test(id);
const pm2=require('../ecosystem.config.cjs').apps[0].env_production;
console.log(JSON.stringify({
  site,measurementId:id,validMeasurementId:validId,ga4Enabled:enabled,
  trustedRegionHeader:process.env.GA4_TRUST_REGION_HEADER==='1',
  internalTrafficEnabled:process.env.INTERNAL_TRAFFIC_ENABLED!=='0',
  configFiles:loaded.loadedEnvFiles.map(file=>file.path),
  pm2AnalyticsMatches:pm2.GA4_ENABLED===(process.env.GA4_ENABLED??'1')&&pm2.GA4_TRUST_REGION_HEADER===(process.env.GA4_TRUST_REGION_HEADER??'0')&&(pm2.GA_MEASUREMENT_ID||pm2.NEXT_PUBLIC_GA_ID).trim()===id,
  unknownRegions:'GA4 blocked without a previously saved consent; internal aggregate counters available',
},null,2));
if(site!=='https://tiksavemp4.online'||(enabled&&!validId)){console.error('Check the public origin and measurement ID before deployment.');process.exitCode=1;}
