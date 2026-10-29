// Media jobs are held in memory: keep exactly one forked worker.
module.exports = { apps: [{
  name: 'tiksave', cwd: __dirname, script: 'node_modules/next/dist/bin/next',
  args: 'start -H 127.0.0.1', instances: 1, exec_mode: 'fork',
  env_production: { NODE_ENV: 'production', PORT: '3002',
    NEXT_PUBLIC_SITE_URL: 'https://tiksavemp4.online',
    ADMIN_ORIGIN: 'https://tiksavemp4.online',
    SAVEFRAME_ADMIN_DATA_DIR: '/var/lib/tiksave/admin',
    DOWNLOAD_TEMP_DIR: '/var/lib/tiksave/downloads',
    GA_MEASUREMENT_ID: process.env.GA_MEASUREMENT_ID || '',
    NEXT_PUBLIC_GA_ID: process.env.NEXT_PUBLIC_GA_ID || 'G-XP63QEZK1R',
    GA4_ENABLED: process.env.GA4_ENABLED || '1',
    GA4_AUTOMATIC_COUNTRIES: process.env.GA4_AUTOMATIC_COUNTRIES || '*'
  },
  max_memory_restart: '1G', kill_timeout: 15000, time: true
}] };
