-- Aggregate counters only. No per-visitor/event rows, IPs, cookies or identifiers.
CREATE TABLE daily_page_statistics (
  day TEXT NOT NULL,
  path TEXT NOT NULL,
  country_code TEXT NOT NULL,
  device TEXT NOT NULL,
  referrer TEXT NOT NULL,
  source TEXT NOT NULL,
  medium TEXT NOT NULL,
  ga4_policy TEXT NOT NULL,
  views INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY(day,path,country_code,device,referrer,source,medium,ga4_policy)
) WITHOUT ROWID;
