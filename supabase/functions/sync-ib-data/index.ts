// supabase/functions/sync-ib-data/index.ts
// ================================================================
// Fetches data from IB Flex Web Service, parses XML, stores in DB
// ================================================================

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

// Step 1: Request a report — IB returns a reference code
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

// Step 2: Poll for the report using the reference code
async function fetchFlexReport(token: string, referenceCode: string): Promise<string> {
  const url = `https://gdcdyn.interactivebrokers.com/Universal/servlet/FlexStatementService.GetStatement?t=${token}&q=${referenceCode}&v=3`;
  for (let attempt = 0; attempt < 5; attempt++) {
    if (attempt > 0) await new Promise(r => setTimeout(r, 2000));
    const res = await fetch(url);
    const text = await res.text();
    if (text.includes("Statement generation in progress")) continue;
    if (text.includes("<ErrorMessage>")) {
      const errorMatch = text.match(/<ErrorMessage>(.*?)<\/ErrorMessage>/);
      throw new Error(`IB fetch failed: ${errorMatch?.[1] ?? text}`);
    }
    if (text.includes("<FlexQueryResponse")) return text;
  }
  throw new Error("IB report generation timed out after 5 attempts");
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
  const regex = new RegExp(`<${tagName}\\s([^/]*?)/>`, "g");
  let match;
  while ((match = regex.exec(xml)) !== null) {
    results.push(parseXMLAttributes(match[1]));
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

function safeDateTime(date: string | undefined, time: string | undefined): string | null {
  if (!date || date === "" || date === "--") return null;
  if (!time || time === "" || time === "--") return `${date}T00:00:00Z`;
  return `${date}T${time}Z`;
}

function parseTrades(xml: string, userId: string, accountId: string) {
  const trades = extractTags(xml, "Trade");
  return trades
    .filter(t => t.levelOfDetail === "EXECUTION" || t.levelOfDetail === "CLOSED_LOT")
    .map(t => ({
      user_id: userId,
      ib_account_id: accountId,
      trade_id: t.tradeID || null,
      transaction_id: t.transactionID || null,
      symbol: t.symbol || null,
      description: t.description || null,
      asset_class: t.assetCategory || null,
      sub_category: t.subCategory || null,
      exchange: t.exchange || null,
      trade_date: safeDate(t.tradeDate),
      date_time: safeDateTime(t.tradeDate, t.dateTime?.split(";")[1]),
      settle_date: safeDate(t.settleDateTarget),
      buy_sell: t.buySell || null,
      quantity: safeNum(t.quantity),
      trade_price: safeNum(t.tradePrice),
      trade_money: safeNum(t.tradeMoney),
      proceeds: safeNum(t.proceeds),
      ib_commission: safeNum(t.ibCommission),
      net_cash: safeNum(t.netCash),
      cost_basis: safeNum(t.costBasis),
      realized_pnl: safeNum(t.fifoPnlRealized),
      open_close: t["openCloseIndicator"] || null,
      order_type: t.orderType || null,
      notes: t["notes/Codes"] || null,
      level_of_detail: t.levelOfDetail || null,
      report_date: safeDate(t.reportDate),
      raw_xml: t,
    }));
}

function parsePositions(xml: string, userId: string, accountId: string) {
  // Debug: log a snippet around OpenPosition tags
  const idx = xml.indexOf("OpenPosition");
  if (idx === -1) {
    console.log("No OpenPosition tags found in XML at all");
  } else {
    console.log("OpenPosition sample (500 chars):", xml.substring(idx, idx + 500));
  }

  // Try self-closing tags first
  let positions = extractTags(xml, "OpenPosition");
  console.log(`extractTags OpenPosition (self-closing): ${positions.length} results`);

  // Also try nested <OpenPosition ...>...</OpenPosition> tags
  if (positions.length === 0) {
    const nestedRegex = /<OpenPosition\s([^>]*?)>/g;
    let match;
    while ((match = nestedRegex.exec(xml)) !== null) {
      positions.push(parseXMLAttributes(match[1]));
    }
    console.log(`Nested OpenPosition tags found: ${positions.length}`);
  }

  // Log all levelOfDetail values for debugging
  const levels = [...new Set(positions.map(p => p.levelOfDetail || "undefined"))];
  console.log(`OpenPosition levelOfDetail values: ${JSON.stringify(levels)}`);

  // No filter — take all positions
  return positions.map(p => ({
    user_id: userId,
    ib_account_id: accountId,
    symbol: p.symbol || null,
    description: p.description || null,
    asset_class: p.assetCategory || null,
    sub_category: p.subCategory || null,
    quantity: safeNum(p.quantity),
    mark_price: safeNum(p.markPrice),
    position_value: safeNum(p.positionValue),
    cost_basis_price: safeNum(p.costBasisPrice),
    cost_basis_money: safeNum(p.costBasisMoney),
    percent_of_nav: safeNum(p.percentOfNAV),
    unrealized_pnl: safeNum(p.fifoPnlUnrealized),
    side: p.side || null,
    open_date_time: safeDate(p.openDateTime),
    report_date: safeDate(p.reportDate),
    synced_at: new Date().toISOString(),
  }));
}

function parseCashBalance(xml: string): number | null {
  // Try CashReportCurrency tags first (most common in Flex reports)
  const cashTags = extractTags(xml, "CashReportCurrency");
  if (cashTags.length > 0) {
    // Find the BASE_SUMMARY or total row, fallback to first row
    const baseSummary = cashTags.find(t => t.currency === "BASE_SUMMARY") || cashTags[0];
    const ending = safeNum(baseSummary.endingCash) ?? safeNum(baseSummary.endingSettledCash);
    if (ending !== null) {
      console.log(`Parsed cash balance from CashReportCurrency: ${ending}`);
      return ending;
    }
  }

  // Try EquitySummaryInBase (has endingCash attribute)
  const equitySummary = extractTags(xml, "EquitySummaryInBase");
  if (equitySummary.length > 0) {
    const cash = safeNum(equitySummary[0].cash);
    if (cash !== null) {
      console.log(`Parsed cash balance from EquitySummaryInBase: ${cash}`);
      return cash;
    }
  }

  // Try regex for endingCash attribute anywhere
  const endingCashMatch = xml.match(/endingCash="([^"]+)"/);
  if (endingCashMatch) {
    const val = safeNum(endingCashMatch[1]);
    if (val !== null) {
      console.log(`Parsed cash balance from endingCash attribute: ${val}`);
      return val;
    }
  }

  console.log("No cash balance found in XML");
  return null;
}

function parseCashTransactions(xml: string, userId: string, accountId: string) {
  const txns = extractTags(xml, "CashTransaction");
  return txns.map(t => ({
    user_id: userId,
    ib_account_id: accountId,
    transaction_id: t.transactionID || null,
    symbol: t.symbol || null,
    description: t.description || null,
    asset_class: t.assetCategory || null,
    currency: t.currency || null,
    date_time: safeDate(t.dateTime?.split(";")[0]),
    settle_date: safeDate(t.settleDate),
    amount: safeNum(t.amount),
    type: t.type || null,
    report_date: safeDate(t.reportDate),
  }));
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

    const { ib_account_id, flex_token, flex_query_id } = ibAccount;
    console.log(`Syncing IB data for account ${ib_account_id}...`);

    const referenceCode = await requestFlexReport(flex_token, flex_query_id);
    console.log(`Got reference code: ${referenceCode}`);

    const xml = await fetchFlexReport(flex_token, referenceCode);
    console.log(`Got XML response, length: ${xml.length}`);

    const trades = parseTrades(xml, user.id, ib_account_id);
    const positions = parsePositions(xml, user.id, ib_account_id);
    const cashTxns = parseCashTransactions(xml, user.id, ib_account_id);
    const cashBalance = parseCashBalance(xml);

    console.log(`Parsed: ${trades.length} trades, ${positions.length} positions, ${cashTxns.length} cash transactions, cash: ${cashBalance}`);

    if (trades.length > 0) {
      const { error: tradesError } = await supabase
        .from("ib_trades")
        .upsert(trades, { onConflict: "transaction_id", ignoreDuplicates: true });
      if (tradesError) console.error("Trades upsert error:", tradesError);
    }

    if (positions.length > 0) {
      await supabase.from("ib_positions").delete().eq("user_id", user.id);
      const { error: posError } = await supabase.from("ib_positions").insert(positions);
      if (posError) console.error("Positions insert error:", posError);
    }

    if (cashTxns.length > 0) {
      const { error: cashError } = await supabase
        .from("ib_cash_transactions")
        .upsert(cashTxns, { onConflict: "transaction_id", ignoreDuplicates: true });
      if (cashError) console.error("Cash transactions upsert error:", cashError);
    }

    await supabase
      .from("ib_accounts")
      .update({ 
        last_synced_at: new Date().toISOString(),
        ...(cashBalance !== null ? { cash_balance: cashBalance } : {}),
      })
      .eq("user_id", user.id);

    return new Response(JSON.stringify({
      success: true,
      synced: {
        trades: trades.length,
        positions: positions.length,
        cash_transactions: cashTxns.length,
        cash_balance: cashBalance,
      }
    }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });

  } catch (err) {
    console.error("Sync error:", err);
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" }
    });
  }
});
