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

// Declare EdgeRuntime for Supabase background tasks
declare const EdgeRuntime: { waitUntil: (promise: Promise<unknown>) => void };

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

    // Quick validation: check newsletters exist
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
        status: "complete",
        executive_summary: "No newsletters uploaded in the last 10 days.",
        newsletters_analyzed: 0,
        insights_analyzed: 0,
      }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Insert a placeholder brief to signal "generating" state
    const generatingAt = new Date().toISOString();
    const { data: placeholder, error: placeholderError } = await supabase
      .from("intelligence_briefs")
      .insert({
        user_id: user.id,
        executive_summary: "__generating__",
        generated_at: generatingAt,
        newsletters_analyzed: newsletterIds.length,
        insights_analyzed: 0,
        action_items: [],
        market_themes: [],
        crowded_trades: [],
        crowded_trades_legacy: [],
        temporal_shifts: [],
      })
      .select("id")
      .single();

    if (placeholderError || !placeholder) {
      console.error("Failed to create placeholder brief:", placeholderError);
      return new Response(
        JSON.stringify({ error: "Failed to start brief generation" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const briefId = placeholder.id;

    // Return immediately — background work continues via EdgeRuntime.waitUntil
    const backgroundWork = generateBriefInBackground({
      supabase,
      userId: user.id,
      briefId,
      newsletters: newsletters ?? [],
      newsletterIds,
      anthropicKey: ANTHROPIC_API_KEY,
    });

    // EdgeRuntime.waitUntil lets the work continue after the response is sent
    // No wall-clock timeout — the background task can run for minutes
    EdgeRuntime.waitUntil(backgroundWork);

    return new Response(JSON.stringify({
      status: "generating",
      briefId,
      message: "Brief generation started. It will appear shortly.",
    }), {
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

// ── Background generation ──────────────────────────────────────────

interface GenerateOpts {
  supabase: any;
  userId: string;
  briefId: string;
  newsletters: any[];
  newsletterIds: string[];
  anthropicKey: string;
}

async function generateBriefInBackground(opts: GenerateOpts) {
  const { supabase, userId, briefId, newsletters, newsletterIds, anthropicKey } = opts;

  try {
    // Parallel: fetch insights, positions, previous brief, Perplexity market context
    const insightsPromise = supabase
      .from("insights")
      .select("*, newsletters(source_name)")
      .in("newsletter_id", newsletterIds)
      .order("created_at", { ascending: false })
      .limit(500);

    const positionsPromise = supabase
      .from("positions")
      .select("ticker, name, position_type, category, market_value, weight_percent")
      .eq("user_id", userId);

    const previousBriefPromise = supabase
      .from("intelligence_briefs")
      .select("temporal_shifts, sector_tilts, crowded_trades_legacy")
      .eq("user_id", userId)
      .neq("id", briefId) // exclude the placeholder we just created
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    const marketContextPromise = fetchMarketContext();

    const [{ data: insights }, { data: positions }, { data: previousBrief }, marketContext] =
      await Promise.all([insightsPromise, positionsPromise, previousBriefPromise, marketContextPromise]);

    const insightsList = insights ?? [];
    const portfolioTickers = (positions ?? []).map((p: any) => p.ticker);
    const portfolioContext = (positions ?? []).map((p: any) => ({
      ticker: p.ticker,
      name: p.name,
      type: p.position_type,
      category: p.category,
      weight: p.weight_percent,
    }));
    const previousKeyPointTitles = ((previousBrief?.temporal_shifts as any[]) ?? []).map((ts: any) => ts.topic || ts.title);
    const previousThemeNames = ((previousBrief?.sector_tilts as any[]) ?? []).map((t: any) => t.sector || t.theme);

    const marketVerificationBlock = marketContext
      ? `\n\nREAL-TIME MARKET CONTEXT (verified data as of today — use this to cross-check newsletter claims):\n${marketContext}\n\nIMPORTANT: Cross-check newsletter claims against the real-time market context above. If a newsletter claim contradicts current verified data, note the discrepancy in your letter and use the verified data. Do not repeat stale or inaccurate claims from newsletters.`
      : "";

    const cap = (s: string | null, max: number) => {
      if (!s) return "";
      return s.length > max ? s.substring(0, max) + "…" : s;
    };

    const userPrompt = `PORTFOLIO: ${JSON.stringify(portfolioContext)}
TICKERS: ${JSON.stringify(portfolioTickers)}

SOURCES (${newsletters.length}):
${newsletters.map((n: any) => `- "${n.source_name}" (${n.upload_date})`).join("\n")}

PREVIOUS BRIEF — themes: ${JSON.stringify(previousThemeNames)}, key points: ${JSON.stringify(previousKeyPointTitles)}

INSIGHTS (${insightsList.length} total, newest first, field key: t=type,c=content,s=sentiment,src=source,tk=tickers,conf=confidence,mgmt=management_tone,guid=guidance,earn=earnings,spec=specificity,data=data_backed,conv=conviction,cons=consensus,cat=catalyst):
${JSON.stringify(insightsList.slice(0, 250).map((i: any) => {
  const meta = i.metadata ?? {};
  const ageDays = Math.floor((Date.now() - new Date(i.created_at).getTime()) / (1000 * 60 * 60 * 24));
  const obj: Record<string, any> = {
    t: i.insight_type,
    c: cap(i.content, 200),
    s: i.sentiment,
    src: i.newsletters?.source_name,
    age: ageDays,
    conf: meta.source_confidence ?? 0.5,
  };
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

Write the weekly intelligence letter. Synthesize, weigh, and judge — do not just summarize. Flag consensus vs edge signals. Note any temporal shifts from the previous brief. Ground every claim in specific newsletter evidence.${marketVerificationBlock}`;

    console.log(`[bg] Summarizing ${insightsList.length} insights from ${newsletters.length} newsletters...`);

    // Call Anthropic — no timeout constraint in background
    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "x-api-key": anthropicKey,
        "anthropic-version": "2023-06-01",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "claude-sonnet-4-5-20250929",
        system: SYSTEM_PROMPT,
        messages: [{ role: "user", content: userPrompt }],
        max_tokens: 8192,
      }),
    });

    if (!response.ok) {
      let detail = "";
      try {
        const body = await response.json();
        detail = body?.error?.message || JSON.stringify(body?.error) || "";
      } catch { detail = String(response.status); }
      console.error(`[bg] Anthropic error: ${response.status} ${detail}`);
      await failBrief(supabase, briefId, `AI request failed (${response.status}): ${detail}`);
      return;
    }

    const aiResponse = await response.json();
    const content = aiResponse.content?.[0]?.text;

    if (!content) {
      await failBrief(supabase, briefId, "AI returned empty response.");
      return;
    }

    const result = parseAIJson(content);
    if (!result) {
      await failBrief(supabase, briefId, "Failed to parse AI response.");
      return;
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

    // Update the placeholder with full results
    const { error: updateError } = await supabase
      .from("intelligence_briefs")
      .update({
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
      })
      .eq("id", briefId);

    if (updateError) {
      console.error("[bg] Failed to save brief:", updateError);
      return;
    }

    console.log(`[bg] Brief ${briefId} generated successfully with ${insightsList.length} insights`);

    // Cleanup: keep last 10 briefs
    const { data: existingBriefs } = await supabase
      .from("intelligence_briefs")
      .select("id, created_at")
      .eq("user_id", userId)
      .order("created_at", { ascending: false });

    if (existingBriefs && existingBriefs.length > 10) {
      const toDelete = existingBriefs.slice(10).map((b: any) => b.id);
      await supabase.from("intelligence_briefs").delete().in("id", toDelete);
    }
  } catch (error) {
    console.error("[bg] Background generation failed:", error);
    await failBrief(opts.supabase, briefId, error instanceof Error ? error.message : "Unknown error");
  }
}

async function failBrief(supabase: any, briefId: string, errorMessage: string) {
  await supabase
    .from("intelligence_briefs")
    .update({
      executive_summary: `__error__:${errorMessage}`,
      generated_at: new Date().toISOString(),
    })
    .eq("id", briefId);
}

async function fetchMarketContext(): Promise<string> {
  const PERPLEXITY_API_KEY = Deno.env.get("PERPLEXITY_API_KEY");
  if (!PERPLEXITY_API_KEY) {
    console.warn("PERPLEXITY_API_KEY not configured — skipping real-time market verification");
    return "";
  }
  try {
    const today = new Date().toISOString().split("T")[0];
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 15000);
    const res = await fetch("https://api.perplexity.ai/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${PERPLEXITY_API_KEY}`,
        "Content-Type": "application/json",
      },
      signal: controller.signal,
      body: JSON.stringify({
        model: "sonar",
        messages: [{
          role: "user",
          content: `As of ${today}: Give me a concise factual summary of current market conditions. Include: S&P 500, Nasdaq, Dow Jones, and Euro Stoxx 50 levels and weekly % change; 10-year US Treasury yield; Fed funds rate and latest FOMC guidance; USD/EUR and USD/JPY; gold and oil prices; VIX level; and the 2-3 most important macro events or data releases this week. Facts only, no opinions. Cite sources.`,
        }],
        search_recency_filter: "week",
      }),
    });
    clearTimeout(timeout);

    if (res.ok) {
      const data = await res.json();
      let ctx = data.choices?.[0]?.message?.content ?? "";
      const citations = data.citations ?? [];
      if (citations.length > 0) ctx += `\n\nSources: ${citations.join(", ")}`;
      console.log("Perplexity market context fetched successfully");
      return ctx;
    }
    console.warn("Perplexity API returned", res.status);
    return "";
  } catch (e) {
    console.warn("Perplexity call failed:", e);
    return "";
  }
}

