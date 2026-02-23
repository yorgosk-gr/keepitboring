import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

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
        summary: "No newsletters uploaded in the last 30 days. Upload some newsletters to get AI-generated insights.",
        key_points: [],
        action_items: [],
        market_themes: [],
        newsletters_analyzed: 0,
        insights_analyzed: 0,
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

    const systemPrompt = `You are an investment research analyst. Synthesize newsletter insights into an actionable intelligence brief.

RESPONSE FORMAT: Return ONLY a raw JSON object. No markdown, no prose, no explanation outside the JSON. Do not wrap in \`\`\`json code blocks. Do not use unescaped double quotes inside string values — use single quotes instead (e.g., use 'crushed' not "crushed").

OUTPUT FORMAT (valid JSON):
{
  "executive_summary": "2-3 sentence overview of the most important themes and actionable signals from the last 30 days.",
  "key_points": [
    {
      "title": "Short headline (5-8 words)",
      "detail": "1-2 sentence explanation with specific data points",
      "relevance": "high" | "medium" | "low",
      "category": "macro" | "sector" | "stock" | "risk" | "opportunity"
    }
  ],
  "action_items": [
    {
      "action": "Specific actionable recommendation (e.g. 'Review AMZN position — multiple sources flag valuation concern')",
      "urgency": "high" | "medium" | "low",
      "reasoning": "One sentence why"
    }
  ],
  "market_themes": [
    {
      "theme": "Theme name (e.g. 'AI Bubble Risk')",
      "sentiment": "bullish" | "bearish" | "mixed",
      "source_count": 3,
      "portfolio_impact": "Which of your holdings are affected and how"
    }
  ],
  "contrarian_signals": [
    "Any cases where newsletters disagree or consensus seems too strong"
  ]
}

RULES:
- Prioritize insights that directly affect the user's portfolio holdings
- Be specific: mention tickers, percentages, dates
- Flag consensus (>2 sources agree) and contrarian views
- Keep key_points to 5-8 items max
- Keep action_items to 3-5 items max
- Keep market_themes to 3-5 items max
- Do NOT fabricate data not present in the insights`;

    const userPrompt = `PORTFOLIO HOLDINGS:
${JSON.stringify(portfolioTickers)}

NEWSLETTERS ANALYZED (${newsletters?.length ?? 0} sources):
${(newsletters ?? []).map(n => `- ${n.source_name} (${n.upload_date})`).join("\n")}

INSIGHTS (${insightsList.length} total):
${JSON.stringify(insightsList.map(i => ({
  type: i.insight_type,
  content: i.content,
  sentiment: i.sentiment,
  tickers: i.tickers_mentioned,
  confidence: i.confidence_words,
  source: (i.newsletters as any)?.source_name,
})), null, 2)}

Synthesize these into an actionable intelligence brief. Focus on what matters for MY portfolio.`;

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
        max_tokens: 4096,
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

    // Parse JSON from response - robust extraction
    let result;
    try {
      let jsonString = content.trim();
      // Extract from markdown code blocks
      const jsonBlockMatch = jsonString.match(/```json\s*([\s\S]*?)```/);
      if (jsonBlockMatch) {
        jsonString = jsonBlockMatch[1].trim();
      } else {
        // Try to find raw JSON object
        const firstBrace = jsonString.indexOf('{');
        const lastBrace = jsonString.lastIndexOf('}');
        if (firstBrace !== -1 && lastBrace > firstBrace) {
          jsonString = jsonString.substring(firstBrace, lastBrace + 1);
        }
      }
      result = JSON.parse(jsonString);
    } catch {
      // Try fixing unescaped quotes inside string values by collapsing to single line
      try {
        let cleaned = content.trim();
        const jsonBlockMatch2 = cleaned.match(/```json\s*([\s\S]*?)```/);
        if (jsonBlockMatch2) {
          cleaned = jsonBlockMatch2[1].trim();
        } else {
          const firstBrace = cleaned.indexOf('{');
          const lastBrace = cleaned.lastIndexOf('}');
          if (firstBrace !== -1 && lastBrace > firstBrace) {
            cleaned = cleaned.substring(firstBrace, lastBrace + 1);
          }
        }
        // Replace unescaped internal double quotes: look for patterns like "word" inside JSON strings
        // by replacing literal newlines and collapsing whitespace
        const singleLine = cleaned.replace(/\r?\n/g, " ").replace(/\s+/g, " ");
        // Fix unescaped quotes by replacing "word" patterns inside strings with \"word\"
        const fixed = singleLine.replace(/(?<=:\s*"[^"]*)"(?=[^"]*"[^"]*(?:,|\}))/g, '\\"');
        result = JSON.parse(fixed);
      } catch (e3) {
        // Last resort: try replacing smart quotes and common problematic chars
        try {
          let raw = content.trim();
          const m = raw.match(/```json\s*([\s\S]*?)```/);
          if (m) raw = m[1].trim();
          else {
            const f = raw.indexOf('{');
            const l = raw.lastIndexOf('}');
            if (f !== -1 && l > f) raw = raw.substring(f, l + 1);
          }
          // Replace curly/smart quotes with straight quotes
          raw = raw.replace(/[\u201C\u201D]/g, '"').replace(/[\u2018\u2019]/g, "'");
          // Escape internal unescaped double quotes in string values
          // Strategy: find "text "quoted" text" and escape the inner quotes
          raw = raw.replace(/"([^"]*)"([^"]*)"([^"]*?)"/g, (match) => {
            // Only fix if it looks like an inner quote issue
            return match;
          });
          const oneLine = raw.replace(/\r?\n/g, " ").replace(/\s+/g, " ");
          result = JSON.parse(oneLine);
        } catch (e4) {
          console.error("Failed to parse AI summary response:", e4);
          console.error("Raw content:", content.substring(0, 1000));
          return new Response(
            JSON.stringify({ error: "Failed to parse AI summary response." }),
            { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }
      }
    }

    // Delete newsletters (and their insights via cascade) older than 30 days
    const thirtyDaysAgoCutoff = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();

    // First delete insights belonging to old newsletters
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
      if (delErr) {
        console.error("Cleanup error:", delErr);
      } else {
        console.log(`Cleaned up ${oldIds.length} newsletters older than 30 days`);
      }
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
