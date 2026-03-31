-- Decision Journal: extend decision_log and add lessons system

-- Add journal fields to decision_log
ALTER TABLE decision_log ADD COLUMN IF NOT EXISTS ticker text;
ALTER TABLE decision_log ADD COLUMN IF NOT EXISTS entry_price numeric;
ALTER TABLE decision_log ADD COLUMN IF NOT EXISTS entry_date timestamptz;
ALTER TABLE decision_log ADD COLUMN IF NOT EXISTS expected_timeframe text; -- '1mo','3mo','6mo','1yr','2yr+'
ALTER TABLE decision_log ADD COLUMN IF NOT EXISTS assumptions jsonb DEFAULT '[]'; -- [{text, invalidated}]
ALTER TABLE decision_log ADD COLUMN IF NOT EXISTS outcome_status text DEFAULT 'pending'; -- 'pending','reviewing','right','wrong','too_early','mixed'
ALTER TABLE decision_log ADD COLUMN IF NOT EXISTS surprise_notes text;
ALTER TABLE decision_log ADD COLUMN IF NOT EXISTS different_notes text; -- "what I'd do differently"
ALTER TABLE decision_log ADD COLUMN IF NOT EXISTS lesson_ids uuid[] DEFAULT '{}';
ALTER TABLE decision_log ADD COLUMN IF NOT EXISTS locked_at timestamptz;
ALTER TABLE decision_log ADD COLUMN IF NOT EXISTS reviewed_at timestamptz;
ALTER TABLE decision_log ADD COLUMN IF NOT EXISTS review_prompted_at timestamptz;
ALTER TABLE decision_log ADD COLUMN IF NOT EXISTS price_at_review numeric;

-- Outcome tracking fields (some may already exist from earlier work)
ALTER TABLE decision_log ADD COLUMN IF NOT EXISTS outcome_30d numeric;
ALTER TABLE decision_log ADD COLUMN IF NOT EXISTS outcome_90d numeric;
ALTER TABLE decision_log ADD COLUMN IF NOT EXISTS outcome_180d numeric;
ALTER TABLE decision_log ADD COLUMN IF NOT EXISTS outcome_checked_at timestamptz;
ALTER TABLE decision_log ADD COLUMN IF NOT EXISTS was_correct boolean;

-- Backfill ticker from positions for existing entries
UPDATE decision_log dl
SET ticker = p.ticker
FROM positions p
WHERE dl.position_id = p.id
  AND dl.ticker IS NULL;

-- Decision lessons / pattern library
CREATE TABLE IF NOT EXISTS decision_lessons (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  label text NOT NULL,
  category text NOT NULL DEFAULT 'other', -- 'bias','timing','sizing','thesis','process','other'
  description text,
  times_used integer NOT NULL DEFAULT 0,
  first_used_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE decision_lessons ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage their own lessons"
  ON decision_lessons
  FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- Index for faster lookups
CREATE INDEX IF NOT EXISTS idx_decision_log_ticker ON decision_log(ticker);
CREATE INDEX IF NOT EXISTS idx_decision_log_outcome_status ON decision_log(outcome_status);
CREATE INDEX IF NOT EXISTS idx_decision_log_reviewed_at ON decision_log(reviewed_at);
CREATE INDEX IF NOT EXISTS idx_decision_lessons_user_id ON decision_lessons(user_id);
