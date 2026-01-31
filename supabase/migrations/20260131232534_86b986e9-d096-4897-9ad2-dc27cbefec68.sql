-- Create etf_metadata table for caching ETF classifications
CREATE TABLE public.etf_metadata (
  ticker text PRIMARY KEY,
  full_name text,
  issuer text,
  tracks text,
  category text,
  sub_category text,
  geography text,
  is_broad_market boolean DEFAULT false,
  asset_class_details text,
  expense_ratio numeric,
  classified_at timestamp with time zone NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.etf_metadata ENABLE ROW LEVEL SECURITY;

-- Anyone can read ETF metadata (it's shared reference data)
CREATE POLICY "Anyone can read ETF metadata" 
ON public.etf_metadata 
FOR SELECT 
USING (true);

-- Authenticated users can insert/update ETF metadata
CREATE POLICY "Authenticated users can insert ETF metadata" 
ON public.etf_metadata 
FOR INSERT 
WITH CHECK (auth.uid() IS NOT NULL);

CREATE POLICY "Authenticated users can update ETF metadata" 
ON public.etf_metadata 
FOR UPDATE 
USING (auth.uid() IS NOT NULL);

-- Add manually_classified flag to positions table
ALTER TABLE public.positions 
ADD COLUMN manually_classified boolean DEFAULT false;