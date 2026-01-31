-- Create verification cache table for storing verified ticker data
CREATE TABLE public.verification_cache (
  ticker TEXT PRIMARY KEY,
  verified_data JSONB NOT NULL,
  verified_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.verification_cache ENABLE ROW LEVEL SECURITY;

-- Anyone can read cached verifications (public data)
CREATE POLICY "Anyone can read verification cache" 
ON public.verification_cache 
FOR SELECT 
USING (true);

-- Only authenticated users can insert/update cache
CREATE POLICY "Authenticated users can insert verification cache" 
ON public.verification_cache 
FOR INSERT 
WITH CHECK (auth.uid() IS NOT NULL);

CREATE POLICY "Authenticated users can update verification cache" 
ON public.verification_cache 
FOR UPDATE 
USING (auth.uid() IS NOT NULL);

-- Create index for faster lookups
CREATE INDEX idx_verification_cache_verified_at ON public.verification_cache(verified_at);