const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const {DatabaseSync} = require('node:sqlite');
const ts = require('typescript');
const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'saveframe-country-check-'));
Object.assign(process.env, {NODE_ENV: 'test', SAVEFRAME_ADMIN_DATA_DIR: directory, SAVEFRAME_ADMIN_EMAIL: 'operator@example.test', ADMIN_ORIGIN: 'http://localhost:3107', ADMIN_ALLOW_LOCAL_HTTP: '1'});
require.extensions['.ts'] = (module, file) => module._compile(ts.transpileModule(fs.readFileSync(file, 'utf8'), {
  compilerOptions: {module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true},
}).outputText, file);
const realNow = Date.now;
const fixedNow = Date.parse('2026-10-27T12:00:00Z');
Date.now = () => fixedNow;

async function main() {
  // Upgrade an actual WAL database at schema 2, retaining historical records/settings.
  const filename = path.join(directory, 'saveframe-admin.sqlite');
  const previous = new DatabaseSync(filename);
  previous.exec('PRAGMA journal_mode=WAL; CREATE TABLE schema_migrations(version INTEGER PRIMARY KEY,applied_at INTEGER NOT NULL)');
  for (const [version, migration] of [[1, '001-admin.sql'], [2, '002-email-login.sql']]) {
    previous.exec(fs.readFileSync('src/admin/migrations/' + migration, 'utf8'));
    previous.prepare('INSERT INTO schema_migrations VALUES(?,?)').run(version, 123);
  }
  const beforeBoundary = Date.parse('2026-10-26T18:29:59.999Z');
  previous.prepare('INSERT INTO download_requests(id,runtime_id,media_type,requested_at,prepared_at,delivered_at,status) VALUES(?,?,?,?,?,?,?)').run('historical', 'old', 'photo', beforeBoundary, beforeBoundary, beforeBoundary, 'delivered');
  previous.prepare('INSERT INTO download_events(correlation_id,event_type,media_type,created_at) VALUES(?,?,?,?)').run('historical', 'download_requested', 'photo', beforeBoundary);
  previous.prepare('INSERT INTO public_settings(key,value,updated_at) VALUES(?,?,?)').run('site_name', 'Preserved brand', fixedNow);
  previous.close();

  const store = require('../src/admin/db.ts');
  const analytics = require('../src/admin/analytics.ts');
  const {countryReports, countryCsv, colomboDay} = require('../src/admin/country-analytics.ts');
  const {requestCountry} = require('../src/admin/country-policy.ts');
  const {countryCode, countryName, countryCodes} = require('../src/lib/country.ts');
  const auth = require('../src/admin/auth.ts');
  const connection = store.db();
  assert.equal(connection.prepare('SELECT MAX(version) version FROM schema_migrations').get().version, 3);
  assert.equal(connection.prepare('SELECT COUNT(*) count FROM schema_migrations WHERE version<3 AND applied_at=123').get().count, 2);
  assert.equal(connection.prepare('SELECT value FROM public_settings WHERE key=?').get('site_name').value, 'Preserved brand');
  assert.equal(connection.prepare('SELECT country_code FROM download_requests WHERE id=?').get('historical').country_code, 'XX');
  assert.equal(connection.prepare('SELECT country_code FROM download_events WHERE correlation_id=?').get('historical').country_code, 'XX');
  assert.equal(connection.prepare('PRAGMA journal_mode').get().journal_mode, 'wal');
  assert.ok(connection.prepare("SELECT name FROM sqlite_master WHERE type='index' AND name='requests_time_type'").get());
  assert.equal(store.db(), connection, 'Repeat initialization is idempotent');

  const policy = {SAVEFRAME_COUNTRY_ANALYTICS_ENABLED: '1', SAVEFRAME_TRUST_COUNTRY_HEADER: '1', SAVEFRAME_COUNTRY_ANALYTICS_COUNTRIES: '*'};
  const headers = (country, extra = {}) => new Headers({'x-saveframe-country': country, ...extra});
  assert.equal(countryCodes.size, 249);
  for (const code of ['US', 'IN', 'LK', 'AU', 'JP']) assert.equal(requestCountry(headers(code), policy), code);
  assert.equal(countryName('LK'), 'Sri Lanka'); assert.equal(countryName('GB'), 'United Kingdom');
  for (const code of ['GB', 'DE', 'CH', 'FR']) {
    assert.equal(requestCountry(headers(code), policy), 'XX');
    assert.equal(requestCountry(headers(code, {cookie: 'sf_analytics_preference=granted'}), policy), code);
  }
  for (const code of ['XX', 'T1', 'EU', 'UK', 'ZZ', 'XK', 'us', 'US, IN', 'USA', '12', '']) {
    assert.equal(requestCountry(headers(code), policy), 'XX', code);
    assert.equal(countryCode(code), 'XX');
  }
  assert.equal(requestCountry(headers('US')), 'XX', 'Unconfigured client header is untrusted');
  assert.equal(requestCountry(headers('US'), {...policy, SAVEFRAME_TRUST_COUNTRY_HEADER: '0'}), 'XX');
  assert.equal(requestCountry(new Headers({'cf-ipcountry': 'US'}), policy), 'XX', 'Raw Cloudflare header is never read by the application');
  assert.equal(requestCountry(headers('IN'), {...policy, SAVEFRAME_COUNTRY_ANALYTICS_COUNTRIES: 'LK,US'}), 'XX');
  assert.equal(requestCountry(headers('US'), {...policy, SAVEFRAME_COUNTRY_CONSENT_REQUIRED_COUNTRIES: '*'}), 'XX');
  for (const extra of [{dnt: '1'}, {'sec-gpc': '1'}, {cookie: 'sf_analytics_preference=denied'}, {cookie: 'sf_analytics_preference=invalid'}, {cookie: 'sf_analytics_preference=granted; sf_analytics_preference=denied'}]) {
    assert.equal(requestCountry(headers('US', extra), policy), 'XX');
  }
  assert.equal(colomboDay(beforeBoundary), '2026-10-26');
  assert.equal(colomboDay(beforeBoundary + 1), '2026-10-27');

  const event = (id, name, type = 'reel', code = null, country = 'XX') => analytics.recordEvent(id, name, type, 'job-' + id, code, null, country);
  Date.now = () => beforeBoundary + 1;
  event('us', 'download_requested', 'reel', null, 'US');
  event('us', 'download_started', 'reel', null, 'IN');
  event('us', 'media_prepared', 'reel'); event('us', 'media_prepared', 'reel');
  event('us', 'delivery_started', 'reel'); event('us', 'delivery_completed', 'reel'); event('us', 'delivery_completed', 'reel');
  event('lk', 'download_requested', 'photo', null, 'LK');
  event('lk', 'media_prepared', 'photo');
  event('lk', 'delivery_failed', 'photo', 'DELIVERY_CANCELLED');
  event('in', 'download_requested', 'video', null, 'IN');
  event('in', 'download_failed', 'video', 'EXTRACTOR_FAILURE');
  event('zip', 'download_requested', 'carousel', null, 'GB');
  // attachJob uses production best-effort guard; exercise it in this disposable DB only.
  process.env.NODE_ENV = 'development';
  analytics.attachJob('zip', 'job-zip', 'carousel', true);
  process.env.NODE_ENV = 'test';
  event('zip', 'media_prepared', 'carousel'); event('zip', 'delivery_completed', 'carousel');
  event('unknown', 'download_requested', 'story');
  event('unknown', 'download_failed', 'story', 'JOB_CANCELLED');
  Date.now = () => fixedNow;

  const range = {from: '2026-10-27', to: '2026-10-27'};
  const report = countryReports(range);
  assert.deepEqual({...report.totals}, {requests: 5, prepared: 3, delivered: 2, failed: 3});
  assert.equal(report.countries.reduce((sum, row) => sum + row.share, 0), 100);
  assert.equal(report.timezone, 'Asia/Colombo');
  assert.equal(report.daily[0].day, '2026-10-27');
  assert.equal(countryReports({...range, country: 'US'}).totals.requests, 1);
  assert.equal(countryReports({...range, type: 'photo'}).totals.failed, 1);
  assert.equal(countryReports({...range, type: 'zip'}).totals.requests, 1);
  assert.equal(countryReports({...range, type: 'carousel'}).totals.requests, 0);
  assert.equal(countryReports({from: '2026-10-26', to: '2026-10-26'}).countries[0].country_code, 'XX');
  assert.equal(countryReports({...range, country: 'XX'}).countries[0].country_name, 'Unknown location');
  assert.deepEqual(connection.prepare('SELECT DISTINCT country_code FROM download_events WHERE correlation_id=?').all('us').map(row => row.country_code), ['US']);
  event('lk', 'delivery_completed', 'photo');
  assert.equal(countryReports({...range, country: 'LK'}).totals.failed, 0, 'A successful retry resolves a failed handoff');
  assert.equal(countryReports({...range, country: 'LK'}).totals.delivered, 1);
  const csv = countryCsv({...range, type: 'zip'});
  assert.ok(csv.startsWith('date,country_code,country_name,media_type,requests,prepared,delivered,failed\r\n'));
  assert.ok(csv.includes('"2026-10-27","GB","United Kingdom","zip","1","1","1","0"'));
  assert.equal(analytics.reportCsv(range).split('\r\n')[0], 'day,media_type,requests,prepared,failed,delivered,processing_ms,processing_samples');
  for (const input of [{from: '2026-02-31'}, {from: '2020-01-01', to: '2026-10-27'}, {type: 'injection'}, {country: 'US OR 1=1'}, {from: '2026-10-28', to: '2026-10-27'}]) {
    assert.throws(() => countryReports(input), error => error.status === 400);
  }

  const {GET} = require('../src/app/api/admin/[[...segments]]/route.ts');
  const context = route => ({params: Promise.resolve({segments: route.split('/')})});
  const endpoint = 'http://localhost:3107/api/admin/';
  for (const route of ['reports/countries', 'reports/countries/export']) {
    assert.equal((await GET(new Request(endpoint + route), context(route))).status, 401);
  }
  const userId = await auth.createAdmin('operator@example.test', 'country-fixture-' + require('node:crypto').randomBytes(20).toString('hex'));
  const session = auth.newSession(userId);
  for (const route of ['reports/countries', 'reports/countries/export']) {
    const response = await GET(new Request(endpoint + route + '?' + new URLSearchParams(range), {headers: {cookie: 'sf_admin_local=' + session.token}}), context(route));
    assert.equal(response.status, 200);
    assert.ok(response.headers.get('cache-control').includes('no-store'));
    assert.ok(response.headers.get('x-robots-tag').includes('noindex'));
    const body = await response.text();
    for (const privateValue of [session.token, 'job-us', 'historical', '127.0.0.1', 'instagram.com']) assert.ok(!body.includes(privateValue));
  }
  // Aggregates survive raw-data retention without altering the legacy UTC reports.
  const oldDay = '2026-08-01';
  connection.prepare('INSERT INTO daily_country_statistics VALUES(?,?,?,?,?,?,?)').run(oldDay, 'LK', 'photo', 2, 1, 1, 1);
  store.cleanup(true);
  assert.equal(countryReports({from: oldDay, to: oldDay}).totals.requests, 2);

  // Each Nginx location has its own proxy_set_header directives: inheritance is insufficient.
  for (const name of ['nginx/saveframe.conf', 'nginx/saveframe-tls.conf.example']) {
    const template = fs.readFileSync(name, 'utf8');
    const locations = template.match(/location[^{}]+\{[^{}]*proxy_pass[^{}]*\}/g) || [];
    assert.ok(locations.length >= 5);
    for (const location of locations) assert.ok(location.includes('proxy_set_header X-SaveFrame-Country $saveframe_analytics_country;'));
    assert.ok(template.includes('server 127.0.0.1:3000;'));
  }
  const geo = fs.readFileSync('nginx/saveframe-analytics-region.conf', 'utf8');
  assert.ok(geo.includes('geo $realip_remote_addr $saveframe_trusted_geo'));
  assert.ok(geo.includes('default XX;'));
  assert.ok(geo.includes('~^1:'));
  assert.ok(require('../package.json').scripts.start.includes('-H 127.0.0.1'), 'Default production startup must bind loopback');
  console.log('PASS: additive WAL migration/history preservation; ISO/trusted-header/privacy policy; original-country persistence; deduplication; preparation/handoff/failure/ZIP distinctions; Colombo boundaries/filtering/trends; historical Unknown; CSV compatibility; admin authorization; retention; proxy header replacement. VPS deployment is not implied.');
}

main().catch(error => {console.error(error); process.exitCode = 1;}).finally(() => {
  Date.now = realNow;
  for (const connection of global.__saveframeAdminDbs?.values() || []) connection.close();
  fs.rmSync(directory, {recursive: true, force: true});
});
