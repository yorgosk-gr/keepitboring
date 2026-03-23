import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.93.3";

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
      return new Response(
        JSON.stringify({ error: "Unauthorized" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const token = authHeader.replace("Bearer ", "");
    const isServiceRole = token === supabaseKey;

    if (!isServiceRole) {
      const { data: { user }, error: authError } = await supabase.auth.getUser(token);
      if (authError || !user) {
        return new Response(
          JSON.stringify({ error: "Unauthorized" }),
          { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
    }

    const { newsletterId, rawText } = await req.json();

    if (!newsletterId || !rawText) {
      return new Response(
        JSON.stringify({ error: "Missing newsletterId or rawText" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) {
      console.error("LOVABLE_API_KEY is not configured");
      return new Response(
        JSON.stringify({ error: "AI service not configured" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log(`Processing newsletter ${newsletterId}, text length: ${rawText.length}`);

    const truncatedText = rawText.length > 50000 ? rawText.substring(0, 50000) + "\n\n[Text truncated...]" : rawText;

    const systemPrompt = `You are an expert financial analyst extracting structured insights from investment newsletters.

Analyze the newsletter text and return ONLY valid JSON (no markdown, no explanation, no code blocks):
{
  "source_profile": {
    "name": "inferred newsletter name if detectable",
    "style": "macro|equity|quant|generalist",
    "confidence_score": 0.8,
    "confidence_rationale": "why this score: track record signals, specificity of claims, use of data vs opinion"
  },
  "stock_mentions": [
    {
      "ticker": "AAPL",
      "sentiment": "bullish",
      "summary": "Brief summary of the view",
      "confidence_language": ["strong buy", "conviction"],
      "management_tone": "positive|negative|neutral|mixed|not_mentioned",
      "guidance_revision": "raised|lowered|maintained|initiated|not_mentioned",
      "earnings_surprise": "beat|miss|in_line|not_mentioned",
      "claim_specificity": "high|medium|low",
      "data_backed": true
    }
  ],
  "macro_views": [
    {
      "topic": "inflation",
      "view": "Summary of the view",
      "sentiment": "bullish",
      "conviction_level": "high|medium|low",
      "is_consensus_view": true,
      "supporting_data": "specific data point cited if any"
    }
  ],
  "sector_views": [
    {
      "sector": "technology",
      "view": "Summary",
      "sentiment": "bullish",
      "conviction_level": "medium"
    }
  ],
  "bubble_signals": [
    {
      "phrase": "exact quote",
      "context": "surrounding context",
      "severity": "high|medium|low"
    }
  ],
  "country_views": [
    {
      "country": "Japan",
      "view": "summary of view",
      "sentiment": "bullish",
      "etf_proxy": "EWJ",
      "conviction_level": "high"
    }
  ],
  "sector_tilts": [
    {
      "sector": "Energy",
      "direction": "overweight",
      "reasoning": "one sentence",
      "conviction": "high"
    }
  ],
  "stock_ideas": [
    {
      "ticker": "OXY",
      "name": "Occidental Petroleum",
      "thesis": "one sentence why",
      "claim_specificity": "high|medium|low",
      "catalyst": "specific catalyst mentioned if any"
    }
  ],
  "overall_sentiment": "bullish",
  "overall_conviction": "high|medium|low",
  "key_takeaways": ["takeaway 1", "takeaway 2"],
  "notable_omissions": ["topic conspicuously not mentioned that peers typically cover"]
}

Rules:
- sentiment must be exactly "bullish", "bearish", or "neutral"
- topic must be one of: "inflation", "rates", "growth", "recession", "other"
- management_tone: infer from language about management commentary, earnings calls, guidance language
- guidance_revision: explicit forward guidance changes only; "not_mentioned" if not discussed
- earnings_surprise: only if earnings are discussed; "not_mentioned" otherwise
- source_profile.confidence_score: 0.0-1.0. High (0.8+) = specific data, named sources, track record signals. Low (<0.5) = vague claims, no data, excessive hedging
- claim_specificity: "high" = specific price targets/dates/data, "medium" = directional with reasoning, "low" = vague opinion
- data_backed: true only if a specific data point, study, or named source supports the claim
- is_consensus_view: true if the view feels like conventional wisdom rather than differentiated insight
- direction must be exactly "overweight", "underweight", or "neutral"
- conviction must be exactly "high", "medium", or "low"
- notable_omissions: what topics are conspicuously absent (e.g. a macro letter ignoring China, an equity letter ignoring rates)
- Return ONLY the JSON object, nothing else
- If no items for a category, use empty array []`;

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
          {
            role: "user",
            content: `Analyze this investment newsletter and extract insights:\n\n${truncatedText}`,
          },
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
        JSON.stringify({ error: "AI processing failed. Please try again." }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const aiResponse = await response.json();
    const content = aiResponse.choices?.[0]?.message?.content;
    const finishReason = aiResponse.choices?.[0]?.finish_reason;

    if (!content) {
      console.error("No content in AI response:", aiResponse);
      return new Response(
        JSON.stringify({ error: "AI returned empty response" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (finishReason === "length") {
      console.error("AI response truncated (finish_reason: length)");
      return new Response(
        JSON.stringify({ error: "Newsletter too long — try splitting it into smaller sections" }),
        { status: 422, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    let insights;
    try {
      let jsonString = content.trim();
      if (jsonString.includes("```json")) {
        jsonString = jsonString.split("```json")[1].split("```")[0];
      } else if (jsonString.includes("```")) {
        jsonString = jsonString.split("```")[1].split("```")[0];
      }
      jsonString = jsonString.trim();

      try {
        insights = JSON.parse(jsonString);
      } catch {
        const singleLine = jsonString.replace(/\r?\n/g, " ").replace(/\s+/g, " ");
        insights = JSON.parse(singleLine);
      }
    } catch (parseError) {
      console.error("Failed to parse AI response:", content.substring(0, 1000));
      return new Response(
        JSON.stringify({ error: "Could not parse AI response", raw: content.substring(0, 500) }),
        { status: 422, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log("Parsed insights:", JSON.stringify(insights).substring(0, 500));

    // Delete existing insights for this newsletter (in case of reprocessing)
    await supabase.from("insights").delete().eq("newsletter_id", newsletterId);

    const sourceConfidence = insights.source_profile?.confidence_score ?? 0.5;
    const insightsToInsert = [];

    // Stock mentions
    for (const stock of insights.stock_mentions || []) {
      insightsToInsert.push({
        newsletter_id: newsletterId,
        insight_type: "stock_mention",
        content: stock.summary,
        sentiment: stock.sentiment,
        tickers_mentioned: [stock.ticker],
        confidence_words: stock.confidence_language || [],
        metadata: {
          management_tone: stock.management_tone,
          guidance_revision: stock.guidance_revision,
          earnings_surprise: stock.earnings_surprise,
          claim_specificity: stock.claim_specificity,
          data_backed: stock.data_backed,
          source_confidence: sourceConfidence,
        },
      });
    }

    // Macro views
    for (const macro of insights.macro_views || []) {
      insightsToInsert.push({
        newsletter_id: newsletterId,
        insight_type: "macro",
        content: `${macro.topic}: ${macro.view}`,
        sentiment: macro.sentiment,
        tickers_mentioned: [],
        confidence_words: macro.conviction_level ? [macro.conviction_level] : [],
        metadata: {
          conviction_level: macro.conviction_level,
          is_consensus_view: macro.is_consensus_view,
          supporting_data: macro.supporting_data,
          source_confidence: sourceConfidence,
        },
      });
    }

    // Sector views
    for (const sector of insights.sector_views || []) {
      insightsToInsert.push({
        newsletter_id: newsletterId,
        insight_type: "recommendation",
        content: `${sector.sector}: ${sector.view}`,
        sentiment: sector.sentiment,
        tickers_mentioned: [],
        confidence_words: [],
        metadata: {
          conviction_level: sector.conviction_level,
          source_confidence: sourceConfidence,
        },
      });
    }

    // Bubble signals
    for (const bubble of insights.bubble_signals || []) {
      insightsToInsert.push({
        newsletter_id: newsletterId,
        insight_type: "bubble_signal",
        content: `"${bubble.phrase}" - ${bubble.context}`,
        sentiment: "bearish",
        tickers_mentioned: [],
        confidence_words: [],
        metadata: {
          severity: bubble.severity,
          source_confidence: sourceConfidence,
        },
      });
    }

    // Country views
    for (const cv of insights.country_views || []) {
      insightsToInsert.push({
        newsletter_id: newsletterId,
        insight_type: "macro",
        content: `Country: ${cv.country}: ${cv.view}`,
        sentiment: cv.sentiment,
        tickers_mentioned: cv.etf_proxy ? [cv.etf_proxy] : [],
        confidence_words: [],
        metadata: {
          conviction_level: cv.conviction_level,
          source_confidence: sourceConfidence,
        },
      });
    }

    // Sector tilts
    for (const st of insights.sector_tilts || []) {
      insightsToInsert.push({
        newsletter_id: newsletterId,
        insight_type: "recommendation",
        content: `Sector tilt: ${st.sector}: ${st.direction} — ${st.reasoning}`,
        sentiment: st.direction === "overweight" ? "bullish" : st.direction === "underweight" ? "bearish" : "neutral",
        tickers_mentioned: [],
        confidence_words: st.conviction ? [st.conviction] : [],
        metadata: {
          conviction_level: st.conviction,
          source_confidence: sourceConfidence,
        },
      });
    }

    // Stock ideas
    for (const si of insights.stock_ideas || []) {
      insightsToInsert.push({
        newsletter_id: newsletterId,
        insight_type: "stock_mention",
        content: `${si.name || si.ticker}: ${si.thesis}`,
        sentiment: "bullish",
        tickers_mentioned: [si.ticker],
        confidence_words: [],
        metadata: {
          claim_specificity: si.claim_specificity,
          catalyst: si.catalyst,
          source_confidence: sourceConfidence,
        },
      });
    }

    // Key takeaways
    for (const takeaway of insights.key_takeaways || []) {
      insightsToInsert.push({
        newsletter_id: newsletterId,
        insight_type: "sentiment",
        content: takeaway,
        sentiment: insights.overall_sentiment || "neutral",
        tickers_mentioned: [],
        confidence_words: [],
        metadata: {
          overall_conviction: insights.overall_conviction,
          source_confidence: sourceConfidence,
          notable_omissions: insights.notable_omissions || [],
        },
      });
    }

    if (insightsToInsert.length > 0) {
      const { error: insertError } = await supabase.from("insights").insert(insightsToInsert);
      if (insertError) {
        console.error("Failed to insert insights:", insertError);
        return new Response(
          JSON.stringify({ error: "Failed to save insights" }),
          { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
    }

    // Mark newsletter as processed
    const { error: updateError } = await supabase
      .from("newsletters")
      .update({ processed: true })
      .eq("id", newsletterId);

    if (updateError) {
      console.error("Failed to update newsletter:", updateError);
    }

    console.log(`Successfully processed newsletter ${newsletterId}, inserted ${insightsToInsert.length} insights`);

    return new Response(
      JSON.stringify({
        success: true,
        insights_count: insightsToInsert.length,
        overall_sentiment: insights.overall_sentiment,
        source_confidence: sourceConfidence,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("Error processing newsletter:", error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
