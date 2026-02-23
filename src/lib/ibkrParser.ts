// ============================================================
// IBKR Parser — supports both Activity Statement and Flex Query CSV formats
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

const BOND_KEYWORDS = ["treasury", "treas", "bond", "gilt", "ibond", "iboxx", "fixed income", "ibonds", "0-1yr", "7-10y", "10y"];
const COMMODITY_KEYWORDS = ["gold", "silver", "commodity", "commodit", "copper", "oil", "physical gold", "physical silver", "bitcoin", "crypto"];
const ETF_KEYWORDS = ["ishares", "vanguard", "invesco", "spdr", "xtrackers", "amundi", "wisdomtree", "lyxor", "ucits etf", "etf", "etc", "etn"];

function inferClassification(ticker: string, description: string): { instrumentType: InstrumentType; assetClass: AssetClass } {
  if (KNOWN_CLASSIFICATIONS[ticker]) return KNOWN_CLASSIFICATIONS[ticker];
  const desc = description.toLowerCase();
  let assetClass: AssetClass = "Equities";
  if (BOND_KEYWORDS.some(kw => desc.includes(kw))) assetClass = "Bonds";
  else if (COMMODITY_KEYWORDS.some(kw => desc.includes(kw))) assetClass = "Commodities";
  let instrumentType: InstrumentType = "Stock";
  if (ETF_KEYWORDS.some(kw => desc.includes(kw))) instrumentType = desc.includes("etc") ? "ETC" : "ETF";
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
    if (ch === '"') { inQuotes = !inQuotes; }
    else if (ch === "," && !inQuotes) { result.push(current.trim()); current = ""; }
    else { current += ch; }
  }
  result.push(current.trim());
  return result;
}

function deriveYahooTickerFromExchange(ticker: string, listingExchange: string): string {
  const safe = ticker.replace(/ /g, "-");
  switch (listingExchange) {
    case "ASX":    return safe + ".AX";
    case "SBF":
    case "AEB":    return safe + ".PA";
    case "LSE":
    case "LSEETF": return safe + ".L";
    default:       return safe;
  }
}

function deriveYahooTickerFromCurrency(ticker: string, currency: string, instrumentType: InstrumentType): string {
  const safe = ticker.replace(/ /g, "-");
  switch (currency) {
    case "AUD": return safe + ".AX";
    case "EUR": return safe + ".PA";
    case "GBP": return safe + ".L";
    case "USD":
      if (instrumentType === "ETF" || instrumentType === "ETC") return safe + ".L";
      return safe;
    default: return safe;
  }
}

// ── Flex Query parser ─────────────────────────────────────────────────────────

