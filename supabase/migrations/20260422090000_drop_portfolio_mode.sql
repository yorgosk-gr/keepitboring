-- Philosophy Mode was removed from the app (Risk Profile is strictly more
-- capable). Drop the now-unused column.
ALTER TABLE public.user_settings DROP COLUMN IF EXISTS portfolio_mode;
