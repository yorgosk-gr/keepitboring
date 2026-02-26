
-- 1. IB Account connections
CREATE TABLE IF NOT EXISTS ib_accounts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  ib_account_id text NOT NULL,
  flex_token text NOT NULL,
  flex_query_id text NOT NULL,
  last_synced_at timestamptz,
  created_at timestamptz DEFAULT now(),
  UNIQUE(user_id, ib_account_id)
);

-- 2. Raw trades from IB
CREATE TABLE IF NOT EXISTS ib_trades (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  ib_account_id text NOT NULL,
  trade_id text,
  transaction_id text UNIQUE,
  symbol text,
  description text,
  asset_class text,
  sub_category text,
  exchange text,
  trade_date date,
  date_time timestamptz,
  settle_date date,
  buy_sell text,
  quantity numeric,
  trade_price numeric,
  trade_money numeric,
  proceeds numeric,
  ib_commission numeric,
  net_cash numeric,
  cost_basis numeric,
  realized_pnl numeric,
  open_close text,
  order_type text,
  notes text,
  level_of_detail text,
  report_date date,
  raw_xml jsonb,
  created_at timestamptz DEFAULT now()
);

-- 3. Open positions snapshot
CREATE TABLE IF NOT EXISTS ib_positions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  ib_account_id text NOT NULL,
  symbol text,
  description text,
  asset_class text,
  sub_category text,
  quantity numeric,
  mark_price numeric,
  position_value numeric,
  cost_basis_price numeric,
  cost_basis_money numeric,
  percent_of_nav numeric,
  unrealized_pnl numeric,
  side text,
  open_date_time timestamptz,
  report_date date,
  synced_at timestamptz DEFAULT now(),
  created_at timestamptz DEFAULT now()
);

-- 4. Cash transactions
CREATE TABLE IF NOT EXISTS ib_cash_transactions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  ib_account_id text NOT NULL,
  transaction_id text UNIQUE,
  symbol text,
  description text,
  asset_class text,
  currency text,
  date_time timestamptz,
  settle_date date,
  amount numeric,
  type text,
  report_date date,
  created_at timestamptz DEFAULT now()
);

-- 5. Market events (populated manually or via data feed)
CREATE TABLE IF NOT EXISTS market_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_date date NOT NULL,
  event_type text,
  title text NOT NULL,
  description text,
  severity int CHECK (severity BETWEEN 1 AND 3),
  index_move_pct numeric,
  source text,
  created_at timestamptz DEFAULT now()
);

-- 6. Behavioral signals (correlated trades + events)
CREATE TABLE IF NOT EXISTS behavioral_signals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  trade_id uuid REFERENCES ib_trades(id),
  market_event_id uuid REFERENCES market_events(id),
  symbol text,
  action text,
  aligned boolean,
  profile_at_time text,
  signal_date date,
  notes text,
  created_at timestamptz DEFAULT now()
);

-- 7. Risk profile history
CREATE TABLE IF NOT EXISTS risk_profiles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  profile text NOT NULL CHECK (profile IN ('cautious', 'balanced', 'growth', 'aggressive')),
  score int,
  dimension_scores jsonb,
  source text CHECK (source IN ('onboarding', 'update')),
  is_active boolean DEFAULT true,
  applied_at timestamptz DEFAULT now(),
  created_at timestamptz DEFAULT now()
);

-- Seed market events
INSERT INTO market_events (event_date, event_type, title, description, severity, index_move_pct, source) VALUES
  ('2024-08-05', 'market_drop',    'Global sell-off — carry trade unwind',     'Nikkei dropped 12%, S&P fell 3% on yen carry trade unwinding', 3, -3.0,  'Bloomberg'),
  ('2024-09-18', 'rate_decision',  'Fed cuts rates 50bps',                     'First Fed rate cut since 2020, larger than expected', 2, 1.7,   'Federal Reserve'),
  ('2024-11-05', 'macro_shock',    'US Election — Trump wins',                 'Markets reacted strongly to Trump election victory', 2, 2.5,   'Reuters'),
  ('2024-12-18', 'rate_decision',  'Fed signals slower cuts in 2025',          'Fed cut 25bps but signaled fewer cuts ahead, markets dropped', 2, -2.9, 'Federal Reserve'),
  ('2025-01-27', 'macro_shock',    'DeepSeek AI shock',                        'Chinese AI model DeepSeek triggered Nasdaq selloff, Nvidia -17%', 3, -3.1, 'WSJ'),
  ('2025-02-03', 'macro_shock',    'Trump tariffs on Canada/Mexico/China',     'New tariff announcements triggered broad market uncertainty', 2, -0.8, 'Reuters');

-- Enable RLS
ALTER TABLE ib_accounts           ENABLE ROW LEVEL SECURITY;
ALTER TABLE ib_trades             ENABLE ROW LEVEL SECURITY;
ALTER TABLE ib_positions          ENABLE ROW LEVEL SECURITY;
ALTER TABLE ib_cash_transactions  ENABLE ROW LEVEL SECURITY;
ALTER TABLE market_events         ENABLE ROW LEVEL SECURITY;
ALTER TABLE behavioral_signals    ENABLE ROW LEVEL SECURITY;
ALTER TABLE risk_profiles         ENABLE ROW LEVEL SECURITY;

-- RLS policies: users can only see their own data
CREATE POLICY "Users own ib_accounts" ON ib_accounts FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users own ib_trades" ON ib_trades FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users own ib_positions" ON ib_positions FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users own ib_cash_transactions" ON ib_cash_transactions FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users own behavioral_signals" ON behavioral_signals FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users own risk_profiles" ON risk_profiles FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- Market events: public read, service role manages writes
CREATE POLICY "Market events public read" ON market_events FOR SELECT USING (true);
CREATE POLICY "Service role manages market events" ON market_events FOR ALL USING (true) WITH CHECK (true);

-- Performance indexes
CREATE INDEX IF NOT EXISTS idx_ib_trades_user_date ON ib_trades (user_id, trade_date DESC);
CREATE INDEX IF NOT EXISTS idx_ib_trades_symbol ON ib_trades (user_id, symbol);
CREATE INDEX IF NOT EXISTS idx_behavioral_signals_user ON behavioral_signals (user_id, signal_date DESC);
CREATE INDEX IF NOT EXISTS idx_risk_profiles_user ON risk_profiles (user_id, applied_at DESC);
CREATE INDEX IF NOT EXISTS idx_market_events_date ON market_events (event_date DESC);
