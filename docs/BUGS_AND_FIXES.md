# KeepItBoring — Bugs & Fixes Log

## Critical: AI Model String History
The correct Anthropic model string has changed several times during this project.
| Date | Wrong string used | Correct string |
|------|------------------|----------------|
| Migration | `claude-sonnet-4-20250514` (Lovable AI gateway format) | — |
| Attempt 1 | `claude-sonnet-4-5-20251001` | — |
| Attempt 2 | `claude-sonnet-4-5-20250929` | — |
| **Current** | — | **`claude-sonnet-4-6`** |

**Rule**: Always verify the model string against Anthropic's current docs. The Claude conversation itself uses `claude-sonnet-4-6` — use the same.

---

## Bugs Fixed (chronological)

### Round 1 — Migration bugs
- `ingest-email`: `OWNER_USER_ID` was old Lovable user ID `593d853f...` → fixed to `38ce8fa7...`
- `process-newsletter`: system prompt in messages array → moved to top-level `system` param
- `fetch-fundamentals`: wrong `Authorization: Bearer` header → changed to `x-api-key`
- `useNewsletters`: `raw_text` not fetched before processing → now fetched on demand
- `useInsightsSummary`: deleted all briefs on each generation → now keeps last 10

### Round 2 — Audit 1 (strategic features)
- `Portfolio.tsx`: used `setSelectedPosition`/`setShowLogDecision` (don't exist) → fixed to `setLoggingDecisionFor`
- `usePreTradeChecklist`: `north_star_positions` query missing `user_id` filter
- `useDecisionOutcomes`: both queries missing `user_id` filters + no `enabled` guard
- `ConvictionReviewWidget`: fires before positions load → added 1s delay + loading guard
- `LogDecisionModal`: `form.watch()` in render → replaced with `useWatch()`
- `useSourceReputation`: `newsletter_sources` query missing `user_id` filter
- `useConvictionReview`: runs before positions finish loading → added `positionsLoading` guard
- `NorthStarWidget`: dynamic Tailwind classes don't purge → changed to static equivalents

### Round 3 — Audit 2
- `Newsletters.tsx`: `SourceReputationPanel` imported but never rendered → added tabs correctly
- `useInsightsSummary`: `intelligence_briefs` history query missing `user_id` filter
- `useSourceReputation`: newsletters query missing `user_id` filter in rebuild
- `Portfolio.tsx`: `previousPrices` built before auth guard → moved after `if (!user) return`

### Round 4 — Audit 3
- `NorthStarWidget`: `reduceMoves` sort was ascending → fixed to descending
- `NorthStarWidget`: `gapUSD` showed `$0k` for < $500 amounts → fixed formatting
- `useNewsletters.updateSourceName`: missing `user_id` filter
- `useNewsletters.deleteNewsletter`: missing `user_id` filter
- `useNewsletters.processNewsletter`: raw_text fetch missing `user_id` filter
- `LogDecisionModal`: checklist read `defaultAction` prop instead of actual form value

### Round 5 — Newsletter display bug
- `useNewsletters`: newsletter list query missing `user_id` filter → insights count showed 0
- `ingest-email`: wrong `OWNER_USER_ID` (old Lovable) → all forwarded emails saved to wrong user

### Round 6 — Audit 4
- `useConvictionReview`: 3 queries missing `user_id` filter (fetch, dedup check, dismiss)
- `useDecisionOutcomes`: `recordOutcome` update missing `user_id` filter
- `process-newsletter`: no idempotency guard on newsletter update
- `process-newsletter`: `style` field from `source_profile` never saved to `newsletter_sources`

### Round 7 — Model string fixes
- All 8 edge functions: wrong model string `claude-sonnet-4-20250514` → `claude-sonnet-4-6`
- Intermediate wrong attempts: `claude-sonnet-4-5-20251001`, `claude-sonnet-4-5-20250929`

---

## Recurring Patterns to Watch
1. **Missing `user_id` filter** — every new DB query must include `.eq("user_id", user.id)` or `user!.id`
2. **Model string** — always `claude-sonnet-4-6`, no date suffix
3. **System prompt** — always top-level `system:` param, never `{ role: "system", content: ... }` in messages
4. **Anthropic headers** — always `x-api-key` not `Authorization: Bearer`
5. **DB migrations** — use Supabase SQL Editor, not `npx supabase db push`
6. **`enabled: !!user`** — all queries that need auth must have this guard

---

## Known Limitations
- `classify-etf` and `verify-ticker` use `web_search_20250305` tool type — verify this is current if they break
- Perplexity `sonar` model in `summarize-insights` — verify model name if market context fails
- IBKR Flex credentials hardcoded in `ib_accounts` table (not env vars) — reconnect flow uses `VITE_IB_*` env vars which aren't set in Vercel
- Migration CLI is broken — always use SQL Editor
