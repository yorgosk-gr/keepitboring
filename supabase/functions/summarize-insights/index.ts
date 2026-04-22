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
  try { return JSON.parse(jsonString); } catch {}
  const cleaned = jsonString.replace(/[\u201C\u201D]/g, '"').replace(/[\u2018\u2019]/g, "'").replace(/\r?\n/g, " ").replace(/\s+/g, " ");
  try { return JSON.parse(cleaned); } catch (e) {
    console.error("Failed to parse AI response:", e);
    return null;
  }
}

/**
 * Phase 2 of brief generation: call Anthropic with the pre-assembled prompt.
 *
 * Expects POST body: { user_prompt, user_id, newsletters_count, insights_count, market_context_available }
 * All data gathering happened in prepare-brief-data (Phase 1).
 *
 * This function ONLY calls Anthropic + saves to DB, keeping it well under 60s.
 */
serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Auth check
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

    const body = await req.json();
    const { user_prompt, newsletters_count, insights_count, market_context_available } = body;

    if (!user_prompt) {
      return new Response(JSON.stringify({ error: "Missing user_prompt — call prepare-brief-data first" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    console.log(`Calling Anthropic for ${insights_count} insights from ${newsletters_count} newsletters...`);

    // Call Anthropic — non-streaming, max_tokens=1800 for ~25-35s generation
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 55000);

    let response: Response;
    try {
      response = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: {
          "x-api-key": ANTHROPIC_API_KEY,
          "anthropic-version": "2023-06-01",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: "claude-sonnet-4-5-20250929",
          system: SYSTEM_PROMPT,
          messages: [{ role: "user", content: user_prompt }],
          max_tokens: 2500,
        }),
        signal: controller.signal,
      });
    } catch (fetchError: any) {
      clearTimeout(timeout);
      if (fetchError?.name === "AbortError") {
        return new Response(JSON.stringify({ error: "AI generation timed out. Please try again." }), {
          status: 504,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      throw fetchError;
    }
    clearTimeout(timeout);

    if (!response.ok) {
      let detail = "";
      try { const b = await response.json(); detail = b?.error?.message || JSON.stringify(b?.error) || ""; } catch {}
      const msgs: Record<number, string> = {
        429: "Rate limit exceeded. Please try again in a moment.",
        402: "AI credits exhausted. Please add credits.",
        401: "AI auth failed. Check API key.", 403: "AI auth failed. Check API key.",
      };
      return new Response(JSON.stringify({
        error: msgs[response.status] || `AI failed (${response.status}): ${detail}`,
      }), {
        status: response.status,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const aiResult = await response.json();
    const fullText = aiResult.content?.[0]?.text ?? "";

    if (!fullText) {
      return new Response(JSON.stringify({ error: "AI returned empty response." }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const stopReason = aiResult.stop_reason ?? "unknown";
    console.log(`Anthropic responded: ${fullText.length} chars, ${aiResult.usage?.output_tokens ?? "?"} tokens, stop_reason=${stopReason}`);

    // Detect truncation — if the AI hit max_tokens, the JSON is likely incomplete
    if (stopReason === "max_tokens") {
      console.error("AI response was truncated (hit max_tokens). First 500 chars:", fullText.substring(0, 500));
      return new Response(JSON.stringify({ error: "AI response was truncated. Please try again." }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const result = parseAIJson(fullText);
    if (!result) {
      console.error("Failed to parse AI response. First 500 chars:", fullText.substring(0, 500));
      console.error("Last 200 chars:", fullText.substring(fullText.length - 200));
      return new Response(JSON.stringify({ error: "Failed to parse AI response." }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Extract executive summary
    let execSummary = result.weekly_priority || "";
    if (!execSummary && result.letter) {
      const m = result.letter.match(/═══\s*ONE-LINE SUMMARY\s*═══\s*\n([\s\S]*?)(?=═══|$)/);
      if (m) execSummary = m[1].trim().substring(0, 500);
      else {
        const l = result.letter.split("\n").filter((x: string) => x.trim() && !x.includes("═══"));
        if (l[0]) execSummary = l[0].trim().substring(0, 500);
      }
    }

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
      valuation_mentions: result.valuation_mentions ?? [],
      action_items: [], market_themes: [],
      crowded_trades_legacy: result.crowded_trades ?? [],
      newsletters_analyzed: newsletters_count,
      insights_analyzed: insights_count,
      generated_at: new Date().toISOString(),
    });

    if (insertError) {
      console.error("Failed to persist brief:", insertError);
      return new Response(JSON.stringify({
        error: "Failed to save brief: " + (insertError.message || "unknown"),
      }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Cleanup old briefs
    const { data: existing } = await supabase.from("intelligence_briefs")
      .select("id, created_at").eq("user_id", user.id).order("created_at", { ascending: false });
    if (existing && existing.length > 10) {
      await supabase.from("intelligence_briefs").delete().in("id", existing.slice(10).map((b: any) => b.id));
    }

    console.log(`Brief saved: ${insights_count} insights from ${newsletters_count} newsletters`);

    const briefPayload = {
      ...result,
      temporal_shifts: result.temporal_shifts ?? [],
      newsletters_analyzed: newsletters_count,
      insights_analyzed: insights_count,
      generated_at: new Date().toISOString(),
      market_context_available: !!market_context_available,
    };

    return new Response(JSON.stringify(briefPayload), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("summarize-insights error:", error);
    return new Response(JSON.stringify({
      error: error instanceof Error ? error.message : "Unknown error",
    }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});

const SYSTEM_PROMPT = `You are a market analyst writing a weekly intelligence letter. Synthesize signals, be opinionated and concise.

ROLE: Analyst ONLY — describe what's happening, never recommend actions. No "buy/sell/trim/add/deploy". Observations only.
RULES: 3+ sources = consensus (crowded). Divergence = highest value. Weight data-backed high-confidence 2x. Every sentence must carry signal.

LETTER FORMAT (inside the "letter" field, use \\n for newlines):
═══ KEY THEMES THIS WEEK ═══
3-5 bullets. Signals/opportunities/risks as observations.
═══ ONE-LINE SUMMARY ═══
One sentence. Dominant signal.
═══ STATE OF THE MARKET ═══
1-2 short paragraphs. End with: Signal quality: HIGH/MEDIUM/LOW.
═══ WHAT TO WATCH NEXT WEEK ═══
2-3 sentences.

CRITICAL: Respond with ONLY a valid JSON object. No markdown, no code fences, no explanation before or after.
Keep the letter SHORT — max 800 words. Keep country_tilts to max 5 entries, sector_tilts to max 5.

JSON schema:
{
  "letter": "full letter text with \\n for newlines",
  "country_tilts": [
    {"region": "...", "direction": "overweight|underweight|neutral", "conviction": "high|medium|low", "etf_proxy": "...", "in_portfolio": false, "reasoning": "one sentence", "signal_type": "consensus|edge|divergent"}
  ],
  "sector_tilts": [
    {"sector": "...", "direction": "overweight|underweight|neutral", "conviction": "high|medium|low", "portfolio_tickers": [], "reasoning": "one sentence", "signal_type": "consensus|edge|divergent", "earnings_pattern": "beats|misses|mixed|no_data"}
  ],
  "weekly_priority": "one sentence — the top signal this week",
  "signal_quality": "high|medium|low",
  "valuation_mentions": [
    {"asset": "asset name (e.g. S&P 500, energy sector, EM equities, 10y Treasury)", "metric": "metric name (e.g. forward P/E, CAPE, dividend yield, spread)", "value": "current value as quoted (e.g. 22x, 3.8%, 350bps)", "vs_history": "high|low|neutral|unknown", "source_snippet": "short quoted/paraphrased context (≤ 20 words)"}
  ]
}

VALUATION MENTIONS — extraction rules:
- Scan newsletter insights for any explicit valuation comparison (P/E, CAPE, EV/EBITDA, dividend yield, credit spread, bond yield, price vs book, etc.) with context.
- Include only mentions that compare current value to history, median, peers, or an explicit level (e.g. "cheapest since 2020", "22x vs 10y median of 17x", "tightest spreads in a decade").
- If the newsletter calls something "expensive", "cheap", "stretched", "compressed", etc. with a numeric anchor, capture it.
- Omit vague claims with no number ("overvalued" alone = skip).
- Max 8 entries. Prefer index/sector-level over single-ticker mentions unless the ticker is widely held.
- If no explicit valuation comparisons appear, return an empty array.`;
