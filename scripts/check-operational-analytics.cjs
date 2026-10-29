const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const {DatabaseSync} = require('node:sqlite');
const ts = require('typescript');
const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'saveframe-analytics-failures-'));
process.env.SAVEFRAME_ADMIN_DATA_DIR = directory;
process.env.NODE_ENV = 'development';
delete process.env.SAVEFRAME_ANALYTICS_DISABLED;
require.extensions['.ts'] = (module, file) => module._compile(ts.transpileModule(fs.readFileSync(file, 'utf8'), {
  compilerOptions: {module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true},
}).outputText, file);
const store = require('../src/admin/db.ts');
const analytics = require('../src/admin/analytics.ts');
const countries = require('../src/admin/country-analytics.ts');
const {analyticsFailure} = require('../src/admin/analytics-failure.ts');
const realNow = Date.now, realWarn = console.warn;
let now = realNow(), locker;
Date.now = () => now;
const warnings = [];
console.warn = (...args) => warnings.push(args);
try {
  const connection = store.db();
  const versions = connection.prepare('SELECT * FROM schema_migrations ORDER BY version').all();
  assert.deepEqual(versions.map(row => row.version), [1, 2, 3]);
  assert.equal(connection.prepare('PRAGMA busy_timeout').get().timeout, 5000);
  const count = (table, column, id) => connection.prepare(`SELECT COUNT(*) n FROM ${table} WHERE ${column}=?`).get(id).n;
  const preserved = analytics.beginDownload('photo', 'LK');

  // Reproduce a maintenance error on a healthy migrated database, after a commit.
  connection.prepare('INSERT INTO download_events(correlation_id,event_type,media_type,created_at) VALUES(?,?,?,?)').run('expired-fixture', 'request_received', 'unknown', 1);
  connection.prepare('INSERT INTO daily_country_statistics VALUES(?,?,?,?,?,?,?)').run('2000-01-01', 'XX', 'photo', 1, 0, 0, 0);
  connection.exec(`CREATE TEMP TRIGGER fail_cleanup BEFORE DELETE ON daily_country_statistics
    WHEN OLD.day='2000-01-01' BEGIN SELECT RAISE(ABORT,'private SQL parameters instagram.com/user 192.0.2.1 auth-secret'); END;`);
  now += 3600001;
  const saved = analytics.beginDownload('reel', 'LK');
  assert.equal(count('download_requests', 'id', saved), 1);
  assert.equal(count('download_events', 'correlation_id', saved), 1);
  assert.equal(count('download_events', 'correlation_id', 'expired-fixture'), 1, 'Failed cleanup rolls back earlier deletes');
  assert.deepEqual(warnings.at(-1), ['[SaveFrame] Operational analytics operation failed.', {operation: 'cleanup', code: 'SQLITE_CONSTRAINT', category: 'query'}]);
  const warningCount = warnings.length;
  analytics.beginDownload('video');
  assert.equal(warnings.length, warningCount, 'Failed maintenance is throttled independently of writes');
  assert.ok(countries.countryReports().totals.requests >= 3, 'Country reports survive maintenance failure');
  assert.ok(analytics.reports().totals.requests >= 3);
  assert.ok(countries.countryCsv().includes('Sri Lanka'));
  connection.exec('DROP TRIGGER fail_cleanup');
  now += 59999;
  store.cleanup();
  assert.equal(count('daily_country_statistics', 'day', '2000-01-01'), 1);
  now += 1;
  store.cleanup();
  assert.equal(count('daily_country_statistics', 'day', '2000-01-01'), 0, 'Retry succeeds after one minute');
  assert.equal(count('download_events', 'correlation_id', 'expired-fixture'), 0);
  connection.prepare('INSERT INTO daily_country_statistics VALUES(?,?,?,?,?,?,?)').run('2000-01-01', 'XX', 'photo', 1, 0, 0, 0);
  now += 3599999;
  store.cleanup();
  assert.equal(count('daily_country_statistics', 'day', '2000-01-01'), 1, 'Success waits one hour');
  now += 1;
  store.cleanup();
  assert.equal(count('daily_country_statistics', 'day', '2000-01-01'), 0);

  // A failed request insert must roll back the preceding event insert too.
  connection.exec(`CREATE TEMP TRIGGER fail_event BEFORE INSERT ON download_requests
    BEGIN SELECT RAISE(ROLLBACK,'private SQL parameters instagram.com/user 192.0.2.1 auth-secret'); END;`);
  const failed = analytics.beginDownload('photo');
  assert.equal(count('download_requests', 'id', failed), 0);
  assert.equal(count('download_events', 'correlation_id', failed), 0);
  assert.deepEqual(warnings.at(-1)[1], {operation: 'record_event', code: 'SQLITE_CONSTRAINT', category: 'query'});
  connection.exec('DROP TRIGGER fail_event');
  connection.exec(`CREATE TEMP TRIGGER fail_country BEFORE INSERT ON daily_country_statistics
    BEGIN SELECT RAISE(ABORT,'private country record'); END;`);
  const totalsBefore = JSON.stringify(connection.prepare('SELECT * FROM daily_statistics ORDER BY day,media_type').all());
  const countriesBefore = JSON.stringify(connection.prepare('SELECT * FROM daily_country_statistics ORDER BY day,country_code,media_type').all());
  const aggregateFailure = analytics.beginDownload('photo', 'LK');
  assert.equal(count('download_events', 'correlation_id', aggregateFailure), 0);
  assert.equal(count('download_requests', 'id', aggregateFailure), 0);
  assert.equal(JSON.stringify(connection.prepare('SELECT * FROM daily_statistics ORDER BY day,media_type').all()), totalsBefore);
  assert.equal(JSON.stringify(connection.prepare('SELECT * FROM daily_country_statistics ORDER BY day,country_code,media_type').all()), countriesBefore);
  connection.exec('DROP TRIGGER fail_country');
  const recovered = analytics.beginDownload('photo', 'LK');
  analytics.jobEvent(recovered, 'media_prepared', null, 'photo');
  assert.equal(connection.prepare('SELECT status FROM download_requests WHERE id=?').get(recovered).status, 'prepared');

  // Actual independent WAL writer contention; production retains a 5-second timeout.
  connection.exec('PRAGMA busy_timeout=25');
  locker = new DatabaseSync(path.join(directory, 'saveframe-admin.sqlite'));
  locker.exec('BEGIN IMMEDIATE');
  const busy = analytics.beginDownload('audio');
  assert.equal(count('download_requests', 'id', busy), 0);
  assert.deepEqual(warnings.at(-1)[1], {operation: 'record_event', code: 'SQLITE_BUSY', category: 'contention'});
  locker.exec('ROLLBACK');
  locker.close(); locker = null;
  const afterLock = analytics.beginDownload('audio', 'LK');
  assert.equal(count('download_requests', 'id', afterLock), 1);
  connection.exec('PRAGMA busy_timeout=5000; PRAGMA query_only=ON');
  assert.doesNotThrow(() => analytics.beginDownload());
  assert.deepEqual(warnings.at(-1)[1], {operation: 'record_event', code: 'SQLITE_READONLY', category: 'access'});
  assert.doesNotThrow(() => analytics.attachJob(afterLock, 'private-job', 'audio'));
  assert.equal(warnings.at(-1)[1].operation, 'attach_job');
  connection.exec('PRAGMA query_only=OFF');
  analytics.attachJob(afterLock, 'private-job', 'audio');
  global.__saveframeAnalyticsRuntime = 'replacement-runtime';
  analytics.recoverInterruptedJobs();
  assert.equal(connection.prepare('SELECT error_code FROM download_requests WHERE id=?').get(afterLock).error_code, 'PROCESS_RESTARTED');

  // Arbitrary thrown values and extended codes cannot leak their contents.
  analyticsFailure('record_event', {code: 'SQLITE_BUSY_auth-secret', message: 'private', stack: 'private'});
  assert.deepEqual(warnings.at(-1)[1], {operation: 'record_event', code: 'UNKNOWN', category: 'unknown'});
  now += 60000;
  analyticsFailure('record_event', {errcode: 517, message: 'private'});
  assert.equal(warnings.at(-1)[1].code, 'SQLITE_BUSY');
  for (const [, detail] of warnings) assert.deepEqual(Object.keys(detail), ['operation', 'code', 'category']);
  for (const secret of ['instagram.com', '192.0.2.1', 'auth-secret', 'private', saved, recovered, afterLock]) {
    assert.ok(!JSON.stringify(warnings).includes(secret), 'Logs must contain only fixed safe diagnostic fields');
  }
  assert.equal(count('download_requests', 'id', preserved), 1);
  assert.deepEqual(connection.prepare('SELECT * FROM schema_migrations ORDER BY version').all(), versions);
  assert.equal(connection.prepare('PRAGMA integrity_check').get().integrity_check, 'ok');
  console.log('PASS: committed events survive cleanup failures; independent sanitized diagnostics; cleanup retry/hourly scheduling; transaction auto-rollback; actual SQLite busy/read-only failures; recovery; country reports and migrations preserved. Disposable databases only.');
} finally {
  console.warn = realWarn;
  Date.now = realNow;
  if (locker) locker.close();
  for (const connection of global.__saveframeAdminDbs?.values() || []) connection.close();
  fs.rmSync(directory, {recursive: true, force: true});
}
