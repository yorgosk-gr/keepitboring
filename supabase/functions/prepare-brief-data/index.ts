import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

/**
 * Phase 1 of brief generation: gather all data and build the prompt.
 * Returns the assembled prompt + metadata so the client can pass it
 * to summarize-insights (Phase 2) which only calls Anthropic.
 *
 * This keeps each function well under the 60s Supabase timeout.
 */
serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const token = authHeader.replace("Bearer ", "");
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);
    if (authError || !user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const tenDaysAgo = new Date(Date.now() - 10 * 24 * 60 * 60 * 1000).toISOString();
    const { data: newsletters } = await supabase
      .from("newsletters")
      .select("id, source_name, upload_date")
      .eq("user_id", user.id)
      .eq("is_archived", false)
      .gte("created_at", tenDaysAgo)
      .order("created_at", { ascending: false });

    const newsletterIds = (newsletters ?? []).map((n: any) => n.id);
    if (newsletterIds.length === 0) {
      return new Response(JSON.stringify({
        empty: true,
        result: {
          executive_summary: "No newsletters uploaded in the last 10 days.",
          weekly_priority: null, temporal_shifts: [], sector_tilts: [],
          country_tilts: [], crowded_trades: [], contrarian_opportunities: [],
          stocks_to_research: [], newsletters_analyzed: 0, insights_analyzed: 0,
        },
      }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Parallel: DB queries + Perplexity market context
    const [{ data: insights }, { data: positions }, { data: previousBrief }, marketContext] =
      await Promise.all([
        supabase.from("insights").select("*, newsletters(source_name)")
          .in("newsletter_id", newsletterIds).order("created_at", { ascending: false }).limit(500),
        supabase.from("positions")
          .select("ticker, name, position_type, category, market_value, weight_percent")
          .eq("user_id", user.id),
        supabase.from("intelligence_briefs")
          .select("temporal_shifts, sector_tilts, crowded_trades_legacy")
          .eq("user_id", user.id)
          .not("executive_summary", "eq", "__generating__")
          .not("executive_summary", "like", "__error__:%")
          .order("created_at", { ascending: false }).limit(1).maybeSingle(),
        fetchMarketContext(),
      ]);

    const insightsList = insights ?? [];
    const portfolioTickers = (positions ?? []).map((p: any) => p.ticker);
    const portfolioContext = (positions ?? []).map((p: any) => ({
      ticker: p.ticker, name: p.name, type: p.position_type,
      category: p.category, weight: p.weight_percent,
    }));
    const prevThemes = ((previousBrief?.sector_tilts as any[]) ?? []).map((t: any) => t.sector || t.theme);
    const prevPoints = ((previousBrief?.temporal_shifts as any[]) ?? []).map((ts: any) => ts.topic || ts.title);

    const mktBlock = marketContext
      ? `\n\nREAL-TIME MARKET CONTEXT:\n${marketContext}\n\nCross-check newsletter claims against this data. Note discrepancies.`
      : "";

    const cap = (s: string | null, max: number) => !s ? "" : s.length > max ? s.substring(0, max) + "…" : s;

    const userPrompt = `PORTFOLIO: ${JSON.stringify(portfolioContext)}
TICKERS: ${JSON.stringify(portfolioTickers)}
SOURCES (${newsletters!.length}): ${newsletters!.map((n: any) => `"${n.source_name}" (${n.upload_date})`).join("; ")}
PREV BRIEF — themes: ${JSON.stringify(prevThemes)}, points: ${JSON.stringify(prevPoints)}

INSIGHTS (${insightsList.length}, key: t=type,c=content,s=sentiment,src=source,tk=tickers,conf=confidence):
${JSON.stringify(insightsList.slice(0, 250).map((i: any) => {
  const meta = i.metadata ?? {};
  const obj: Record<string, any> = { t: i.insight_type, c: cap(i.content, 200), s: i.sentiment, src: i.newsletters?.source_name, conf: meta.source_confidence ?? 0.5 };
  if (i.tickers_mentioned?.length) obj.tk = i.tickers_mentioned;
  if (meta.management_tone && meta.management_tone !== "not_mentioned") obj.mgmt = meta.management_tone;
  if (meta.data_backed) obj.data = true;
  if (meta.conviction_level) obj.conv = meta.conviction_level;
  if (meta.catalyst) obj.cat = meta.catalyst;
  return obj;
}))}

Write the weekly intelligence letter.${mktBlock}`;

    console.log(`Prepared brief data: ${insightsList.length} insights from ${newsletters!.length} newsletters`);

    return new Response(JSON.stringify({
      empty: false,
      user_prompt: userPrompt,
      user_id: user.id,
      newsletters_count: newsletters!.length,
      insights_count: insightsList.length,
      market_context_available: !!marketContext,
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("prepare-brief-data error:", error);
    return new Response(JSON.stringify({
      error: error instanceof Error ? error.message : "Unknown error",
    }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});

async function fetchMarketContext(): Promise<string> {
  const key = Deno.env.get("PERPLEXITY_API_KEY");
  if (!key) return "";
  try {
    const today = new Date().toISOString().split("T")[0];
    const c = new AbortController();
    const t = setTimeout(() => c.abort(), 15000);
    const res = await fetch("https://api.perplexity.ai/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      signal: c.signal,
      body: JSON.stringify({
        model: "sonar",
        messages: [{ role: "user", content: `As of ${today}: Concise factual market summary. S&P 500, Nasdaq, Dow, Euro Stoxx 50 levels + weekly % change; 10Y yield; Fed funds rate; USD/EUR, USD/JPY; gold, oil; VIX; top 2-3 macro events this week. Facts only.` }],
        search_recency_filter: "week",
      }),
    });
    clearTimeout(t);
    if (!res.ok) return "";
    const data = await res.json();
    let ctx = data.choices?.[0]?.message?.content ?? "";
    if (data.citations?.length) ctx += `\nSources: ${data.citations.join(", ")}`;
    return ctx;
  } catch { return ""; }
}
