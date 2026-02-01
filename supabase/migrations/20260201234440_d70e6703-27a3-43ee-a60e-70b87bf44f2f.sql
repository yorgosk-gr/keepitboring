-- Drop existing category constraint if it exists
ALTER TABLE positions DROP CONSTRAINT IF EXISTS positions_category_check;

-- Add updated constraint with all valid categories
ALTER TABLE positions ADD CONSTRAINT positions_category_check 
  CHECK (category IN ('equity', 'bond', 'commodity', 'gold', 'country', 'theme'));

-- Drop existing bet_type constraint if it exists
ALTER TABLE positions DROP CONSTRAINT IF EXISTS positions_bet_type_check;

-- Add updated constraint with all valid bet types
ALTER TABLE positions ADD CONSTRAINT positions_bet_type_check 
  CHECK (bet_type IN ('core', 'satellite', 'explore', 'active', 'passive_carry', 'legacy_hold'));