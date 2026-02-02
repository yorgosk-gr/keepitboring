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
    // Authenticate user
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

    const { 
      positions, 
      portfolioValueStart, 
      portfolioValueEnd, 
      newslettersCount,
      insights,
      alerts,
      decisions,
      rulesCompliance,
      monthYear
    } = await req.json();

    const systemPrompt = `You are a professional investment report writer. Generate a comprehensive monthly portfolio report in markdown format.

CRITICAL RULES — DO NOT VIOLATE:
1. NEVER fabricate, estimate, or invent performance data. If portfolioValueStart is 0, null, or missing, say "First month of tracking — no historical comparison available" instead of making up returns.
2. NEVER invent individual position returns (e.g. "COPX +34%") unless the data explicitly provides month-start vs month-end prices. If you only have current prices and avg costs, you can show unrealized P&L from cost basis, but label it clearly as "P&L since purchase" not "monthly return".
3. Only state facts that are directly supported by the data provided. If data is missing, say so honestly.
4. Acknowledge the role of luck vs skill (per Annie Duke's framework).
5. Focus on process quality, not just outcomes.
6. Be direct about risks.
7. End every report with: "Process over outcomes. Stay humble."

ALLOCATION TARGETS (current investment philosophy):
- Equities (stocks + equity ETFs): max 70%
- Bonds (IDTM, IB01): max 20%
- Commodities + Gold + Crypto (CMOD, COPX, IGLN): max 10%
- Cash: remainder
- Within equities: 15-25% individual stocks, 75-85% ETFs
- Single stock limit: max 8% of portfolio
- Themed ETF limit: max 15%
- Sector limit: max 25%

TRADE RECOMMENDATIONS:
For every position, provide a SELL / HOLD / BUY recommendation:
- Be SPECIFIC: "SELL 200 shares of CSPX (~€149K)" not "consider reducing"
- Respect documented theses — don't recommend selling positions with valid theses unless limits are breached or thesis is invalidated
- If a position has no thesis, recommend documenting one before selling
- Include a rebalancing summary at the end showing total sells, buys, and net cash impact`;

    const hasHistoricalData = portfolioValueStart && portfolioValueStart > 0;

    const userPrompt = `Generate a professional monthly investment report.

DATA PROVIDED:

Portfolio positions (current):
${JSON.stringify(positions, null, 2)}

${hasHistoricalData 
  ? `Portfolio value 30 days ago: €${portfolioValueStart.toLocaleString()}
Portfolio value today: €${portfolioValueEnd?.toLocaleString() || '0'}` 
  : `Portfolio value today: €${portfolioValueEnd?.toLocaleString() || '0'}
NOTE: No historical value available. This is the first month of tracking. Do NOT fabricate month-over-month performance figures.`}

Newsletters processed: ${newslettersCount}

Key insights from newsletters:
${JSON.stringify(insights, null, 2)}

Alerts triggered:
${JSON.stringify(alerts, null, 2)}

Decisions logged:
${JSON.stringify(decisions, null, 2)}

Rules compliance status:
${JSON.stringify(rulesCompliance, null, 2)}

Write the report in markdown with these sections:

# Portfolio Report: ${monthYear}

## Executive Summary
3-4 sentences: current state, key observations, overall health. ${!hasHistoricalData ? 'Note this is the first tracking month — no performance comparison available.' : ''}

## Performance Review
${hasHistoricalData 
  ? `- Value change: €X → €X (X%)
- Top 3 gainers with % (from actual data only)
- Top 3 losers with % (from actual data only)
- Reality check: acknowledge luck vs skill` 
  : `- Current portfolio value and composition
- Unrealized P&L from cost basis for each position (this is P&L since purchase, NOT monthly return)
- Note: first month — monthly performance tracking starts next month
- Reality check: snapshot only, no trend data yet`}

## Allocation Status
Show allocation by ASSET CLASS (not just stock/ETF split):
- Equities (stocks + equity ETFs): X% / target: ≤70%
- Bonds: X% / target: ≤20%
- Commodities + Gold: X% / target: ≤10%
- Cash: X%
- Stock/ETF split within equities: X% / X%
- Flag any breaches clearly

## Position Review
- Positions needing attention (missing thesis, oversized, etc.)
- For positions WITH thesis: is thesis still valid?
- For positions WITHOUT thesis: flag and recommend documenting
- Bet type review (core/satellite/explore classification)

## Trade Recommendations
For EVERY position, state: SELL / HOLD / BUY
Format as a table:
| Ticker | Action | Shares | Reasoning |
Show specific share counts and estimated values.

Then add a Rebalancing Summary:
- Total sells: €X across N positions
- Total buys: €X across N positions
- Net cash impact: +/- €X
- Goal: one sentence describing what the rebalancing achieves

## Market Insights Summary
- Key themes from newsletters
- Bubble signals detected (if any)
- Consensus view

## Decision Quality Review
- Decisions made this month
- Process-driven or reactive?
- Any resulting or emotional patterns?
${!hasHistoricalData ? '- Note: first month, no decision history to evaluate yet' : ''}

## Compliance Status
- Rules passed: X
- Rules flagged: X warnings, X critical
- Specific actions needed for each violation

## Risks & Watch Items
- Top risks to monitor
- Positions on watch list with trigger conditions

## Recommendations for Next Month
Top 3-5 SPECIFIC, ACTIONABLE items with concrete trades where applicable.

REMEMBER: Do NOT fabricate any numbers. Only use data provided above. End with "Process over outcomes. Stay humble."`;

    console.log("Calling Lovable AI gateway for report generation...");

    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "claude-sonnet-4-20250514",
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
        JSON.stringify({ error: "Report generation failed. Please try again." }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const aiResponse = await response.json();
    
    // OpenAI-compatible format: choices[0].message.content
    const content = aiResponse.choices?.[0]?.message?.content;

    if (!content) {
      console.error("Empty AI response:", JSON.stringify(aiResponse));
      return new Response(
        JSON.stringify({ error: "AI returned empty response. Please try again." }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log("Report generated successfully");

    // Extract executive summary (first paragraph after ## Executive Summary)
    const summaryMatch = content.match(/## Executive Summary\s*\n\n?([^\n#]+(?:\n[^\n#]+)*)/i);
    const summary = summaryMatch ? summaryMatch[1].trim().substring(0, 300) : "";

    return new Response(JSON.stringify({ 
      content,
      summary,
      title: `Portfolio Report: ${monthYear}`
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("generate-report error:", error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Unknown error" }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});
