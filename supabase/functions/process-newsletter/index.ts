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

    const ANTHROPIC_API_KEY = Deno.env.get("ANTHROPIC_API_KEY");
    if (!ANTHROPIC_API_KEY) {
      console.error("ANTHROPIC_API_KEY is not configured");
      return new Response(
        JSON.stringify({ error: "AI service not configured" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log(`Processing newsletter ${newsletterId}, text length: ${rawText.length}`);

    // Acquire processing lock — prevents duplicate processing from concurrent calls
    const lockCutoff = new Date(Date.now() - 5 * 60 * 1000).toISOString();
    const { data: lockResult } = await supabase
      .from("newsletters")
      .update({ processing_started_at: new Date().toISOString() })
      .eq("id", newsletterId)
      .or(`processing_started_at.is.null,processing_started_at.lt.${lockCutoff}`)
      .select("id")
      .maybeSingle();

    if (!lockResult) {
      console.log(`Newsletter ${newsletterId} is already being processed, skipping`);
      return new Response(
        JSON.stringify({ error: "Newsletter is already being processed", already_processing: true }),
        { status: 409, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Release lock helper
    const releaseLock = async () => {
      await supabase
        .from("newsletters")
        .update({ processing_started_at: null })
        .eq("id", newsletterId);
    };

    try {

    const truncatedText = rawText.length > 50000 ? rawText.substring(0, 50000) + "\n\n[Text truncated...]" : rawText;

    const systemPrompt = `You are an expert financial analyst extracting structured insights from investment newsletters.

Analyze the newsletter text and return ONLY valid JSON (no markdown, no explanation, no code blocks):
{
  "source_profile": {
    "name": "inferred newsletter name if detectable",
    "author": "author or writer name if detectable, or null",
    "publication_date": "date the newsletter was written in YYYY-MM-DD format if detectable, or null",
    "style": "macro|equity|quant|generalist",
    "confidence_score": 0.8,
    "confidence_rationale": "specific data cited, named sources, track record signals vs vague opinion"
  },
  "stock_mentions": [
    {
      "ticker": "AAPL",
      "sentiment": "bullish",
      "summary": "what the newsletter actually says about this stock",
      "confidence_language": ["strong buy", "high conviction"],
      "management_tone": "positive|negative|neutral|mixed|not_mentioned",
      "guidance_revision": "raised|lowered|maintained|initiated|not_mentioned",
      "earnings_surprise": "beat|miss|in_line|not_mentioned",
      "claim_specificity": "high|medium|low",
      "data_backed": true,
      "catalyst": "specific catalyst mentioned, or null"
    }
  ],
  "macro_views": [
    {
      "topic": "inflation|rates|growth|recession|other",
      "view": "what the newsletter says",
      "sentiment": "bullish|bearish|neutral",
      "conviction_level": "high|medium|low",
      "is_consensus_view": true,
      "supporting_data": "specific data point or named source cited, or null"
    }
  ],
  "sector_views": [
    {
      "sector": "technology",
      "view": "summary",
      "sentiment": "bullish|bearish|neutral",
      "conviction_level": "high|medium|low"
    }
  ],
  "country_views": [
    {
      "country": "Japan",
      "view": "summary",
      "sentiment": "bullish|bearish|neutral",
      "etf_proxy": "EWJ",
      "conviction_level": "high|medium|low"
    }
  ],
  "sector_tilts": [
    {
      "sector": "Energy",
      "direction": "overweight|underweight|neutral",
      "reasoning": "one sentence",
      "conviction": "high|medium|low"
    }
  ],
  "stock_ideas": [
    {
      "ticker": "OXY",
      "name": "Occidental Petroleum",
      "sentiment": "bullish|bearish|neutral",
      "thesis": "one sentence why",
      "claim_specificity": "high|medium|low",
      "catalyst": "specific catalyst or null"
    }
  ],
  "bubble_signals": [
    {
      "phrase": "exact quote",
      "context": "surrounding context",
      "severity": "high|medium|low"
    }
  ],
  "overall_sentiment": "bullish|bearish|neutral",
  "overall_conviction": "high|medium|low",
  "key_takeaways": ["takeaway 1", "takeaway 2"],
  "notable_omissions": ["topic conspicuously absent that peers typically cover"]
}

EXTRACTION RULES:
- management_tone: infer from earnings call language, CEO commentary, forward guidance tone — not_mentioned if absent
- guidance_revision: explicit forward guidance changes only — raised/lowered/maintained/initiated — not_mentioned if not discussed
- earnings_surprise: only populate if earnings results are actually discussed — not_mentioned otherwise
- source_profile.confidence_score: 0.0–1.0. High (≥0.8) = specific data, price targets, named sources, cited studies. Medium (0.5–0.79) = directional with reasoning. Low (<0.5) = vague claims, no data, excessive hedging or certainty without basis
- claim_specificity: high = price targets or specific dates or hard data; medium = directional with reasoning; low = vague directional opinion
- data_backed: true only if a specific statistic, study, or named source is cited in support
- is_consensus_view: true if the view is conventional wisdom broadly held — false if it is differentiated or contrarian
- notable_omissions: what major topics does this letter conspicuously ignore? (e.g. a macro letter silent on China, an equity letter ignoring rates)
- Return ONLY the JSON object, nothing else
- Empty array [] for any category with no items`;

    // Retry wrapper for Anthropic API calls
    async function callAnthropicWithRetry(body: object, maxRetries = 2): Promise<Response> {
      for (let attempt = 0; attempt <= maxRetries; attempt++) {
        const response = await fetch("https://api.anthropic.com/v1/messages", {
          method: "POST",
          headers: {
            "x-api-key": ANTHROPIC_API_KEY,
            "anthropic-version": "2023-06-01",
            "Content-Type": "application/json",
          },
          body: JSON.stringify(body),
        });

        if (response.ok) return response;

        // Don't retry on auth/billing errors
        if (response.status === 401 || response.status === 402 || response.status === 403) {
          return response;
        }

        // Retry on rate limit (429) and server errors (5xx)
        if (attempt < maxRetries && (response.status === 429 || response.status >= 500)) {
          const delay = response.status === 429 ? 5000 * (attempt + 1) : 2000 * (attempt + 1);
          console.log(`Anthropic returned ${response.status}, retrying in ${delay}ms (attempt ${attempt + 1}/${maxRetries})`);
          await new Promise(r => setTimeout(r, delay));
          continue;
        }

        return response;
      }
      throw new Error("Unreachable");
    }

    const response = await callAnthropicWithRetry({
      model: "claude-sonnet-4-5-20250929",
      system: systemPrompt,
      messages: [
        {
          role: "user",
          content: `Analyze this investment newsletter and extract insights:\n\n${truncatedText}`,
        },
      ],
      max_tokens: 16384,
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error("AI gateway error:", response.status, errorText);

      if (response.status === 429) {
        await releaseLock();
        return new Response(
          JSON.stringify({ error: "Rate limit exceeded. Please try again in a moment.", retry_after_seconds: 30 }),
          { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json", "Retry-After": "30" } }
        );
      }
      if (response.status === 402) {
        await releaseLock();
        return new Response(
          JSON.stringify({ error: "AI credits exhausted. Please add credits to continue." }),
          { status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      await releaseLock();
      return new Response(
        JSON.stringify({ error: "AI processing failed. Please try again." }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const aiResponse = await response.json();
    const content = aiResponse.content?.[0]?.text;
    const finishReason = aiResponse.stop_reason;

    if (!content) {
      console.error("No content in AI response:", aiResponse);
      await releaseLock();
      return new Response(
        JSON.stringify({ error: "AI returned empty response" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (finishReason === "max_tokens") {
      console.error("AI response truncated (finish_reason: length)");
      await releaseLock();
      return new Response(
        JSON.stringify({ error: "Newsletter generated too many insights for a single pass. Please try reprocessing." }),
        { status: 422, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    let insights;
    try {
      let jsonString = content.trim();
      // Strip markdown code blocks
      if (jsonString.includes("```json")) {
        jsonString = jsonString.split("```json")[1].split("```")[0];
      } else if (jsonString.includes("```")) {
        jsonString = jsonString.split("```")[1].split("```")[0];
      }
      jsonString = jsonString.trim();

      // If it doesn't start with {, try to find the JSON object
      if (!jsonString.startsWith("{")) {
        const firstBrace = jsonString.indexOf("{");
        const lastBrace = jsonString.lastIndexOf("}");
        if (firstBrace !== -1 && lastBrace > firstBrace) {
          jsonString = jsonString.substring(firstBrace, lastBrace + 1);
        }
      }

      try {
        insights = JSON.parse(jsonString);
      } catch {
        // Normalize smart quotes and whitespace, then retry
        const cleaned = jsonString
          .replace(/[\u201C\u201D]/g, '"')
          .replace(/[\u2018\u2019]/g, "'")
          .replace(/\r?\n/g, " ")
          .replace(/\s+/g, " ");
        insights = JSON.parse(cleaned);
      }
    } catch (parseError) {
      console.error("Failed to parse AI response:", content.substring(0, 1000));
      // Release processing lock before returning
      await supabase.from("newsletters").update({ processing_started_at: null }).eq("id", newsletterId);
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
          catalyst: stock.catalyst || null,
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
        sentiment: si.sentiment || "bullish",
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

    // Run newsletter update and reputation update in parallel (both non-blocking)
    const authorValue = insights.source_profile?.author ?? null;
    const pubDateValue = insights.source_profile?.publication_date ?? null;

    // Fix: removed .is("processed", false) guard — allow re-processing to update metadata
    const updateNewsletterPromise = supabase
      .from("newsletters")
      .update({
        processed: true,
        ...(authorValue ? { author: authorValue } : {}),
        ...(pubDateValue ? { publication_date: pubDateValue } : {}),
      })
      .eq("id", newsletterId)
      .then(({ error }) => {
        if (error) console.error("Failed to update newsletter:", error);
      });

    // Source reputation update via atomic RPC (non-fatal)
    const updateReputationPromise = (async () => {
      try {
        const { data: nl } = await supabase
          .from("newsletters")
          .select("source_name, user_id")
          .eq("id", newsletterId)
          .single();

        if (!nl) return;

        await supabase.rpc("recalculate_source_reputation", {
          p_user_id: nl.user_id,
          p_source_name: nl.source_name,
          p_style: insights.source_profile?.style ?? null,
        });
      } catch (reputationError) {
        console.warn("Failed to update source reputation (non-fatal):", reputationError);
      }
    })();

    // Wait for both in parallel
    await Promise.all([updateNewsletterPromise, updateReputationPromise]);

    console.log(`Successfully processed newsletter ${newsletterId}, inserted ${insightsToInsert.length} insights`);

    await releaseLock();
    return new Response(
      JSON.stringify({
        success: true,
        insights_count: insightsToInsert.length,
        overall_sentiment: insights.overall_sentiment,
        source_confidence: sourceConfidence,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

    } catch (innerError) {
      // Release processing lock on any error within the processing block
      await releaseLock();
      throw innerError;
    }
  } catch (error) {
    console.error("Error processing newsletter:", error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
