-- Fix newsletter pipeline: processing lock, missing columns, atomic reputation recalculation

-- 1. Add missing columns to newsletters
ALTER TABLE public.newsletters
  ADD COLUMN IF NOT EXISTS processing_started_at TIMESTAMPTZ DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS author TEXT DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS publication_date DATE DEFAULT NULL;

-- 2. Atomic reputation recalculation function
-- Replaces the read-then-write pattern that caused TOCTOU races and reprocess inflation
CREATE OR REPLACE FUNCTION public.recalculate_source_reputation(
  p_user_id UUID,
  p_source_name TEXT,
  p_style TEXT DEFAULT NULL
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_total INTEGER;
  v_high_conviction INTEGER;
  v_data_backed INTEGER;
  v_avg_confidence NUMERIC;
BEGIN
  SELECT
    COUNT(*),
    COUNT(*) FILTER (WHERE
      (i.metadata->>'source_confidence')::numeric >= 0.8
      OR i.metadata->>'conviction_level' = 'high'
    ),
    COUNT(*) FILTER (WHERE
      i.metadata->>'data_backed' = 'true'
    ),
    COALESCE(AVG(
      COALESCE((i.metadata->>'source_confidence')::numeric, 0.5)
    ), 0.5)
  INTO v_total, v_high_conviction, v_data_backed, v_avg_confidence
  FROM insights i
  JOIN newsletters n ON n.id = i.newsletter_id
  WHERE n.user_id = p_user_id
    AND n.source_name = p_source_name;

  INSERT INTO newsletter_sources (
    user_id, source_name, total_insights, high_conviction_insights,
    data_backed_insights, avg_confidence_score, style, last_seen_at
  ) VALUES (
    p_user_id, p_source_name, v_total, v_high_conviction,
    v_data_backed, ROUND(v_avg_confidence, 3), p_style, now()
  )
  ON CONFLICT (user_id, source_name) DO UPDATE SET
    total_insights = EXCLUDED.total_insights,
    high_conviction_insights = EXCLUDED.high_conviction_insights,
    data_backed_insights = EXCLUDED.data_backed_insights,
    avg_confidence_score = EXCLUDED.avg_confidence_score,
    style = COALESCE(EXCLUDED.style, newsletter_sources.style),
    last_seen_at = now();
END;
$$;
