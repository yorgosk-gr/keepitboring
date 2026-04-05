import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

function parseAIJson(content: string) {
  let jsonString = content.trim();
  const jsonBlockMatch = jsonString.match(/```json\s*([\s\S]*?)```/);
  if (jsonBlockMatch) {
    jsonString = jsonBlockMatch[1].trim();
  } else {
    const firstBrace = jsonString.indexOf('{');
    const lastBrace = jsonString.lastIndexOf('}');
    if (firstBrace !== -1 && lastBrace > firstBrace) {
      jsonString = jsonString.substring(firstBrace, lastBrace + 1);
    }
  }

  try {
    return JSON.parse(jsonString);
  } catch {
    const cleaned = jsonString
      .replace(/[\u201C\u201D]/g, '"')
      .replace(/[\u2018\u2019]/g, "'")
      .replace(/\r?\n/g, " ")
      .replace(/\s+/g, " ");
    try {
      return JSON.parse(cleaned);
    } catch (e) {
      console.error("Failed to parse AI response:", e);
      console.error("Raw content:", content.substring(0, 1000));
      return null;
    }
  }
}

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
      return new Response(
        JSON.stringify({ error: "AI service not configured" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const tenDaysAgo = new Date(Date.now() - 10 * 24 * 60 * 60 * 1000).toISOString();
    const { data: newsletters } = await supabase
      .from("newsletters")
      .select("id, source_name, upload_date")
      .eq("user_id", user.id)
      .eq("is_archived", false)
      .gte("created_at", tenDaysAgo)
      .order("created_at", { ascending: false });

    const newsletterIds = (newsletters ?? []).map(n => n.id);

    if (newsletterIds.length === 0) {
      return new Response(JSON.stringify({
        executive_summary: "No newsletters uploaded in the last 10 days.",
        weekly_priority: null, temporal_shifts: [], action_items: [],
        market_themes: [], sector_tilts: [], country_tilts: [],
        crowded_trades: [], contrarian_opportunities: [],
        stocks_to_research: [], newsletters_analyzed: 0, insights_analyzed: 0,
      }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // Parallel: all DB queries + Perplexity
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
    const previousKeyPointTitles = ((previousBrief?.temporal_shifts as any[]) ?? []).map((ts: any) => ts.topic || ts.title);
    const previousThemeNames = ((previousBrief?.sector_tilts as any[]) ?? []).map((t: any) => t.sector || t.theme);

    const marketVerificationBlock = marketContext
      ? `\n\nREAL-TIME MARKET CONTEXT (verified data as of today):\n${marketContext}\n\nCross-check newsletter claims against the real-time data above. Note discrepancies.`
      : "";

    const cap = (s: string | null, max: number) => !s ? "" : s.length > max ? s.substring(0, max) + "…" : s;

    const userPrompt = `PORTFOLIO: ${JSON.stringify(portfolioContext)}
TICKERS: ${JSON.stringify(portfolioTickers)}

SOURCES (${newsletters.length}):
${newsletters.map((n: any) => `- "${n.source_name}" (${n.upload_date})`).join("\n")}

PREVIOUS BRIEF — themes: ${JSON.stringify(previousThemeNames)}, key points: ${JSON.stringify(previousKeyPointTitles)}

INSIGHTS (${insightsList.length}, key: t=type,c=content,s=sentiment,src=source,tk=tickers,conf=confidence,mgmt=mgmt_tone,guid=guidance,earn=earnings,spec=specificity,data=data_backed,conv=conviction,cons=consensus,cat=catalyst):
${JSON.stringify(insightsList.slice(0, 250).map((i: any) => {
  const meta = i.metadata ?? {};
  const ageDays = Math.floor((Date.now() - new Date(i.created_at).getTime()) / (1000 * 60 * 60 * 24));
  const obj: Record<string, any> = { t: i.insight_type, c: cap(i.content, 200), s: i.sentiment, src: i.newsletters?.source_name, age: ageDays, conf: meta.source_confidence ?? 0.5 };
  if (i.tickers_mentioned?.length) obj.tk = i.tickers_mentioned;
  if (meta.management_tone && meta.management_tone !== "not_mentioned") obj.mgmt = meta.management_tone;
  if (meta.guidance_revision && meta.guidance_revision !== "not_mentioned") obj.guid = meta.guidance_revision;
  if (meta.earnings_surprise && meta.earnings_surprise !== "not_mentioned") obj.earn = meta.earnings_surprise;
  if (meta.claim_specificity) obj.spec = meta.claim_specificity;
  if (meta.data_backed) obj.data = true;
  if (meta.conviction_level) obj.conv = meta.conviction_level;
  if (meta.is_consensus_view) obj.cons = true;
  if (meta.catalyst) obj.cat = meta.catalyst;
  return obj;
}))}

Write the weekly intelligence letter.${marketVerificationBlock}`;

    console.log(`Summarizing ${insightsList.length} insights from ${newsletters.length} newsletters...`);

    // Use STREAMING to keep the connection alive — Supabase only kills idle connections
    // With streaming, tokens flow continuously so the 60s wall-clock limit doesn't apply
    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "x-api-key": ANTHROPIC_API_KEY,
        "anthropic-version": "2023-06-01",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "claude-sonnet-4-5-20250929",
        system: SYSTEM_PROMPT,
        messages: [{ role: "user", content: userPrompt }],
        max_tokens: 8192,
        stream: true,
      }),
    });

    if (!response.ok) {
      let errorDetail = "";
      try {
        const body = await response.json();
        errorDetail = body?.error?.message || JSON.stringify(body?.error) || "";
      } catch { errorDetail = String(response.status); }
      console.error("AI gateway error:", response.status, errorDetail);
      const errorMessages: Record<number, string> = {
        429: "Rate limit exceeded. Please try again in a moment.",
        402: "AI credits exhausted. Please add credits to continue.",
        401: "AI authentication failed. Check API key configuration.",
        403: "AI authentication failed. Check API key configuration.",
      };
      return new Response(
        JSON.stringify({ error: errorMessages[response.status] || `AI request failed (${response.status}): ${errorDetail}` }),
        { status: response.status === 429 ? 429 : 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Read the SSE stream and accumulate the full text
    const reader = response.body!.getReader();
    const decoder = new TextDecoder();
    let fullText = "";
    let buffer = "";

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop() ?? "";

      for (const line of lines) {
        if (!line.startsWith("data: ")) continue;
        const jsonStr = line.slice(6).trim();
        if (jsonStr === "[DONE]") continue;
        try {
          const event = JSON.parse(jsonStr);
          if (event.type === "content_block_delta" && event.delta?.text) {
            fullText += event.delta.text;
          }
        } catch {
          // skip malformed SSE lines
        }
      }
    }

    if (!fullText) {
      return new Response(
        JSON.stringify({ error: "AI returned empty response." }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const result = parseAIJson(fullText);
    if (!result) {
      return new Response(
        JSON.stringify({ error: "Failed to parse AI summary response." }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Extract executive summary
    let execSummary = result.weekly_priority || "";
    if (!execSummary && result.letter) {
      const m = result.letter.match(/═══\s*ONE-LINE SUMMARY\s*═══\s*\n([\s\S]*?)(?=═══|$)/);
      if (m) execSummary = m[1].trim().substring(0, 500);
      else {
        const lines = result.letter.split("\n").filter((l: string) => l.trim() && !l.includes("═══"));
        if (lines[0]) execSummary = lines[0].trim().substring(0, 500);
      }
    }

    const briefPayload = {
      ...result,
      temporal_shifts: result.temporal_shifts ?? [],
      newsletters_analyzed: newsletters.length,
      insights_analyzed: insightsList.length,
      generated_at: new Date().toISOString(),
      market_context_available: !!marketContext,
    };

    // Persist brief
    const { error: insertError } = await supabase.from("intelligence_briefs").insert({
      user_id: user.id,
      executive_summary: execSummary || "Brief generated",
      letter: result.letter ?? null,
      section_titles: result.section_titles ?? null,
      stocks_to_research: result.stocks_to_research ?? null,
      country_tilts: result.country_tilts ?? null,
      sector_tilts: result.sector_tilts ?? null,
      contrarian_opportunities: result.contrarian_opportunities ?? null,
      crowded_trades: result.crowded_trades ?? [],
      weekly_priority: result.weekly_priority ?? null,
      temporal_shifts: result.temporal_shifts ?? [],
      action_items: [],
      market_themes: [],
      crowded_trades_legacy: result.crowded_trades ?? [],
      newsletters_analyzed: newsletters.length,
      insights_analyzed: insightsList.length,
      generated_at: new Date().toISOString(),
    });

    if (insertError) {
      console.error("Failed to persist brief:", insertError);
      return new Response(
        JSON.stringify({ error: "Failed to save intelligence brief" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Cleanup: keep last 10 briefs
    const { data: existingBriefs } = await supabase
      .from("intelligence_briefs")
      .select("id, created_at")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false });

    if (existingBriefs && existingBriefs.length > 10) {
      const toDelete = existingBriefs.slice(10).map((b: any) => b.id);
      await supabase.from("intelligence_briefs").delete().in("id", toDelete);
    }

    console.log(`Brief generated: ${insightsList.length} insights from ${newsletters.length} newsletters`);

    return new Response(JSON.stringify(briefPayload), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("summarize-insights error:", error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});

async function fetchMarketContext(): Promise<string> {
  const key = Deno.env.get("PERPLEXITY_API_KEY");
  if (!key) return "";
  try {
    const today = new Date().toISOString().split("T")[0];
    const controller = new AbortController();
    const t = setTimeout(() => controller.abort(), 15000);
    const res = await fetch("https://api.perplexity.ai/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      signal: controller.signal,
      body: JSON.stringify({
        model: "sonar",
        messages: [{ role: "user", content: `As of ${today}: Concise factual summary of current market conditions. S&P 500, Nasdaq, Dow, Euro Stoxx 50 levels + weekly % change; 10Y yield; Fed funds rate; USD/EUR, USD/JPY; gold, oil; VIX; top 2-3 macro events this week. Facts only.` }],
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

const SYSTEM_PROMPT = `You are a sharp, independent investment analyst writing a weekly intelligence letter. Your job is to synthesize signals from multiple newsletter sources into a clear, opinionated market view.

CROSS-SOURCE ANALYSIS:
- 3+ sources sharing a view → label 'consensus' (crowded, lower edge)
- Sources diverging → most valuable signal. Name disagreements and why they matter
- Weight by source_confidence: ≥0.8 AND data_backed=true carry 2x weight

TEMPORAL TRACKING:
- Compare against PREVIOUS BRIEF themes/key points
- View reversed → flag: 'Shift: previously [X], now [Y]'
- Theme persists → 'Persistent signal — week N'
- Theme disappears → note the silence

ENTITY DEPTH:
- Negative management_tone / lowered guidance across stocks → earnings season signal
- Aggregate beat/miss patterns by sector
- Named catalysts → time-sensitive signals

MARKET ANALYSIS FRAMING:
- Write as market analyst, not portfolio manager
- Portfolio context only for flagging exposure intersections

LETTER FORMAT (only this goes in 'letter' field):

═══ WHAT TO DO THIS WEEK ═══
3–5 bullet points. Concrete, actionable. Start each with a verb. Grounded in specific signals.

═══ ONE-LINE SUMMARY ═══
Single sentence. Dominant signal. A judgment, not description.

═══ STATE OF THE MARKET ═══
2–3 short paragraphs. What is happening and why. End with: 'Signal quality this week:' HIGH/MEDIUM/LOW conviction + one sentence why.

═══ CONSENSUS vs DIVERGENCE ═══
Most important section. Where do sources agree/disagree? What does disagreement tell you?

═══ WHAT TO WATCH NEXT WEEK ═══
2–3 sentences. One data release/event. One price level/threshold. One sentence on surprise implications.

RESPONSE FORMAT: Return ONLY raw JSON. No markdown. No code blocks.

{
  "letter": "narrative sections with exact headers above",
  "stocks_to_research": [{"ticker":"OXY","name":"Occidental Petroleum","setup":"one sentence","thesis":"one sentence","trigger":"what to watch","time_horizon":"short|medium|long","risk_level":"low|moderate|high","mentioned_in":2,"source_confidence_avg":0.75,"consensus_or_edge":"consensus|edge|divergent"}],
  "country_tilts": [{"region":"Japan","direction":"overweight|underweight|neutral","conviction":"high|medium|low","etf_proxy":"EWJ","in_portfolio":true,"reasoning":"one sentence","signal_type":"consensus|edge|divergent","vs_prior_brief":"new|unchanged|strengthened|reversed"}],
  "sector_tilts": [{"sector":"Energy","direction":"overweight|underweight|neutral","conviction":"high|medium|low","portfolio_tickers":["IGLN"],"reasoning":"one sentence","signal_type":"consensus|edge|divergent","vs_prior_brief":"new|unchanged|strengthened|reversed","earnings_pattern":"beats|misses|mixed|no_data"}],
  "contrarian_opportunities": [{"title":"short headline","macro_tailwind":"reason","why_not_crowded":"what market misses","second_order_logic":"if X then Y","ticker":"ETF or stock","ticker_name":"full name","in_portfolio":false,"time_horizon":"medium|long","conviction":"high|medium|low"}],
  "crowded_trades": ["description — N/M sources bullish, signal_type"],
  "temporal_shifts": [{"topic":"AI infrastructure","prior_view":"bullish consensus","current_view":"scrutiny on fundamentals","weeks_tracked":2,"significance":"one sentence"}],
  "weekly_priority": "single action item — market level",
  "signal_quality": "high|medium|low",
  "newsletters_analyzed": 0,
  "insights_analyzed": 0
}`;
