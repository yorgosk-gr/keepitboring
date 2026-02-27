
-- Create portfolio_strategy table
CREATE TABLE public.portfolio_strategy (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  mandate text,
  philosophy text,
  target_description text,
  priorities text[],
  positions_to_build jsonb,
  positions_to_exit jsonb,
  constraints text,
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.portfolio_strategy ENABLE ROW LEVEL SECURITY;

-- RLS policies
CREATE POLICY "Users can view their own strategy"
ON public.portfolio_strategy FOR SELECT
USING (auth.uid() = user_id);

CREATE POLICY "Users can create their own strategy"
ON public.portfolio_strategy FOR INSERT
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own strategy"
ON public.portfolio_strategy FOR UPDATE
USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own strategy"
ON public.portfolio_strategy FOR DELETE
USING (auth.uid() = user_id);
