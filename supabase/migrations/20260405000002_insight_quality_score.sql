-- Add quality scoring columns to insights table.
--
-- quality_score (1–5): auto-assigned during newsletter processing based on
-- data specificity, conviction, catalysts, and source quality. NULL for
-- insights processed before this migration.
--   1 = noise / filler (auto-excluded from brief)
--   2 = low quality (vague directional claim)
--   3 = medium (directional with some reasoning)
--   4 = good (specific claim, named source, or catalyst)
--   5 = strong (data-backed, high conviction, specific price target / hard data)
--
-- excluded_from_brief: user-controlled override. Auto-set to TRUE for
-- quality_score = 1. Users can flip this in the All Insights panel to
-- include/exclude any insight from the weekly brief regardless of score.

ALTER TABLE public.insights
  ADD COLUMN IF NOT EXISTS quality_score SMALLINT DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS excluded_from_brief BOOLEAN NOT NULL DEFAULT FALSE;

COMMENT ON COLUMN public.insights.quality_score IS '1–5 quality score. 1=noise, 5=high-conviction data-backed signal. NULL = pre-dates scoring feature.';
COMMENT ON COLUMN public.insights.excluded_from_brief IS 'When true, insight is skipped by the brief generator. Auto-set for score=1; user can override any insight.';
