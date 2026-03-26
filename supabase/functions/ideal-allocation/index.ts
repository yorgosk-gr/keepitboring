import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

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

    const ANTHROPIC_API_KEY = Deno.env.get("ANTHROPIC_API_KEY");
    if (!ANTHROPIC_API_KEY) {
      return new Response(JSON.stringify({ error: "AI service not configured" }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { rules, intelligence_brief, portfolio_value } = await req.json();
    const budget = portfolio_value && portfolio_value > 0 ? Math.round(portfolio_value) : 100000;
    const budgetFormatted = "$" + budget.toLocaleString("en-US");

    const briefSection = intelligence_brief
      ? `INTELLIGENCE BRIEF (use to inform tactical tilts):
Executive Summary: ${intelligence_brief.executive_summary || "N/A"}
Key Points:
${(intelligence_brief.key_points || []).map((kp: any) => "- [" + kp.relevance + "] " + kp.title + ": " + kp.detail).join("\n")}
Market Themes:
${(intelligence_brief.market_themes || []).map((mt: any) => "- " + mt.theme + " (" + mt.sentiment + "): " + mt.portfolio_impact).join("\n")}
Contrarian Signals:
${(intelligence_brief.contrarian_signals || []).map((cs: string) => "- " + cs).join("\n")}
Use these signals to tilt sector/region weights.`
      : "No intelligence brief available — use strategic allocation only.";

    const systemPrompt = `You are an expert portfolio construction advisor for non-US residents.

RESPONSE FORMAT: Return ONLY a raw JSON object. No markdown, no prose, no code blocks.

CONTEXT:
- UAE tax resident (0% income/capital gains tax)
- Prefer Ireland-domiciled UCITS ETFs (15% US dividend treaty rate vs 30%)
- Budget: ${budgetFormatted}
- MODE: CLEAN SLATE — Build an ideal portfolio from scratch, ignoring any existing holdings.

RULES ENGINE:
You are given a RULES_JSON array. Each rule has: scope, category, metric, operator, threshold_min, threshold_max, rule_enforcement, message_on_breach.
Use these as the SOLE source of allocation constraints. Respect every min/max threshold strictly.
If no rule exists for a given metric, use conservative defaults and note them in strategy_summary.

RULES_JSON:
${JSON.stringify(rules, null, 2)}

ASSET CLASS RESERVES:
- Individual stocks: ~10% (investor manages separately)
- Commodities (gold, broad): 5-8%
- Cash reserve: 5-10%
- Remaining ~72-80% split between equity and bond ETFs per rules

${briefSection}

REQUIREMENTS:
1. Recommend 6-10 ETFs
2. All MUST be Ireland-domiciled UCITS (LSE, Euronext, or Xetra)
3. Use real tickers (VWRA, IGLA, AGGU, IGLN, EIMI, etc.)
4. Cover equity (global, regional), bonds, commodities
5. Each ETF: 1-2 sentence explanation in plain English
6. Allocations sum to ETF portion (after reserves)
7. Every ETF must have TER ≤ 0.22% — no exceptions
8. Total effective US equity ≤ 40%, tech ≤ 15%
9. Avoid hidden overlap (e.g. VWRA is ~65% US — don't stack US ETFs on top)
10. Bonds 10–40% with duration diversification (short + intermediate)
11. One gold ETF preferred over splitting physical + miners

JSON OUTPUT:
{
  "etfs": [{
    "ticker": "VWRA",
    "name": "Vanguard FTSE All-World UCITS ETF (Acc)",
    "asset_class": "Equity",
    "sub_category": "Global",
    "domicile": "Ireland",
    "exchange": "LSE",
    "amount_usd": 25000,
    "percent": 25.0,
    "expense_ratio": 0.22,
    "explanation": "Core global equity holding."
  }],
  "strategy_summary": "2-3 sentences on overall strategy in plain English.",
  "tax_note": "1-2 sentences on tax efficiency for UAE resident."
}`;

    const userMessage = "Generate the ideal " + budgetFormatted + " portfolio using Ireland-domiciled UCITS ETFs. Return only the JSON object.";

    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "x-api-key": ANTHROPIC_API_KEY,
        "anthropic-version": "2023-06-01",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "claude-sonnet-4-5-20250929",
        system: systemPrompt,
          messages: [{ role: "user", content: userMessage }],
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
    const content = aiData.content?.[0]?.text?.trim() || "";
    const finishReason = aiData.choices?.[0]?.finish_reason;

    if (!content) {
      return new Response(JSON.stringify({ error: "AI returned empty response." }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (finishReason === "max_tokens") {
      return new Response(JSON.stringify({ error: "Response truncated. Try again." }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Parse JSON — same logic as analyze-portfolio
    let result;
    try {
      if (content.startsWith("{") && content.endsWith("}")) {
        result = JSON.parse(content);
      } else {
        const first = content.indexOf("{");
        const last = content.lastIndexOf("}");
        if (first !== -1 && last > first) {
          result = JSON.parse(content.substring(first, last + 1));
        } else {
          throw new Error("No JSON object found in response");
        }
      }
    } catch (parseError) {
      console.error("Failed to parse AI response:", parseError);
      console.error("Raw (first 500):", content.substring(0, 500));
      return new Response(JSON.stringify({ error: "Failed to parse AI response" }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

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
