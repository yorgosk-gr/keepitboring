import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

/**
 * Phase 1 of brief generation.
 *
 * Steps:
 *  1. Fetch newsletters, insights, positions, previous brief, market context (parallel)
 *  2. Pre-process raw insights with Haiku:
 *       - merge near-duplicates
 *       - identify consensus vs. divergence
 *       - flag contradictions
 *       - drop stale / irrelevant entries
 *  3. Return a compact signal digest for Phase 2 (Sonnet brief writer)
 *
 * Haiku handles the messy deduplication work cheaply and fast (~10s).
 * Sonnet then receives clean, structured signals and can focus purely
 * on analysis and letter writing — with a much smaller input (~3-5k tokens).
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

    const ANTHROPIC_API_KEY = Deno.env.get("ANTHROPIC_API_KEY");
    if (!ANTHROPIC_API_KEY) {
      return new Response(JSON.stringify({ error: "AI service not configured" }), {
        status: 500,
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

    // ── Step 1: Parallel data fetch ──────────────────────────────────────────
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

    console.log(`Fetched ${insightsList.length} raw insights from ${newsletters!.length} newsletters`);

    // ── Step 2: Haiku pre-processing ─────────────────────────────────────────
    // Send all raw insights to Haiku for deduplication, contradiction detection,
    // and relevance filtering. Haiku is fast and cheap for this structured task.
    const cap = (s: string | null, max: number) => !s ? "" : s.length > max ? s.substring(0, max) + "…" : s;
    const today = new Date().toISOString().split("T")[0];

    const rawInsightsPayload = insightsList.map((i: any) => {
      const meta = i.metadata ?? {};
      const obj: Record<string, any> = {
        type: i.insight_type,
        content: cap(i.content, 200),
        sentiment: i.sentiment,
        source: i.newsletters?.source_name,
        confidence: meta.source_confidence ?? 0.5,
      };
      if (i.tickers_mentioned?.length) obj.tickers = i.tickers_mentioned;
      if (meta.data_backed) obj.data_backed = true;
      if (meta.conviction_level) obj.conviction = meta.conviction_level;
      if (meta.catalyst) obj.catalyst = meta.catalyst;
      if (i.is_starred) obj.starred = true;
      return obj;
    });

    const preprocessPrompt = `Today is ${today}. You are pre-processing raw investment newsletter insights before they are synthesised into a weekly intelligence brief.

RAW INSIGHTS (${rawInsightsPayload.length} total from ${newsletters!.length} sources):
${JSON.stringify(rawInsightsPayload)}

Your job — clean and consolidate these signals:

1. MERGE near-duplicates: if multiple sources say essentially the same thing about the same ticker or macro topic, combine them into ONE signal with source_count > 1.
2. DETECT contradictions: if sources explicitly disagree (e.g. one says AAPL bullish, another says AAPL bearish), keep BOTH but set contradicted=true and add a contradiction_note.
3. CLASSIFY signal strength: consensus = 3+ sources agree; edge = 1-2 sources, differentiated view; divergent = sources disagree.
4. DROP stale/irrelevant: remove references to past events that have already resolved (earnings already reported, catalysts already fired), vague filler ("markets are volatile"), or entries with no actionable content.
5. PRESERVE starred insights always — never drop them.

Return ONLY a JSON object, no markdown:
{
  "signals": [
    {
      "type": "stock|macro|sector|recommendation|bubble",
      "topic": "ticker symbol or macro topic name",
      "tickers": ["AAPL"],
      "sentiment": "bullish|bearish|neutral",
      "signal_strength": "consensus|edge|divergent",
      "sources": ["source name 1", "source name 2"],
      "source_count": 2,
      "insight": "one clear consolidated sentence capturing the signal",
      "contradicted": false,
      "contradiction_note": null,
      "data_backed": false,
      "conviction": "high|medium|low",
      "catalyst": null
    }
  ],
  "dropped_count": 12,
  "stats": {
    "consensus_signals": 4,
    "edge_signals": 8,
    "divergent_signals": 2,
    "contradictions": 1
  }
}`;

    let processedSignals: any = null;

    try {
      const haiku = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: {
          "x-api-key": ANTHROPIC_API_KEY,
          "anthropic-version": "2023-06-01",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: "claude-haiku-4-5",
          messages: [{ role: "user", content: preprocessPrompt }],
          max_tokens: 4096,
        }),
        signal: AbortSignal.timeout(30000),
      });

      if (haiku.ok) {
        const haikuResult = await haiku.json();
        const haikuText = haikuResult.content?.[0]?.text ?? "";
        try {
          let jsonStr = haikuText.trim();
          const m = jsonStr.match(/```json\s*([\s\S]*?)```/);
          if (m) jsonStr = m[1].trim();
          else {
            const f = jsonStr.indexOf("{"), l = jsonStr.lastIndexOf("}");
            if (f !== -1 && l > f) jsonStr = jsonStr.substring(f, l + 1);
          }
          processedSignals = JSON.parse(jsonStr);
          console.log(`Haiku pre-processing: ${processedSignals.signals?.length} signals from ${insightsList.length} raw insights (dropped ${processedSignals.dropped_count ?? "?"})`);
        } catch {
          console.warn("Haiku output failed to parse — falling back to raw insights");
        }
      } else {
        console.warn(`Haiku pre-processing returned ${haiku.status} — falling back to raw insights`);
      }
    } catch (haikuErr) {
      console.warn("Haiku pre-processing failed — falling back to raw insights:", haikuErr);
    }

    // ── Step 3: Build the prompt for Phase 2 (Sonnet) ───────────────────────
    const mktBlock = marketContext
      ? `\n\nREAL-TIME MARKET CONTEXT (from Perplexity, cross-check newsletter claims):\n${marketContext}`
      : "";

    let userPrompt: string;

    if (processedSignals?.signals?.length) {
      // Use the clean pre-processed digest — much smaller input for Sonnet
      const stats = processedSignals.stats ?? {};
      userPrompt = `PORTFOLIO: ${JSON.stringify(portfolioContext)}
TICKERS IN PORTFOLIO: ${JSON.stringify(portfolioTickers)}
SOURCES THIS WEEK (${newsletters!.length}): ${newsletters!.map((n: any) => `"${n.source_name}" (${n.upload_date})`).join("; ")}
PREV BRIEF — themes: ${JSON.stringify(prevThemes)}, tracked points: ${JSON.stringify(prevPoints)}

PRE-PROCESSED SIGNAL DIGEST (${processedSignals.signals.length} signals consolidated from ${insightsList.length} raw insights; ${processedSignals.dropped_count ?? 0} dropped as duplicate/stale):
Consensus: ${stats.consensus_signals ?? "?"} | Edge: ${stats.edge_signals ?? "?"} | Divergent: ${stats.divergent_signals ?? "?"} | Contradictions: ${stats.contradictions ?? "?"}

${JSON.stringify(processedSignals.signals)}

Write the weekly intelligence letter.${mktBlock}`;
    } else {
      // Fallback: use raw insights, prioritised and capped
      const prioritised = [...insightsList].sort((a: any, b: any) => {
        const aConf = (a.metadata as any)?.source_confidence ?? 0.5;
        const bConf = (b.metadata as any)?.source_confidence ?? 0.5;
        const aStar = a.is_starred ? 1 : 0;
        const bStar = b.is_starred ? 1 : 0;
        return (bStar - aStar) || (bConf - aConf);
      }).slice(0, 100);

      userPrompt = `PORTFOLIO: ${JSON.stringify(portfolioContext)}
TICKERS IN PORTFOLIO: ${JSON.stringify(portfolioTickers)}
SOURCES THIS WEEK (${newsletters!.length}): ${newsletters!.map((n: any) => `"${n.source_name}" (${n.upload_date})`).join("; ")}
PREV BRIEF — themes: ${JSON.stringify(prevThemes)}, tracked points: ${JSON.stringify(prevPoints)}

RAW INSIGHTS (${prioritised.length} of ${insightsList.length}, highest confidence):
${JSON.stringify(prioritised.map((i: any) => {
  const meta = i.metadata ?? {};
  const obj: Record<string, any> = { t: i.insight_type, c: cap(i.content, 120), s: i.sentiment, src: i.newsletters?.source_name };
  if (i.tickers_mentioned?.length) obj.tk = i.tickers_mentioned;
  if (meta.data_backed) obj.data = true;
  if (meta.conviction_level && meta.conviction_level !== "low") obj.conv = meta.conviction_level;
  return obj;
}))}

Write the weekly intelligence letter.${mktBlock}`;
    }

    return new Response(JSON.stringify({
      empty: false,
      user_prompt: userPrompt,
      user_id: user.id,
      newsletters_count: newsletters!.length,
      insights_count: insightsList.length,
      preprocessed_signals: processedSignals?.signals?.length ?? null,
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
