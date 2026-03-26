# KeepItBoring — Deployment Procedures

## Standard deploy (frontend changes)
```bash
cd ~/Documents/keepitboring
git add -A
git commit -m "description"
git push origin main
# Vercel auto-deploys in ~20 seconds
```

## Deploy an edge function
```bash
cd ~/Documents/keepitboring
npx supabase functions deploy <function-name>
# e.g. npx supabase functions deploy process-newsletter
```

## Deploy all edge functions at once
```bash
cd ~/Documents/keepitboring
for func in process-newsletter summarize-insights analyze-portfolio fetch-fundamentals ideal-allocation classify-etf verify-ticker process-screenshot ingest-email; do
  npx supabase functions deploy $func
done
```

## Apply a DB migration (IMPORTANT: use SQL Editor, not CLI)
The Supabase CLI migration history is out of sync. Do NOT use `npx supabase db push`.
Instead, go to **Supabase → SQL Editor** and paste the SQL directly.

## Check deployment status
```bash
# Latest Vercel deployment
# Check via Vercel dashboard or ask Claude (it can check via Vercel MCP)
```

## Fix migration history error (if CLI needed)
```bash
npx supabase migration repair --status reverted 20260223220309 \
  --db-url "postgresql://postgres:KeepItBoring123\$@db.fltouhivhclbmctjzcts.supabase.co:5432/postgres"
```

---

## Environment Variables

### Vercel (set in dashboard)
- `VITE_SUPABASE_URL` = `https://fltouhivhclbmctjzcts.supabase.co`
- `VITE_SUPABASE_PUBLISHABLE_KEY` = `sb_publishable_5sGsL_HoIicvRlmOFynIuQ_Tiz1Zhg_`

### Supabase Edge Functions (set in Supabase → Settings → Secrets)
- `ANTHROPIC_API_KEY`
- `PERPLEXITY_API_KEY`
- `CLOUDMAILIN_PASS`
- `SUPABASE_URL` (auto-set)
- `SUPABASE_SERVICE_ROLE_KEY` (auto-set)

---

## Debugging edge functions
1. Go to **Supabase → Edge Functions → [function name] → Logs**
2. Look for lines starting with `AI gateway error:` — these show the exact Anthropic error
3. Common errors:
   - `model not found` → wrong model string, use `claude-sonnet-4-6`
   - `Unexpected role "system"` → system prompt is in messages array, not top-level
   - `dns error` → wrong Anthropic API URL (should be `https://api.anthropic.com/v1/messages`)
   - `401 Unauthorized` → wrong `x-api-key` header format

---

## Recovering orphaned data
If newsletters appear with wrong user_id (e.g. after a migration):
```sql
UPDATE public.newsletters
SET user_id = '38ce8fa7-9327-4424-b247-c14755e32852'
WHERE user_id = '593d853f-25d2-4cce-ad17-f77db49a377a';
```
The old Lovable user ID was `593d853f-25d2-4cce-ad17-f77db49a377a`.
The current correct user ID is `38ce8fa7-9327-4424-b247-c14755e32852`.
