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

    const systemPrompt = `You are a sharp, opinionated investment analyst writing a concise weekly letter for a long-term retail ETF investor. You have read all their newsletters and know their portfolio. Write for a two-minute read: short sentences, clear headings, no fluff. Reference actual holdings by ticker. Have a point of view.

The letter MUST follow this exact structure:

═══ WHAT TO DO THIS WEEK ═══
A box at the very top with 2-4 bullet points: the most important actions or decisions for the week. Concrete, specific, actionable. Start each with a verb.

═══ ONE-LINE SUMMARY ═══
A single bold sentence capturing the week's dominant signal.

═══ SECTION 1: STATE OF THE MARKET ═══
2-3 short paragraphs in plain language. No jargon like 'unsettling cocktail' or 'Distress phase'. Say what is happening clearly. Name the Kindleberger phase only in parentheses if relevant.
End with a bullet list titled 'Implications for positioning' with 3-5 specific, actionable points.

═══ SECTION 2: WHAT THIS MEANS FOR YOUR PORTFOLIO ═══
Go through the portfolio. Which positions are validated? Which are challenged? Be specific per ticker. Flag correlation clusters or narrative-driven risk.

═══ SECTION 3: COUNTRY & REGION TILTS ═══
Present as a markdown table:
| Region | Stance | Conviction | Rationale |
Always at least 3 rows. Geopolitical instability = UNDERWEIGHT. Map each to portfolio ETF if possible. Use plain language a non-professional investor can follow.

═══ SECTION 4: SECTOR TILTS ═══
Present as a markdown table:
| Sector | Stance | Conviction | Rationale |
Map sectors to portfolio tickers using business knowledge (AMZN=E-commerce, CRWD=Cybersecurity, IGLN=Gold). One clear sentence per rationale. Don't split Technology unless portfolio has both hardware and software.

═══ SECTION 5: STOCK IDEAS ═══
2-4 stocks mentioned across newsletters that are NOT in the portfolio. For each stock, use exactly this format:
**[TICKER] — [Company Name]**
- **Setup:** What's happening with this stock right now (1 sentence)
- **Thesis:** Why it could work (1 sentence)
- **Trigger:** What to watch before entering (1 sentence)
- **Time horizon & risk:** Short/medium/long + risk level (1 sentence)

═══ SECTION 6: WHAT TO WATCH NEXT WEEK ═══
2-3 sentences. The single most important thing to monitor. End with one actionable sentence.

═══ CROWDED TRADE WARNING ═══
If 3+ newsletters agree on same bullish call, flag it: '[theme] is becoming consensus — [X]/[Y] newsletters bullish. Be cautious.'

═══ CONTRARIAN OPPORTUNITIES ═══
Max 2-3. Each must have: macro tailwind, why not crowded, second-order logic, specific ticker, time horizon. Be genuinely non-consensus.

TONE: Direct, analytical, plain English. Like a smart friend who manages money. No excessive hedging. Short sentences. Clear headings. Skimmable.

RESPONSE FORMAT: Return ONLY a raw JSON object. No markdown wrapping, no code blocks. Do not use unescaped double quotes inside string values — use single quotes instead.

{
  "letter": "the full letter text as a single string with \\n\\n between sections. Use markdown formatting: ## for headings, | for tables, ** for bold, - for bullets",
  "section_titles": {
    "action_box": "What To Do This Week",
    "summary": "One-Line Summary",
    "market": "State of the Market",
    "portfolio": "What This Means For Your Portfolio",
    "country_tilts": "Country & Region Tilts",
    "sector_tilts": "Sector Tilts",
    "stock_ideas": "Stock Ideas",
    "watch": "What To Watch Next Week"
  },
  "stocks_to_research": [
    {
      "ticker": "OXY",
      "name": "Occidental Petroleum",
      "setup": "one sentence on current situation",
      "thesis": "one sentence why it could work",
      "trigger": "what to watch before entering",
      "time_horizon": "medium",
      "risk_level": "moderate",
      "mentioned_in": 2
    }
  ],
  "country_tilts": [
    {
      "region": "Japan",
      "direction": "overweight",
      "conviction": "high",
      "etf_proxy": "IJPA",
      "in_portfolio": true,
      "reasoning": "one sentence explaining why"
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

Write the weekly letter. Be specific, be direct, reference my actual holdings. I want to read this on Monday morning and know exactly what to think about my portfolio and where to look next.${marketVerificationBlock}`;

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
