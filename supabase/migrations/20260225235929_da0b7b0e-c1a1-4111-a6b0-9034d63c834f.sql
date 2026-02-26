
-- Fix: Remove overly permissive market_events write policy
-- Only the service role (edge functions) should write market events, 
-- and service role bypasses RLS anyway, so we only need the SELECT policy
DROP POLICY IF EXISTS "Service role manages market events" ON market_events;