// ── System prompt (extracted to reduce nesting) ──────────────────

const SYSTEM_PROMPT = `You are a sharp, independent investment analyst writing a weekly intelligence letter. You have no client portfolio to manage. Your job is to synthesize signals from multiple newsletter sources into a clear, opinionated market view.

CROSS-SOURCE ANALYSIS — apply these rules before writing anything:

CONSENSUS vs EDGE:
- If 3+ sources share a view → label it 'consensus' in your synthesis. Consensus = crowded = lower informational edge. Note it but don't treat it as a strong signal.
- If sources diverge on a ticker, sector, or macro view → this is the most valuable signal. Name who disagrees, what they say, and why the disagreement matters.
- Weight insights by source_confidence: insights with source_confidence ≥ 0.8 AND data_backed=true carry 2x the weight of vague low-confidence claims. Surface this weighting in your reasoning.

TEMPORAL TRACKING:
- Compare current insights against PREVIOUS BRIEF themes and key points provided in the prompt.
- If a view has reversed since last brief → flag it explicitly: 'Shift: previously [X], now [Y] across N sources'
- If a theme appears for the 2nd or 3rd consecutive brief → flag it as 'Persistent signal — week N'
- If a previously prominent theme disappears → note the silence

ENTITY DEPTH:
- Where management_tone = negative or guidance_revision = lowered across multiple stocks → identify the pattern as an earnings season signal, not just individual stock noise
- Where earnings_surprise data exists → aggregate beat/miss patterns by sector
- Where catalysts are named → prioritize these as time-sensitive signals

MARKET ANALYSIS FRAMING:
- Write as a market analyst, not a portfolio manager for any specific investor
- Do not frame observations around any particular person's holdings
- Portfolio context is provided only so you can flag when a sector/country tilt intersects with existing exposure — keep this brief and factual, not advisory

LETTER FORMAT:
The 'letter' field contains ONLY the narrative sections below, separated by exact headers. Structured data goes in dedicated JSON fields — never duplicate in the letter.

═══ WHAT TO DO THIS WEEK ═══
3–5 bullet points. Concrete, actionable, market-level. Start each with a verb. Ground each in a specific signal from the newsletters, not generic advice.

═══ ONE-LINE SUMMARY ═══
Single sentence. The dominant signal this week in plain English. Make it a judgment, not a description.

═══ STATE OF THE MARKET ═══
2–3 short paragraphs. What is actually happening and why. Name the 1–2 forces driving everything else.
End with a bullet list: 'Signal quality this week:' — rate the overall newsletter consensus as HIGH / MEDIUM / LOW conviction and explain why in one sentence.

═══ CONSENSUS vs DIVERGENCE ═══
The most important section. Where do sources agree (and is that agreement meaningful or just noise)? Where do they disagree? What does the disagreement tell you? Name sources where identifiable.

═══ WHAT TO WATCH NEXT WEEK ═══
2–3 sentences only. One specific data release or event. One specific price level or threshold that changes the view. One sentence on what a surprise in either direction would mean.

That is ALL that goes in the 'letter' field. Country tilts, sector tilts, stock ideas, crowded trades, and contrarian opportunities are returned ONLY in their structured JSON fields below — never in the letter text.

RESPONSE FORMAT: Return ONLY a raw JSON object. No markdown. No code blocks. Use single quotes inside string values, never unescaped double quotes.

{
  "letter": "narrative sections only, exact headers above, \\n\\n between paragraphs",
  "stocks_to_research": [
    {
      "ticker": "OXY",
      "name": "Occidental Petroleum",
      "setup": "current situation in one sentence",
      "thesis": "why it could work in one sentence",
      "trigger": "what to watch before acting",
      "time_horizon": "short|medium|long",
      "risk_level": "low|moderate|high",
      "mentioned_in": 2,
      "source_confidence_avg": 0.75,
      "consensus_or_edge": "consensus|edge|divergent"
    }
  ],
  "country_tilts": [
    {
      "region": "Japan",
      "direction": "overweight|underweight|neutral",
      "conviction": "high|medium|low",
      "etf_proxy": "EWJ",
      "in_portfolio": true,
      "reasoning": "one sentence",
      "signal_type": "consensus|edge|divergent",
      "vs_prior_brief": "new|unchanged|strengthened|reversed"
    }
  ],
  "sector_tilts": [
    {
      "sector": "Energy",
      "direction": "overweight|underweight|neutral",
      "conviction": "high|medium|low",
      "portfolio_tickers": ["IGLN"],
      "reasoning": "one sentence",
      "signal_type": "consensus|edge|divergent",
      "vs_prior_brief": "new|unchanged|strengthened|reversed",
      "earnings_pattern": "beats|misses|mixed|no_data"
    }
  ],
  "contrarian_opportunities": [
    {
      "title": "short headline",
      "macro_tailwind": "structural reason",
      "why_not_crowded": "what the market is missing",
      "second_order_logic": "if X then Y",
      "ticker": "specific ETF or stock",
      "ticker_name": "full name",
      "in_portfolio": false,
      "time_horizon": "medium|long",
      "conviction": "high|medium|low"
    }
  ],
  "crowded_trades": ["description — N/M sources bullish, signal_type"],
  "temporal_shifts": [
    {
      "topic": "AI infrastructure",
      "prior_view": "bullish consensus",
      "current_view": "scrutiny on fundamentals",
      "weeks_tracked": 2,
      "significance": "one sentence on what the shift means"
    }
  ],
  "weekly_priority": "single action item — market level, not personal",
  "signal_quality": "high|medium|low",
  "newsletters_analyzed": 0,
  "insights_analyzed": 0
}`;
