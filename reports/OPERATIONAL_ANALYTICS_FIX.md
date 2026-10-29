# Operational analytics warning investigation

Date: 2026-10-29

## Confirmed cause of misleading attribution

The former `bestEffort()` implementation in `src/admin/analytics.ts` used one catch for both `operation()` and `cleanup()`. An event transaction could commit successfully, then maintenance could throw and emit `[SaveFrame] Operational analytics storage is unavailable.` The warning could therefore originate from either event recording (including UTC and country aggregate rebuilding) or cleanup. It did not prove that an event was lost or that the database was corrupt. The process-wide warning flag then suppressed all subsequent failures, regardless of operation or recovery.

This failure path was reproduced with a cleanup-only SQLite trigger in a disposable, healthy WAL database with migrations 1–3. The new event and request remained committed while cleanup failed. Actual independent-writer contention and read-only failures were reproduced separately.

The exact exception that triggered the production warning remains unknown: the old catch discarded the error, and no production database or production exception trace was accessed for this work. Integrity checks, installed migrations, existing tables and subsequent successful writes do not rule out a transient lock or a maintenance-specific exception. Neither is asserted as the production cause.

## Changes

- Separate event/mutation failure handling from maintenance failure handling. Public analytics entry points remain best effort and return without throwing database failures into downloads.
- Emit a fixed warning with only `operation`, `code` and `category`. Operations are fixed internal names; SQLite primary codes are allowlisted, including normalization of Node SQLite numeric extended codes. Unknown errors become `UNKNOWN` / `unknown`. No error object, message, stack, identifiers, SQL, parameters, submitted input or records are logged.
- Throttle warnings per operation and safe code for one minute, allowing recurring failures to remain observable without the old lifetime suppression.
- Make analytics reports and country reports/exports tolerate maintenance failure while retaining normal failures for unavailable report data.
- Schedule cleanup per connection, one hour after success and one minute after failure. Cleanup remains synchronous and triggered by application activity; there is no new timer or background job. Forced CLI cleanup still bypasses the schedule and surfaces failure.
- Preserve the original transaction failure when SQLite has already auto-rolled back and a subsequent explicit rollback also fails.
- Configure the existing 5-second busy timeout before WAL initialization. `BEGIN IMMEDIATE` and atomic event/UTC/country aggregate transactions remain in place. Lock contention can still delay a synchronous attempt up to the configured timeout; failed writes are not queued or replayed automatically. Subsequent attempts recover after the lock clears.
- Leave authentication logic, migrations, schemas, aggregate definitions, and retention periods unchanged. No database reset or production data edits were performed.

## Verification

- `npm test`: passed, including admin authentication, migrations/history preservation, country statistics, downloads, privacy controls, and the new operational analytics regression suite.
- `node scripts/check-operational-analytics.cjs`: passed again after extending coverage for cleanup rollback and country aggregation failure.
- `npm run lint`: passed.
- `npm run typecheck`: passed.
- `npm run build`: passed, including build trace privacy checks.
- `git diff --check`: passed.

Regression coverage includes committed events surviving failed cleanup; atomic rollback of event/request/UTC/country writes; rollback preserving the original error; independent SQLite writer contention; read-only failures; subsequent successful writes; interrupted-job recovery; cleanup retry and hourly scheduling; report/export availability during maintenance failures; safe logging and throttling; unchanged migration records and database integrity.

No push or deployment was performed.
