# KeepItBoring — Architecture

## Stack
- **Frontend**: React + TypeScript + Vite + Shadcn/UI + TanStack Query
- **Backend**: Supabase (Postgres + Edge Functions + Auth + Storage)
- **AI**: Anthropic API (`claude-sonnet-4-6`)
- **Market data**: Yahoo Finance (via `refresh-prices` edge function)
- **Email ingestion**: CloudMailin → `ingest-email` edge function
- **Broker sync**: IBKR Flex Web Service → `sync-ib-data` edge function
- **Deployment**: Vercel (auto-deploy on push to main)

---

## Edge Functions (13 total)

| Function | Purpose | AI? |
|----------|---------|-----|
| `process-newsletter` | Extract insights from newsletter text | ✓ Anthropic |
| `summarize-insights` | Generate weekly intelligence brief | ✓ Anthropic + Perplexity |
| `analyze-portfolio` | Full portfolio AI analysis | ✓ Anthropic |
| `ideal-allocation` | Suggest target allocation | ✓ Anthropic |
| `fetch-fundamentals` | Get stock fundamentals | ✓ Anthropic |
| `classify-etf` | Classify ETF holdings | ✓ Anthropic + web search |
| `verify-ticker` | Verify/correct ticker symbols | ✓ Anthropic + web search |
| `process-screenshot` | Extract data from IBKR screenshots | ✓ Anthropic |
| `ingest-email` | Receive forwarded emails from CloudMailin | No |
| `refresh-prices` | Fetch live prices from Yahoo Finance | No |
| `sync-ib-data` | Pull IBKR Flex data | No |
| `sync-ib-performance` | Pull IBKR performance data | No |
| `correlate-signals` | Cross-reference newsletter signals | No |

### Critical: All Anthropic API calls must use:
```typescript
headers: {
  "x-api-key": ANTHROPIC_API_KEY,
  "anthropic-version": "2023-06-01",
  "Content-Type": "application/json",
}
body: JSON.stringify({
  model: "claude-sonnet-4-6",  // ← current correct string
  system: systemPrompt,         // ← top-level, NOT in messages array
  messages: [{ role: "user", content: "..." }],
  max_tokens: 8192,
})
```

---

## Database Schema (key tables)

### Core
- `newsletters` — stored newsletter text + metadata (author, publication_date, processed)
- `insights` — extracted AI insights per newsletter (joined via newsletter_id)
- `intelligence_briefs` — weekly AI summaries (keeps last 10)
- `positions` — manual position annotations (thesis, conviction, invalidation trigger)
- `ib_positions` — live IBKR positions (synced from broker)
- `ib_accounts` — IBKR account connection + cash balance
- `ib_trades` — historical trades from IBKR
- `decision_log` — logged investment decisions (with entry_price for outcome tracking)
- `philosophy_rules` — codified investment rules
- `portfolio_snapshots` — historical portfolio value snapshots

### Strategic (added during this project)
- `position_reviews` — conviction check reminders + volatility alerts
- `newsletter_sources` — per-source quality reputation scores
- `decision_log.ticker` — ticker column (added for outcome tracking)
- `decision_log.entry_price` — entry price (added for 30/90/180d return tracking)
- `decision_log.outcome_30d/90d/180d` — return tracking columns
- `newsletters.author` — extracted author name
- `newsletters.publication_date` — extracted publication date

### RLS Notes
- All tables have RLS enabled with `auth.uid() = user_id` policies
- `insights` RLS uses EXISTS join through `newsletters.user_id` (no direct user_id on insights)
- Edge functions use service role key (bypasses RLS)

---

## Data Flow

### Newsletter ingestion (email)
```
Email forwarded → CloudMailin → ingest-email (saves to newsletters) 
  → auto-calls process-newsletter → extracts insights → saves to insights table
  → updates newsletter_sources reputation score
```

### Newsletter ingestion (manual)
```
User uploads PDF/pastes text → useNewsletters.uploadNewsletter() 
  → saves to newsletters table → user clicks Process 
  → process-newsletter edge function → same as above
```

### Portfolio sync
```
User clicks Sync → sync-ib-data edge function → IBKR Flex API 
  → saves to ib_positions + ib_trades → refresh-prices fetches Yahoo Finance prices
  → handleApplyPriceUpdates → volatility check → portfolio_snapshots
```

### Analysis flow
```
User clicks Analyze → analyze-portfolio edge function 
  → reads positions + insights + philosophy_rules 
  → Anthropic API → returns recommendations
```

---

## Frontend Structure
```
src/
  pages/          — Dashboard, Portfolio, Newsletters, Analysis, Philosophy, Journal, Settings
  components/
    dashboard/    — PortfolioValue, ConvictionReviewWidget, PerformanceChart
    decisions/    — LogDecisionModal, PreTradeChecklist
    newsletters/  — NewsletterList, SourceReputationPanel, SourceQualityBadge, InsightsSummaryCard
    portfolio/    — VolatilityAlertModal, RefreshPricesModal, IBConnectionSection
  hooks/          — all data fetching and mutation logic
  lib/            — positionUtils (shared derivePositionType/deriveCategory)
```

---

## Key Design Decisions
- **All DB queries must include `.eq("user_id", user.id)`** — RLS is a backup, not the primary guard
- **Lazy loading** on all pages for bundle size
- **No raw_text in newsletter list query** — fetched on demand before processing
- **Intelligence briefs** keep last 10, auto-delete oldest
- **Volatility alerts** fire after price refresh if any position moves ≥10%
- **Pre-trade checklist** fires before every buy/sell/trim/add decision
