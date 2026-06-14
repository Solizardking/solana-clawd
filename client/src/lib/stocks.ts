export type StockRange = "1D" | "5D" | "1M" | "3M" | "1Y";

export type StockQuote = {
  price: number;
  confidence: number;
  confidencePercent: number | null;
  expo: number;
  publishTime: number;
  ageSeconds: number;
  emaPrice: number | null;
  slot: number | null;
  proofAvailableTime: number | null;
};

export type StockSession = {
  session: "regular" | "pre" | "post" | "overnight";
  feedId: string;
  ticker: string;
  displaySymbol: string;
  schedule?: string | null;
  publishInterval?: string | null;
  description?: string;
  quote: StockQuote | null;
};

export type StockSearchItem = {
  symbol: string;
  name: string;
  description: string;
  country: string | null;
  sessions: Array<{
    session: StockSession["session"];
    feedId: string;
    ticker: string;
    displaySymbol: string;
    schedule?: string | null;
  }>;
};

export type StocksStatus = {
  configured: boolean;
  apiKeyConfigured: boolean;
  usingAuthenticatedHermes: boolean;
  hermesBase: string;
  benchmarksBase: string;
  upgradeCutoverDate: string;
  featuredSymbols: string[];
  spacexIpoSymbols: string[];
  financialDatasets: FinancialDatasetsStatus;
  massive: MassiveStatus;
};

export type FeaturedStock = {
  symbol: string;
  name: string;
  description: string;
  country: string | null;
  active: {
    session: StockSession["session"];
    feedId: string;
    ticker: string;
    displaySymbol: string;
    quote: StockQuote | null;
  } | null;
  changePercent: number | null;
  sparkline: number[];
  sessions: StockSession[];
};

export type StocksFeaturedResponse = {
  updatedAt: string;
  items: FeaturedStock[];
};

export type StockHistoryPoint = {
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume?: number | null;
  vwap?: number | null;
  transactions?: number | null;
};

export type StockAsset = {
  symbol: string;
  name: string;
  description: string;
  country: string | null;
  active: {
    session: StockSession["session"];
    feedId: string;
    ticker: string;
    displaySymbol: string;
    quote: StockQuote | null;
  } | null;
  history: {
    ticker: string;
    range: StockRange;
    resolution: string;
    points: StockHistoryPoint[];
    source?: "pyth" | "massive" | string;
  };
  changePercent: number | null;
  sessions: StockSession[];
  providerIssues?: {
    pyth: string[];
    massive: string[];
  };
  massive?: MassiveAsset;
};

export type ProviderDoc = {
  label: string;
  url: string;
  use: string;
};

export type ProviderEndpoint = {
  name: string;
  method: string;
  path: string;
  params: string;
};

export type MassiveStatus = {
  configured: boolean;
  base: string;
  authMode: string;
  docs: ProviderDoc[];
  endpoints: ProviderEndpoint[];
};

export type MassiveTickerDetails = {
  ticker: string | null;
  name: string | null;
  description: string | null;
  market: string | null;
  locale: string | null;
  primaryExchange: string | null;
  currencyName: string | null;
  type: string | null;
  active: boolean | null;
  marketCap: number | null;
  listDate: string | null;
  sicCode: string | null;
  sicDescription: string | null;
  totalEmployees: number | null;
  homepageUrl: string | null;
  logoUrl: string | null;
  iconUrl: string | null;
  cik: string | null;
  compositeFigi: string | null;
  shareClassFigi: string | null;
  lastUpdatedUtc: string | null;
};

export type MassiveTrade = {
  price: number | null;
  size: number | null;
  exchange: number | null;
  timestamp: string | null;
  conditions: unknown[];
  id: string | null;
  tape: number | null;
};

export type MassiveQuote = {
  bid: number | null;
  bidSize: number | null;
  ask: number | null;
  askSize: number | null;
  bidExchange: number | null;
  askExchange: number | null;
  timestamp: string | null;
};

export type MassiveDayBar = {
  open: number | null;
  high: number | null;
  low: number | null;
  close: number | null;
  volume: number | null;
  vwap: number | null;
  timestamp: string | null;
  transactions: number | null;
};

export type MassiveSnapshot = {
  ticker: string | null;
  updatedAt: string | null;
  day: MassiveDayBar | null;
  prevDay: MassiveDayBar | null;
  minute: MassiveDayBar | null;
  lastTrade: MassiveTrade | null;
  lastQuote: MassiveQuote | null;
  latestPrice: number | null;
  todaysChange: number | null;
  todaysChangePercent: number | null;
  volume: number | null;
};

export type MassiveIndicatorPoint = {
  time: number;
  value: number;
};

export type MassiveNewsItem = {
  title: string;
  summary: string | null;
  source: string | null;
  url: string | null;
  imageUrl: string | null;
  tickers: string[];
  publishedAt: string | null;
};

export type MassiveAsset = MassiveStatus & {
  tickerTypes: {
    count: number | null;
    results: Array<{
      code: string | null;
      description: string | null;
      assetClass: string | null;
      locale: string | null;
    }>;
  } | null;
  details: MassiveTickerDetails | null;
  snapshot: MassiveSnapshot | null;
  lastTrade: MassiveTrade | null;
  aggregates: {
    ticker: string | null;
    range: StockRange;
    adjusted: boolean | null;
    queryCount: number | null;
    resultsCount: number | null;
    multiplier: number | null;
    timespan: string | null;
    points: StockHistoryPoint[];
  };
  indicators: {
    values: {
      sma20: MassiveIndicatorPoint[];
      sma50: MassiveIndicatorPoint[];
      ema20: MassiveIndicatorPoint[];
      rsi14: MassiveIndicatorPoint[];
    };
    accessIssues: string[];
  };
  news: MassiveNewsItem[];
  accessIssues: string[];
};

