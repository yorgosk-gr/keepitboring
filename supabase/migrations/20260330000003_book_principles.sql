-- Structured investment principles extracted from books
-- Used to enrich AI analysis with source-attributed wisdom
CREATE TABLE IF NOT EXISTS public.book_principles (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id),
  author TEXT NOT NULL,
  book TEXT NOT NULL,
  category TEXT NOT NULL, -- allocation, risk, behavior, valuation, market_cycle, position_sizing, contrarian, discipline
  condition TEXT NOT NULL, -- "When X happens" or "If portfolio shows Y"
  principle TEXT NOT NULL, -- The core insight
  action_implication TEXT NOT NULL, -- What to do about it
  tags TEXT[] DEFAULT '{}',
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

ALTER TABLE public.book_principles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage their own book principles"
ON public.book_principles
FOR ALL USING (auth.uid() = user_id);

-- Index for tag-based lookups
CREATE INDEX idx_book_principles_tags ON public.book_principles USING GIN (tags);
CREATE INDEX idx_book_principles_category ON public.book_principles (category);
