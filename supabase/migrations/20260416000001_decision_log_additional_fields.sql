-- Split information_set into three clean columns instead of markdown-concatenated text.
ALTER TABLE public.decision_log
  ADD COLUMN IF NOT EXISTS alternative_scenarios text,
  ADD COLUMN IF NOT EXISTS reversal_information text;
