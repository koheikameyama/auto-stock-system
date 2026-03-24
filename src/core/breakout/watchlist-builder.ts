/**
 * ウォッチリストビルダー
 *
 * 8:00AMに実行し、場中のブレイクアウトスキャナーが監視する候補銘柄リストを生成する。
 * スコアリングやAIレビューは行わない。
 *
 * フロー:
 *   1. DB全銘柄 + OHLCVデータ一括取得
 *   2. checkGates() でゲート判定
 *   3. weeklyClose < weeklySma13 の銘柄を除外（落ちるナイフ回避）
 *   4. high20 / avgVolume25 / atr14 を算出
 *   5. WatchlistEntry[] を返す
 */

import { prisma } from "../../lib/prisma";
import { TECHNICAL_MIN_DATA } from "../../lib/constants";
import { readHistoricalFromDB } from "../market-data";
import { analyzeTechnicals } from "../technical-analysis";
import { checkGates } from "../scoring/gates";
import { computeScoringIntermediates } from "../scoring/intermediates";
import { BREAKOUT } from "../../lib/constants/breakout";
import type { WatchlistEntry } from "./types";

/**
 * 直近 N 営業日の日足 high の最大値を計算する
 * @param data OHLCVデータ（newest-first）
 * @param days 遡る日数
 */
function computeHigh(data: { high: number }[], days: number): number | null {
  const slice = data.slice(0, days);
  if (slice.length === 0) return null;
  return Math.max(...slice.map((d) => d.high));
}

/**
 * 直近 N 日の平均出来高を計算する
 * @param data OHLCVデータ（newest-first）
 * @param days 平均を取る日数
 */
function computeAvgVolume(data: { volume: number }[], days: number): number | null {
  const slice = data.slice(0, days);
  if (slice.length === 0) return null;
  return slice.reduce((sum, d) => sum + d.volume, 0) / slice.length;
}

/**
 * ウォッチリストを構築する
 *
 * 基本フィルター（ゲート）と週足下降トレンドチェックを通過した銘柄を返す。
 */
export async function buildWatchlist(): Promise<WatchlistEntry[]> {
  // 1. DB全銘柄取得（廃止・制限なし）
  const stocks = await prisma.stock.findMany({
    where: {
      isDelisted: false,
      isActive: true,
      isRestricted: false,
      tradingHaltFlag: false,
      delistingDate: null,
    },
    select: {
      tickerCode: true,
      latestPrice: true,
      latestVolume: true,
      nextEarningsDate: true,
      exDividendDate: true,
    },
  });

  if (stocks.length === 0) return [];

  const allTickerCodes = stocks.map((s) => s.tickerCode);

  // 2. OHLCVデータを一括取得（DBから）
  const historicalMap = await readHistoricalFromDB(allTickerCodes);

  const today = new Date();
  const entries: WatchlistEntry[] = [];

  for (const stock of stocks) {
    try {
      const historical = historicalMap.get(stock.tickerCode);
      if (!historical || historical.length < TECHNICAL_MIN_DATA.SCANNER_MIN_BARS) {
        continue;
      }

      // 3. テクニカル分析（ATR・avgVolume計算に必要）
      const summary = analyzeTechnicals(historical);

      // avgVolume25 は直近25日の出来高平均
      const avgVolume25 = computeAvgVolume(historical, 25);

      // ATR%（ゲートチェック用）
      const latestPrice = stock.latestPrice != null ? Number(stock.latestPrice) : summary.currentPrice;
      const atrPct =
        summary.atr14 != null && latestPrice > 0
          ? (summary.atr14 / latestPrice) * 100
          : null;

      // 4. checkGates() でゲート判定
      const gate = checkGates({
        latestPrice,
        avgVolume25,
        atrPct,
        nextEarningsDate: stock.nextEarningsDate ?? null,
        exDividendDate: stock.exDividendDate ?? null,
        today,
      });

      if (!gate.passed) continue;

      // 5. 週足下降トレンドチェック（checkGates には含まれていないため個別チェック）
      const intermediates = computeScoringIntermediates(historical);
      const { weeklyClose, weeklySma13 } = intermediates;

      if (weeklySma13 != null && weeklyClose != null && weeklyClose < weeklySma13) {
        continue;
      }

      // 6. high20 = 直近 HIGH_LOOKBACK_DAYS 日の high の最大値
      const high20 = computeHigh(historical, BREAKOUT.PRICE.HIGH_LOOKBACK_DAYS);
      if (high20 == null) continue;

      // atr14 が null の場合はスキップ
      if (summary.atr14 == null) continue;

      // avgVolume25 が null の場合はスキップ
      if (avgVolume25 == null) continue;

      entries.push({
        ticker: stock.tickerCode,
        avgVolume25,
        high20,
        atr14: summary.atr14,
        latestClose: summary.currentPrice,
      });
    } catch (error) {
      console.error(`[watchlist-builder] 処理エラー: ${stock.tickerCode}`, error);
    }
  }

  return entries;
}