function parseFlexQuery(lines: string[]): ParsedPortfolio {
  const warnings: string[] = [];
  let accountId = "", accountName = "", statementDate = "", baseCurrency = "USD";
  let cashUSD = 0, totalNAV = 0;
  const fxRates: Record<string, number> = { USD: 1.0 };
  const cashByCurrency: Record<string, number> = {};
  const positions: Position[] = [];
  let lastEqutRow: string[] | null = null;

  for (const line of lines) {
    const c = parseCSVLine(line);
    if (c[0] !== "DATA") continue;
    const section = c[1];

    if (section === "ACCT") {
      accountId = c[2]; baseCurrency = c[3]; accountName = c[4];
    }
    if (section === "EQUT") {
      lastEqutRow = c;
    }
    if (section === "RATE") {
      if (!statementDate) statementDate = c[2];
      const fromCcy = c[3];
      const rate = parseNumber(c[5]);
      if (fromCcy && rate > 0 && !fxRates[fromCcy]) fxRates[fromCcy] = rate;
    }
    if (section === "MTMP" && c[2] === "CASH") {
      const ccy = c[3];
      const amt = parseNumber(c[5]);
      const rate = parseNumber(c[6]);
      if (Math.abs(amt) >= 0.01) cashByCurrency[ccy] = amt;
      if (rate > 0 && ccy !== "USD") fxRates[ccy] = rate;
    }
    if (section === "POST") {
      const currency        = c[2];
      const fxRateToBase    = parseNumber(c[3]) || 1;
      const ticker          = c[5];
      const description     = c[6];
      const listingExchange = c[7];
      const quantity        = parseNumber(c[8]);
      const closePrice      = parseNumber(c[9]);
      const valueLocal      = parseNumber(c[10]);
      const costPrice       = parseNumber(c[11]);
      const unrealizedPL    = parseNumber(c[13]);

      if (!ticker || quantity === 0) continue;

      fxRates[currency] = fxRateToBase;
      const valueUSD = valueLocal * fxRateToBase;
      const { instrumentType, assetClass } = inferClassification(ticker, description);
      const yahooTicker = deriveYahooTickerFromExchange(ticker, listingExchange);
      positions.push({ ticker, description, currency, quantity, costPrice, closePrice, valueLocal, valueUSD, unrealizedPL, instrumentType, assetClass, yahooTicker });
    }
  }

  if (lastEqutRow) {
    cashUSD  = parseNumber(lastEqutRow[2]);
    totalNAV = parseNumber(lastEqutRow[8]);
  }
  const securitiesUSD = positions.reduce((sum, p) => sum + p.valueUSD, 0);

  // If no MTMP CASH rows were found, fall back to EQUT-derived cashUSD
  if (Object.keys(cashByCurrency).length === 0 && cashUSD > 0) {
    cashByCurrency[baseCurrency] = cashUSD;
  }

  return { accountId, accountName, statementDate, baseCurrency, totalNAV, cashUSD, securitiesUSD, positions, fxRates, cashByCurrency, warnings };
}

// ── Activity Statement parser ─────────────────────────────────────────────────

function parseLegacyStatement(lines: string[]): ParsedPortfolio {
  const warnings: string[] = [];
  let accountId = "", accountName = "", statementDate = "", baseCurrency = "USD";
  let cashUSD = 0, totalNAV = 0;
  const descriptionMap: Record<string, string> = {};
  const cashByCurrency: Record<string, number> = {};
  const fxRates: Record<string, number> = { USD: 1.0 };

  for (const line of lines) {
    const cols = parseCSVLine(line);
    if (cols.length < 2) continue;
    const section = cols[0], rowType = cols[1];
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
      const ticker = cols[3]?.trim(), desc = cols[4]?.trim();
      if (ticker && desc) descriptionMap[ticker] = desc;
    }
    if (section === "Cash Report" && rowType === "Data" && cols[2] === "Ending Cash" && cols[3] !== "Base Currency Summary") {
      const val = parseNumber(cols[4]);
      if (Math.abs(val) >= 0.01) cashByCurrency[cols[3]] = (cashByCurrency[cols[3]] ?? 0) + val;
    }
  }

  for (const line of lines) {
    const cols = parseCSVLine(line);
    if (cols.length < 8) continue;
    if (cols[0] === "Mark-to-Market Performance Summary" && cols[1] === "Data" && cols[2] === "Forex") {
      const ccy = cols[3]?.trim(), rate = parseNumber(cols[7]);
      if (ccy && rate > 0 && ccy !== "USD") fxRates[ccy] = rate;
    }
  }

  const fallbacks: Record<string, number> = { EUR: 1.18, GBP: 1.35, AUD: 0.63, CAD: 0.73 };
  for (const [ccy, rate] of Object.entries(fallbacks)) {
    if (!fxRates[ccy]) {
      fxRates[ccy] = rate;
      warnings.push(`FX rate for ${ccy} not found — using fallback ${rate}`);
    }
  }

  const positions: Position[] = [];
  for (const line of lines) {
    const cols = parseCSVLine(line);
    if (cols.length < 10) continue;
    if (cols[0] !== "Open Positions" || cols[1] !== "Data" || cols[2] !== "Summary") continue;
    const currency    = cols[4]?.trim();
    const ticker      = cols[5]?.trim();
    const quantity    = parseNumber(cols[6]);
    const costPrice   = parseNumber(cols[8]);
    const closePrice  = parseNumber(cols[10]);
    const valueLocal  = parseNumber(cols[11]);
    const unrealizedPL = parseNumber(cols[12]);
    if (!ticker || quantity === 0) continue;
    const description = descriptionMap[ticker] || "";
    const { instrumentType, assetClass } = inferClassification(ticker, description);
    const fxRate = fxRates[currency] ?? 1;
    const valueUSD = valueLocal * fxRate;
    const yahooTicker = deriveYahooTickerFromCurrency(ticker, currency, instrumentType);
    positions.push({ ticker, description, currency, quantity, costPrice, closePrice, valueLocal, valueUSD, unrealizedPL, instrumentType, assetClass, yahooTicker });
  }

  const securitiesUSD = positions.reduce((sum, p) => sum + p.valueUSD, 0);
  return { accountId, accountName, statementDate, baseCurrency, totalNAV, cashUSD, securitiesUSD, positions, fxRates, cashByCurrency, warnings };
}

