# CLAUDE.md — KeepItBoring

## What is this project?
Portfolio intelligence app for a single user (personal use). Tracks IB (Interactive Brokers) positions, processes investment newsletter insights, generates AI-powered portfolio analysis with trade recommendations, and maintains a decision journal. Built as a React SPA with Supabase backend.

## Tech stack
- **Frontend**: React 18 + TypeScript + Vite + TailwindCSS + shadcn/ui (Radix primitives)
- **Data fetching**: TanStack React Query v5
- **Backend**: Supabase (Postgres, Auth, Edge Functions)
- **AI**: Anthropic Claude via Edge Functions (ANTHROPIC_API_KEY)
- **Deployment**: Vercel (auto-deploys from `main` branch)

## Key commands
```bash
npm run dev          # Local dev server
npm run build        # Production build (vite build)
npx supabase functions deploy <name> --no-verify-jwt --project-ref fltouhivhclbmctjzcts
```

## Project structure
```
src/
  pages/           # 12 routes (Dashboard, Portfolio, Analysis, Newsletters, etc.)
  hooks/           # 35+ custom hooks — most data logic lives here
  components/      # Feature components + shadcn/ui primitives
  contexts/        # AuthContext (Supabase auth)
  lib/             # Utilities (positionUtils, tickerReference, etc.)
  integrations/    # Supabase client + generated types
supabase/
  functions/       # 15 Deno edge functions
  migrations/      # SQL migrations
```

## Architecture patterns

### Data flow: IB positions → analysis
1. `sync-ib-data` edge function fetches IB Flex XML, parses into `ib_positions` table
2. **Cash is stored in `ib_accounts.cash_balance`**, NOT as positions in `ib_positions`
3. `usePositions` hook merges `ib_positions` with user annotations from `positions` table + `etf_metadata`
4. `usePortfolioAnalysis` separates cash positions, computes ETF overlap / sector momentum client-side, then calls `analyze-portfolio` edge function
5. Edge function runs deterministic `computeRuleEvaluation` (allocation %, rule breaches, health score) then feeds results into Claude for narrative + trade recommendations

### Position classification pipeline
`derivePositionType(assetClass, subCategory, hasEtfMetadata, ticker)` in `positionUtils.ts`:
1. ETF metadata table (DB) → "etf"
2. Local reference (KNOWN_ETFS / SP500_STOCKS) → "etf" or "stock"
3. IB asset_class field → "cash" (CASH/FX/FXCONV), "etf", "stock", "bond", "commodity"

Manual annotations (`positions.manually_classified = true`) can override derived type, **except** cash — IB cash always wins.

### Edge function: computeRuleEvaluation
Asset class ordering matters: `cash → bond (by category) → commodity/gold (by category) → stock (by posType) → equity (default)`. Category checks must come before posType to prevent stale annotations from miscounting bond ETFs as equity.

### Newsletter → Intelligence pipeline
1. User uploads newsletters → `process-newsletter` extracts insights (type, sentiment, tickers, confidence)
2. `prepare-brief-data` + `summarize-insights` generate an intelligence brief
3. Analysis uses brief + raw insights for market signals, sector momentum, position alerts

## Important tables
| Table | Purpose |
|-------|---------|
| `ib_positions` | Raw IB position data (stocks, ETFs, bonds — NOT cash) |
| `ib_accounts` | IB account metadata including `cash_balance` |
| `positions` | User annotations (thesis, confidence, manual classification) keyed by ticker |
| `etf_metadata` | ETF classification data (category, geography, broad_market flag) |
| `analysis_history` | Saved analysis results with raw_response JSON |
| `intelligence_briefs` | Generated weekly intelligence briefs |
| `insights` | Individual newsletter insights with sentiment, tickers, quality_score |
| `philosophy_rules` | User-defined portfolio rules (HARD/SOFT) with thresholds |
| `decision_log` | Trade decisions with reasoning and outcome tracking |

## Pages

### Dashboard (`/`, `/dashboard`)
Portfolio overview hub. Uses `useDashboardData`, `useAllETFMetadata`, `usePhilosophyRules`. Renders portfolio value card, three donut charts (investment type / asset class / geography with philosophy targets), performance chart, top holdings, recent activity, risk profile, conviction reviews, north star widget, and action feed.

