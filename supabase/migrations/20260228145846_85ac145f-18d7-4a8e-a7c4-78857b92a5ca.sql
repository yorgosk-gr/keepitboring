ALTER TABLE public.intelligence_briefs
  ADD COLUMN IF NOT EXISTS letter text,
  ADD COLUMN IF NOT EXISTS section_titles jsonb,
  ADD COLUMN IF NOT EXISTS stocks_to_research jsonb,
  ADD COLUMN IF NOT EXISTS country_tilts jsonb,
  ADD COLUMN IF NOT EXISTS sector_tilts jsonb,
  ADD COLUMN IF NOT EXISTS crowded_trades text[],
  ADD COLUMN IF NOT EXISTS weekly_priority text;