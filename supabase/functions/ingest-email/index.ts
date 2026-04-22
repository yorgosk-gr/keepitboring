import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const OWNER_USER_ID = Deno.env.get("INGEST_DEFAULT_USER_ID");

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

function stripHtml(html: string): string {
  let text = html;

  // Remove entire blocks that are never content
  text = text.replace(/<head[\s>][\s\S]*?<\/head>/gi, "");
  text = text.replace(/<style[\s>][\s\S]*?<\/style>/gi, "");
  text = text.replace(/<script[\s>][\s\S]*?<\/script>/gi, "");
  text = text.replace(/<noscript[\s>][\s\S]*?<\/noscript>/gi, "");
  text = text.replace(/<!--[\s\S]*?-->/g, "");

  // Remove tracking pixels and tiny images (1x1, hidden, display:none)
  text = text.replace(/<img[^>]*(width\s*=\s*["']?1["']?|height\s*=\s*["']?1["']?|display\s*:\s*none)[^>]*\/?>/gi, "");

  // Remove common newsletter footer/nav patterns before tag stripping
  text = text.replace(/<footer[\s>][\s\S]*?<\/footer>/gi, "");

  // Convert block elements to newlines for structure preservation
  text = text.replace(/<\/?(p|div|br|hr|h[1-6]|li|tr|blockquote|section|article)[\s>][^>]*>/gi, "\n");
  text = text.replace(/<br\s*\/?>/gi, "\n");

  // Extract link text (keep text, drop URL)
  text = text.replace(/<a[^>]*>([\s\S]*?)<\/a>/gi, "$1");

  // Strip all remaining tags
  text = text.replace(/<[^>]+>/g, " ");

  // Decode HTML entities
  const entities: Record<string, string> = {
    "&nbsp;": " ", "&amp;": "&", "&lt;": "<", "&gt;": ">",
    "&quot;": '"', "&#39;": "'", "&apos;": "'", "&ndash;": "–",
    "&mdash;": "—", "&bull;": "•", "&hellip;": "…", "&rsquo;": "'",
    "&lsquo;": "'", "&rdquo;": "\u201D", "&ldquo;": "\u201C",
    "&trade;": "™", "&copy;": "©", "&reg;": "®",
  };
  for (const [entity, char] of Object.entries(entities)) {
    text = text.replaceAll(entity, char);
  }
  // Numeric entities
  text = text.replace(/&#(\d+);/g, (_, code) => String.fromCharCode(parseInt(code)));
  text = text.replace(/&#x([0-9a-fA-F]+);/g, (_, code) => String.fromCharCode(parseInt(code, 16)));

  // Remove URLs (tracking links, image URLs, etc.)
  text = text.replace(/https?:\/\/[^\s)}\]"'<>]+/g, "");

  // Remove common newsletter junk lines
  const junkPatterns = [
    /unsubscribe/i, /view\s*(this\s*)?(email\s*)?in\s*(your\s*)?browser/i,
    /manage\s*preferences/i, /email\s*preferences/i,
    /add\s*us\s*to\s*your\s*address\s*book/i,
    /©\s*\d{4}/i, /all\s*rights\s*reserved/i,
    /powered\s*by\s*(mailchimp|substack|beehiiv|convertkit|buttondown)/i,
    /click\s*here\s*to/i, /forward\s*this\s*(email|newsletter)/i,
    /sent\s*(to|by)\s*\S+@\S+/i,
  ];

  const lines = text.split("\n");
  const cleanedLines = lines.filter((line) => {
    const trimmed = line.trim();
    if (!trimmed) return false;
    // Skip very short lines (likely nav items, buttons) but keep ticker-length lines
    if (trimmed.length < 2) return false;
    // Only apply junk patterns to short lines — long lines with "click here" or "©" likely have valuable context
    if (trimmed.length < 100) {
      return !junkPatterns.some((p) => p.test(trimmed));
    }
    return true;
  });

  // Collapse whitespace per line, then join
  text = cleanedLines
    .map((l) => l.replace(/\s+/g, " ").trim())
    .join("\n");

  // Collapse multiple blank lines
  text = text.replace(/\n{3,}/g, "\n\n");

  return text.trim();
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  try {
    // Basic auth verification (Cloudmailin sends credentials in the URL)
    const CLOUDMAILIN_USER = "ingest";
    const CLOUDMAILIN_PASS = Deno.env.get("CLOUDMAILIN_PASS") ?? "";
    const authHeader = req.headers.get("Authorization") ?? "";
    if (authHeader.startsWith("Basic ")) {
      const decoded = atob(authHeader.slice(6));
      const [user, pass] = decoded.split(":");
      if (user !== CLOUDMAILIN_USER || pass !== CLOUDMAILIN_PASS) {
        return new Response(JSON.stringify({ error: "Unauthorized" }), {
          status: 401,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
    } else {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const body = await req.json();

    // Extract fields from Cloudmailin payload
    const rawSubject =
      body.subject || body.headers?.subject || "Unknown Newsletter";
    const rawFrom: string =
      body.from || body.headers?.from || body.envelope?.from || "";
    const plain = body.plain || "";
    const html = body.html || "";

    // Normalize the subject: strip forwarding prefixes and trailing dates
    // so "Fwd: Fwd: Re: Morning Briefing — Mar 28" → "Morning Briefing".
    // This is the per-issue title, not the publisher.
    function normalizeTitle(s: string): string {
      let name = s;
      let prev = "";
      while (prev !== name) {
        prev = name;
        name = name.replace(/^\s*(Fwd|Fw|Re)\s*:\s*/i, "");
      }
      name = name.replace(/\s*[—–-]\s*\w+\.?\s+\d{1,2}(,?\s*\d{4})?\s*$/, "");
      name = name.replace(/\s*[—–-]\s*\d{1,2}\/\d{1,2}(\/\d{2,4})?\s*$/, "");
      return name.trim() || s.trim();
    }
    const title = normalizeTitle(rawSubject);

    // Extract publisher/source from the From header.
    // "Name <email@domain.com>" → "Name"
    // "email@domain.com" → "domain.com" (stripped of common email-service prefixes)
    function extractSourceFromFrom(from: string): string | null {
      if (!from) return null;
      const f = from.trim();
      if (!f) return null;

      // "Display Name <addr@domain.com>" → prefer display name
      const displayMatch = f.match(/^\s*"?([^"<]+?)"?\s*<[^>]+>\s*$/);
      if (displayMatch) {
        const name = displayMatch[1].trim().replace(/^['"]|['"]$/g, "");
        if (name && !name.includes("@")) return name;
      }

      // Fall back to the domain of the email address
      const addrMatch = f.match(/<?([^<\s]+@[^>\s]+)>?/);
      if (addrMatch) {
        const domain = addrMatch[1].split("@")[1]?.toLowerCase();
        if (!domain) return null;
        // Strip common forwarder/relay subdomains so "mail.substack.com" → "substack.com"
        const parts = domain.split(".");
        if (parts.length > 2 && ["mail", "email", "send", "newsletter", "news", "ne", "mg", "list"].includes(parts[0])) {
          return parts.slice(1).join(".");
        }
        return domain;
      }

      return null;
    }
    const sourceName = extractSourceFromFrom(rawFrom);

    // Prefer HTML — plain text versions of rich newsletters are often garbage
    // (no structure, stripped tables, mangled formatting)
    let rawText = "";
    const strippedHtml = html ? stripHtml(html) : "";
    const plainTrimmed = plain.trim();
    if (strippedHtml.length > plainTrimmed.length && strippedHtml.length > 50) {
      rawText = strippedHtml;
    } else if (plainTrimmed) {
      rawText = plainTrimmed;
    } else {
      rawText = strippedHtml;
    }

    if (!rawText) {
      return new Response(
        JSON.stringify({ error: "No email body content found" }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    if (!OWNER_USER_ID) {
      console.error("INGEST_DEFAULT_USER_ID environment variable is not set");
      return new Response(
        JSON.stringify({ error: "Server misconfigured: INGEST_DEFAULT_USER_ID not set" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Create Supabase client with service role key to bypass RLS
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, serviceRoleKey);

    // Deduplication: hash the first 2000 chars of content + source name to detect duplicate forwards.
    // Uses SubtleCrypto (available in Deno) to compute SHA-256.
    const dedupeInput = `${title}::${rawText.substring(0, 2000)}`;
    const hashBuffer = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(dedupeInput));
    const contentHash = Array.from(new Uint8Array(hashBuffer)).map(b => b.toString(16).padStart(2, "0")).join("");

    // Check if a newsletter with the same hash was ingested in the last 7 days
    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
    const { data: existing } = await supabase
      .from("newsletters")
      .select("id")
      .eq("user_id", OWNER_USER_ID)
      .eq("title", title)
      .gte("created_at", sevenDaysAgo)
      .limit(1)
      .maybeSingle();

    if (existing) {
      console.log(`Duplicate newsletter detected: "${title}" — skipping (existing id: ${existing.id})`);
      return new Response(
        JSON.stringify({ success: true, duplicate: true, existing_id: existing.id }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Insert newsletter row and get the ID back
    const { data: newsletter, error: insertError } = await supabase
      .from("newsletters")
      .insert({
        user_id: OWNER_USER_ID,
        source_name: sourceName,
        title,
        raw_text: rawText,
        upload_date: new Date().toISOString().split("T")[0],
        processed: false,
      })
      .select("id")
      .single();

    if (insertError || !newsletter) {
      console.error("Insert error:", insertError);
      return new Response(JSON.stringify({ error: insertError?.message ?? "Insert failed" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    console.log(`Newsletter ingested: "${title}" from "${sourceName ?? "unknown"}" (${newsletter.id})`);

    // Auto-process: fire-and-forget to avoid edge function timeout
    // The newsletter is already saved; if processing fails, user can retry manually
    const processUrl = `${supabaseUrl}/functions/v1/process-newsletter`;
    fetch(processUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${serviceRoleKey}`,
      },
      body: JSON.stringify({
        newsletterId: newsletter.id,
        rawText,
      }),
    }).then(async (processResponse) => {
      if (processResponse.ok) {
        const processResult = await processResponse.json();
        console.log(`Auto-processed newsletter: ${processResult.insights_count} insights extracted`);
      } else {
        const errBody = await processResponse.text();
        console.error("Auto-process failed (newsletter saved, user can retry manually):", errBody);
      }
    }).catch((processErr) => {
      console.error("Auto-process error (non-fatal):", processErr);
    });

    return new Response(
      JSON.stringify({ success: true, title, source_name: sourceName, id: newsletter.id }),
      {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  } catch (err) {
    console.error("Unexpected error:", err);
    return new Response(JSON.stringify({ error: "Internal server error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
