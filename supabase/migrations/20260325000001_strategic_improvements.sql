-- Decision outcome tracking
ALTER TABLE public.decision_log 
  ADD COLUMN IF NOT EXISTS ticker text,
  ADD COLUMN IF NOT EXISTS entry_price numeric,
  ADD COLUMN IF NOT EXISTS entry_date date,
  ADD COLUMN IF NOT EXISTS outcome_30d numeric,
  ADD COLUMN IF NOT EXISTS outcome_90d numeric,
  ADD COLUMN IF NOT EXISTS outcome_180d numeric,
  ADD COLUMN IF NOT EXISTS outcome_checked_at timestamptz,
  ADD COLUMN IF NOT EXISTS was_correct boolean;

-- Position review reminders
CREATE TABLE IF NOT EXISTS public.position_reviews (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  ticker text NOT NULL,
  review_type text NOT NULL CHECK (review_type IN ('conviction_check', 'volatility_alert', 'thesis_drift', 'anniversary')),
  triggered_at timestamptz NOT NULL DEFAULT now(),
  dismissed_at timestamptz,
  notes text,
  original_thesis text,
  original_confidence int,
  price_at_trigger numeric,
  price_change_pct numeric
);

ALTER TABLE public.position_reviews ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users own reviews" ON public.position_reviews 
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE INDEX IF NOT EXISTS idx_position_reviews_user ON public.position_reviews(user_id, triggered_at DESC);

-- Source reputation scores
CREATE TABLE IF NOT EXISTS public.newsletter_sources (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  source_name text NOT NULL,
  total_insights int DEFAULT 0,
  high_conviction_insights int DEFAULT 0,
  data_backed_insights int DEFAULT 0,
  avg_confidence_score numeric DEFAULT 0.5,
  style text,
  first_seen_at timestamptz DEFAULT now(),
  last_seen_at timestamptz DEFAULT now(),
  UNIQUE(user_id, source_name)
);

ALTER TABLE public.newsletter_sources ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users own sources" ON public.newsletter_sources 
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
