-- Enable pg_cron and pg_net extensions for scheduled edge function calls
-- These are already available on Supabase Pro plans

-- Schedule daily price refresh at 6:00 PM UTC (after US market close)
SELECT cron.schedule(
  'daily-price-refresh',
  '0 18 * * 1-5',  -- Mon-Fri at 18:00 UTC
  $$
  SELECT net.http_post(
    url := current_setting('app.settings.supabase_url') || '/functions/v1/cron-tasks',
    headers := jsonb_build_object(
      'Authorization', 'Bearer ' || current_setting('app.settings.service_role_key'),
      'Content-Type', 'application/json'
    ),
    body := '{"task": "refresh-prices"}'::jsonb
  );
  $$
);

-- Schedule newsletter processing every 2 hours
SELECT cron.schedule(
  'process-newsletters',
  '0 */2 * * *',  -- Every 2 hours
  $$
  SELECT net.http_post(
    url := current_setting('app.settings.supabase_url') || '/functions/v1/cron-tasks',
    headers := jsonb_build_object(
      'Authorization', 'Bearer ' || current_setting('app.settings.service_role_key'),
      'Content-Type', 'application/json'
    ),
    body := '{"task": "process-newsletters"}'::jsonb
  );
  $$
);

-- Schedule rule violation checks daily at 19:00 UTC (after price refresh)
SELECT cron.schedule(
  'daily-rule-check',
  '0 19 * * 1-5',  -- Mon-Fri at 19:00 UTC
  $$
  SELECT net.http_post(
    url := current_setting('app.settings.supabase_url') || '/functions/v1/cron-tasks',
    headers := jsonb_build_object(
      'Authorization', 'Bearer ' || current_setting('app.settings.service_role_key'),
      'Content-Type', 'application/json'
    ),
    body := '{"task": "check-rules"}'::jsonb
  );
  $$
);

-- Schedule weekly intelligence brief on Sundays at 10:00 UTC
SELECT cron.schedule(
  'weekly-brief',
  '0 10 * * 0',  -- Sunday at 10:00 UTC
  $$
  SELECT net.http_post(
    url := current_setting('app.settings.supabase_url') || '/functions/v1/cron-tasks',
    headers := jsonb_build_object(
      'Authorization', 'Bearer ' || current_setting('app.settings.service_role_key'),
      'Content-Type', 'application/json'
    ),
    body := '{"task": "summarize"}'::jsonb
  );
  $$
);
