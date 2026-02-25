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

function getYahooTicker(ticker: string, currency?: string, instrumentType?: string, exchange?: string): string {
  const upper = ticker.toUpperCase().replace(/ /g, "-");
  if (ALIASES[ticker]) return ALIASES[ticker];

  // Use exchange field first for accurate suffix resolution
  const exNorm = (exchange || "").toUpperCase();
  if (exNorm.includes("AMS") || exNorm === "AEB" || exNorm === "EURONEXT") {
    return upper + ".AS"; // Euronext Amsterdam
  }
  if (exNorm.includes("PAR") || exNorm === "EPA") {
    return upper + ".PA"; // Euronext Paris
  }
  if (exNorm.includes("LSE") || exNorm === "LSEETF") {
    return upper + ".L"; // London Stock Exchange
  }
  if (exNorm.includes("ASX")) {
    return upper + ".AX"; // Australian
  }
  if (exNorm.includes("XETRA") || exNorm === "FRA") {
    return upper + ".DE"; // Germany
  }

  // Fallback: derive suffix from currency
  if (currency === "AUD") return upper + ".AX";
  if (currency === "EUR") return upper + ".AS"; // Default EUR to Amsterdam (most UCITS ETFs)
  if (currency === "GBP") return upper + ".L";
  if (currency === "USD" && (instrumentType === "ETF" || instrumentType === "ETC")) {
    return upper + ".L"; // UCITS ETFs listed on LSE, priced in USD
  }

  return upper; // US stocks need no suffix
}

interface PriceResult {
  ticker: string;
  current_price: number;       // price in USD
  local_price: number;         // price in original currency
  currency: string;            // original currency
  fx_rate: number;             // rate used: 1 local = fx_rate USD
  price_date: string;
  source: string;
}

// Fetch FX rate from Yahoo Finance: returns how many USD per 1 unit of currency
async function fetchFXRate(currency: string): Promise<number> {
  if (currency === "USD") return 1;
  
  const pair = `${currency}USD=X`;
  try {
    const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(pair)}?range=1d&interval=1d`;
    const response = await fetch(url, {
      headers: { "User-Agent": "Mozilla/5.0" },
    });
    if (!response.ok) {
      console.error(`FX rate error for ${pair}: ${response.status}`);
      return 0;
    }
    const data = await response.json();
    const meta = data?.chart?.result?.[0]?.meta;
    const rate = meta?.regularMarketPrice ?? meta?.previousClose;
    if (!rate || rate === 0) return 0;
    console.log(`FX rate ${currency}/USD = ${rate}`);
    return rate;
  } catch (error) {
    console.error(`FX fetch error for ${pair}:`, error);
    return 0;
  }
}

async function fetchYahooPrice(
  ticker: string,
  currency?: string,
  instrumentType?: string,
  fxRates?: Record<string, number>,
  exchange?: string
): Promise<PriceResult | null> {
  const yahooTicker = getYahooTicker(ticker, currency, instrumentType, exchange);
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

    // Auto-convert GBP pence to pounds
    let localPrice = price;
    let localCurrency = meta.currency || currency || "USD";
    if (localCurrency === "GBp") {
      localPrice = price / 100;
      localCurrency = "GBP";
    }

    // Convert to USD
    const fxRate = fxRates?.[localCurrency] ?? (localCurrency === "USD" ? 1 : 0);
    const usdPrice = fxRate > 0 ? localPrice * fxRate : localPrice;

    return {
      ticker: ticker.toUpperCase(),
      current_price: Math.round(usdPrice * 100) / 100,
      local_price: Math.round(localPrice * 100) / 100,
      currency: localCurrency,
      fx_rate: fxRate,
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
    const tickerItems: { ticker: string; currency?: string; instrumentType?: string; exchange?: string }[] =
      Array.isArray(body.tickers)
        ? body.tickers.map((t: string | { ticker: string; currency?: string; instrumentType?: string; exchange?: string }) =>
            typeof t === "string" ? { ticker: t } : t
          )
        : [];
    if (!tickerItems.length) {
      return new Response(
        JSON.stringify({ error: "No tickers provided" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Determine which FX rates we need
    const uniqueCurrencies = new Set<string>();
    for (const item of tickerItems) {
      if (item.currency && item.currency !== "USD") {
        uniqueCurrencies.add(item.currency);
      }
    }

    // Fetch FX rates in parallel
    const fxRates: Record<string, number> = { USD: 1 };
    if (uniqueCurrencies.size > 0) {
      console.log(`Fetching FX rates for: ${[...uniqueCurrencies].join(", ")}`);
      const fxResults = await Promise.allSettled(
        [...uniqueCurrencies].map(async (cur) => {
          const rate = await fetchFXRate(cur);
          return { currency: cur, rate };
        })
      );
      for (const result of fxResults) {
        if (result.status === "fulfilled" && result.value.rate > 0) {
          fxRates[result.value.currency] = result.value.rate;
        }
      }
      console.log("FX rates:", JSON.stringify(fxRates));
    }

    console.log(`Yahoo Finance: fetching ${tickerItems.length} tickers`);
    const results = await Promise.allSettled(
      tickerItems.map(t => fetchYahooPrice(t.ticker, t.currency, t.instrumentType, fxRates, t.exchange))
    );
    const prices: PriceResult[] = [];
    const notFound: string[] = [];
    results.forEach((r, i) => {
      if (r.status === "fulfilled" && r.value) prices.push(r.value);
      else notFound.push(tickerItems[i].ticker);
    });
    console.log(`Done: ${prices.length} found, ${notFound.length} not found`);
    return new Response(
      JSON.stringify({ success: true, prices, not_found: notFound, fx_rates: fxRates, fetched_at: new Date().toISOString() }),
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