### Portfolio (`/portfolio`)
Positions management. Uses `usePositions`, `useDashboardData`, `useIBSync`. Searchable/filterable positions table with edit modals, thesis panel, and decision logging. Features IB sync integration with business-day freshness calculation, thesis health banner, and bulk position clearing.

### Analysis (`/analysis`)
AI portfolio analysis dashboard. Uses `usePortfolioAnalysis`, `usePositions`, `useIdealAllocation`, `useInsightsSummary`. Two tabs: AI Analysis (allocation check, position alerts, market signals, trade recommendations, ideal allocation) and Decision Log. Auto-loads latest analysis from history on mount. Brief staleness indicator warns when intelligence brief is old. "Run New Analysis" triggers the full pipeline (client-side prep → edge function → Claude).

### Newsletters (`/newsletters`)
Newsletter ingestion and insight extraction. Uses `useNewsletters`, `useInsightsSummary`. Upload/paste newsletters for AI processing, generate intelligence briefs, view extracted insights. Features email forwarding via CloudMailin, bulk reprocess with rate-limit backoff, three tabs (newsletters list, all insights with quality scores, source reputation rankings).

### Philosophy (`/philosophy`)
Investment rules manager. Uses `usePhilosophyRules`, `useBookPrinciples`, `usePortfolioStrategy`. Rules organized by author (Graham, Malkiel, Siegel, etc.) with HARD/SOFT classification and threshold ranges. Three tabs: rules editor, book wisdom browser, portfolio strategy editor. Auto-seeds default rules on first load.

### North Star (`/north-star`)
Target portfolio allocation tracker. Uses `useNorthStar`, `useIBCurrentWeights`, `usePhilosophyRules`. Manages ideal positions with status (build/hold/reduce/exit), calculates rebalancing deltas vs current IB weights, detects philosophy-rule conflicts. Features cash target editor and import-from-current.

### Journal (`/journal`)
Decision journal with two-panel layout. Uses `useDecisionJournal`. Left panel: searchable/filterable entry list (by action type, outcome, ticker). Right panel: detailed view with assumptions, lessons, outcomes, and price return calculations.

### Settings (`/settings`)
Configuration hub. Uses `useSettings`. Sections: IB connection setup, API config, philosophy mode toggle, storage dashboard, notifications, and data management (export/clear/reset/delete account).

### Auth (`/auth`) & Reset Password (`/reset-password`)
Authentication flow using Supabase Auth. Login/signup/forgot-password modes with Zod validation. Reset password validates recovery session from URL hash, auto-redirects on success.

## Known gotchas
- **Cash is NOT in ib_positions.** IB reports cash separately; the sync stores it in `ib_accounts.cash_balance`. The Portfolio page renders a synthetic cash row from this value — it's not a real position. `usePositions()` returns only non-cash positions. Any code needing cash must query `ib_accounts.cash_balance` directly (see `useDashboardData` for the canonical pattern).
- **IB's percent_of_nav excludes cash.** Position weights sum to ~100% with cash excluded from the denominator. Do NOT try to derive cash from NAV math — it will give ~$0.
- **Stale annotations.** The `positions` table may have old `manually_classified=true` rows with wrong `position_type`. The classification pipeline handles this by checking category before posType in the edge function, and forcing cash regardless of annotations in the frontend.
- **IB ticker mismatches.** IB sometimes uses 0 where the market uses O (e.g. IB01 vs IBO1). `lookupEtfMeta` in usePositions handles this with a swap fallback.
- **Edge functions need `--no-verify-jwt`.** All edge functions are called from the authenticated frontend with Supabase client, but deployed without JWT verification.
- **Intelligence brief is separate from analysis.** Briefs are generated on the Newsletters page, not during analysis. Analysis reads the latest existing brief. "Intelligence brief: X days ago" on the Analysis page is a staleness indicator, not a bug.

## Deployment workflow
1. Commit to `main` branch → Vercel auto-deploys frontend
2. Edge functions: deploy manually via `npx supabase functions deploy`
3. Migrations: apply via Supabase dashboard or CLI

## Supabase project
- Project ref: `fltouhivhclbmctjzcts`
- Vercel project: `prj_C7rF0JXlUb43MYgejhJ6CYWJ7jIO` / team `team_een4XcVCMoE7RzmHMHN3aI4p`
