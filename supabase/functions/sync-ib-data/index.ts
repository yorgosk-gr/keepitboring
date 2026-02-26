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
  for (let attempt = 0; attempt < 10; attempt++) {
    if (attempt > 0) await new Promise(r => setTimeout(r, 3000));
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
  throw new Error("IB report generation timed out after 10 attempts");
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

  // No filter — take all positions (raw, before FX conversion)
  const rawPositions = positions.map(p => ({
    user_id: userId,
    ib_account_id: accountId,
    symbol: p.symbol || null,
    description: p.description || null,
    asset_class: p.assetCategory || null,
    sub_category: p.subCategory || null,
    quantity: safeNum(p.position) ?? safeNum(p.quantity),
    mark_price: safeNum(p.markPrice),
    position_value: safeNum(p.positionValue),
    cost_basis_price: safeNum(p.costBasisPrice),
    cost_basis_money: safeNum(p.costBasisMoney),
    percent_of_nav: safeNum(p.percentOfNAV),
    unrealized_pnl: safeNum(p.fifoPnlUnrealized),
    side: p.side || null,
    listing_exchange: p.listingExchange || p.primaryExch || null,
    open_date_time: safeDate(p.openDateTime),
    report_date: safeDate(p.reportDate),
    synced_at: new Date().toISOString(),
    currency: p.currency || null,
  }));

  // Derive total NAV in USD from USD-denominated positions
  // NAV = position_value / (percent_of_nav / 100) for any USD position with both values
  let totalNavUsd: number | null = null;
  for (const pos of rawPositions) {
    const isUSD = !pos.currency || pos.currency === "USD";
    if (isUSD && pos.position_value && pos.percent_of_nav && pos.percent_of_nav > 0) {
      totalNavUsd = (pos.position_value / pos.percent_of_nav) * 100;
      break;
    }
  }

  if (totalNavUsd) {
    console.log(`Derived total NAV (USD): ${totalNavUsd.toFixed(2)}`);
  }

  // Convert non-USD positions to USD using NAV-derived values
  return rawPositions.map(pos => {
    const isUSD = !pos.currency || pos.currency === "USD";
    if (!isUSD && totalNavUsd && pos.percent_of_nav) {
      const usdValue = Math.round((pos.percent_of_nav / 100) * totalNavUsd * 100) / 100;
      // Derive FX rate from the conversion for cost basis and PnL
      const fxRate = pos.position_value && pos.position_value !== 0
        ? usdValue / pos.position_value
        : 1;
      console.log(`FX converting ${pos.symbol}: ${pos.currency} -> USD (NAV-derived rate ~${fxRate.toFixed(4)}, value ${pos.position_value} -> ${usdValue})`);
      return {
        ...pos,
        position_value: usdValue,
        cost_basis_money: pos.cost_basis_money !== null ? Math.round(pos.cost_basis_money * fxRate * 100) / 100 : null,
        unrealized_pnl: pos.unrealized_pnl !== null ? Math.round(pos.unrealized_pnl * fxRate * 100) / 100 : null,
      };
    }
    return pos;
  });
}

function parseCashBalance(xml: string, positions: { position_value: number | null; percent_of_nav: number | null }[]): number | null {
  // Try CashReportCurrency tags first (most common in Flex reports)
  const cashTags = extractTags(xml, "CashReportCurrency");
  if (cashTags.length > 0) {
    const baseSummary = cashTags.find(t => t.currency === "BASE_SUMMARY") || cashTags[0];
    const ending = safeNum(baseSummary.endingCash) ?? safeNum(baseSummary.endingSettledCash);
    if (ending !== null) {
      console.log(`Parsed cash balance from CashReportCurrency: ${ending}`);
      return ending;
    }
  }

  // Try EquitySummaryInBase (has cash attribute)
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

  // Fallback: derive cash from NAV minus total position values
  // NAV = positionValue / (percentOfNAV / 100) for any position with both values
  if (positions.length > 0) {
    const posWithNav = positions.find(p => p.position_value && p.percent_of_nav && p.percent_of_nav > 0);
    if (posWithNav) {
      const nav = (posWithNav.position_value! / posWithNav.percent_of_nav!) * 100;
      const totalPositionValue = positions.reduce((sum, p) => sum + (p.position_value || 0), 0);
      const cash = Math.round((nav - totalPositionValue) * 100) / 100;
      console.log(`Derived cash balance from NAV: NAV=${nav.toFixed(2)}, positions=${totalPositionValue.toFixed(2)}, cash=${cash}`);
      return cash;
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
    const cashBalance = parseCashBalance(xml, positions);

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

    // Backfill listing_exchange from trades for positions that don't have it
    if (positions.length > 0) {
      // Preferred exchange mappings (filter out dark pools and internal venues)
      const darkPools = new Set(["DARK", "EUDARK", "IBKRATS", "IBIS2"]);
      const exchangeMap: Record<string, string> = {};
      
      // Get most common non-dark-pool exchange per symbol from trades
      const { data: tradeExchanges } = await supabase
        .from("ib_trades")
        .select("symbol, exchange")
        .eq("user_id", user.id)
        .not("exchange", "is", null);
      
      if (tradeExchanges) {
        // Count exchange occurrences per symbol, excluding dark pools
        const counts: Record<string, Record<string, number>> = {};
        for (const t of tradeExchanges) {
          if (!t.symbol || !t.exchange || darkPools.has(t.exchange)) continue;
          if (!counts[t.symbol]) counts[t.symbol] = {};
          counts[t.symbol][t.exchange] = (counts[t.symbol][t.exchange] || 0) + 1;
        }
        for (const [sym, exMap] of Object.entries(counts)) {
          const best = Object.entries(exMap).sort((a, b) => b[1] - a[1])[0];
          if (best) exchangeMap[sym] = best[0];
        }
      }

      // Standardize exchange names
      const exchangeStandard: Record<string, string> = {
        "LSEETF": "LSE", "ISLAND": "NASDAQ", "NASDAQ.NMS": "NASDAQ",
        "NASDAQ.SCM": "NASDAQ", "TRWBUKETF": "LSE", "AEB": "AMS",
      };

      for (const pos of positions) {
        if (pos.listing_exchange) continue;
        const raw = exchangeMap[pos.symbol || ""];
        if (raw) {
          const standardized = exchangeStandard[raw] || raw;
          await supabase
            .from("ib_positions")
            .update({ listing_exchange: standardized })
            .eq("user_id", user.id)
            .eq("symbol", pos.symbol);
        }
      }
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
