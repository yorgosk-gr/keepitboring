 import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
 import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
 
 const corsHeaders = {
   "Access-Control-Allow-Origin": "*",
   "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

function buildRulesSection(rulesCompliance: any[]): string {
  if (!rulesCompliance || rulesCompliance.length === 0) return "No custom rules defined.";
  return rulesCompliance.map((r: any) => {
    const icon = r.status === "ok" ? "✅" : r.status === "warning" ? "⚠️" : "🔴";
    return `- ${icon} ${r.name} [${r.type}]: ${r.message}`;
  }).join("\n");
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
       rulesCompliance,
       monthYear
     } = await req.json();
 
    const systemPrompt = `You are a portfolio report writer. Be CONCISE. No fluff.

RULES:
1. NEVER fabricate data. If no historical baseline exists, say "First month — no comparison available."
2. Use bullet points, not paragraphs. 
3. Tables must be simple: | Col1 | Col2 | Col3 | with proper markdown.
4. Each section: 3-5 bullet points MAX.
5. Skip sections that have no meaningful data.
6. Total report length: under 800 words.

ALLOCATION COMPLIANCE (from user's rules):
${buildRulesSection(rulesCompliance)}

Use these rule results for the Allocation table — do NOT use hardcoded targets.

TONE: Direct, factual. No hedging language ("it appears", "seems to"). State facts or say "unknown."

End with: "Process over outcomes. Stay humble."`;

     const hasHistoricalData = portfolioValueStart && portfolioValueStart > 0;
 
     const userPrompt = `Generate a monthly portfolio report. Keep it SHORT.
 
 DATA:
 - Portfolio value: €${portfolioValueEnd?.toLocaleString() || '0'}
 ${hasHistoricalData ? `- Previous: €${portfolioValueStart.toLocaleString()} (change: ${(((portfolioValueEnd - portfolioValueStart) / portfolioValueStart) * 100).toFixed(2)}%)` : '- First month, no historical data'}
 - Newsletters: ${newslettersCount}
 
 Positions:
 ${JSON.stringify(positions, null, 2)}
 
 Insights: ${JSON.stringify(insights?.slice(0, 10), null, 2)}
 
 Compliance: ${JSON.stringify(rulesCompliance, null, 2)}
 
 FORMAT (keep each section to 3-5 bullets max):
 
 # Portfolio Report: ${monthYear}
 
 ## Summary
 2-3 sentences only. Lead with the biggest issue or "Portfolio healthy."
 
 ## Performance
 ${hasHistoricalData ? '- Value: €X → €Y (+Z%)\n- Top gainer: TICKER +X%\n- Top loser: TICKER -X%' : '- Current value: €X\n- First month, tracking starts next period'}
 
 ## Allocation
 | Asset | Current | Target | Status |
 |-------|---------|--------|--------|
 | Equities | X% | ≤70% | ✅/🔴 |
 | Bonds | X% | ≤20% | ✅/🔴 |
 | Commodities | X% | ≤10% | ✅/🔴 |
 
 ## Issues (only if any)
 - List only actual problems requiring action
 
 ## Actions
 1. Specific action with ticker/shares
 2. Next action
 3. (max 5)
 
 Process over outcomes. Stay humble.`;
 
     console.log("Calling Lovable AI gateway for report generation...");
 
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
         JSON.stringify({ error: "Report generation failed. Please try again." }),
         { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
       );
     }
 
     const aiResponse = await response.json();
     const content = aiResponse.choices?.[0]?.message?.content;
 
     if (!content) {
       console.error("Empty AI response:", JSON.stringify(aiResponse));
       return new Response(
         JSON.stringify({ error: "AI returned empty response. Please try again." }),
         { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
       );
     }
 
     console.log("Report generated successfully");
 
     const summaryMatch = content.match(/## Summary\s*\n\n?([^\n#]+(?:\n[^\n#]+)*)/i);
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
