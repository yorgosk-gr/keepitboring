// ============================================================
// KNOWN ETF DATABASE
// Covers: Your portfolio ETFs, popular UCITS ETFs, US ETFs
// ============================================================

export interface ETFInfo {
  ticker: string;
  name: string;
  category: "equity" | "bond" | "commodity" | "gold" | "country" | "theme";
  geography?: string;
  is_broad_market: boolean;
  exchange?: string;
  currency?: string;
}

export const KNOWN_ETFS: Record<string, ETFInfo> = {
  // === YOUR PORTFOLIO ETFs ===
  VWRA: { ticker: "VWRA", name: "Vanguard FTSE All-World UCITS ETF (USD Acc)", category: "equity", geography: "global", is_broad_market: true, exchange: "LSE", currency: "USD" },
  CSPX: { ticker: "CSPX", name: "iShares Core S&P 500 UCITS ETF (USD Acc)", category: "equity", geography: "us", is_broad_market: true, exchange: "LSE", currency: "USD" },
  IDTM: { ticker: "IDTM", name: "iShares USD Treasury Bond 1-3yr UCITS ETF", category: "bond", geography: "us", is_broad_market: false, exchange: "LSE", currency: "USD" },
  IMID: { ticker: "IMID", name: "iShares MSCI Mid Cap Value Factor UCITS ETF", category: "equity", geography: "global", is_broad_market: false, exchange: "LSE", currency: "USD" },
  NDIA: { ticker: "NDIA", name: "iShares MSCI India UCITS ETF", category: "country", geography: "india", is_broad_market: false, exchange: "LSE", currency: "USD" },
  CMOD: { ticker: "CMOD", name: "iShares Diversified Commodity Swap UCITS ETF", category: "commodity", geography: "global", is_broad_market: false, exchange: "LSE", currency: "USD" },
  IGLN: { ticker: "IGLN", name: "iShares Physical Gold ETC", category: "gold", geography: "global", is_broad_market: false, exchange: "LSE", currency: "USD" },
  EIMI: { ticker: "EIMI", name: "iShares Core MSCI EM IMI UCITS ETF (USD Acc)", category: "equity", geography: "emerging", is_broad_market: true, exchange: "LSE", currency: "USD" },
  COPX: { ticker: "COPX", name: "Global X Copper Miners ETF", category: "commodity", geography: "global", is_broad_market: false, exchange: "NYSE", currency: "USD" },
  IJPA: { ticker: "IJPA", name: "iShares MSCI Japan UCITS ETF (USD Acc)", category: "country", geography: "japan", is_broad_market: false, exchange: "LSE", currency: "USD" },
  IMEU: { ticker: "IMEU", name: "iShares Core MSCI Europe UCITS ETF (EUR Acc)", category: "equity", geography: "europe", is_broad_market: true, exchange: "LSE", currency: "EUR" },
  IB01: { ticker: "IB01", name: "iShares USD Treasury Bond 0-1yr UCITS ETF", category: "bond", geography: "us", is_broad_market: false, exchange: "LSE", currency: "USD" },
  CBUX: { ticker: "CBUX", name: "iShares Global Infrastructure UCITS ETF (USD Acc)", category: "theme", geography: "global", is_broad_market: false, exchange: "XETRA", currency: "USD" },
  XDWH: { ticker: "XDWH", name: "Xtrackers MSCI World Health Care UCITS ETF", category: "theme", geography: "global", is_broad_market: false, exchange: "XETRA", currency: "EUR" },

  // === POPULAR UCITS ETFs (Europe/LSE/XETRA) ===
  VWCE: { ticker: "VWCE", name: "Vanguard FTSE All-World UCITS ETF (EUR Acc)", category: "equity", geography: "global", is_broad_market: true, exchange: "XETRA", currency: "EUR" },
  IWDA: { ticker: "IWDA", name: "iShares Core MSCI World UCITS ETF (USD Acc)", category: "equity", geography: "global", is_broad_market: true, exchange: "LSE", currency: "USD" },
  SWDA: { ticker: "SWDA", name: "iShares Core MSCI World UCITS ETF (USD Acc)", category: "equity", geography: "global", is_broad_market: true, exchange: "LSE", currency: "USD" },
  AGGG: { ticker: "AGGG", name: "iShares Core Global Aggregate Bond UCITS ETF", category: "bond", geography: "global", is_broad_market: true, exchange: "LSE", currency: "USD" },
  ISAC: { ticker: "ISAC", name: "iShares MSCI ACWI UCITS ETF (USD Acc)", category: "equity", geography: "global", is_broad_market: true, exchange: "LSE", currency: "USD" },
  IUSQ: { ticker: "IUSQ", name: "iShares MSCI ACWI UCITS ETF (USD Acc)", category: "equity", geography: "global", is_broad_market: true, exchange: "XETRA", currency: "EUR" },
  VUAA: { ticker: "VUAA", name: "Vanguard S&P 500 UCITS ETF (USD Acc)", category: "equity", geography: "us", is_broad_market: true, exchange: "LSE", currency: "USD" },
  VUSA: { ticker: "VUSA", name: "Vanguard S&P 500 UCITS ETF (USD Dist)", category: "equity", geography: "us", is_broad_market: true, exchange: "LSE", currency: "USD" },
  VMID: { ticker: "VMID", name: "Vanguard FTSE 250 UCITS ETF", category: "equity", geography: "uk", is_broad_market: false, exchange: "LSE", currency: "GBP" },
  VFEM: { ticker: "VFEM", name: "Vanguard FTSE Emerging Markets UCITS ETF", category: "equity", geography: "emerging", is_broad_market: true, exchange: "LSE", currency: "USD" },
  INFR: { ticker: "INFR", name: "iShares Global Infrastructure UCITS ETF (USD Dist)", category: "theme", geography: "global", is_broad_market: false, exchange: "LSE", currency: "USD" },
  IQQI: { ticker: "IQQI", name: "iShares Global Infrastructure UCITS ETF (USD Dist)", category: "theme", geography: "global", is_broad_market: false, exchange: "XETRA", currency: "EUR" },
  IUIT: { ticker: "IUIT", name: "iShares S&P 500 IT Sector UCITS ETF", category: "theme", geography: "us", is_broad_market: false, exchange: "LSE", currency: "USD" },
  INRG: { ticker: "INRG", name: "iShares Global Clean Energy UCITS ETF", category: "theme", geography: "global", is_broad_market: false, exchange: "LSE", currency: "USD" },
  SGLN: { ticker: "SGLN", name: "iShares Physical Gold ETC", category: "gold", geography: "global", is_broad_market: false, exchange: "LSE", currency: "GBP" },
  PHAU: { ticker: "PHAU", name: "WisdomTree Physical Gold", category: "gold", geography: "global", is_broad_market: false, exchange: "LSE", currency: "USD" },
  LQDA: { ticker: "LQDA", name: "iShares USD Corporate Bond UCITS ETF", category: "bond", geography: "us", is_broad_market: false, exchange: "LSE", currency: "USD" },
  XDWD: { ticker: "XDWD", name: "Xtrackers MSCI World UCITS ETF", category: "equity", geography: "global", is_broad_market: true, exchange: "XETRA", currency: "EUR" },
  XDEM: { ticker: "XDEM", name: "Xtrackers MSCI Emerging Markets UCITS ETF", category: "equity", geography: "emerging", is_broad_market: true, exchange: "XETRA", currency: "EUR" },

  // === POPULAR US-LISTED ETFs ===
  SPY: { ticker: "SPY", name: "SPDR S&P 500 ETF Trust", category: "equity", geography: "us", is_broad_market: true, exchange: "NYSE", currency: "USD" },
  QQQ: { ticker: "QQQ", name: "Invesco QQQ Trust", category: "equity", geography: "us", is_broad_market: true, exchange: "NASDAQ", currency: "USD" },
  VTI: { ticker: "VTI", name: "Vanguard Total Stock Market ETF", category: "equity", geography: "us", is_broad_market: true, exchange: "NYSE", currency: "USD" },
  VOO: { ticker: "VOO", name: "Vanguard S&P 500 ETF", category: "equity", geography: "us", is_broad_market: true, exchange: "NYSE", currency: "USD" },
  IVV: { ticker: "IVV", name: "iShares Core S&P 500 ETF", category: "equity", geography: "us", is_broad_market: true, exchange: "NYSE", currency: "USD" },
  VEA: { ticker: "VEA", name: "Vanguard FTSE Developed Markets ETF", category: "equity", geography: "global", is_broad_market: true, exchange: "NYSE", currency: "USD" },
  VWO: { ticker: "VWO", name: "Vanguard FTSE Emerging Markets ETF", category: "equity", geography: "emerging", is_broad_market: true, exchange: "NYSE", currency: "USD" },
  EEM: { ticker: "EEM", name: "iShares MSCI Emerging Markets ETF", category: "equity", geography: "emerging", is_broad_market: true, exchange: "NYSE", currency: "USD" },
  IEMG: { ticker: "IEMG", name: "iShares Core MSCI Emerging Markets ETF", category: "equity", geography: "emerging", is_broad_market: true, exchange: "NYSE", currency: "USD" },
  GLD: { ticker: "GLD", name: "SPDR Gold Trust", category: "gold", geography: "global", is_broad_market: false, exchange: "NYSE", currency: "USD" },
  SLV: { ticker: "SLV", name: "iShares Silver Trust", category: "commodity", geography: "global", is_broad_market: false, exchange: "NYSE", currency: "USD" },
  TLT: { ticker: "TLT", name: "iShares 20+ Year Treasury Bond ETF", category: "bond", geography: "us", is_broad_market: false, exchange: "NASDAQ", currency: "USD" },
  HYG: { ticker: "HYG", name: "iShares iBoxx High Yield Corporate Bond ETF", category: "bond", geography: "us", is_broad_market: false, exchange: "NYSE", currency: "USD" },
  LQD: { ticker: "LQD", name: "iShares iBoxx Investment Grade Corporate Bond ETF", category: "bond", geography: "us", is_broad_market: false, exchange: "NYSE", currency: "USD" },
  ARKK: { ticker: "ARKK", name: "ARK Innovation ETF", category: "theme", geography: "us", is_broad_market: false, exchange: "NYSE", currency: "USD" },
  SCHD: { ticker: "SCHD", name: "Schwab US Dividend Equity ETF", category: "equity", geography: "us", is_broad_market: false, exchange: "NYSE", currency: "USD" },
  JEPI: { ticker: "JEPI", name: "JPMorgan Equity Premium Income ETF", category: "equity", geography: "us", is_broad_market: false, exchange: "NYSE", currency: "USD" },
  VGK: { ticker: "VGK", name: "Vanguard FTSE Europe ETF", category: "equity", geography: "europe", is_broad_market: true, exchange: "NYSE", currency: "USD" },
  EWJ: { ticker: "EWJ", name: "iShares MSCI Japan ETF", category: "country", geography: "japan", is_broad_market: false, exchange: "NYSE", currency: "USD" },
  INDA: { ticker: "INDA", name: "iShares MSCI India ETF", category: "country", geography: "india", is_broad_market: false, exchange: "NASDAQ", currency: "USD" },
  EWZ: { ticker: "EWZ", name: "iShares MSCI Brazil ETF", category: "country", geography: "brazil", is_broad_market: false, exchange: "NYSE", currency: "USD" },
  FXI: { ticker: "FXI", name: "iShares China Large-Cap ETF", category: "country", geography: "china", is_broad_market: false, exchange: "NYSE", currency: "USD" },
  DBA: { ticker: "DBA", name: "Invesco DB Agriculture Fund", category: "commodity", geography: "global", is_broad_market: false, exchange: "NYSE", currency: "USD" },
  USO: { ticker: "USO", name: "United States Oil Fund", category: "commodity", geography: "global", is_broad_market: false, exchange: "NYSE", currency: "USD" },
  XLE: { ticker: "XLE", name: "Energy Select Sector SPDR Fund", category: "theme", geography: "us", is_broad_market: false, exchange: "NYSE", currency: "USD" },
  XLK: { ticker: "XLK", name: "Technology Select Sector SPDR Fund", category: "theme", geography: "us", is_broad_market: false, exchange: "NYSE", currency: "USD" },
  XLF: { ticker: "XLF", name: "Financial Select Sector SPDR Fund", category: "theme", geography: "us", is_broad_market: false, exchange: "NYSE", currency: "USD" },
  XLV: { ticker: "XLV", name: "Health Care Select Sector SPDR Fund", category: "theme", geography: "us", is_broad_market: false, exchange: "NYSE", currency: "USD" },
};

