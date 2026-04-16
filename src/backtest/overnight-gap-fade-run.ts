/**
 * Overnight Gap-Fade バックテスト実行スクリプト
 *
 * Usage:
 *   npm run backtest:ogf
 *   npm run backtest:ogf -- --start 2025-04-01 --end 2026-03-25
 *   npm run backtest:ogf -- --verbose
 */

import dayjs from "dayjs";
import { prisma } from "../lib/prisma";
import { OGF_BACKTEST_DEFAULTS } from "./overnight-gap-fade-config";
import { getMaxBuyablePrice } from "../core/risk-manager";
import { runOvernightGapFadeBacktest } from "./overnight-gap-fade-simulation";
import { saveBacktestResult } from "./db-saver";
import { fetchHistoricalFromDB, fetchVixFromDB, fetchIndexFromDB } from "./data-fetcher";
import { calculateCapitalUtilization } from "./metrics";
import type { OvernightGapFadeBacktestConfig, PerformanceMetrics } from "./types";

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
  const budget = Number(getArg(args, "--budget") ?? OGF_BACKTEST_DEFAULTS.initialBudget);
  const verbose = args.includes("--verbose");
  const noPositionCap = args.includes("--no-position-cap");

  console.log("=".repeat(60));
  console.log("Overnight Gap-Fade バックテスト");
  console.log("=".repeat(60));
  console.log(`期間: ${startDate} → ${endDate}`);
  console.log(`初期資金: ¥${budget.toLocaleString()}`);

  const stocks = await prisma.stock.findMany({
    where: { isDelisted: false, isActive: true, isRestricted: false },
    select: { tickerCode: true },
  });
  let tickerCodes = stocks.map((s) => s.tickerCode);
  if (tickerCodes.length === 0) {
    const distinctTickers = await prisma.stockDailyBar.findMany({
      where: { tickerCode: { not: { startsWith: "^" } } },
      distinct: ["tickerCode"],
      select: { tickerCode: true },
    });
    tickerCodes = distinctTickers.map((t) => t.tickerCode);
    console.log(`[data] Stockテーブル空のためStockDailyBarから${tickerCodes.length}銘柄を取得`);
  }
  console.log(`[data] ${tickerCodes.length}銘柄のデータ取得中...`);

  const rawData = await fetchHistoricalFromDB(tickerCodes, startDate, endDate);
  const vixData = await fetchVixFromDB(startDate, endDate);
  const indexData = await fetchIndexFromDB("^N225", startDate, endDate);
  console.log(`[data] ${rawData.size}銘柄, VIX ${vixData.size}日, N225 ${indexData.size}日`);

  const maxPrice = getMaxBuyablePrice(budget);
  const allData = new Map<string, import("../core/technical-analysis").OHLCVData[]>();
  for (const [ticker, bars] of rawData) {
    if (bars.some((b) => b.close <= maxPrice && b.close > 0)) {
      allData.set(ticker, bars);
    }
  }
  console.log(`[data] ${allData.size}銘柄（フィルタ後）`);

  const baseConfig: OvernightGapFadeBacktestConfig = {
    ...OGF_BACKTEST_DEFAULTS,
    startDate,
    endDate,
    initialBudget: budget,
    maxPrice,
    verbose,
    positionCapEnabled: !noPositionCap,
  };

  const vixArg = vixData.size > 0 ? vixData : undefined;
  const indexArg = indexData.size > 0 ? indexData : undefined;

  const result = runOvernightGapFadeBacktest(baseConfig, allData, vixArg, indexArg);
  printResult(result, "Overnight Gap-Fade 戦略");

  const util = calculateCapitalUtilization(result.equityCurve);
  console.log(`\n平均ポジション数: ${util.avgConcurrentPositions}`);
  console.log(`資本稼働率: ${util.capitalUtilizationPct.toFixed(1)}%`);

  try {
    const id = await saveBacktestResult(result, "overnight-gap-fade");
    console.log(`[db] BacktestRun 保存完了: ${id}`);
  } catch (err) {
    console.error("[db] BacktestRun 保存失敗:", err);
  }

  await prisma.$disconnect();
}

main().catch((err) => {
  console.error("OGF BTエラー:", err);
  process.exit(1);
});
