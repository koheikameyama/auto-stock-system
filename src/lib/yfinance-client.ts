/**
 * yfinance サイドカー HTTP クライアント
 *
 * Python FastAPI サイドカーに HTTP リクエストを送り、
 * yfinance 経由で市場データを取得する。
 */

const YFINANCE_URL = process.env.YFINANCE_URL || "http://localhost:8000";
const SIDECAR_SECRET = process.env.SIDECAR_SECRET || "";
const TIMEOUT_MS = 30_000;

// ========================================
// レスポンス型
// ========================================

export interface YfQuoteResult {
  tickerCode: string;
  price: number;
  previousClose: number;
  change: number;
  changePercent: number;
  volume: number;
  high: number;
  low: number;
  open: number;
  per: number | null;
  pbr: number | null;
  eps: number | null;
  marketCap: number | null;
}

export interface YfOHLCVBar {
  date: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

export interface YfIndexQuote {
  price: number;
  previousClose: number;
  change: number;
  changePercent: number;
}

export interface YfMarketData {
  nikkei: YfIndexQuote | null;
  sp500: YfIndexQuote | null;
  vix: YfIndexQuote | null;
  nikkeiVi: YfIndexQuote | null;
  usdjpy: YfIndexQuote | null;
  cmeFutures: YfIndexQuote | null;
}

export interface YfCorporateEvents {
  nextEarningsDate: string | null;
  exDividendDate: string | null;
  dividendPerShare: number | null;
  lastSplitFactor: string | null;
  lastSplitDate: string | null;
}

export interface YfNewsItem {
  title: string;
  link: string;
  providerPublishTime: string | null;
}

// ========================================
// HTTP ヘルパー
// ========================================

async function yfinanceFetch<T>(path: string, options?: RequestInit): Promise<T> {
  const url = `${YFINANCE_URL}${path}`;
  const response = await fetch(url, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...(SIDECAR_SECRET ? { "X-Api-Key": SIDECAR_SECRET } : {}),
      ...options?.headers,
    },
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });

  if (!response.ok) {
    const text = await response.text().catch(() => "");
    throw new Error(`yfinance ${path}: ${response.status} ${text}`);
  }

  return response.json() as Promise<T>;
}

// ========================================
// 公開 API
// ========================================

/**
 * 個別銘柄のクォートを取得
 */
export async function yfFetchQuote(symbol: string): Promise<YfQuoteResult> {
  return yfinanceFetch<YfQuoteResult>(`/quote?symbol=${encodeURIComponent(symbol)}`);
}

/**
 * 複数銘柄のクォートをバッチ取得
 */
export async function yfFetchQuotesBatch(symbols: string[]): Promise<(YfQuoteResult | null)[]> {
  return yfinanceFetch<(YfQuoteResult | null)[]>("/quotes", {
    method: "POST",
    body: JSON.stringify({ symbols }),
  });
}

/**
 * ヒストリカル OHLCV データを取得（日数指定）
 */
export async function yfFetchHistorical(symbol: string, days: number): Promise<YfOHLCVBar[]> {
  return yfinanceFetch<YfOHLCVBar[]>(
    `/historical?symbol=${encodeURIComponent(symbol)}&days=${days}`,
  );
}

/**
 * ヒストリカル OHLCV データを取得（期間指定、バックテスト用）
 */
export async function yfFetchHistoricalRange(
  symbol: string,
  start: string,
  end: string,
): Promise<YfOHLCVBar[]> {
  return yfinanceFetch<YfOHLCVBar[]>("/historical", {
    method: "POST",
    body: JSON.stringify({ symbol, start, end }),
  });
}

/**
 * 市場指標データを一括取得
 */
export async function yfFetchMarket(): Promise<YfMarketData> {
  return yfinanceFetch<YfMarketData>("/market");
}

/**
 * コーポレートイベント情報を取得
 */
export async function yfFetchEvents(symbol: string): Promise<YfCorporateEvents> {
  return yfinanceFetch<YfCorporateEvents>(`/events?symbol=${encodeURIComponent(symbol)}`);
}

/**
 * ニュース検索
 */
export async function yfFetchNews(
  query: string,
  newsCount: number,
): Promise<YfNewsItem[]> {
  const result = await yfinanceFetch<{ news: YfNewsItem[] }>("/search", {
    method: "POST",
    body: JSON.stringify({ query, news_count: newsCount }),
  });
  return result.news;
}

/**
 * ヘルスチェック（サイドカーが起動しているか確認）
 */
export async function yfHealthCheck(): Promise<boolean> {
  try {
    await yfinanceFetch<{ status: string }>("/health");
    return true;
  } catch {
    return false;
  }
}
