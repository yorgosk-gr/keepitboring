-- Drop the FK constraint from decision_log to positions.
-- The ticker column already stores the symbol as a durable, denormalised
-- reference, so this FK just causes 409s whenever a position is deleted.
ALTER TABLE public.decision_log
  DROP CONSTRAINT IF EXISTS decision_log_position_id_fkey;
