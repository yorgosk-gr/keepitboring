import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

function formatRules(rules: any[]): string {
  if (!rules || rules.length === 0) return "No custom rules — use sensible defaults (60% equity, 25% bonds, 15% commodities)";
  return rules.map((r: any) => {
    let line = "- " + r.name;
    if (r.description) line += ": " + r.description;
    if (r.threshold_min != null) line += " (min: " + r.threshold_min + "%)";
    if (r.threshold_max != null) line += " (max: " + r.threshold_max + "%)";
    if (r.rule_type) line += " [type: " + r.rule_type + "]";
    return line;
  }).join("\n");
}

function formatBrief(brief: any): string {
  if (!brief) return "No intelligence brief available — use strategic allocation only.";

  const parts: string[] = [];
  parts.push("INTELLIGENCE BRIEF (use this to inform tactical tilts):");
  parts.push("Executive Summary: " + (brief.executive_summary || "N/A"));

  if (brief.key_points && brief.key_points.length > 0) {
    parts.push("\nKey Points:");
    for (const kp of brief.key_points) {
      parts.push("- [" + kp.relevance + "] " + kp.title + ": " + kp.detail);
    }
  }

  if (brief.market_themes && brief.market_themes.length > 0) {
    parts.push("\nMarket Themes:");
    for (const mt of brief.market_themes) {
      parts.push("- " + mt.theme + " (" + mt.sentiment + "): " + mt.portfolio_impact);
    }
  }

  if (brief.contrarian_signals && brief.contrarian_signals.length > 0) {
    parts.push("\nContrarian Signals:");
    for (const cs of brief.contrarian_signals) {
      parts.push("- " + cs);
    }
  }

  parts.push("\nUse these signals to adjust tactical weights.");
  return parts.join("\n");
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const token = authHeader.replace("Bearer ", "");
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);
    if (authError || !user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) {
      return new Response(JSON.stringify({ error: "AI service not configured" }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { rules, intelligence_brief } = await req.json();

    const systemPrompt = [
      "You are an expert portfolio construction advisor specializing in tax-efficient investing for non-US residents.",
      "",
      "CONTEXT:",
      "- The investor is a UAE tax resident (0% income tax, 0% capital gains tax)",
      "- To avoid US withholding tax on dividends (30% for non-treaty countries), prefer Ireland-domiciled UCITS ETFs",
      "- Ireland has a 15% treaty rate with the US, making Irish-domiciled ETFs the most tax-efficient choice",
      "- Budget: $100,000 to allocate",
      "",
      "INVESTMENT PHILOSOPHY RULES:",
      formatRules(rules),
      "",
      "REQUIREMENTS:",
      "1. Recommend exactly 6 to 10 ETFs",
      "2. All ETFs MUST be Ireland-domiciled UCITS ETFs (traded on London Stock Exchange, Euronext, or Xetra)",
      "3. Use real, existing ETF tickers (e.g., VWRA, IGLA, AGGU, IGLN, EIMI, etc.)",
      "4. Cover equity (global, regional), bonds, and commodities",
      "5. Each ETF must have a brief explanation (1-2 sentences) covering why it's chosen",
      "6. Allocations must sum to exactly $100,000",
      "7. Respect the philosophy rules for allocation limits",
      "",
      formatBrief(intelligence_brief),
      "",
      'Return a JSON object with this EXACT structure:',
      '{',
      '  "etfs": [',
      '    {',
      '      "ticker": "VWRA",',
      '      "name": "Vanguard FTSE All-World UCITS ETF (Acc)",',
      '      "asset_class": "Equity",',
      '      "sub_category": "Global",',
      '      "domicile": "Ireland",',
      '      "exchange": "LSE",',
      '      "amount_usd": 25000,',
      '      "percent": 25.0,',
      '      "expense_ratio": 0.22,',
      '      "explanation": "Core global equity holding."',
      '    }',
      '  ],',
      '  "strategy_summary": "2-3 sentences explaining the overall allocation strategy.",',
      '  "tax_note": "1-2 sentences about tax efficiency for a UAE resident."',
      '}',
    ].join("\n");

    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: "Bearer " + LOVABLE_API_KEY,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: "Generate the ideal $100,000 portfolio allocation using Ireland-domiciled UCITS ETFs. Return only the JSON object." },
        ],
        max_tokens: 4000,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error("AI gateway error:", response.status, errorText);
      if (response.status === 429) {
        return new Response(JSON.stringify({ error: "Rate limit exceeded. Please try again in a moment." }), {
          status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      if (response.status === 402) {
        return new Response(JSON.stringify({ error: "AI credits exhausted. Please add credits." }), {
          status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      return new Response(JSON.stringify({ error: "AI analysis failed." }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const aiData = await response.json();
    let content = aiData.choices?.[0]?.message?.content || "";
    content = content.replace(/```json\s*/g, "").replace(/```\s*/g, "").trim();
    const result = JSON.parse(content);

    return new Response(JSON.stringify(result), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("ideal-allocation error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
