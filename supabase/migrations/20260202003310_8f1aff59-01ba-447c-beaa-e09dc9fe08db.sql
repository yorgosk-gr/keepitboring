-- Add exchange column to positions table
ALTER TABLE public.positions 
ADD COLUMN exchange text;