import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

function parseAIJson(content: string) {
  let jsonString = content.trim();
  // Extract from markdown code blocks
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
    // Normalize and retry
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

    // Fetch last 10 days of insights with newsletter source names
    const tenDaysAgo = new Date(Date.now() - 10 * 24 * 60 * 60 * 1000).toISOString();

    const { data: newsletters } = await supabase
      .from("newsletters")
      .select("id, source_name, upload_date")
      .eq("user_id", user.id)
      .gte("created_at", tenDaysAgo)
      .order("created_at", { ascending: false });

    const newsletterIds = (newsletters ?? []).map(n => n.id);

    if (newsletterIds.length === 0) {
      return new Response(JSON.stringify({
        executive_summary: "No newsletters uploaded in the last 10 days. Upload some newsletters to get AI-generated insights.",
        weekly_priority: null,
        key_points: [],
        action_items: [],
        market_themes: [],
        contrarian_signals: [],
        newsletters_analyzed: 0,
        insights_analyzed: 0,
        persistent_signals: [],
      }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data: insights } = await supabase
      .from("insights")
      .select("*, newsletters(source_name)")
      .in("newsletter_id", newsletterIds)
      .order("created_at", { ascending: false })
      .limit(100);

    const insightsList = insights ?? [];

    // Fetch user positions for portfolio context
    const { data: positions } = await supabase
      .from("positions")
      .select("ticker, name, position_type, category, market_value, weight_percent")
      .eq("user_id", user.id);

    const portfolioTickers = (positions ?? []).map(p => p.ticker);
    const portfolioContext = (positions ?? []).map(p => ({
      ticker: p.ticker,
      name: p.name,
      type: p.position_type,
      category: p.category,
      weight: p.weight_percent,
    }));

    // Fetch previous brief for signal persistence tracking
    const { data: previousBrief } = await supabase
      .from("intelligence_briefs")
      .select("key_points, market_themes, contrarian_signals")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    const previousKeyPointTitles = ((previousBrief?.key_points as any[]) ?? []).map((kp: any) => kp.title);
    const previousThemeNames = ((previousBrief?.market_themes as any[]) ?? []).map((t: any) => t.theme);

    // Build newsletter source map for the prompt
    const sourceMap: Record<string, string> = {};
    for (const n of newsletters ?? []) {
      sourceMap[n.id] = n.source_name;
    }

    const systemPrompt = `You are a sharp, independent investment analyst writing a weekly intelligence letter. You have no client portfolio to manage. Your job is to synthesize signals from multiple newsletter sources into a clear, opinionated market view.

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

    // Step: Fetch real-time market context via Perplexity
    let marketContext = "";
    const PERPLEXITY_API_KEY = Deno.env.get("PERPLEXITY_API_KEY");
    if (PERPLEXITY_API_KEY) {
      try {
        const today = new Date().toISOString().split("T")[0];
        const perplexityRes = await fetch("https://api.perplexity.ai/chat/completions", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${PERPLEXITY_API_KEY}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            model: "sonar",
            messages: [
              {
                role: "user",
                content: `As of ${today}: Give me a concise factual summary of current market conditions. Include: S&P 500, Nasdaq, Dow Jones, and Euro Stoxx 50 levels and weekly % change; 10-year US Treasury yield; Fed funds rate and latest FOMC guidance; USD/EUR and USD/JPY; gold and oil prices; VIX level; and the 2-3 most important macro events or data releases this week. Facts only, no opinions. Cite sources.`,
              },
            ],
            search_recency_filter: "week",
          }),
        });

        if (perplexityRes.ok) {
          const perplexityData = await perplexityRes.json();
          marketContext = perplexityData.choices?.[0]?.message?.content ?? "";
          const citations = perplexityData.citations ?? [];
          if (citations.length > 0) {
            marketContext += `\n\nSources: ${citations.join(", ")}`;
          }
          console.log("Perplexity market context fetched successfully");
        } else {
          console.warn("Perplexity API returned", perplexityRes.status, "— proceeding without market verification");
        }
      } catch (e) {
        console.warn("Perplexity call failed, proceeding without market verification:", e);
      }
    } else {
      console.warn("PERPLEXITY_API_KEY not configured — skipping real-time market verification");
    }

    const marketVerificationBlock = marketContext
      ? `\n\nREAL-TIME MARKET CONTEXT (verified data as of today — use this to cross-check newsletter claims):\n${marketContext}\n\nIMPORTANT: Cross-check newsletter claims against the real-time market context above. If a newsletter claim contradicts current verified data, note the discrepancy in your letter and use the verified data. Do not repeat stale or inaccurate claims from newsletters.`
      : "";

    const userPrompt = `PORTFOLIO CONTEXT (for exposure flagging only — do not write as portfolio manager):
${JSON.stringify(portfolioContext, null, 2)}

PORTFOLIO TICKERS: ${JSON.stringify(portfolioTickers)}

NEWSLETTERS THIS PERIOD (${newsletters?.length ?? 0} sources):
${(newsletters ?? []).map(n => `- "${n.source_name}" (${n.upload_date})`).join("\n")}

PREVIOUS BRIEF (for temporal tracking):
Previous themes: ${JSON.stringify(previousThemeNames)}
Previous key points: ${JSON.stringify(previousKeyPointTitles)}

ALL INSIGHTS (${insightsList.length} total, with metadata, sorted newest first):
${JSON.stringify(insightsList.map(i => {
  const meta = (i as any).metadata ?? {};
  const ageDays = Math.floor((Date.now() - new Date(i.created_at).getTime()) / (1000 * 60 * 60 * 24));
  return {
    type: i.insight_type,
    content: i.content,
    sentiment: i.sentiment,
    tickers: i.tickers_mentioned,
    source: (i.newsletters as any)?.source_name,
    age_days: ageDays,
    source_confidence: meta.source_confidence ?? 0.5,
    management_tone: meta.management_tone,
    guidance_revision: meta.guidance_revision,
    earnings_surprise: meta.earnings_surprise,
    claim_specificity: meta.claim_specificity,
    data_backed: meta.data_backed,
    conviction_level: meta.conviction_level,
    is_consensus_view: meta.is_consensus_view,
    catalyst: meta.catalyst,
  };
}), null, 2)}

Write the weekly intelligence letter. Synthesize, weigh, and judge — do not just summarize. Flag consensus vs edge signals. Note any temporal shifts from the previous brief. Ground every claim in specific newsletter evidence.${marketVerificationBlock}`;

    console.log(`Summarizing ${insightsList.length} insights from ${newsletters?.length} newsletters...`);

    // Retry wrapper for Anthropic API calls
    async function callAnthropicWithRetry(body: object, maxRetries = 2): Promise<Response> {
      for (let attempt = 0; attempt <= maxRetries; attempt++) {
        const resp = await fetch("https://api.anthropic.com/v1/messages", {
          method: "POST",
          headers: {
            "x-api-key": ANTHROPIC_API_KEY,
            "anthropic-version": "2023-06-01",
            "Content-Type": "application/json",
          },
          body: JSON.stringify(body),
        });

        if (resp.ok) return resp;
        if (resp.status === 401 || resp.status === 402 || resp.status === 403) return resp;

        if (attempt < maxRetries && (resp.status === 429 || resp.status >= 500)) {
          const delay = resp.status === 429 ? 5000 * (attempt + 1) : 2000 * (attempt + 1);
          console.log(`Anthropic returned ${resp.status}, retrying in ${delay}ms (attempt ${attempt + 1}/${maxRetries})`);
          await new Promise(r => setTimeout(r, delay));
          continue;
        }
        return resp;
      }
      throw new Error("Unreachable");
    }

    const response = await callAnthropicWithRetry({
      model: "claude-sonnet-4-5-20250929",
      system: systemPrompt,
      messages: [{ role: "user", content: userPrompt }],
      max_tokens: 8192,
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error("AI gateway error:", response.status, errorText);
      if (response.status === 429) {
        return new Response(
          JSON.stringify({ error: "Rate limit exceeded. Please try again in a moment." }),
          { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      if (response.status === 402) {
        return new Response(
          JSON.stringify({ error: "AI credits exhausted. Please add credits to continue." }),
          { status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      return new Response(
        JSON.stringify({ error: "AI summarization failed. Please try again." }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const aiResponse = await response.json();
    const content = aiResponse.content?.[0]?.text;

    if (!content) {
      return new Response(
        JSON.stringify({ error: "AI returned empty response." }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const result = parseAIJson(content);
    if (!result) {
      return new Response(
        JSON.stringify({ error: "Failed to parse AI summary response." }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const briefPayload = {
      ...result,
      key_points: result.temporal_shifts ?? [],
      newsletters_analyzed: newsletters?.length ?? 0,
      insights_analyzed: insightsList.length,
      generated_at: new Date().toISOString(),
    };

    // Persist brief server-side so it survives client disconnects
    const { error: insertError } = await supabase.from("intelligence_briefs").insert({
      user_id: user.id,
      executive_summary: (result.letter ?? "").substring(0, 500),
      letter: result.letter ?? null,
      section_titles: result.section_titles ?? null,
      stocks_to_research: result.stocks_to_research ?? null,
      country_tilts: result.country_tilts ?? null,
      sector_tilts: result.sector_tilts ?? null,
      contrarian_opportunities: result.contrarian_opportunities ?? null,
      crowded_trades: result.crowded_trades ?? [],
      weekly_priority: result.weekly_priority ?? null,
      key_points: result.temporal_shifts ?? [],
      action_items: [],
      market_themes: [],
      // crowded_trades stored in contrarian_signals column (legacy schema mapping)
      contrarian_signals: result.crowded_trades ?? [],
      newsletters_analyzed: newsletters?.length ?? 0,
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

    // Cleanup: keep last 10 briefs (AFTER successful insert to avoid data loss)
    const { data: existingBriefs } = await supabase
      .from("intelligence_briefs")
      .select("id, created_at")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false });

    if (existingBriefs && existingBriefs.length > 10) {
      const toDelete = existingBriefs.slice(10).map((b: any) => b.id);
      await supabase.from("intelligence_briefs").delete().in("id", toDelete);
    }

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
