-- Create analysis_history table to store analysis results
CREATE TABLE public.analysis_history (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  health_score INTEGER,
  allocation_check JSONB,
  position_alerts JSONB,
  thesis_checks JSONB,
  market_signals JSONB,
  recommended_actions JSONB,
  key_risks TEXT[],
  summary TEXT,
  raw_response JSONB
);

-- Enable Row Level Security
ALTER TABLE public.analysis_history ENABLE ROW LEVEL SECURITY;

-- Create policies for user access
CREATE POLICY "Users can view their own analysis history" 
ON public.analysis_history 
FOR SELECT 
USING (auth.uid() = user_id);

CREATE POLICY "Users can create their own analysis history" 
ON public.analysis_history 
FOR INSERT 
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete their own analysis history" 
ON public.analysis_history 
FOR DELETE 
USING (auth.uid() = user_id);