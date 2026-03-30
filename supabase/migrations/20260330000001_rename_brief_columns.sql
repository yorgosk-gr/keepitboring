-- Rename misleading columns in intelligence_briefs table
-- key_points actually stores temporal_shifts data
-- contrarian_signals actually stores crowded_trades data (crowded_trades column already exists)

ALTER TABLE public.intelligence_briefs RENAME COLUMN key_points TO temporal_shifts;
ALTER TABLE public.intelligence_briefs RENAME COLUMN contrarian_signals TO crowded_trades_legacy;
