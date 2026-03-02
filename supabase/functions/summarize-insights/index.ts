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
    } catch {
      // Last resort: single quotes to double quotes
      try {
        return JSON.parse(cleaned.replace(/'/g, '"'));
      } catch (e) {
        console.error("Failed to parse AI response:", e);
        console.error("Raw content:", content.substring(0, 1000));
        return null;
      }
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

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) {
      return new Response(
        JSON.stringify({ error: "AI service not configured" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Fetch last 30 days of insights with newsletter source names
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();

    const { data: newsletters } = await supabase
      .from("newsletters")
      .select("id, source_name, upload_date")
      .eq("user_id", user.id)
      .gte("created_at", thirtyDaysAgo)
      .order("created_at", { ascending: false });

    const newsletterIds = (newsletters ?? []).map(n => n.id);

    if (newsletterIds.length === 0) {
      return new Response(JSON.stringify({
        executive_summary: "No newsletters uploaded in the last 30 days. Upload some newsletters to get AI-generated insights.",
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

    const systemPrompt = `You are a sharp, opinionated investment analyst writing a weekly letter to a single sophisticated investor. You have read all their newsletters and know their portfolio intimately.

Write in first-person analytical prose — like a trusted friend who happens to be a portfolio manager. Direct, specific, no fluff. Reference their actual holdings by ticker. Have a point of view.

The letter has four sections. Write each as flowing prose, not bullet points or headers within sections.

SECTION 1 — STATE OF THE MARKET
2-3 paragraphs. What is the macro environment doing right now? What is the dominant theme across this week's newsletters? What does the weight of evidence suggest about the direction of markets, rates, and risk appetite? Name the Kindleberger phase for the most relevant sector if applicable (Displacement / Credit Expansion / Euphoria / Distress / Revulsion). Be direct about what you think is happening, not just what newsletters said.

SECTION 2 — WHAT THIS MEANS FOR YOUR PORTFOLIO
2-3 paragraphs. Go through the portfolio systematically. Which positions are being validated by this week's signals? Which are being challenged? For each meaningful holding affected, say specifically what the signal means and whether it changes anything. Connect newsletter themes to actual tickers. If a position has no signal this week, say so briefly.
Flag any Taleb-style risks: correlation clusters, untested positions, narrative-driven theses.

SECTION 3 — WHERE TO INVEST
Be concrete and opinionated. Cover three things:
- COUNTRY/REGION TILTS: Which geographies are newsletters overweighting or underweighting? Does this suggest adding to or trimming any of the geographic ETFs in the portfolio?
  COUNTRY TILTS: Always generate at least 3 country/region tilts based on the macro signals. Think carefully about direction: geopolitical instability, war, or sanctions in a region means UNDERWEIGHT (not overweight!). Only overweight regions with positive catalysts like structural growth, reform, or capital inflows. Examples: Middle East conflict = underweight Middle East; strong AI hardware demand = overweight US/Taiwan; sticky inflation = underweight EM. Map each to the closest ETF in the portfolio. Never return an empty country_tilts array.
- SECTOR TILTS: Which sectors are seeing upgrades or downgrades across newsletters? Map these to actual or potential holdings.
  For each sector_tilt, add a 'portfolio_tickers' array containing any tickers from the user's actual portfolio that belong to that sector. Use your knowledge of each company's primary business to determine sector membership — do not rely on hardcoded rules. For example: AMZN is Technology/E-commerce, not Hardware; CRWD is Cybersecurity/Software; IGLN is Gold/Commodities; IB01 is Fixed Income; IJPA is Japan Equities. If no portfolio holdings belong to a sector, set portfolio_tickers to an empty array. Also never split Technology into Hardware vs Software unless the portfolio has holdings in both sub-sectors. Add a 'reasoning' field with one sentence explaining the tilt.
- STOCKS TO RESEARCH: List 2-4 specific stocks mentioned positively across multiple newsletters that are NOT currently in the portfolio but are worth investigating. For each: ticker, one-sentence thesis, and why it fits the investment philosophy.

SECTION 4 — WATCH THIS WEEK
2-3 sentences. The single most important thing to monitor. Could be a data release, an earnings report, a technical level on a position, or a developing narrative. End with one actionable sentence — the ONE thing to do or decide this week.

CROWDED TRADE WARNING: If more than 3 newsletters agree on the same bullish call, flag it at the end of the relevant section as: "Note: [theme] is becoming consensus — [X] of [Y] newsletters bullish. Lefèvre would be cautious here."

SECTION: CONTRARIAN OPPORTUNITIES
After analyzing the main themes, look for opportunities that meet ALL THREE of these criteria:
1. MACRO TAILWIND: There is a structural, multi-year reason for this sector, country, or stock to appreciate — driven by rates, demographics, geopolitics, technology adoption, or capital flows
2. NOT CROWDED: This opportunity is NOT the consensus trade. It should appear in fewer than 2 of the newsletters, or be mentioned only as a secondary/indirect beneficiary
3. LOGICAL FOLLOW-ON: It follows logically from a signal that IS in the newsletters, but one step removed. Ask: if X is true, what else must also be true that nobody is talking about yet?

For each opportunity, explain:
- What the macro tailwind is
- Why it is not yet crowded (what the market is missing)
- What the second-order logic is
- A specific ticker or ETF to express the trade (can be something not currently in the portfolio)
- Time horizon: medium (6-18 months) or long (2-5 years)

Be specific and opinionated. These should feel like genuine insights, not generic diversification advice. Limit to 2-3 opportunities maximum. Quality over quantity — only include if genuinely non-consensus and well-reasoned.

TONE: Analytical but direct. Like the Economist meets a hedge fund letter. No excessive hedging. No 'it remains to be seen.' Have a view.

RESPONSE FORMAT: Return ONLY a raw JSON object. No markdown, no prose outside the JSON. Do not wrap in code blocks. Do not use unescaped double quotes inside string values — use single quotes instead.

{
  "letter": "the full letter text as a single string with \\n\\n between paragraphs",
  "section_titles": {
    "market": "State of the Market",
    "portfolio": "What This Means For Your Portfolio",
    "invest": "Where to Invest",
    "watch": "Watch This Week"
  },
  "stocks_to_research": [
    {
      "ticker": "OXY",
      "name": "Occidental Petroleum",
      "thesis": "one sentence",
      "mentioned_in": 2
    }
  ],
  "country_tilts": [
    {
      "region": "Japan",
      "direction": "overweight",
      "etf_proxy": "IJPA",
      "in_portfolio": true,
      "reasoning": "one sentence explaining why this tilt"
    }
  ],
  "sector_tilts": [
    {
      "sector": "Energy",
      "direction": "overweight",
      "conviction": "high",
      "portfolio_tickers": ["IGLN", "CMOD"],
      "reasoning": "one sentence why"
    }
  ],
  "contrarian_opportunities": [
    {
      "title": "Short headline",
      "macro_tailwind": "The structural reason this goes up",
      "why_not_crowded": "What the market is missing",
      "second_order_logic": "If X then Y — the non-obvious link",
      "ticker": "Specific ETF or stock",
      "ticker_name": "Full name",
      "in_portfolio": false,
      "time_horizon": "medium",
      "conviction": "high"
    }
  ],
  "crowded_trades": ["AI infrastructure — 4/5 newsletters bullish"],
  "weekly_priority": "one sentence — the single action item",
  "newsletters_analyzed": 0,
  "insights_analyzed": 0
}`;

    const userPrompt = `MY PORTFOLIO:
${JSON.stringify(portfolioContext, null, 2)}

PORTFOLIO TICKERS: ${JSON.stringify(portfolioTickers)}

NEWSLETTERS THIS PERIOD (${newsletters?.length ?? 0} sources):
${(newsletters ?? []).map(n => `- "${n.source_name}" (${n.upload_date})`).join("\n")}

PREVIOUS BRIEF (for persistence tracking):
Previous themes: ${JSON.stringify(previousThemeNames)}
Previous key points: ${JSON.stringify(previousKeyPointTitles)}

ALL INSIGHTS (${insightsList.length} total, sorted newest first):
${JSON.stringify(insightsList.map(i => {
  const ageDays = Math.floor((Date.now() - new Date(i.created_at).getTime()) / (1000 * 60 * 60 * 24));
  return {
    type: i.insight_type,
    content: i.content,
    sentiment: i.sentiment,
    tickers: i.tickers_mentioned,
    source: (i.newsletters as any)?.source_name,
    age_days: ageDays,
  };
}), null, 2)}

Write the weekly letter. Be specific, be direct, reference my actual holdings. I want to read this on Monday morning and know exactly what to think about my portfolio and where to look next.`;

    console.log(`Summarizing ${insightsList.length} insights from ${newsletters?.length} newsletters...`);

    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt },
        ],
        max_tokens: 8192,
      }),
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
    const content = aiResponse.choices?.[0]?.message?.content;

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

    // Clean up old newsletters (30 days)
    const thirtyDaysAgoCutoff = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
    const { data: oldNewsletters } = await supabase
      .from("newsletters")
      .select("id")
      .eq("user_id", user.id)
      .lt("created_at", thirtyDaysAgoCutoff);

    const oldIds = (oldNewsletters ?? []).map(n => n.id);
    if (oldIds.length > 0) {
      await supabase.from("insights").delete().in("newsletter_id", oldIds);
      const { error: delErr } = await supabase
        .from("newsletters")
        .delete()
        .eq("user_id", user.id)
        .lt("created_at", thirtyDaysAgoCutoff);
      if (delErr) console.error("Cleanup error:", delErr);
      else console.log(`Cleaned up ${oldIds.length} newsletters older than 30 days`);
    }

    return new Response(JSON.stringify({
      ...result,
      newsletters_analyzed: newsletters?.length ?? 0,
      insights_analyzed: insightsList.length,
      generated_at: new Date().toISOString(),
      cleaned_up: oldIds.length,
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
