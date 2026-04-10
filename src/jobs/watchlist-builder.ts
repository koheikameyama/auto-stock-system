/**
 * ウォッチリストビルダージョブ（8:00 JST / 平日）
 *
 * 朝8:00に実行し、場中のブレイクアウトスキャナーが監視する候補銘柄リストを構築する。
 * 結果はDBに永続化し、breakout-monitorジョブ・Web UIから参照される。
 */

import dayjs from "dayjs";
import { buildWatchlist } from "../core/breakout/watchlist-builder";
import { notifySlack } from "../lib/slack";
import { prisma } from "../lib/prisma";
import { getTodayForDB } from "../lib/market-date";
import { BREAKOUT } from "../lib/constants/breakout";
import type { WatchlistEntry } from "../core/breakout/types";

// インメモリキャッシュ（breakout-monitorの毎分DB読み込みを抑制）
let cachedWatchlist: WatchlistEntry[] | null = null;
let cacheExpiry = 0;

/**
 * 現在のウォッチリストを取得する（DB読み込み + インメモリキャッシュ）
 */
export async function getWatchlist(): Promise<WatchlistEntry[]> {
  const now = dayjs().valueOf();
  if (cachedWatchlist !== null && now < cacheExpiry) {
    return cachedWatchlist;
  }

  const today = getTodayForDB();
  const rows = await prisma.breakoutWatchlistEntry.findMany({
    where: { date: today },
  });

  const entries: WatchlistEntry[] = rows.map((r) => ({
    ticker: r.tickerCode,
    avgVolume25: r.avgVolume25,
    high20: r.high20,
    atr14: r.atr14,
    latestClose: r.latestClose,
    weeklyHigh13: r.weeklyHigh13 ?? undefined,
  }));

  cachedWatchlist = entries;
  cacheExpiry = now + BREAKOUT.WATCHLIST_CACHE_TTL_MS;
  return entries;
}

/**
 * ウォッチリストをDBに保存する（日次スナップショット: delete+createMany）
 */
async function saveWatchlistToDB(entries: WatchlistEntry[]): Promise<void> {
  const today = getTodayForDB();

  await prisma.breakoutWatchlistEntry.deleteMany({ where: { date: today } });

  if (entries.length > 0) {
    await prisma.breakoutWatchlistEntry.createMany({
      data: entries.map((e) => ({
        date: today,
        tickerCode: e.ticker,
        avgVolume25: e.avgVolume25,
        high20: e.high20,
        atr14: e.atr14,
        latestClose: e.latestClose,
        weeklyHigh13: e.weeklyHigh13 ?? null,
      })),
    });
  }

  // キャッシュを即時更新
  cachedWatchlist = entries;
  cacheExpiry = dayjs().add(BREAKOUT.WATCHLIST_CACHE_TTL_MS, "millisecond").valueOf();
}

export async function main(): Promise<void> {
  console.log("=== Watchlist Builder 開始 ===");

  try {
    const { entries, stats } = await buildWatchlist();
    await saveWatchlistToDB(entries);
    console.log(`ウォッチリスト構築完了: ${entries.length}銘柄`);

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

const isDirectRun = process.argv[1]?.includes("watchlist-builder");
if (isDirectRun) {
  main()
    .catch((error) => {
      console.error("Watchlist Builder エラー:", error);
      process.exit(1);
    })
    .finally(async () => {
      await prisma.$disconnect();
    });
}
