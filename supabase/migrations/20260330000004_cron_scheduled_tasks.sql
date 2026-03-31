-- Cron scheduled tasks for automated pipeline
--
-- pg_cron is not enabled on this project. Set up scheduled tasks manually:
--
-- Option A: Enable pg_cron via Supabase Dashboard → Database → Extensions,
--           then run the cron.schedule() calls below in the SQL Editor.
--
-- Option B: Use an external scheduler (e.g. GitHub Actions, cron job, or
--           Claude Code scheduled-tasks MCP) to POST to the cron-tasks edge function.
--
-- Schedules to set up:
--   1. Daily price refresh: Mon-Fri 18:00 UTC  →  POST /functions/v1/cron-tasks {"task":"refresh-prices"}
--   2. Newsletter processing: Every 2 hours     →  POST /functions/v1/cron-tasks {"task":"process-newsletters"}
--   3. Rule violation check: Mon-Fri 19:00 UTC  →  POST /functions/v1/cron-tasks {"task":"check-rules"}
--   4. Weekly brief: Sunday 10:00 UTC           →  POST /functions/v1/cron-tasks {"task":"summarize"}
--
-- All requests require: Authorization: Bearer <service_role_key>

SELECT 1; -- no-op placeholder
