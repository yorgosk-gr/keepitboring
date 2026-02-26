-- Drop bet_type constraint
ALTER TABLE positions DROP CONSTRAINT IF EXISTS positions_bet_type_check;