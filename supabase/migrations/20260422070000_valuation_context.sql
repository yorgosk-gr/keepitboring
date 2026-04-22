-- Valuation context: macro/valuation anchors pulled from external sources
-- (FRED) and newsletter-extracted mentions. Feeds the analyze-portfolio
-- prompt as a forward-looking anti-momentum signal.
--
-- Global data (not per-user). Readable by any authenticated user; writes
-- happen via service role from scheduled edge functions.

CREATE TABLE public.valuation_context (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  series_key TEXT NOT NULL,
  value NUMERIC,
  value_text TEXT,
  as_of DATE NOT NULL,
  source TEXT NOT NULL,
  label TEXT,
  interpretation TEXT,
  metadata JSONB DEFAULT '{}'::JSONB,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE (series_key, as_of)
);

CREATE INDEX idx_valuation_context_key_asof
  ON public.valuation_context (series_key, as_of DESC);

CREATE INDEX idx_valuation_context_source_asof
  ON public.valuation_context (source, as_of DESC);

ALTER TABLE public.valuation_context ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can read valuation context"
  ON public.valuation_context FOR SELECT
  TO authenticated
  USING (true);

-- No INSERT/UPDATE/DELETE policy: writes must use service role.

-- Add newsletter-extracted valuation mentions to intelligence briefs.
-- Each entry: { asset: "S&P 500", metric: "forward P/E", value: "22x", vs_history: "high|low|neutral", source_snippet: "..." }
ALTER TABLE public.intelligence_briefs
  ADD COLUMN IF NOT EXISTS valuation_mentions JSONB DEFAULT '[]'::JSONB;
