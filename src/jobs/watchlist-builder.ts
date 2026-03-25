/**
 * ウォッチリストビルダージョブ（8:00 JST / 平日）
 *
 * 朝8:00に実行し、場中のブレイクアウトスキャナーが監視する候補銘柄リストを構築する。
 * 結果はモジュールスコープ変数に保存し、breakout-monitorジョブから参照される。
 */

import { buildWatchlist } from "../core/breakout/watchlist-builder";
import { notifySlack } from "../lib/slack";
import type { WatchlistEntry } from "../core/breakout/types";

let currentWatchlist: WatchlistEntry[] = [];

/**
 * 現在のウォッチリストを取得する
 */
export function getWatchlist(): WatchlistEntry[] {
  return currentWatchlist;
}

export async function main(): Promise<void> {
  console.log("=== Watchlist Builder 開始 ===");

  try {
    const { entries, stats } = await buildWatchlist();
    currentWatchlist = entries;
    console.log(`ウォッチリスト構築完了: ${currentWatchlist.length}銘柄`);

    await notifySlack({
      title: "ウォッチリスト構築完了",
      message:
        `ブレイクアウト監視対象: *${stats.passed}銘柄*\n` +
        `対象: ${stats.totalStocks} → OHLCV: ${stats.historicalLoaded}\n` +
        `データ不足: -${stats.skipInsufficientData} / ゲート落ち: -${stats.skipGate}\n` +
        `週足下降: -${stats.skipWeeklyTrend} / その他: -${stats.skipHigh20 + stats.skipAtr + stats.skipAvgVolume + stats.skipError}`,
      color: "good",
    });
  } catch (err) {
    console.error("[watchlist-builder] エラー:", err);
    await notifySlack({
      title: "ウォッチリスト構築エラー",
      message: err instanceof Error ? err.message : String(err),
      color: "danger",
    });
    throw err;
  }

  console.log("=== Watchlist Builder 終了 ===");
}