export type FinancialDatasetsDoc = {
  label: string;
  url: string;
  use: string;
};

export type FinancialDatasetsEndpoint = {
  name: string;
  method: string;
  path: string;
  params: string;
};

export type FinancialDatasetsStatus = {
  configured: boolean;
  base: string;
  authHeader: string;
  docs: FinancialDatasetsDoc[];
  endpoints: FinancialDatasetsEndpoint[];
};

export type FinancialDatasetsNewsItem = {
  title: string;
  summary: string | null;
  source: string | null;
  url: string | null;
  ticker: string | null;
  publishedAt: string | null;
};

export type FinancialDatasetsFiling = {
  ticker: string | null;
  cik: string | null;
  type: string | null;
  accessionNumber: string | null;
  filingDate: string | null;
  reportDate: string | null;
  url: string | null;
  title: string | null;
};

export type FinancialDatasetsFacts = {
  name: string | null;
  ticker: string | null;
  cik: string | null;
  exchange: string | null;
  industry: string | null;
  sector: string | null;
  website: string | null;
  fiscalYearEnd: string | null;
};

export type FinancialDatasetsMetrics = {
  marketCap: number | null;
  enterpriseValue: number | null;
  revenue: number | null;
  grossProfit: number | null;
  ebitda: number | null;
  eps: number | null;
  priceToSales: number | null;
  priceToEarnings: number | null;
  debtToEquity: number | null;
};

export type FinancialDatasetsPrice = {
  ticker: string | null;
  price: number | null;
  dayChange: number | null;
  dayChangePercent: number | null;
  time: string | null;
  timeMilliseconds: number | null;
};

export type SpaceXIpoComparable = {
  symbol: string;
  name: string;
  lane: string;
  price: FinancialDatasetsPrice | null;
  issue: string | null;
};

export type SpaceXIpoReadiness = {
  key: string;
  label: string;
  status: "live" | "ready" | "configure" | "watching" | string;
  detail: string;
};

export type SpaceXIpoWatch = {
  updatedAt: string;
  company: {
    name: string;
    commonName: string;
    watchSymbols: string[];
    primaryWatchSymbol: string;
    statusNote: string;
  };
  pyth: {
    configured: boolean;
    candidate: {
      symbol: string;
      name: string;
      description: string;
      active: {
        session: StockSession["session"];
        feedId: string;
        ticker: string;
        displaySymbol: string;
        quote: StockQuote | null;
      } | null;
      sessions: StockSession[];
    } | null;
  };
  financialDatasets: FinancialDatasetsStatus;
  facts: FinancialDatasetsFacts | null;
  metrics: FinancialDatasetsMetrics | null;
  filings: FinancialDatasetsFiling[];
  news: {
    limit: number;
    company: FinancialDatasetsNewsItem[];
    market: FinancialDatasetsNewsItem[];
  };
  comparables: SpaceXIpoComparable[];
  readiness: SpaceXIpoReadiness[];
  accessIssues: string[];
  sources: FinancialDatasetsDoc[];
};

export type FinancialDatasetsNewsResponse = {
  configured: boolean;
  ticker: string | null;
  limit: number;
  items: FinancialDatasetsNewsItem[];
  accessIssues: string[];
  source?: FinancialDatasetsDoc;
};

async function getJson<T>(url: string) {
  const response = await fetch(url, {
    credentials: "same-origin",
    headers: { Accept: "application/json" },
  });
  if (!response.ok) {
    const text = await response.text();
    throw new Error(text || `Request failed: ${response.status}`);
  }
  return response.json() as Promise<T>;
}

export function getStocksStatus() {
  return getJson<StocksStatus>("/api/stocks/status");
}

export function getFeaturedStocks() {
  return getJson<StocksFeaturedResponse>("/api/stocks/featured");
}

export function searchStocks(query: string) {
  return getJson<{ query: string; items: StockSearchItem[] }>(`/api/stocks/search?q=${encodeURIComponent(query)}`);
}

export function getStockAsset(symbol: string, range: StockRange) {
  return getJson<StockAsset>(`/api/stocks/asset/${encodeURIComponent(symbol)}?range=${encodeURIComponent(range)}`);
}

export function getMassiveStockAsset(symbol: string, range: StockRange) {
  return getJson<{ symbol: string; range: StockRange; massive: MassiveAsset }>(
    `/api/stocks/massive/${encodeURIComponent(symbol)}?range=${encodeURIComponent(range)}`,
  );
}

export function getSpaceXIpoWatch(limit = 10) {
  return getJson<SpaceXIpoWatch>(`/api/stocks/ipo/spacex?limit=${encodeURIComponent(limit)}`);
}

export function getFinancialDatasetsNews(limit = 10, ticker?: string) {
  const params = new URLSearchParams({ limit: String(limit) });
  if (ticker) params.set("ticker", ticker);
  return getJson<FinancialDatasetsNewsResponse>(`/api/stocks/fd/news?${params.toString()}`);
}
