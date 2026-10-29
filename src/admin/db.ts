import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { DatabaseSync } from 'node:sqlite';

declare global { var __saveframeAdminDbs: Map<string, DatabaseSync> | undefined; }
export function dataDirectory() {
  const directory = path.resolve(process.env.SAVEFRAME_ADMIN_DATA_DIR || path.join(process.cwd(), '.data'));
  const publicDir = path.resolve(process.cwd(), 'public');
  const relative = path.relative(publicDir, directory);
  if (!relative || (!relative.startsWith('..' + path.sep) && !path.isAbsolute(relative))) throw Error('Admin data must be outside public/');
  fs.mkdirSync(directory, { recursive: true, mode: 0o700 });
  if (fs.lstatSync(directory).isSymbolicLink()) throw Error('Admin data directory cannot be a symlink');
  const resolved = fs.realpathSync(directory);
  if (resolved === publicDir || resolved.startsWith(publicDir + path.sep)) throw Error('Admin data cannot resolve inside public/');
  return directory;
}
export function db(): DatabaseSync {
  const filename = path.join(dataDirectory(), 'saveframe-admin.sqlite');
  global.__saveframeAdminDbs ||= new Map();
  if (global.__saveframeAdminDbs.has(filename)) return global.__saveframeAdminDbs.get(filename)!;
  if (fs.existsSync(filename) && fs.lstatSync(filename).isSymbolicLink()) throw Error('Database cannot be a symlink');
  const connection = new DatabaseSync(filename);
  connection.exec('PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON; PRAGMA busy_timeout=5000; PRAGMA synchronous=NORMAL;');
  connection.exec('CREATE TABLE IF NOT EXISTS schema_migrations(version INTEGER PRIMARY KEY, applied_at INTEGER NOT NULL)');
  if (!connection.prepare('SELECT version FROM schema_migrations WHERE version=1').get()) {
    connection.exec('BEGIN IMMEDIATE');
    try {
      if (!connection.prepare('SELECT version FROM schema_migrations WHERE version=1').get()) {
        connection.exec(fs.readFileSync(path.join(process.cwd(), 'src/admin/migrations/001-admin.sql'), 'utf8'));
        connection.prepare('INSERT INTO schema_migrations VALUES(1,?)').run(Date.now());
      }
      connection.exec('COMMIT');
    } catch (error) { connection.exec('ROLLBACK'); connection.close(); throw error; }
  }
  if (!connection.prepare('SELECT version FROM schema_migrations WHERE version=2').get()) {
    connection.exec('BEGIN IMMEDIATE');
    try {
      if (!connection.prepare('SELECT version FROM schema_migrations WHERE version=2').get()) {
        connection.exec(fs.readFileSync(path.join(process.cwd(), 'src/admin/migrations/002-email-login.sql'), 'utf8'));
        connection.prepare('INSERT INTO schema_migrations VALUES(2,?)').run(Date.now());
      }
      connection.exec('COMMIT');
    } catch(error) {connection.exec('ROLLBACK');connection.close();throw error;}
  }
  if (!connection.prepare('SELECT version FROM schema_migrations WHERE version=3').get()) {
    connection.exec('BEGIN IMMEDIATE');
    try {
      if (!connection.prepare('SELECT version FROM schema_migrations WHERE version=3').get()) {
        connection.exec(fs.readFileSync(path.join(process.cwd(), 'src/admin/migrations/003-country-analytics.sql'), 'utf8'));
        connection.prepare('INSERT INTO schema_migrations VALUES(3,?)').run(Date.now());
      }
      connection.exec('COMMIT');
    } catch (error) { connection.exec('ROLLBACK'); connection.close(); throw error; }
  }
  try { fs.chmodSync(filename, 0o600); } catch { /* Windows uses its directory ACL. */ }
  global.__saveframeAdminDbs.set(filename, connection);
  return connection;
}
export function transaction<T>(operation: () => T): T {
  const connection = db(); connection.exec('BEGIN IMMEDIATE');
  try { const result = operation(); connection.exec('COMMIT'); return result; }
  catch (error) { connection.exec('ROLLBACK'); throw error; }
}
export function serverKey(): Buffer {
  const configured = process.env.SAVEFRAME_ADMIN_SECRET;
  if (configured) {
    if (configured.length < 32) throw Error('SAVEFRAME_ADMIN_SECRET must have at least 32 characters');
    return crypto.createHash('sha256').update(configured).digest();
  }
  const filename = path.join(dataDirectory(), 'session.key');
  if (fs.existsSync(filename) && fs.lstatSync(filename).isSymbolicLink()) throw Error('Session key cannot be a symlink');
  if (!fs.existsSync(filename)) {
    try { fs.writeFileSync(filename, crypto.randomBytes(32), { flag: 'wx', mode: 0o600 }); }
    catch (error: any) { if (error.code !== 'EEXIST') throw error; }
  }
  const key = fs.readFileSync(filename);
  if (key.length !== 32) throw Error('Invalid private session key');
  return key;
}
export function audit(actor: string | null, action: string, target: string, detail = '') {
  db().prepare('INSERT INTO admin_audit_events(actor_id,action,target,detail,created_at) VALUES(?,?,?,?,?)').run(actor, action.slice(0,80), target.slice(0,200), detail.slice(0,500), Date.now());
}
export const settingDefaults: Record<string, string> = {
  site_name: 'SaveFrame', contact_email: process.env.SAVEFRAME_SUPPORT_EMAIL || 'backbencherz@gmail.com',
  default_description: 'Download public Instagram Reels, videos, photos, carousels, and MP3 audio with a simple link.',
  default_social_image: '/social/saveframe.png', analytics_retention_days: '30', default_tool: 'photo',
};
export function settings(): Record<string, string> {
  const result = { ...settingDefaults };
  for (const row of db().prepare('SELECT key,value FROM public_settings').all() as any[]) if (Object.hasOwn(result,row.key)) result[row.key] = row.value;
  return result;
}
export function publicSettings() {
  if(process.env.SAVEFRAME_DISABLE_SEO_OVERRIDES==='1') return {siteName:settingDefaults.site_name,contactEmail:settingDefaults.contact_email,defaultTool:'photo',defaultDescription:settingDefaults.default_description,defaultSocialImage:settingDefaults.default_social_image};
  try { const value = settings(); return { siteName: value.site_name, contactEmail: value.contact_email, defaultTool: value.default_tool, defaultDescription: value.default_description, defaultSocialImage: value.default_social_image }; }
  catch { return { siteName: settingDefaults.site_name, contactEmail: settingDefaults.contact_email, defaultTool: 'photo', defaultDescription: settingDefaults.default_description, defaultSocialImage: settingDefaults.default_social_image }; }
}
let lastCleanup = 0;
export function cleanup(force = false) {
  const now = Date.now();
  if (!force && now - lastCleanup < 3600000) return;
  lastCleanup = now;
  const retention = Math.min(180, Math.max(7, Number(settings().analytics_retention_days) || 30));
  transaction(() => {
    const cutoff = now - retention * 86400000;
    db().prepare('DELETE FROM download_events WHERE created_at < ?').run(cutoff);
    db().prepare('DELETE FROM download_requests WHERE requested_at < ?').run(cutoff);
    db().prepare('DELETE FROM daily_statistics WHERE day < ?').run(new Date(now - 730 * 86400000).toISOString().slice(0,10));
    db().prepare('DELETE FROM daily_country_statistics WHERE day < ?').run(new Date(now + 19800000 - 730 * 86400000).toISOString().slice(0,10));
    db().prepare('DELETE FROM admin_sessions WHERE expires_at < ? OR last_seen < ?').run(now, now - 1800000);
    db().prepare('DELETE FROM login_limits WHERE reset_at < ?').run(now);
    db().prepare('DELETE FROM admin_email_challenges WHERE expires_at < ?').run(now);
    db().prepare('DELETE FROM admin_audit_events WHERE created_at < ?').run(now - 180 * 86400000);
    db().exec('DELETE FROM seo_revisions WHERE id NOT IN (SELECT id FROM (SELECT id, ROW_NUMBER() OVER(PARTITION BY route ORDER BY id DESC) AS n FROM seo_revisions) WHERE n <= 100)');
  });
}
