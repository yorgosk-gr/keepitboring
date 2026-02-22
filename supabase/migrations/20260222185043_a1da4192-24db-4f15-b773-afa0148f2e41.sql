
CREATE TABLE public.watchlist (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  ticker TEXT NOT NULL,
  name TEXT,
  position_type TEXT,
  category TEXT,
  target_price NUMERIC NOT NULL,
  invalidation_price NUMERIC,
  intended_size_percent NUMERIC,
  thesis TEXT,
  source TEXT,
  notes TEXT,
  current_price NUMERIC,
  currency TEXT DEFAULT 'USD',
  exchange TEXT,
  last_price_refresh TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.watchlist ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own watchlist"
  ON public.watchlist FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can create their own watchlist items"
  ON public.watchlist FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own watchlist items"
  ON public.watchlist FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own watchlist items"
  ON public.watchlist FOR DELETE
  USING (auth.uid() = user_id);

CREATE TRIGGER update_watchlist_updated_at
  BEFORE UPDATE ON public.watchlist
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();
