-- Seed etf_metadata with AGGU as a bond ETF.
-- IB tags AGGU (iShares Core Global Aggregate Bond UCITS, USD-Hedged)
-- as "Equities" in its Flex reports, which causes the analysis pipeline
-- to count its full value toward equity allocation unless etf_metadata
-- says otherwise.
INSERT INTO public.etf_metadata
  (ticker, full_name, issuer, tracks, category, sub_category, geography, is_broad_market, asset_class_details, expense_ratio)
VALUES
  ('AGGU',
   'iShares Core Global Aggregate Bond UCITS ETF USD Hedged (Acc)',
   'iShares',
   'Bloomberg Global Aggregate Bond Index (USD-Hedged)',
   'bond',
   'global_aggregate',
   'global',
   true,
   'Investment-grade global aggregate bonds, USD-hedged',
   0.10)
ON CONFLICT (ticker) DO UPDATE SET
  category = EXCLUDED.category,
  sub_category = EXCLUDED.sub_category,
  geography = EXCLUDED.geography,
  is_broad_market = EXCLUDED.is_broad_market,
  asset_class_details = EXCLUDED.asset_class_details;
