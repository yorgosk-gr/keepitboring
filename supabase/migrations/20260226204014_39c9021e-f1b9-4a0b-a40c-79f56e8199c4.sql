
-- NAV history table
CREATE TABLE public.ib_nav_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  report_date date NOT NULL,
  cash numeric,
  stock numeric,
  bonds numeric,
  funds numeric,
  total_nav numeric,
  created_at timestamptz DEFAULT now(),
  UNIQUE(user_id, report_date)
);

-- TWR history table
CREATE TABLE public.ib_twr_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  from_date date,
  to_date date,
  starting_value numeric,
  ending_value numeric,
  mark_to_market numeric,
  deposits_withdrawals numeric,
  dividends numeric,
  interest numeric,
  commissions numeric,
  twr numeric,
  created_at timestamptz DEFAULT now()
);

-- Add performance_query_id to ib_accounts
ALTER TABLE public.ib_accounts ADD COLUMN IF NOT EXISTS performance_query_id text;

-- Enable RLS
ALTER TABLE public.ib_nav_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ib_twr_history ENABLE ROW LEVEL SECURITY;

-- RLS policies
CREATE POLICY "users_own_nav" ON public.ib_nav_history FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "users_own_twr" ON public.ib_twr_history FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
