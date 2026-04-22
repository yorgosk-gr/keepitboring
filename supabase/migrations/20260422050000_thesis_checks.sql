-- Persistent thesis health checks per position per analysis run.
-- Lets us track streaks ("NKE invalidated 3 runs in a row") and
-- feed that signal back into the next analysis prompt.

CREATE TABLE public.thesis_checks (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  analysis_id UUID NOT NULL REFERENCES public.analysis_history(id) ON DELETE CASCADE,
  ticker TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('invalidated', 'reinforced', 'stale', 'silent')),
  confidence TEXT NOT NULL DEFAULT 'medium' CHECK (confidence IN ('high', 'medium', 'low')),
  evidence TEXT,
  supporting_insight_ids UUID[] DEFAULT ARRAY[]::UUID[],
  thesis_snapshot TEXT,
  invalidation_trigger_snapshot TEXT,
  recommended_action TEXT CHECK (recommended_action IN ('SELL', 'TRIM', 'REVIEW', 'HOLD', 'ADD')),
  position_weight NUMERIC,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

CREATE INDEX idx_thesis_checks_user_ticker_created
  ON public.thesis_checks (user_id, ticker, created_at DESC);

CREATE INDEX idx_thesis_checks_analysis
  ON public.thesis_checks (analysis_id);

ALTER TABLE public.thesis_checks ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own thesis checks"
  ON public.thesis_checks FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own thesis checks"
  ON public.thesis_checks FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own thesis checks"
  ON public.thesis_checks FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own thesis checks"
  ON public.thesis_checks FOR DELETE
  USING (auth.uid() = user_id);

-- Streak view: for each (user, ticker), how many consecutive most-recent
-- checks share the current status. Used to drive escalation logic and UI.
CREATE OR REPLACE VIEW public.thesis_check_streaks AS
WITH ordered AS (
  SELECT
    user_id,
    ticker,
    status,
    confidence,
    evidence,
    recommended_action,
    created_at,
    analysis_id,
    ROW_NUMBER() OVER (PARTITION BY user_id, ticker ORDER BY created_at DESC) AS rn
  FROM public.thesis_checks
),
latest AS (
  SELECT user_id, ticker, status AS current_status
  FROM ordered
  WHERE rn = 1
),
run_tagged AS (
  SELECT
    o.*,
    l.current_status,
    CASE WHEN o.status = l.current_status THEN 1 ELSE 0 END AS matches
  FROM ordered o
  JOIN latest l USING (user_id, ticker)
),
first_break AS (
  SELECT user_id, ticker, MIN(rn) AS break_rn
  FROM run_tagged
  WHERE matches = 0
  GROUP BY user_id, ticker
)
SELECT
  l.user_id,
  l.ticker,
  l.current_status,
  COALESCE(fb.break_rn - 1, (SELECT MAX(rn) FROM ordered o2 WHERE o2.user_id = l.user_id AND o2.ticker = l.ticker)) AS streak_length,
  (SELECT o3.created_at FROM ordered o3 WHERE o3.user_id = l.user_id AND o3.ticker = l.ticker AND o3.rn = 1) AS last_checked_at,
  (SELECT o4.evidence FROM ordered o4 WHERE o4.user_id = l.user_id AND o4.ticker = l.ticker AND o4.rn = 1) AS last_evidence,
  (SELECT o5.recommended_action FROM ordered o5 WHERE o5.user_id = l.user_id AND o5.ticker = l.ticker AND o5.rn = 1) AS last_recommended_action
FROM latest l
LEFT JOIN first_break fb USING (user_id, ticker);

-- View inherits RLS from thesis_checks via security_invoker.
ALTER VIEW public.thesis_check_streaks SET (security_invoker = on);
