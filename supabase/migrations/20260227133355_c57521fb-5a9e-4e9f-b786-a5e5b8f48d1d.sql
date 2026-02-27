
-- North Star Portfolio table
CREATE TABLE public.north_star_portfolio (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  name text DEFAULT 'Target Portfolio',
  description text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE public.north_star_portfolio ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own north star" ON public.north_star_portfolio FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can create their own north star" ON public.north_star_portfolio FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update their own north star" ON public.north_star_portfolio FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can delete their own north star" ON public.north_star_portfolio FOR DELETE USING (auth.uid() = user_id);

-- North Star Positions table
CREATE TABLE public.north_star_positions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  portfolio_id uuid NOT NULL REFERENCES public.north_star_portfolio(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  ticker text NOT NULL,
  name text,
  target_weight_min numeric,
  target_weight_max numeric,
  target_weight_ideal numeric,
  rationale text,
  priority int DEFAULT 1,
  status text DEFAULT 'hold',
  created_at timestamptz DEFAULT now()
);

ALTER TABLE public.north_star_positions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own ns positions" ON public.north_star_positions FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can create their own ns positions" ON public.north_star_positions FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update their own ns positions" ON public.north_star_positions FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can delete their own ns positions" ON public.north_star_positions FOR DELETE USING (auth.uid() = user_id);

-- Validation trigger for priority
CREATE OR REPLACE FUNCTION public.validate_ns_position()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $$
BEGIN
  IF NEW.priority < 1 OR NEW.priority > 3 THEN
    RAISE EXCEPTION 'priority must be between 1 and 3';
  END IF;
  IF NEW.status NOT IN ('build', 'hold', 'reduce', 'exit') THEN
    RAISE EXCEPTION 'status must be build, hold, reduce, or exit';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER validate_ns_position_trigger
BEFORE INSERT OR UPDATE ON public.north_star_positions
FOR EACH ROW EXECUTE FUNCTION public.validate_ns_position();
