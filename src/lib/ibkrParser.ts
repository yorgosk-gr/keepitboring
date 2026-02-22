// ============================================================
// IBKR Statement Parser — supports both Flex Query CSV and
// legacy Activity Statement CSV formats.
// ============================================================

export type AssetClass = "Equities" | "Bonds" | "Commodities" | "Unknown";
export type InstrumentType = "Stock" | "ETF" | "ETC" | "Unknown";

export interface Position {
  ticker: string;
  description: string;
  currency: string;
  quantity: number;
  costPrice: number;
  closePrice: number;
  valueLocal: number;
  valueUSD: number;
  unrealizedPL: number;
  instrumentType: InstrumentType;
  assetClass: AssetClass;
  yahooTicker: string;
  listingExchange: string;
}

export interface ParsedPortfolio {
  accountId: string;
  accountName: string;
  statementDate: string;
  baseCurrency: string;
  totalNAV: number;
  cashUSD: number;
  securitiesUSD: number;
  positions: Position[];
  fxRates: Record<string, number>;
  cashByCurrency: Record<string, number>;
  warnings: string[];
}

// ── Known classifications ─────────────────────────────────────────────────────

const KNOWN_CLASSIFICATIONS: Record<string, { instrumentType: InstrumentType; assetClass: AssetClass }> = {
  IB01:  { instrumentType: "ETF", assetClass: "Bonds" },
  IDTM:  { instrumentType: "ETF", assetClass: "Bonds" },
  IBTG:  { instrumentType: "ETF", assetClass: "Bonds" },
  IEF:   { instrumentType: "ETF", assetClass: "Bonds" },
  SGOV:  { instrumentType: "ETF", assetClass: "Bonds" },
  TLT:   { instrumentType: "ETF", assetClass: "Bonds" },
  BND:   { instrumentType: "ETF", assetClass: "Bonds" },
  AGG:   { instrumentType: "ETF", assetClass: "Bonds" },
  IGLN:  { instrumentType: "ETC", assetClass: "Commodities" },
  GLD:   { instrumentType: "ETF", assetClass: "Commodities" },
  IAU:   { instrumentType: "ETF", assetClass: "Commodities" },
  SLV:   { instrumentType: "ETF", assetClass: "Commodities" },
  CMOD:  { instrumentType: "ETF", assetClass: "Commodities" },
  COPX:  { instrumentType: "ETF", assetClass: "Commodities" },
  IBIT:  { instrumentType: "ETF", assetClass: "Commodities" },
  IUQA:  { instrumentType: "ETF", assetClass: "Equities" },
  IJPA:  { instrumentType: "ETF", assetClass: "Equities" },
  IMEU:  { instrumentType: "ETF", assetClass: "Equities" },
  EIMI:  { instrumentType: "ETF", assetClass: "Equities" },
  GRE:   { instrumentType: "ETF", assetClass: "Equities" },
  CSPX:  { instrumentType: "ETF", assetClass: "Equities" },
  CBUX:  { instrumentType: "ETF", assetClass: "Equities" },
  IBZL:  { instrumentType: "ETF", assetClass: "Equities" },
};

const BOND_KEYWORDS = [
  "treasury", "treas", "bond", "gilt", "ibond", "iboxx",
  "fixed income", "iboxx", "ibonds", "0-1yr", "7-10y", "10y",
];

const COMMODITY_KEYWORDS = [
  "gold", "silver", "commodity", "commodit", "copper", "oil",
  "physical gold", "physical silver", "bitcoin", "crypto",
];

const ETF_KEYWORDS = [
  "ishares", "vanguard", "invesco", "spdr", "xtrackers", "amundi",
  "wisdomtree", "lyxor", "ucits etf", "etf", "etc", "etn",
];

function inferClassification(
  ticker: string,
  description: string
): { instrumentType: InstrumentType; assetClass: AssetClass } {
  if (KNOWN_CLASSIFICATIONS[ticker]) return KNOWN_CLASSIFICATIONS[ticker];

  const desc = description.toLowerCase();

  let assetClass: AssetClass = "Equities";
  if (BOND_KEYWORDS.some((kw) => desc.includes(kw))) assetClass = "Bonds";
  else if (COMMODITY_KEYWORDS.some((kw) => desc.includes(kw))) assetClass = "Commodities";

  let instrumentType: InstrumentType = "Stock";
  if (ETF_KEYWORDS.some((kw) => desc.includes(kw))) {
    instrumentType = desc.includes("etc") ? "ETC" : "ETF";
  }

  return { instrumentType, assetClass };
}

// ── CSV helpers ───────────────────────────────────────────────────────────────

function parseNumber(raw: string): number {
  if (!raw || raw === "--") return 0;
  return parseFloat(raw.replace(/,/g, "")) || 0;
}

