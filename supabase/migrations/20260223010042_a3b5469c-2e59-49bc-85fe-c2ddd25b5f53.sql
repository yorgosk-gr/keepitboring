
-- Add fundamentals JSONB column to positions table
ALTER TABLE public.positions ADD COLUMN fundamentals jsonb DEFAULT NULL;

-- Add last_fundamentals_refresh timestamp
ALTER TABLE public.positions ADD COLUMN last_fundamentals_refresh timestamp with time zone DEFAULT NULL;