// ── Main entry point ──────────────────────────────────────────────────────────

export function parseIBKRStatement(csvText: string): ParsedPortfolio {
  const lines = csvText
    .replace(/^\uFEFF/, "")
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n")
    .split("\n");

  const isFlexQuery = lines.some(line => {
    const c = parseCSVLine(line);
    return c[0] === "DATA" && c[1] === "POST";
  });

  return isFlexQuery ? parseFlexQuery(lines) : parseLegacyStatement(lines);
}

// ── Allocation summary ────────────────────────────────────────────────────────

export function getAllocationSummary(portfolio: ParsedPortfolio): AllocationSummary {
  const total = portfolio.securitiesUSD + portfolio.cashUSD;
  const pct = (v: number) => (v / total) * 100;
  const equitiesUSD    = portfolio.positions.filter(p => p.assetClass === "Equities").reduce((s, p) => s + p.valueUSD, 0);
  const bondsUSD       = portfolio.positions.filter(p => p.assetClass === "Bonds").reduce((s, p) => s + p.valueUSD, 0);
  const commoditiesUSD = portfolio.positions.filter(p => p.assetClass === "Commodities").reduce((s, p) => s + p.valueUSD, 0);
  const stocksUSD      = portfolio.positions.filter(p => p.assetClass === "Equities" && p.instrumentType === "Stock").reduce((s, p) => s + p.valueUSD, 0);
  const etfsUSD        = portfolio.positions.filter(p => p.assetClass === "Equities" && p.instrumentType !== "Stock").reduce((s, p) => s + p.valueUSD, 0);

  const breaches: string[] = [];
  if (pct(equitiesUSD) > 70)    breaches.push(`Equities ${pct(equitiesUSD).toFixed(1)}% exceeds 70% target`);
  if (pct(bondsUSD) > 40)       breaches.push(`Bonds ${pct(bondsUSD).toFixed(1)}% exceeds 40% target`);
  if (pct(commoditiesUSD) > 10) breaches.push(`Commodities ${pct(commoditiesUSD).toFixed(1)}% exceeds 10% target`);

  const stocksOfEquities = (stocksUSD / (equitiesUSD || 1)) * 100;
  if (stocksOfEquities < 15) breaches.push(`Stocks are ${stocksOfEquities.toFixed(1)}% of equities — below 15% floor`);
  if (stocksOfEquities > 25) breaches.push(`Stocks are ${stocksOfEquities.toFixed(1)}% of equities — above 25% ceiling`);

  for (const p of portfolio.positions) {
    if (p.instrumentType === "Stock" && pct(p.valueUSD) > 8)
      breaches.push(`${p.ticker} is ${pct(p.valueUSD).toFixed(1)}% — exceeds 8% single stock limit`);
    if (p.instrumentType === "ETF" && pct(p.valueUSD) > 15)
      breaches.push(`${p.ticker} is ${pct(p.valueUSD).toFixed(1)}% — exceeds 15% ETF limit`);
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
