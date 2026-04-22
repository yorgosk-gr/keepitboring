-- Separate per-issue title from publisher/source name.
--
-- Previously `source_name` held the email subject, which is unique per issue
-- ("Waller's Warning", "Catalyst Watch"). That collapsed Source Rankings into
-- one row per issue instead of aggregating by publisher.
--
-- New model:
--   title       — the issue title / email subject (was source_name)
--   source_name — the publisher ("UBS Morning audio comment", "apolloacademy.com")
--
-- Historical rows have no From-header data, so we move their existing
-- source_name into title and clear source_name. Aggregated newsletter_sources
-- data is wiped so it rebuilds correctly from new ingests.

ALTER TABLE public.newsletters
  ADD COLUMN IF NOT EXISTS title TEXT;

-- Backfill title from the current source_name.
UPDATE public.newsletters
SET title = source_name
WHERE title IS NULL;

-- Drop NOT NULL constraint — source_name is now optional and populated
-- from the email's From header.
ALTER TABLE public.newsletters
  ALTER COLUMN source_name DROP NOT NULL;

-- Clear polluted per-issue values from historical rows. New ingests will
-- populate source_name from the From header going forward.
UPDATE public.newsletters
SET source_name = NULL;

-- Wipe stale aggregated rankings that were built from the old per-issue
-- source_name values. They will rebuild as new emails arrive.
DELETE FROM public.newsletter_sources;
