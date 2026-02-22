import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

// Handle known special cases where IBKR ticker differs from Yahoo ticker
const ALIASES: Record<string, string> = {
  "GRE1": "GRE.PA",
  "CBUX": "INFR.L",
  "BRK B": "BRK-B",
};

function getYahooTicker(ticker: string, currency?: string, instrumentType?: string): string {
  const upper = ticker.toUpperCase().replace(/ /g, "-");
  if (ALIASES[ticker]) return ALIASES[ticker];

  // Derive suffix from currency and instrument type
  if (currency === "AUD") return upper + ".AX";
  if (currency === "EUR") return upper + ".PA";
  if (currency === "GBP") return upper + ".L";
  if (currency === "USD" && (instrumentType === "ETF" || instrumentType === "ETC")) {
    return upper + ".L"; // UCITS ETFs listed on LSE, priced in USD
  }

  return upper; // US stocks need no suffix
}

interface PriceResult {
  ticker: string;
  current_price: number;
  currency: string;
  price_date: string;
  source: string;
}

async function fetchYahooPrice(ticker: string, currency?: string, instrumentType?: string): Promise<PriceResult | null> {
  const yahooTicker = getYahooTicker(ticker, currency, instrumentType);
  try {
    const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(yahooTicker)}?range=1d&interval=1d`;
    const response = await fetch(url, {
      headers: { "User-Agent": "Mozilla/5.0" },
    });
    if (!response.ok) {
      console.error(`Yahoo error for ${yahooTicker}: ${response.status}`);
      return null;
    }
    const data = await response.json();
    const meta = data?.chart?.result?.[0]?.meta;
    if (!meta) return null;
    const price = meta.regularMarketPrice ?? meta.previousClose;
    if (!price || price === 0) return null;

    // Auto-convert GBP pence to pounds. Yahoo returns "GBp" for pence-priced LSE securities.
    let finalPrice = price;
    let finalCurrency = meta.currency || "USD";
    if (finalCurrency === "GBp") {
      finalPrice = price / 100;
      finalCurrency = "GBP";
    }

    return {
      ticker: ticker.toUpperCase(),
      current_price: Math.round(finalPrice * 100) / 100,
      currency: finalCurrency,
      price_date: meta.regularMarketTime
        ? new Date(meta.regularMarketTime * 1000).toISOString().split("T")[0]
        : new Date().toISOString().split("T")[0],
      source: `Yahoo Finance (${yahooTicker})`,
    };
  } catch (error) {
    console.error(`Fetch error for ${yahooTicker}:`, error);
    return null;
  }
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }
  try {
    const body = await req.json();
    // Support both old format { tickers: string[] } and new format { tickers: TickerInfo[] }
    const tickerItems: { ticker: string; currency?: string; instrumentType?: string }[] =
      Array.isArray(body.tickers)
        ? body.tickers.map((t: string | { ticker: string; currency?: string; instrumentType?: string }) =>
            typeof t === "string" ? { ticker: t } : t
          )
        : [];
    if (!tickerItems.length) {
      return new Response(
        JSON.stringify({ error: "No tickers provided" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }
    console.log(`Yahoo Finance: fetching ${tickerItems.length} tickers`);
    const results = await Promise.allSettled(
      tickerItems.map(t => fetchYahooPrice(t.ticker, t.currency, t.instrumentType))
    );
    const prices: PriceResult[] = [];
    const notFound: string[] = [];
    results.forEach((r, i) => {
      if (r.status === "fulfilled" && r.value) prices.push(r.value);
      else notFound.push(tickerItems[i].ticker);
    });
    console.log(`Done: ${prices.length} found, ${notFound.length} not found`);
    return new Response(
      JSON.stringify({ success: true, prices, not_found: notFound, fetched_at: new Date().toISOString() }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("Price fetch error:", error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
