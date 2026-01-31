-- Create positions table
CREATE TABLE public.positions (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  ticker TEXT NOT NULL,
  name TEXT,
  position_type TEXT CHECK (position_type IN ('stock', 'etf')),
  category TEXT CHECK (category IN ('equity', 'bond', 'commodity', 'gold', 'country', 'theme')),
  shares NUMERIC,
  avg_cost NUMERIC,
  current_price NUMERIC,
  market_value NUMERIC,
  weight_percent NUMERIC,
  thesis_notes TEXT,
  bet_type TEXT CHECK (bet_type IN ('active', 'passive_carry', 'legacy_hold')),
  confidence_level INTEGER CHECK (confidence_level >= 1 AND confidence_level <= 10),
  last_review_date DATE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create philosophy_rules table
CREATE TABLE public.philosophy_rules (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT,
  rule_type TEXT CHECK (rule_type IN ('allocation', 'position_size', 'quality', 'decision', 'market')),
  threshold_min NUMERIC,
  threshold_max NUMERIC,
  is_active BOOLEAN NOT NULL DEFAULT true,
  source_books TEXT[],
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create newsletters table
CREATE TABLE public.newsletters (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  source_name TEXT NOT NULL,
  upload_date DATE NOT NULL DEFAULT CURRENT_DATE,
  raw_text TEXT,
  file_path TEXT,
  processed BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create insights table
CREATE TABLE public.insights (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  newsletter_id UUID NOT NULL REFERENCES public.newsletters(id) ON DELETE CASCADE,
  insight_type TEXT CHECK (insight_type IN ('stock_mention', 'macro', 'sentiment', 'bubble_signal', 'recommendation')),
  content TEXT,
  tickers_mentioned TEXT[],
  sentiment TEXT CHECK (sentiment IN ('bullish', 'bearish', 'neutral')),
  confidence_words TEXT[],
  is_starred BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create alerts table
CREATE TABLE public.alerts (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  rule_id UUID REFERENCES public.philosophy_rules(id) ON DELETE SET NULL,
  position_id UUID REFERENCES public.positions(id) ON DELETE SET NULL,
  alert_type TEXT CHECK (alert_type IN ('position', 'portfolio', 'market')),
  severity TEXT CHECK (severity IN ('info', 'warning', 'critical')),
  message TEXT NOT NULL,
  resolved BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create decision_log table
CREATE TABLE public.decision_log (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  position_id UUID REFERENCES public.positions(id) ON DELETE SET NULL,
  action_type TEXT CHECK (action_type IN ('buy', 'sell', 'hold', 'trim', 'add', 'rebalance')),
  reasoning TEXT,
  information_set TEXT,
  confidence_level INTEGER CHECK (confidence_level >= 1 AND confidence_level <= 10),
  probability_estimate TEXT,
  invalidation_triggers TEXT,
  outcome_notes TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create portfolio_snapshots table
CREATE TABLE public.portfolio_snapshots (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  snapshot_date DATE NOT NULL DEFAULT CURRENT_DATE,
  total_value NUMERIC,
  cash_balance NUMERIC,
  stocks_percent NUMERIC,
  etfs_percent NUMERIC,
  data_json JSONB,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable Row Level Security on all tables
ALTER TABLE public.positions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.philosophy_rules ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.newsletters ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.insights ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.alerts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.decision_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.portfolio_snapshots ENABLE ROW LEVEL SECURITY;

-- RLS Policies for positions
CREATE POLICY "Users can view their own positions" ON public.positions
  FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can create their own positions" ON public.positions
  FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update their own positions" ON public.positions
  FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can delete their own positions" ON public.positions
  FOR DELETE USING (auth.uid() = user_id);

-- RLS Policies for philosophy_rules
CREATE POLICY "Users can view their own philosophy rules" ON public.philosophy_rules
  FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can create their own philosophy rules" ON public.philosophy_rules
  FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update their own philosophy rules" ON public.philosophy_rules
  FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can delete their own philosophy rules" ON public.philosophy_rules
  FOR DELETE USING (auth.uid() = user_id);

-- RLS Policies for newsletters
CREATE POLICY "Users can view their own newsletters" ON public.newsletters
  FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can create their own newsletters" ON public.newsletters
  FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update their own newsletters" ON public.newsletters
  FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can delete their own newsletters" ON public.newsletters
  FOR DELETE USING (auth.uid() = user_id);

-- RLS Policies for insights (through newsletter ownership)
CREATE POLICY "Users can view insights from their newsletters" ON public.insights
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.newsletters 
      WHERE newsletters.id = insights.newsletter_id 
      AND newsletters.user_id = auth.uid()
    )
  );
CREATE POLICY "Users can create insights for their newsletters" ON public.insights
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.newsletters 
      WHERE newsletters.id = insights.newsletter_id 
      AND newsletters.user_id = auth.uid()
    )
  );
CREATE POLICY "Users can update insights from their newsletters" ON public.insights
  FOR UPDATE USING (
    EXISTS (
      SELECT 1 FROM public.newsletters 
      WHERE newsletters.id = insights.newsletter_id 
      AND newsletters.user_id = auth.uid()
    )
  );
CREATE POLICY "Users can delete insights from their newsletters" ON public.insights
  FOR DELETE USING (
    EXISTS (
      SELECT 1 FROM public.newsletters 
      WHERE newsletters.id = insights.newsletter_id 
      AND newsletters.user_id = auth.uid()
    )
  );

-- RLS Policies for alerts
CREATE POLICY "Users can view their own alerts" ON public.alerts
  FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can create their own alerts" ON public.alerts
  FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update their own alerts" ON public.alerts
  FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can delete their own alerts" ON public.alerts
  FOR DELETE USING (auth.uid() = user_id);

-- RLS Policies for decision_log
CREATE POLICY "Users can view their own decision logs" ON public.decision_log
  FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can create their own decision logs" ON public.decision_log
  FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update their own decision logs" ON public.decision_log
  FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can delete their own decision logs" ON public.decision_log
  FOR DELETE USING (auth.uid() = user_id);

-- RLS Policies for portfolio_snapshots
CREATE POLICY "Users can view their own portfolio snapshots" ON public.portfolio_snapshots
  FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can create their own portfolio snapshots" ON public.portfolio_snapshots
  FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update their own portfolio snapshots" ON public.portfolio_snapshots
  FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can delete their own portfolio snapshots" ON public.portfolio_snapshots
  FOR DELETE USING (auth.uid() = user_id);

-- Create updated_at trigger function
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Add trigger to positions table
CREATE TRIGGER update_positions_updated_at
  BEFORE UPDATE ON public.positions
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- Create storage bucket for uploads
INSERT INTO storage.buckets (id, name, public)
VALUES ('uploads', 'uploads', false);

-- Storage RLS policies
CREATE POLICY "Users can view their own uploads" ON storage.objects
  FOR SELECT USING (bucket_id = 'uploads' AND auth.uid()::text = (storage.foldername(name))[1]);

CREATE POLICY "Users can upload to their own folder" ON storage.objects
  FOR INSERT WITH CHECK (bucket_id = 'uploads' AND auth.uid()::text = (storage.foldername(name))[1]);

CREATE POLICY "Users can update their own uploads" ON storage.objects
  FOR UPDATE USING (bucket_id = 'uploads' AND auth.uid()::text = (storage.foldername(name))[1]);

CREATE POLICY "Users can delete their own uploads" ON storage.objects
  FOR DELETE USING (bucket_id = 'uploads' AND auth.uid()::text = (storage.foldername(name))[1]);