function parseCSVLine(line: string): string[] {
  const result: string[] = [];
  let current = "";
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      inQuotes = !inQuotes;
    } else if (ch === "," && !inQuotes) {
      result.push(current.trim());
      current = "";
    } else {
      current += ch;
    }
  }
  result.push(current.trim());
  return result;
}

/** Strip surrounding quotes from every field */
function stripQuotes(cols: string[]): string[] {
  return cols.map((c) => {
    const t = c.trim();
    if (t.length >= 2 && t.startsWith('"') && t.endsWith('"')) {
      return t.slice(1, -1).trim();
    }
    return t;
  });
}

// ── Yahoo ticker derivation ──────────────────────────────────────────────────

const TICKER_ALIASES: Record<string, string> = {
  "BRK B": "BRK-B",
};

function deriveYahooTickerFromExchange(ticker: string, exchange: string): string {
  const mapped = TICKER_ALIASES[ticker] ?? ticker;
  switch (exchange) {
    case "ASX": return `${mapped}.AX`;
    case "SBF": return `${mapped}.PA`;
    case "AEB": return `${mapped}.PA`;
    case "LSE": return `${mapped}.L`;
    case "LSEETF": return `${mapped}.L`;
    case "NASDAQ":
    case "NYSE":
    case "NYSE ARCA":
      return mapped;
    default: return mapped;
  }
}

function deriveYahooTickerLegacy(ticker: string, currency: string, instrumentType: InstrumentType): string {
  switch (currency) {
    case "AUD": return `${ticker}.AX`;
    case "EUR": return `${ticker}.PA`;
    case "GBP": return `${ticker}.L`;
    case "USD":
      if (instrumentType === "ETF" || instrumentType === "ETC") return `${ticker}.L`;
      return ticker;
    default: return ticker;
  }
}

// (format detection is inline in parseIBKRStatement)

// ── Flex Query parser ────────────────────────────────────────────────────────

function parseFlexQuery(lines: string[]): ParsedPortfolio {
  const warnings: string[] = [];
  const fxRates: Record<string, number> = { USD: 1.0 };
  const cashByCurrency: Record<string, number> = {};
  const positions: Position[] = [];

  let accountId = "";
  let accountName = "";
  let baseCurrency = "USD";
  let statementDate = "";
  let cashUSD = 0;
  let securitiesUSD = 0;
  let totalNAV = 0;

  // Last EQUT DATA row values
  let lastEqutCash = 0;
  let lastEqutStock = 0;
  let lastEqutNAV = 0;

  for (const line of lines) {
    const raw = parseCSVLine(line);
    const cols = stripQuotes(raw);
    if (cols.length < 3) continue;

    const rowType = cols[0]; // DATA or HEADER
    const section = cols[1]; // ACCT, EQUT, POST, MTMP, CRTT, RATE

    if (rowType !== "DATA") continue;

    // STEP 2 — ACCT
    if (section === "ACCT") {
      accountId = cols[2] || accountId;
      baseCurrency = cols[3] || baseCurrency;
      accountName = cols[4] || accountName;
    }

    // STEP 3 — EQUT (take last DATA row)
    if (section === "EQUT") {
      lastEqutCash = parseNumber(cols[2]);
      lastEqutStock = parseNumber(cols[5]);
      lastEqutNAV = parseNumber(cols[8]);
    }

    // STEP 4 — POST (Open Positions)
    if (section === "POST") {
      const currency = cols[2]?.trim();
      const fxRateToBase = parseNumber(cols[3]);
      const ticker = cols[5]?.trim();
      const description = cols[6]?.trim() || "";
      const listingExchange = cols[7]?.trim() || "";
      const quantity = parseNumber(cols[8]);
      const closePrice = parseNumber(cols[9]);
      const valueLocal = parseNumber(cols[10]);
      const costPrice = parseNumber(cols[11]);
      const unrealizedPL = parseNumber(cols[13]);

      if (!ticker || quantity === 0) continue;

      const valueUSD = valueLocal * (fxRateToBase || 1);
      const { instrumentType, assetClass } = inferClassification(ticker, description);
      const yahooTicker = deriveYahooTickerFromExchange(ticker, listingExchange);

      // Store FX rate from POST rows as well
      if (currency && fxRateToBase > 0) {
        fxRates[currency] = fxRateToBase;
      }

      positions.push({
        ticker,
        description,
        currency,
        quantity,
        costPrice,
        closePrice,
        valueLocal,
        valueUSD,
        unrealizedPL,
        instrumentType,
        assetClass,
        yahooTicker,
        listingExchange,
      });
    }

    // STEP 5 — MTMP CASH rows
    if (section === "MTMP" && cols[2] === "CASH") {
      const ccy = cols[3]?.trim();
      const amount = parseNumber(cols[5]);
      const fxRate = parseNumber(cols[6]);

      if (ccy && Math.abs(amount) >= 0.01) {
        cashByCurrency[ccy] = (cashByCurrency[ccy] ?? 0) + amount;
      }
      if (ccy && fxRate > 0) {
        fxRates[ccy] = fxRate;
      }
    }

    // STEP 6 — RATE rows
    if (section === "RATE") {
      const fromCurrency = cols[2]?.trim();
      const rate = parseNumber(cols[4]);
      if (fromCurrency && rate > 0) {
        fxRates[fromCurrency] = rate;
      }
    }
  }

  cashUSD = lastEqutCash;
  securitiesUSD = lastEqutStock || positions.reduce((s, p) => s + p.valueUSD, 0);
  totalNAV = lastEqutNAV || (cashUSD + securitiesUSD);

  return {
    accountId,
    accountName,
    statementDate,
    baseCurrency,
    totalNAV,
    cashUSD,
    securitiesUSD,
    positions,
    fxRates,
    cashByCurrency,
    warnings,
  };
}

