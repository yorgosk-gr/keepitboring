-- Attribution: link a decision_log entry back to the AI recommendation that spawned it.
-- Enables track-record scoring: how often recommendations get followed and how they pan out.

ALTER TABLE public.decision_log
  ADD COLUMN IF NOT EXISTS source_analysis_id UUID REFERENCES public.analysis_history(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS source_action_index INTEGER,
  ADD COLUMN IF NOT EXISTS executed_price NUMERIC,
  ADD COLUMN IF NOT EXISTS executed_shares NUMERIC;

CREATE INDEX IF NOT EXISTS idx_decision_log_source_analysis
  ON public.decision_log (source_analysis_id);
