ALTER TABLE download_requests ADD COLUMN country_code TEXT NOT NULL DEFAULT 'XX' CHECK (country_code GLOB '[A-Z][A-Z]');
ALTER TABLE download_requests ADD COLUMN is_zip INTEGER NOT NULL DEFAULT 0 CHECK (is_zip IN (0,1));
ALTER TABLE download_requests ADD COLUMN delivery_failed_at INTEGER;
ALTER TABLE download_events ADD COLUMN country_code TEXT NOT NULL DEFAULT 'XX' CHECK (country_code GLOB '[A-Z][A-Z]');

CREATE INDEX requests_country_time ON download_requests(country_code, requested_at, media_type);
CREATE TABLE daily_country_statistics (
  day TEXT NOT NULL,
  country_code TEXT NOT NULL,
  media_type TEXT NOT NULL,
  requests INTEGER NOT NULL,
  prepared INTEGER NOT NULL,
  delivered INTEGER NOT NULL,
  failed INTEGER NOT NULL,
  PRIMARY KEY (day, country_code, media_type)
);

UPDATE download_requests SET delivery_failed_at = (
  SELECT MIN(created_at) FROM download_events
  WHERE correlation_id = download_requests.id AND event_type = 'delivery_failed'
);

-- Only retained raw timestamps support a truthful Colombo-date backfill.
-- Older UTC daily aggregates cannot be split into Sri Lanka reporting days.
INSERT INTO daily_country_statistics
SELECT date(requested_at / 1000.0, 'unixepoch', '+05:30'), 'XX', media_type,
  COUNT(*), SUM(prepared_at IS NOT NULL), SUM(delivered_at IS NOT NULL),
  SUM(failed_at IS NOT NULL OR (delivery_failed_at IS NOT NULL AND delivered_at IS NULL))
FROM download_requests GROUP BY 1, 2, 3;