// ── Legacy Activity Statement parser ─────────────────────────────────────────

function parseLegacyStatement(lines: string[]): ParsedPortfolio {
  const warnings: string[] = [];
  const fxRates: Record<string, number> = { USD: 1.0 };
  const cashByCurrency: Record<string, number> = {};
  const descriptionMap: Record<string, string> = {};

  let accountId = "";
  let accountName = "";
  let statementDate = "";
  let baseCurrency = "USD";
  let cashUSD = 0;
  let totalNAV = 0;

  // Pass 1: metadata
  for (const line of lines) {
    const cols = parseCSVLine(line);
    if (cols.length < 2) continue;
    const section = cols[0];
    const rowType = cols[1];

    if (section === "Statement" && rowType === "Data" && cols[2] === "Period") statementDate = cols[3];
    if (section === "Account Information" && rowType === "Data") {
      if (cols[2] === "Account") accountId = cols[3];
      if (cols[2] === "Name") accountName = cols[3];
      if (cols[2] === "Base Currency") baseCurrency = cols[3];
    }
    if (section === "Net Asset Value" && rowType === "Data") {
      if (cols[2] === "Cash ") cashUSD = parseNumber(cols[4]);
      if (cols[2] === "Total") totalNAV = parseNumber(cols[4]);
    }
    if (section === "Month & Year to Date Performance Summary" && rowType === "Data") {
      const ticker = cols[3]?.trim();
      const desc = cols[4]?.trim();
      if (ticker && desc) descriptionMap[ticker] = desc;
    }
    if (section === "Cash Report" && rowType === "Data" && cols[2] === "Ending Cash" && cols[3] !== "Base Currency Summary") {
      const val = parseNumber(cols[4]);
      if (Math.abs(val) >= 0.01) cashByCurrency[cols[3]] = (cashByCurrency[cols[3]] ?? 0) + val;
    }
  }

  // Pass 2: FX rates
  for (const line of lines) {
    const cols = parseCSVLine(line);
    if (cols.length < 6) continue;
    if (cols[0] === "Mark-to-Market Performance Summary" && cols[1] === "Data" && cols[2] === "Forex") {
      const ccy = cols[3]?.trim();
      const currentPrice = parseNumber(cols[7]);
      if (ccy && currentPrice > 0 && ccy !== "USD") fxRates[ccy] = currentPrice;
    }
  }

  const fallbacks: Record<string, number> = { EUR: 1.18, GBP: 1.35, AUD: 0.63, CAD: 0.73 };
  for (const [ccy, rate] of Object.entries(fallbacks)) {
    if (!fxRates[ccy]) {
      fxRates[ccy] = rate;
      warnings.push(`FX rate for ${ccy} not found in statement — using fallback ${rate}. Refresh rates for accuracy.`);
    }
  }

  // Pass 3: positions
  const positions: Position[] = [];
  for (const line of lines) {
    const cols = parseCSVLine(line);
    if (cols.length < 10) continue;
    if (cols[0] !== "Open Positions" || cols[1] !== "Data" || cols[2] !== "Summary") continue;

    const currency = cols[4]?.trim();
    const ticker = cols[5]?.trim();
    const quantity = parseNumber(cols[6]);
    const costPrice = parseNumber(cols[8]);
    const closePrice = parseNumber(cols[10]);
    const valueLocal = parseNumber(cols[11]);
    const unrealizedPL = parseNumber(cols[12]);

    if (!ticker || quantity === 0) continue;

    const description = descriptionMap[ticker] || "";
    const { instrumentType, assetClass } = inferClassification(ticker, description);
    const fxRate = fxRates[currency] ?? 1;
    const valueUSD = valueLocal * fxRate;

    if (!fxRates[currency]) {
      warnings.push(`No FX rate found for ${currency} (${ticker}) — value may be inaccurate.`);
    }

    const yahooTicker = deriveYahooTickerLegacy(ticker, currency, instrumentType);

    positions.push({
      ticker,
      description,
      currency,
      quantity,
      costPrice,
      closePrice,
      valueLocal,
      valueUSD,
      unrealizedPL,
      instrumentType,
      assetClass,
      yahooTicker,
      listingExchange: "",
    });
  }

  const securitiesUSD = positions.reduce((sum, p) => sum + p.valueUSD, 0);

  return {
    accountId,
    accountName,
    statementDate,
    baseCurrency,
    totalNAV,
    cashUSD,
    securitiesUSD,
    positions,
    fxRates,
    cashByCurrency,
    warnings,
  };
}

