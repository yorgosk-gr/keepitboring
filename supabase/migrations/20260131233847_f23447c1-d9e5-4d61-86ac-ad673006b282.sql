-- Add is_archived column to newsletters table for archive system
ALTER TABLE public.newsletters 
ADD COLUMN is_archived boolean NOT NULL DEFAULT false;

-- Add is_summarized column to insights table for aggregation tracking
ALTER TABLE public.insights 
ADD COLUMN is_summarized boolean NOT NULL DEFAULT false;

-- Add summarized_from_ids column to track which insights were merged
ALTER TABLE public.insights 
ADD COLUMN summarized_from_ids uuid[] DEFAULT NULL;

-- Create index for faster archive queries
CREATE INDEX idx_newsletters_archived ON public.newsletters (is_archived, created_at DESC);

-- Create index for faster insight filtering
CREATE INDEX idx_insights_type_created ON public.insights (insight_type, created_at DESC);
CREATE INDEX idx_insights_tickers ON public.insights USING GIN (tickers_mentioned);