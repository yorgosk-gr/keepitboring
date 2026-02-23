
-- Add v2 rule schema columns
ALTER TABLE public.philosophy_rules ADD COLUMN scope text NOT NULL DEFAULT 'portfolio';
ALTER TABLE public.philosophy_rules ADD COLUMN category text NOT NULL DEFAULT 'allocation';
ALTER TABLE public.philosophy_rules ADD COLUMN metric text NOT NULL DEFAULT '';
ALTER TABLE public.philosophy_rules ADD COLUMN operator text NOT NULL DEFAULT 'between';
ALTER TABLE public.philosophy_rules ADD COLUMN tags text[] NOT NULL DEFAULT '{}';
ALTER TABLE public.philosophy_rules ADD COLUMN message_on_breach text NOT NULL DEFAULT '';
ALTER TABLE public.philosophy_rules ADD COLUMN scoring_weight numeric DEFAULT 1;