// ── Main entry point ─────────────────────────────────────────────────────────

export function parseIBKRStatement(csvText: string): ParsedPortfolio {
  const lines = csvText
    .replace(/^\uFEFF/, "")
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n")
    .split("\n")
    .filter((l) => l.trim().length > 0);

  // Detect format: check if any line has a Flex Query section code in col[1]
  const isFlexQuery = lines.some(line => {
    const cols = parseCSVLine(line);
    return cols[0] === "DATA" && cols[1] === "POST";
  });

  return isFlexQuery ? parseFlexQuery(lines) : parseLegacyStatement(lines);
}

// ── Allocation summary ───────────────────────────────────────────────────────

export interface AllocationSummary {
  totalUSD: number;
  cashPct: number;
  equitiesPct: number;
  bondsPct: number;
  commoditiesPct: number;
  stocksWithinEquitiesPct: number;
  etfsWithinEquitiesPct: number;
  breaches: string[];
}

export function getAllocationSummary(portfolio: ParsedPortfolio): AllocationSummary {
  const total = portfolio.securitiesUSD + portfolio.cashUSD;
  const pct = (v: number) => (v / total) * 100;

  const byClass = (cls: AssetClass) =>
    portfolio.positions.filter((p) => p.assetClass === cls).reduce((s, p) => s + p.valueUSD, 0);

  const equitiesUSD = byClass("Equities");
  const bondsUSD = byClass("Bonds");
  const commoditiesUSD = byClass("Commodities");

  const stocksUSD = portfolio.positions
    .filter((p) => p.assetClass === "Equities" && p.instrumentType === "Stock")
    .reduce((s, p) => s + p.valueUSD, 0);

  const etfsUSD = portfolio.positions
    .filter((p) => p.assetClass === "Equities" && p.instrumentType !== "Stock")
    .reduce((s, p) => s + p.valueUSD, 0);

  const breaches: string[] = [];

  if (pct(equitiesUSD) > 70) breaches.push(`Equities ${pct(equitiesUSD).toFixed(1)}% exceeds 70% target`);
  if (pct(bondsUSD) > 20) breaches.push(`Bonds ${pct(bondsUSD).toFixed(1)}% exceeds 20% target`);
  if (pct(commoditiesUSD) > 10) breaches.push(`Commodities ${pct(commoditiesUSD).toFixed(1)}% exceeds 10% target`);

  const equityTotal = equitiesUSD || 1;
  const stocksOfEquities = (stocksUSD / equityTotal) * 100;
  if (stocksOfEquities < 15) breaches.push(`Stocks are ${stocksOfEquities.toFixed(1)}% of equities — below 15% floor`);
  if (stocksOfEquities > 25) breaches.push(`Stocks are ${stocksOfEquities.toFixed(1)}% of equities — above 25% ceiling`);

  for (const p of portfolio.positions) {
    if (p.instrumentType === "Stock" && pct(p.valueUSD) > 8) {
      breaches.push(`${p.ticker} is ${pct(p.valueUSD).toFixed(1)}% — exceeds 8% single stock limit`);
    }
    if (p.instrumentType === "ETF" && pct(p.valueUSD) > 15) {
      breaches.push(`${p.ticker} is ${pct(p.valueUSD).toFixed(1)}% — exceeds 15% themed ETF limit`);
    }
  }

  return {
    totalUSD: total,
    cashPct: pct(portfolio.cashUSD),
    equitiesPct: pct(equitiesUSD),
    bondsPct: pct(bondsUSD),
    commoditiesPct: pct(commoditiesUSD),
    stocksWithinEquitiesPct: pct(stocksUSD),
    etfsWithinEquitiesPct: pct(etfsUSD),
    breaches,
  };
}