// Helper: check if ticker is a known ETF
export function isKnownETF(ticker: string): boolean {
  return ticker.toUpperCase() in KNOWN_ETFS;
}

// Helper: get ETF info
export function getETFInfo(ticker: string): ETFInfo | null {
  return KNOWN_ETFS[ticker.toUpperCase()] || null;
}

// ============================================================
// S&P 500 STOCKS — for ticker validation and name lookup
// ============================================================

export const SP500_STOCKS: Record<string, string> = {
  AAPL: "Apple Inc.",
  ABBV: "AbbVie Inc.",
  ABT: "Abbott Laboratories",
  ACN: "Accenture plc",
  ADBE: "Adobe Inc.",
  ADI: "Analog Devices Inc.",
  ADP: "Automatic Data Processing",
  ADSK: "Autodesk Inc.",
  AEP: "American Electric Power",
  AIG: "American International Group",
  AMAT: "Applied Materials Inc.",
  AMD: "Advanced Micro Devices",
  AMGN: "Amgen Inc.",
  AMZN: "Amazon.com Inc.",
  ANET: "Arista Networks Inc.",
  APH: "Amphenol Corporation",
  APP: "AppLovin Corporation",
  ARES: "Ares Management Corporation",
  AVGO: "Broadcom Inc.",
  AXP: "American Express Company",
  BA: "Boeing Company",
  BAC: "Bank of America Corp.",
  BK: "Bank of New York Mellon",
  BKNG: "Booking Holdings Inc.",
  BLK: "BlackRock Inc.",
  BMY: "Bristol-Myers Squibb",
  BRK_B: "Berkshire Hathaway Inc.",
  BSX: "Boston Scientific Corp.",
  BX: "Blackstone Inc.",
  C: "Citigroup Inc.",
  CAT: "Caterpillar Inc.",
  CHTR: "Charter Communications",
  CL: "Colgate-Palmolive Co.",
  CMCSA: "Comcast Corporation",
  CME: "CME Group Inc.",
  COP: "ConocoPhillips",
  COST: "Costco Wholesale Corp.",
  CRM: "Salesforce Inc.",
  CRWD: "CrowdStrike Holdings",
  CSCO: "Cisco Systems Inc.",
  CTAS: "Cintas Corporation",
  CVS: "CVS Health Corporation",
  CVX: "Chevron Corporation",
  DASH: "DoorDash Inc.",
  DE: "Deere & Company",
  DHR: "Danaher Corporation",
  DIS: "Walt Disney Company",
  DUK: "Duke Energy Corporation",
  ECL: "Ecolab Inc.",
  EMR: "Emerson Electric Co.",
  ENPH: "Enphase Energy Inc.",
  EOG: "EOG Resources Inc.",
  EQIX: "Equinix Inc.",
  ETN: "Eaton Corporation",
  EW: "Edwards Lifesciences",
  F: "Ford Motor Company",
  FDX: "FedEx Corporation",
  FI: "Fiserv Inc.",
  GD: "General Dynamics Corp.",
  GE: "General Electric Co.",
  GEV: "GE Vernova Inc.",
  GILD: "Gilead Sciences Inc.",
  GM: "General Motors Company",
  GOOG: "Alphabet Inc. (Class C)",
  GOOGL: "Alphabet Inc. (Class A)",
  GS: "Goldman Sachs Group",
  HD: "Home Depot Inc.",
  HON: "Honeywell International",
  IBM: "International Business Machines",
  ICE: "Intercontinental Exchange",
  INTC: "Intel Corporation",
  INTU: "Intuit Inc.",
  ISRG: "Intuitive Surgical Inc.",
  JNJ: "Johnson & Johnson",
  JPM: "JPMorgan Chase & Co.",
  KHC: "Kraft Heinz Company",
  KLAC: "KLA Corporation",
  KO: "Coca-Cola Company",
  LIN: "Linde plc",
  LLY: "Eli Lilly and Company",
  LMT: "Lockheed Martin Corp.",
  LOW: "Lowe's Companies Inc.",
  LRCX: "Lam Research Corp.",
  MA: "Mastercard Incorporated",
  MCD: "McDonald's Corporation",
  MCO: "Moody's Corporation",
  MDLZ: "Mondelez International",
  MDT: "Medtronic plc",
  MET: "MetLife Inc.",
  META: "Meta Platforms Inc.",
  MMM: "3M Company",
  MO: "Altria Group Inc.",
  MRK: "Merck & Co. Inc.",
  MS: "Morgan Stanley",
  MSFT: "Microsoft Corporation",
  MU: "Micron Technology Inc.",
  NEE: "NextEra Energy Inc.",
  NFLX: "Netflix Inc.",
  NKE: "Nike Inc.",
  NOW: "ServiceNow Inc.",
  NSC: "Norfolk Southern Corp.",
  NVDA: "NVIDIA Corporation",
  ORCL: "Oracle Corporation",
  PANW: "Palo Alto Networks",
  PEP: "PepsiCo Inc.",
  PFE: "Pfizer Inc.",
  PG: "Procter & Gamble Co.",
  PGR: "Progressive Corporation",
  PLTR: "Palantir Technologies",
  PM: "Philip Morris International",
  PYPL: "PayPal Holdings Inc.",
  QCOM: "QUALCOMM Incorporated",
  REGN: "Regeneron Pharmaceuticals",
  ROP: "Roper Technologies",
  RTX: "RTX Corporation",
  SBUX: "Starbucks Corporation",
  SCHW: "Charles Schwab Corp.",
  SHW: "Sherwin-Williams Co.",
  SNOW: "Snowflake Inc.",
  SO: "Southern Company",
  SPGI: "S&P Global Inc.",
  SYK: "Stryker Corporation",
  T: "AT&T Inc.",
  TGT: "Target Corporation",
  TJX: "TJX Companies Inc.",
  TMO: "Thermo Fisher Scientific",
  TMUS: "T-Mobile US Inc.",
  TSLA: "Tesla Inc.",
  TXN: "Texas Instruments Inc.",
  UNH: "UnitedHealth Group",
  UNP: "Union Pacific Corporation",
  UPS: "United Parcel Service",
  V: "Visa Inc.",
  VRTX: "Vertex Pharmaceuticals",
  VZ: "Verizon Communications",
  WFC: "Wells Fargo & Company",
  WM: "Waste Management Inc.",
  WMT: "Walmart Inc.",
  XOM: "Exxon Mobil Corporation",
  ZTS: "Zoetis Inc.",
};

