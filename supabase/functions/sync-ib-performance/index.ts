import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

async function requestFlexReport(token: string, queryId: string): Promise<string> {
  const url = `https://gdcdyn.interactivebrokers.com/Universal/servlet/FlexStatementService.SendRequest?t=${token}&q=${queryId}&v=3`;
  const res = await fetch(url);
  const text = await res.text();
  const refMatch = text.match(/<ReferenceCode>(.*?)<\/ReferenceCode>/);
  if (!refMatch) {
    const errorMatch = text.match(/<ErrorMessage>(.*?)<\/ErrorMessage>/);
    throw new Error(`IB request failed: ${errorMatch?.[1] ?? text}`);
  }
  return refMatch[1];
}

async function fetchFlexReport(token: string, referenceCode: string): Promise<string> {
  const url = `https://gdcdyn.interactivebrokers.com/Universal/servlet/FlexStatementService.GetStatement?t=${token}&q=${referenceCode}&v=3`;
  for (let attempt = 0; attempt < 20; attempt++) {
    if (attempt > 0) await new Promise(r => setTimeout(r, 5000));
    const res = await fetch(url);
    const text = await res.text();
    if (text.includes("Statement generation in progress")) {
      console.log(`Attempt ${attempt + 1}: statement still generating...`);
      continue;
    }
    if (text.includes("<ErrorMessage>")) {
      const errorMatch = text.match(/<ErrorMessage>(.*?)<\/ErrorMessage>/);
      throw new Error(`IB fetch failed: ${errorMatch?.[1] ?? text}`);
    }
    if (text.includes("<FlexQueryResponse")) return text;
  }
  throw new Error("IB report generation timed out after 20 attempts");
}

function parseXMLAttributes(tag: string): Record<string, string> {
  const attrs: Record<string, string> = {};
  const regex = /(\w+)="([^"]*)"/g;
  let match;
  while ((match = regex.exec(tag)) !== null) {
    attrs[match[1]] = match[2];
  }
  return attrs;
}

function extractTags(xml: string, tagName: string): Record<string, string>[] {
  const results: Record<string, string>[] = [];
  // Self-closing tags
  const selfClose = new RegExp(`<${tagName}\\s([^/]*?)/>`, "g");
  let match;
  while ((match = selfClose.exec(xml)) !== null) {
    results.push(parseXMLAttributes(match[1]));
  }
  // Opening tags (non-self-closing)
  if (results.length === 0) {
    const open = new RegExp(`<${tagName}\\s([^>]*?)>`, "g");
    while ((match = open.exec(xml)) !== null) {
      results.push(parseXMLAttributes(match[1]));
    }
  }
  return results;
}

function safeNum(val: string | undefined): number | null {
  if (!val || val === "" || val === "--") return null;
  const n = parseFloat(val);
  return isNaN(n) ? null : n;
}

function safeDate(val: string | undefined): string | null {
  if (!val || val === "" || val === "--") return null;
  return val;
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const authHeader = req.headers.get("Authorization");
    if (!authHeader) return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: corsHeaders });

    const { data: { user }, error: authError } = await supabase.auth.getUser(authHeader.replace("Bearer ", ""));
    if (authError || !user) return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: corsHeaders });

    const { data: ibAccount, error: ibError } = await supabase
      .from("ib_accounts")
      .select("*")
      .eq("user_id", user.id)
      .single();

    if (ibError || !ibAccount) {
      return new Response(JSON.stringify({ error: "No IB account connected" }), { status: 404, headers: corsHeaders });
    }

    const { flex_token, performance_query_id } = ibAccount;
    if (!performance_query_id) {
      return new Response(JSON.stringify({ error: "No performance query configured" }), { status: 400, headers: corsHeaders });
    }

    console.log(`Syncing IB performance data for account ${ibAccount.ib_account_id}...`);

    const referenceCode = await requestFlexReport(flex_token, performance_query_id);
    console.log(`Got reference code: ${referenceCode}`);

    const xml = await fetchFlexReport(flex_token, referenceCode);
    console.log(`Got XML response, length: ${xml.length}`);

    // Parse NavInBase tags → ib_nav_history
    const navTags = extractTags(xml, "EquitySummaryByReportDateInBase");
    console.log(`Found ${navTags.length} EquitySummaryByReportDateInBase tags`);
    
    const navRecords = navTags
      .filter(t => t.reportDate && t.reportDate !== "--")
      .map(t => ({
        user_id: user.id,
        report_date: t.reportDate,
        cash: safeNum(t.cash),
        stock: safeNum(t.stock),
        bonds: safeNum(t.bonds) ?? safeNum(t.bond),
        funds: safeNum(t.funds) ?? safeNum(t.fund),
        total_nav: safeNum(t.total),
      }));

    if (navRecords.length > 0) {
      const { error: navError } = await supabase
        .from("ib_nav_history")
        .upsert(navRecords, { onConflict: "user_id,report_date" });
      if (navError) console.error("NAV upsert error:", navError);
      else console.log(`Upserted ${navRecords.length} NAV records`);
    }

    // Parse ChangeInNAV tags → ib_twr_history
    const twrTags = extractTags(xml, "ChangeInNAV");
    console.log(`Found ${twrTags.length} ChangeInNAV tags`);

    const twrRecords = twrTags.map(t => ({
      user_id: user.id,
      from_date: safeDate(t.fromDate),
      to_date: safeDate(t.toDate),
      starting_value: safeNum(t.startingValue),
      ending_value: safeNum(t.endingValue),
      mark_to_market: safeNum(t.markToMarket) ?? safeNum(t.realized),
      deposits_withdrawals: safeNum(t.depositsWithdrawals) ?? safeNum(t.cashSettling),
      dividends: safeNum(t.dividends),
      interest: safeNum(t.brokerInterest) ?? safeNum(t.interest),
      commissions: safeNum(t.commissions),
      twr: safeNum(t.twr),
    }));

    if (twrRecords.length > 0) {
      const { error: twrError } = await supabase
        .from("ib_twr_history")
        .upsert(twrRecords, { onConflict: "user_id,from_date,to_date" });
      if (twrError) console.error("TWR upsert error:", twrError);
      else console.log(`Upserted ${twrRecords.length} TWR records`);
    }

    // Parse MTDYTDPerformanceSummary (log for now)
    const perfTags = extractTags(xml, "MTDYTDPerformanceSummary");
    console.log(`Found ${perfTags.length} MTDYTDPerformanceSummary tags`);
    if (perfTags.length > 0) {
      console.log("Sample perf tag:", JSON.stringify(perfTags[0]));
    }

    return new Response(JSON.stringify({
      success: true,
      synced: {
        nav_records: navRecords.length,
        twr_records: twrRecords.length,
        perf_summaries: perfTags.length,
      }
    }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });

  } catch (err) {
    console.error("Performance sync error:", err);
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" }
    });
  }
});
