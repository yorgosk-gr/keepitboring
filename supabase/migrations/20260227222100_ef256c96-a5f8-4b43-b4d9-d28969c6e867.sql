ALTER TABLE public.north_star_portfolio
  ADD COLUMN cash_target_ideal numeric DEFAULT 10,
  ADD COLUMN cash_target_min numeric DEFAULT 8,
  ADD COLUMN cash_target_max numeric DEFAULT 15;