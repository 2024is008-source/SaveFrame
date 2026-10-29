// Never forward Error objects, messages, stacks or arbitrary codes to logs.
type Operation = 'record_event' | 'attach_job' | 'recover_interrupted_jobs' | 'cleanup';
const primaryCodes: Record<number, string> = {
  1: 'SQLITE_ERROR', 2: 'SQLITE_INTERNAL', 3: 'SQLITE_PERM', 4: 'SQLITE_ABORT',
  5: 'SQLITE_BUSY', 6: 'SQLITE_LOCKED', 7: 'SQLITE_NOMEM', 8: 'SQLITE_READONLY',
  9: 'SQLITE_INTERRUPT', 10: 'SQLITE_IOERR', 11: 'SQLITE_CORRUPT', 12: 'SQLITE_NOTFOUND',
  13: 'SQLITE_FULL', 14: 'SQLITE_CANTOPEN', 15: 'SQLITE_PROTOCOL', 16: 'SQLITE_EMPTY',
  17: 'SQLITE_SCHEMA', 18: 'SQLITE_TOOBIG', 19: 'SQLITE_CONSTRAINT', 20: 'SQLITE_MISMATCH',
  21: 'SQLITE_MISUSE', 22: 'SQLITE_NOLFS', 23: 'SQLITE_AUTH', 24: 'SQLITE_FORMAT',
  25: 'SQLITE_RANGE', 26: 'SQLITE_NOTADB', 27: 'SQLITE_NOTICE', 28: 'SQLITE_WARNING',
};
const lastWarnings = new Map<string, number>();
export function analyticsFailure(operation: Operation, error: unknown) {
  let code = 'UNKNOWN';
  try {
    const value = error as {code?: unknown; errcode?: unknown} | null;
    if (typeof value?.errcode === 'number' && Number.isSafeInteger(value.errcode) && value.errcode > 0) {
      code = primaryCodes[value.errcode & 255] || 'UNKNOWN';
    } else if (typeof value?.code === 'string') {
      code = Object.values(primaryCodes).find(candidate => candidate === value.code) || 'UNKNOWN';
    }
  } catch { /* Untrusted error properties must not affect downloads. */ }
  const category = ['SQLITE_BUSY', 'SQLITE_LOCKED'].includes(code) ? 'contention'
    : ['SQLITE_PERM', 'SQLITE_READONLY', 'SQLITE_AUTH'].includes(code) ? 'access'
    : ['SQLITE_IOERR', 'SQLITE_FULL', 'SQLITE_CANTOPEN', 'SQLITE_NOLFS'].includes(code) ? 'storage'
    : ['SQLITE_CORRUPT', 'SQLITE_NOTADB'].includes(code) ? 'integrity'
    : ['SQLITE_ERROR', 'SQLITE_SCHEMA', 'SQLITE_CONSTRAINT', 'SQLITE_MISMATCH', 'SQLITE_RANGE'].includes(code) ? 'query'
    : code === 'UNKNOWN' ? 'unknown' : 'database';
  const key = operation + ':' + code, now = Date.now();
  if (lastWarnings.has(key) && now - lastWarnings.get(key)! < 60000) return;
  lastWarnings.set(key, now);
  try { console.warn('[SaveFrame] Operational analytics operation failed.', {operation, code, category}); }
  catch { /* Logging is best effort too. */ }
}
