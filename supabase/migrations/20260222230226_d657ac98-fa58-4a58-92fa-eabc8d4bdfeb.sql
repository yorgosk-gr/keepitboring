
CREATE TABLE public.intelligence_briefs (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid NOT NULL,
  executive_summary text,
  key_points jsonb,
  action_items jsonb,
  market_themes jsonb,
  contrarian_signals text[],
  newsletters_analyzed integer,
  insights_analyzed integer,
  generated_at timestamp with time zone NOT NULL DEFAULT now(),
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

ALTER TABLE public.intelligence_briefs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own briefs" ON public.intelligence_briefs FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can create their own briefs" ON public.intelligence_briefs FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can delete their own briefs" ON public.intelligence_briefs FOR DELETE USING (auth.uid() = user_id);
