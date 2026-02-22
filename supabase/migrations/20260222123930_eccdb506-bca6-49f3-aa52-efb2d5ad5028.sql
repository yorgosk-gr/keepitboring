-- Add currency column to positions table to track original trading currency
ALTER TABLE public.positions ADD COLUMN currency text NULL DEFAULT 'USD';