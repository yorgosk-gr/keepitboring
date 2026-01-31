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
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } }
    );

    const token = authHeader.replace("Bearer ", "");
    const { data: claimsData, error: claimsError } = await supabase.auth.getClaims(token);
    if (claimsError || !claimsData?.claims) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
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

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) {
      throw new Error("LOVABLE_API_KEY is not configured");
    }

    const systemPrompt = `You are a professional investment report writer. Generate a comprehensive monthly portfolio report in markdown format.

Key principles to follow:
- Be direct and concise
- Use bullet points extensively
- Acknowledge the role of luck vs skill (per Annie Duke's framework)
- Focus on process quality, not just outcomes
- Be honest about risks
- End with: "Process over outcomes. Stay humble."`;

    const userPrompt = `Generate a professional monthly investment report.

DATA:

Portfolio positions:
${JSON.stringify(positions, null, 2)}

Portfolio value 30 days ago: €${portfolioValueStart?.toLocaleString() || '0'}
Portfolio value today: €${portfolioValueEnd?.toLocaleString() || '0'}

Newsletters processed: ${newslettersCount}

Key insights from newsletters:
${JSON.stringify(insights, null, 2)}

Alerts triggered:
${JSON.stringify(alerts, null, 2)}

Decisions logged:
${JSON.stringify(decisions, null, 2)}

Rules compliance status:
${JSON.stringify(rulesCompliance, null, 2)}

Write a report in markdown with these sections:

# Portfolio Report: ${monthYear}

## Executive Summary
3-4 sentences: performance, key events, overall health

## Performance Review
- Value change: €X → €X (X%)
- Top 3 gainers with %
- Top 3 losers with %
- Comparison note: acknowledge luck vs skill (per Duke)

## Allocation Status
- Stocks: X% (target 20%)
- ETFs: X% (target 80%)
- Any rebalancing needed?

## Position Review
- Any positions needing attention?
- Thesis still valid for each stock?
- Any bet types that should change?

## Market Insights Summary
- Key themes from newsletters
- Any bubble signals detected?
- Consensus view summary

## Decision Quality Review
- Decisions made this month
- Were they process-driven?
- Any signs of resulting or emotional decisions?

## Compliance Status
- Rules passed: X
- Rules flagged: X
- Actions needed

## Risks & Watch Items
- Key risks to monitor
- Positions on watch list

## Recommendations for Next Month
Top 3-5 specific, actionable items

Keep it concise. Use bullet points. Be direct about risks.

End with a reminder: "Process over outcomes. Stay humble."`;

    console.log("Calling Lovable AI Gateway for report generation...");

    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-3-flash-preview",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt },
        ],
        temperature: 0.4,
      }),
    });

    if (!response.ok) {
      if (response.status === 429) {
        return new Response(JSON.stringify({ error: "Rate limit exceeded. Please try again later." }), {
          status: 429,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      if (response.status === 402) {
        return new Response(JSON.stringify({ error: "API credits exhausted. Please add credits." }), {
          status: 402,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const errorText = await response.text();
      console.error("AI Gateway error:", response.status, errorText);
      throw new Error(`AI Gateway error: ${response.status}`);
    }

    const aiResponse = await response.json();
    const content = aiResponse.choices?.[0]?.message?.content;

    if (!content) {
      throw new Error("Empty response from AI");
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
