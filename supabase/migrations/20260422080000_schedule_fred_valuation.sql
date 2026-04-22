-- Weekly FRED valuation refresh. Calls the fetch-fred-valuation edge function
-- via pg_net every Monday at 12:00 UTC. The function is deployed with
-- --no-verify-jwt, so no auth header is needed.

CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;

-- Remove any prior version of this job to keep the migration idempotent.
DO $$
BEGIN
  PERFORM cron.unschedule('weekly-fred-valuation-refresh');
EXCEPTION WHEN OTHERS THEN
  -- job didn't exist — ignore
  NULL;
END $$;

SELECT cron.schedule(
  'weekly-fred-valuation-refresh',
  '0 12 * * 1', -- every Monday at 12:00 UTC
  $$
  SELECT net.http_post(
    url := 'https://fltouhivhclbmctjzcts.supabase.co/functions/v1/fetch-fred-valuation',
    headers := '{"Content-Type": "application/json"}'::JSONB,
    body := '{}'::JSONB
  );
  $$
);
