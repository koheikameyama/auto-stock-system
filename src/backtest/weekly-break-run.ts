/**
 * 週足レンジブレイク バックテスト実行スクリプト
 *
 * Usage:
 *   npm run backtest:weekly-break
 *   npm run backtest:weekly-break -- --start 2025-04-01 --end 2026-03-25
 *   npm run backtest:weekly-break -- --verbose
 */

import dayjs from "dayjs";
import { prisma } from "../lib/prisma";
import { WEEKLY_BREAK_BACKTEST_DEFAULTS, WEEKLY_BREAK_LARGECAP_PARAMS } from "./weekly-break-config";
import { getMaxBuyablePrice } from "../core/risk-manager";
import { runWeeklyBreakBacktest } from "./weekly-break-simulation";
import { fetchHistoricalFromDB, fetchVixFromDB, fetchIndexFromDB } from "./data-fetcher";
import { calculateCapitalUtilization } from "./metrics";
import type { WeeklyBreakBacktestConfig, PerformanceMetrics } from "./types";
import type { OHLCVData } from "../core/technical-analysis";

function getArg(args: string[], flag: string): string | undefined {
  const idx = args.indexOf(flag);
  return idx >= 0 && idx + 1 < args.length ? args[idx + 1] : undefined;
}

function printResult(result: { metrics: PerformanceMetrics; trades: { exitReason: string | null }[] }, label: string): void {
  const m = result.metrics;
  console.log(`\n=== ${label} ===`);
  console.log(`トレード数: ${m.totalTrades} (勝${m.wins} / 負${m.losses} / 未決済${m.stillOpen})`);
  console.log(`勝率: ${m.winRate.toFixed(1)}%`);
  console.log(`PF: ${m.profitFactor.toFixed(2)}`);
  console.log(`平均勝: +${m.avgWinPct.toFixed(2)}%  平均負: ${m.avgLossPct.toFixed(2)}%`);
  console.log(`期待値: ${m.expectancy >= 0 ? "+" : ""}${m.expectancy.toFixed(2)}%`);
  console.log(`RR比: ${m.riskRewardRatio.toFixed(2)}`);
  console.log(`最大DD: ${m.maxDrawdown.toFixed(1)}%`);
  console.log(`平均保有日数: ${m.avgHoldingDays.toFixed(1)}日`);
  console.log(`総損益: ¥${m.totalPnl.toLocaleString()} (${m.totalReturnPct.toFixed(1)}%)`);
  if (m.totalCommission > 0) {
    console.log(`手数料: ¥${m.totalCommission.toLocaleString()}  税金: ¥${m.totalTax.toLocaleString()}`);
    console.log(`純損益: ¥${m.totalNetPnl.toLocaleString()} (${m.netReturnPct.toFixed(1)}%)`);
  }
}

async function main() {
  const args = process.argv.slice(2);
  const endDate = getArg(args, "--end") ?? dayjs().format("YYYY-MM-DD");
  const startDate = getArg(args, "--start") ?? dayjs(endDate).subtract(12, "month").format("YYYY-MM-DD");
  const budget = Number(getArg(args, "--budget") ?? WEEKLY_BREAK_BACKTEST_DEFAULTS.initialBudget);
  const verbose = args.includes("--verbose");
  const noPositionCap = args.includes("--no-position-cap");
  const largecapPreset = args.includes("--largecap");

  // 個別オーバーライド
  const minMarketCapArg = getArg(args, "--min-market-cap");
  const maxPriceArg = getArg(args, "--max-price");
  const volSurgeArg = getArg(args, "--vol-surge");

  const presetOverrides: Partial<WeeklyBreakBacktestConfig> = largecapPreset ? { ...WEEKLY_BREAK_LARGECAP_PARAMS } : {};
  if (minMarketCapArg !== undefined) presetOverrides.minMarketCap = Number(minMarketCapArg);
  if (maxPriceArg !== undefined) presetOverrides.maxPrice = Number(maxPriceArg);
  if (volSurgeArg !== undefined) presetOverrides.weeklyVolSurgeRatio = Number(volSurgeArg);

  console.log("=".repeat(60));
  console.log(`週足レンジブレイク バックテスト${largecapPreset ? "（大型株プリセット）" : ""}`);
  console.log("=".repeat(60));
  console.log(`期間: ${startDate} → ${endDate}`);
  console.log(`初期資金: ¥${budget.toLocaleString()}`);

  // データ取得（時価総額フィルター付き）
  const effectiveMinMarketCap = presetOverrides.minMarketCap;
  const stocks = await prisma.stock.findMany({
    where: {
      isDelisted: false,
      isActive: true,
      isRestricted: false,
      ...(effectiveMinMarketCap != null ? { marketCap: { gte: effectiveMinMarketCap } } : {}),
    },
    select: { tickerCode: true },
  });
  const tickerCodes = stocks.map((s) => s.tickerCode);
  if (effectiveMinMarketCap != null) {
    console.log(`[data] 時価総額 >= ¥${(effectiveMinMarketCap / 1_000_000_000).toLocaleString()}B: ${tickerCodes.length}銘柄`);
  } else {
    console.log(`[data] ${tickerCodes.length}銘柄のデータ取得中...`);
  }

  const rawData = await fetchHistoricalFromDB(tickerCodes, startDate, endDate);
  const vixData = await fetchVixFromDB(startDate, endDate);
  const indexData = await fetchIndexFromDB("^N225", startDate, endDate);
  console.log(`[data] ${rawData.size}銘柄, VIX ${vixData.size}日, N225 ${indexData.size}日`);

  // 事前フィルタ（maxPriceベース）
  const maxPrice = presetOverrides.maxPrice ?? getMaxBuyablePrice(budget);
  const allData = new Map<string, OHLCVData[]>();
  for (const [ticker, bars] of rawData) {
    if (bars.some((b) => b.close <= maxPrice && b.close > 0)) {
      allData.set(ticker, bars);
    }
  }
  console.log(`[data] ${allData.size}銘柄（価格フィルタ後）`);

  const baseConfig: WeeklyBreakBacktestConfig = {
    ...WEEKLY_BREAK_BACKTEST_DEFAULTS,
    ...presetOverrides,
    startDate,
    endDate,
    initialBudget: budget,
    maxPrice,
    verbose,
    positionCapEnabled: !noPositionCap,
  };

  console.log(`13週高値: ${baseConfig.weeklyHighLookback}週, VolSurge: ${baseConfig.weeklyVolSurgeRatio}x, atr=${baseConfig.atrMultiplier}, be=${baseConfig.beActivationMultiplier}, trail=${baseConfig.trailMultiplier}`);

  const vixArg = vixData.size > 0 ? vixData : undefined;
  const indexArg = indexData.size > 0 ? indexData : undefined;

  // 実行
  const result = runWeeklyBreakBacktest(baseConfig, allData, vixArg, indexArg);
  printResult(result, "週足レンジブレイク戦略");

  // 資本効率
  const util = calculateCapitalUtilization(result.equityCurve);
  console.log(`\n平均ポジション数: ${util.avgConcurrentPositions}`);
  console.log(`資本稼働率: ${util.capitalUtilizationPct.toFixed(1)}%`);


  await prisma.$disconnect();
}

main().catch((err) => {
  console.error("週足レンジブレイクBTエラー:", err);
  process.exit(1);
});
