// Media jobs are held in memory: keep exactly one forked worker.
// Resolve Next's production-file precedence before handing values to PM2.
// Explicitly refresh only public analytics flags so stale PM2 values cannot
// silently shadow .env.production.local after --update-env.
const {combinedEnv}=require('@next/env').loadEnvConfig(__dirname,false,{info(){},error(){}});
const analyticsDefaults={NEXT_PUBLIC_GA_ID:'G-XP63QEZK1R',GA4_ENABLED:'1',GA4_TRUST_REGION_HEADER:'0',INTERNAL_TRAFFIC_ENABLED:'1'};
const analyticsKeys=['GA_MEASUREMENT_ID','NEXT_PUBLIC_GA_ID','GA4_ENABLED','GA4_TRUST_REGION_HEADER','GA4_AUTOMATIC_COUNTRIES','GA4_CONSENT_REQUIRED_COUNTRIES','GA4_CAMPAIGN_SOURCES','GA4_CAMPAIGN_MEDIUMS','GA4_CAMPAIGN_NAMES','GA4_CAMPAIGN_CONTENT','GA4_CAMPAIGN_TERMS','INTERNAL_TRAFFIC_ENABLED'];
const analyticsEnv=Object.fromEntries(analyticsKeys.map(key=>[key,combinedEnv[key]??analyticsDefaults[key]??'']));
module.exports = { apps: [{
  name: 'tiksave', cwd: __dirname, script: 'node_modules/next/dist/bin/next',
  args: 'start -H 127.0.0.1', instances: 1, exec_mode: 'fork',
  env_production: { NODE_ENV: 'production', PORT: '3002',
    NEXT_PUBLIC_SITE_URL: 'https://tiksavemp4.online',
    ADMIN_ORIGIN: 'https://tiksavemp4.online',
    SAVEFRAME_ADMIN_DATA_DIR: '/var/lib/tiksave/admin',
    DOWNLOAD_TEMP_DIR: '/var/lib/tiksave/downloads',
    ...analyticsEnv
  },
  max_memory_restart: '1G', kill_timeout: 15000, time: true
}] };