// Helper: check if ticker is a known S&P 500 stock
export function isKnownStock(ticker: string): boolean {
  return ticker.toUpperCase() in SP500_STOCKS;
}

// Helper: get stock name
export function getStockName(ticker: string): string | null {
  return SP500_STOCKS[ticker.toUpperCase()] || null;
}

// ============================================================
// COMBINED LOOKUP — for screenshot extraction validation
// ============================================================

export interface TickerLookupResult {
  ticker: string;
  name: string;
  type: "stock" | "etf";
  category?: string;
  exchange?: string;
  currency?: string;
}

export function lookupTicker(ticker: string): TickerLookupResult | null {
  const upper = ticker.toUpperCase();
  
  const etf = KNOWN_ETFS[upper];
  if (etf) {
    return {
      ticker: etf.ticker,
      name: etf.name,
      type: "etf",
      category: etf.category,
      exchange: etf.exchange,
      currency: etf.currency,
    };
  }
  
  const stock = SP500_STOCKS[upper];
  if (stock) {
    return {
      ticker: upper,
      name: stock,
      type: "stock",
      category: "equity",
    };
  }
  
  return null;
}

// Generate a compact string of all known tickers for AI prompts
export function getKnownTickersForPrompt(): string {
  const etfTickers = Object.keys(KNOWN_ETFS).join(", ");
  const stockTickers = Object.keys(SP500_STOCKS).join(", ");
  return `Known ETF tickers: ${etfTickers}\n\nKnown stock tickers (S&P 500): ${stockTickers}`;
}
