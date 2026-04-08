/**
 * マーケットデータプロバイダー
 *
 * - リアルタイムクォート: 立花証券API → 失敗時 yfinance にフォールバック
 * - ヒストリカル・市場指標・ニュース等: yfinance
 */

import {
  tachibanaFetchQuote,
  tachibanaFetchQuotesBatch,
} from "./tachibana-price-client";
import {
  yfFetchQuote,
  yfFetchQuotesBatch,
  yfFetchHistorical,
  yfFetchHistoricalRange,
  yfFetchHistoricalBatch,
  yfFetchMarket,
  yfFetchEvents,
  yfFetchNews,
  type YfQuoteResult,
  type YfOHLCVBar,
  type YfMarketData,
  type YfCorporateEvents,
  type YfNewsItem,
} from "./yfinance-client";

// ========================================
// 公開 API
// ========================================

/**
 * 個別銘柄のクォートを取得
 * 立花証券API → 失敗時 yfinance にフォールバック
 */
export async function providerFetchQuote(symbol: string): Promise<YfQuoteResult> {
  try {
    return await tachibanaFetchQuote(symbol);
  } catch (error) {
    console.warn(
      `[market-data-provider] 立花API失敗、yfinanceにフォールバック (${symbol}):`,
      error instanceof Error ? error.message : error,
    );
    return yfFetchQuote(symbol);
  }
}

/**
 * 複数銘柄のクォートをバッチ取得
 * 立花証券API → 全銘柄失敗時 yfinance にフォールバック
 * 個別銘柄の失敗は立花APIレベルで null になるため、null の銘柄を yfinance で補完する
 */
export async function providerFetchQuotesBatch(
  symbols: string[],
): Promise<(YfQuoteResult | null)[]> {
  let results: (YfQuoteResult | null)[];

  try {
    results = await tachibanaFetchQuotesBatch(symbols);
  } catch (error) {
    // 全銘柄失敗 → yfinance バッチで取得
    console.warn(
      `[market-data-provider] 立花APIバッチ全失敗、yfinanceにフォールバック:`,
      error instanceof Error ? error.message : error,
    );
    return yfFetchQuotesBatch(symbols);
  }

  // 立花APIで null だった銘柄を yfinance で個別補完
  const nullIndices = results
    .map((r, i) => (r === null ? i : -1))
    .filter((i) => i >= 0);

  if (nullIndices.length > 0) {
    console.warn(
      `[market-data-provider] 立花APIで${nullIndices.length}銘柄失敗、yfinanceで補完`,
    );
    const fallbackSymbols = nullIndices.map((i) => symbols[i]);
    try {
      const fallbackResults = await yfFetchQuotesBatch(fallbackSymbols);
      for (let j = 0; j < nullIndices.length; j++) {
        results[nullIndices[j]] = fallbackResults[j];
      }
    } catch (yfError) {
      console.warn(
        `[market-data-provider] yfinanceバッチ補完も失敗:`,
        yfError instanceof Error ? yfError.message : yfError,
      );
    }
  }

  return results;
}

/**
 * ヒストリカル OHLCV データを取得（日数指定）
 */
export async function providerFetchHistorical(
  symbol: string,
  days: number,
): Promise<YfOHLCVBar[]> {
  return yfFetchHistorical(symbol, days);
}

/**
 * ヒストリカル OHLCV データを取得（期間指定、バックテスト用）
 */
export async function providerFetchHistoricalRange(
  symbol: string,
  start: string,
  end: string,
): Promise<YfOHLCVBar[]> {
  return yfFetchHistoricalRange(symbol, start, end);
}

/**
 * 複数銘柄のヒストリカルデータをバッチ取得（yf.download 一括）
 */
export async function providerFetchHistoricalBatch(
  symbols: string[],
  start: string,
  end: string,
): Promise<Record<string, YfOHLCVBar[]>> {
  return yfFetchHistoricalBatch(symbols, start, end);
}

/**
 * 市場指標データを一括取得
 */
export async function providerFetchMarket(): Promise<YfMarketData> {
  return yfFetchMarket();
}

/**
 * コーポレートイベント情報を取得
 */
export async function providerFetchEvents(
  symbol: string,
): Promise<YfCorporateEvents> {
  return yfFetchEvents(symbol);
}

/**
 * ニュース検索
 */
export async function providerFetchNews(
  query: string,
  newsCount: number,
): Promise<YfNewsItem[]> {
  return yfFetchNews(query, newsCount);
}
