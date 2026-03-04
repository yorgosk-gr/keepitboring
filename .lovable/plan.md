

## Plan: Improve Weekly Letter Accuracy

### Problem
The intelligence brief uses a 30-day newsletter window and relies solely on newsletter content, which may contain outdated or inaccurate claims. No real-time market verification is performed.

### Changes

#### 1. Narrow newsletter window to 10 days
In `supabase/functions/summarize-insights/index.ts`, change the 30-day lookback to 10 days for fetching newsletters and insights. Update the "no newsletters" message accordingly. Also update the cleanup cutoff (keep at 30 days for storage, but only analyze last 10 days).

#### 2. Add real-time market verification via Perplexity
Before calling the AI to write the letter, make a call to the Perplexity API to fetch current market conditions. This gives the AI grounded, cited facts to cross-check newsletter claims against.

**Setup required**: Connect the Perplexity connector so the `PERPLEXITY_API_KEY` is available in edge functions.

**Flow change in `summarize-insights`**:
1. Fetch newsletters/insights (last 10 days)
2. **New step**: Call Perplexity with a query like "Current market conditions, major indices performance, key macro events this week, March 2026" to get a grounded market snapshot
3. Inject the Perplexity response into the AI prompt as a "REAL-TIME MARKET CONTEXT" section
4. Add instructions to the system prompt: "Cross-check newsletter claims against the real-time market context below. If a newsletter claim contradicts current data, note the discrepancy and use the verified data."

#### 3. Update smart insight selection
In `src/hooks/useSmartInsightSelection.ts`, the `windowDate` is hardcoded to 30 days. Update to 10 days to match.

#### 4. Update cleanup in `useInsightsSummary.ts`
The hook currently cleans up newsletters older than 60 days. Keep this as-is (storage cleanup != analysis window).

### Technical Details

- Perplexity `sonar` model provides grounded search results with citations
- The market context will be ~500-1000 tokens, well within budget
- Edge function will gracefully degrade if Perplexity is unavailable (proceed without verification, log warning)

### Files Modified
- `supabase/functions/summarize-insights/index.ts` — 10-day window + Perplexity verification step
- `src/hooks/useSmartInsightSelection.ts` — align window to 10 days

### Prerequisite
Connect the Perplexity connector to this project for real-time market search.

