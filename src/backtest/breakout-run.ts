/**
 * ブレイクアウトバックテスト実行スクリプト
 *
 * Usage:
 *   npm run backtest:breakout
 *   npm run backtest:breakout -- --start 2025-04-01 --end 2026-03-25
 *   npm run backtest:breakout -- --verbose
 *   npm run backtest:breakout -- --budget 1000000
 */

import dayjs from "dayjs";
import { prisma } from "../lib/prisma";
import { BREAKOUT_BACKTEST_DEFAULTS } from "./breakout-config";
import { runBreakoutBacktest } from "./breakout-simulation";
import { fetchHistoricalFromDB, fetchVixFromDB } from "./data-fetcher";
import { calculateCapitalUtilization } from "./metrics";
import type { BreakoutBacktestConfig, BreakoutBacktestResult, PerformanceMetrics } from "./types";

function getArg(args: string[], flag: string): string | undefined {
  const idx = args.indexOf(flag);
  return idx >= 0 && idx + 1 < args.length ? args[idx + 1] : undefined;
}

async function main() {
  const args = process.argv.slice(2);
  const startDate = getArg(args, "--start") ?? dayjs().subtract(12, "month").format("YYYY-MM-DD");
  const endDate = getArg(args, "--end") ?? dayjs().format("YYYY-MM-DD");
  const verbose = args.includes("--verbose") || args.includes("-v");
  const budgetStr = getArg(args, "--budget");

  const config: BreakoutBacktestConfig = {
    ...BREAKOUT_BACKTEST_DEFAULTS,
    startDate,
    endDate,
    verbose,
  };
  if (budgetStr) config.initialBudget = Number(budgetStr);

  console.log("=".repeat(60));
  console.log("ブレイクアウトバックテスト");
  console.log("=".repeat(60));
  console.log(`期間: ${startDate} → ${endDate}`);
  console.log(`初期資金: ¥${config.initialBudget.toLocaleString()}`);
  console.log(`最大同時保有: ${config.maxPositions}`);
  console.log(`出来高サージ閾値: ${config.triggerThreshold}x`);
  console.log(`高値ルックバック: ${config.highLookbackDays}日`);
  console.log(`SL ATR倍率: ${config.atrMultiplier}`);
  console.log(`TS発動: ATR×${config.tsActivationMultiplier}, トレール: ATR×${config.trailMultiplier}`);
  console.log("");

  // 1. 候補銘柄の取得
  const stocks = await prisma.stock.findMany({
    where: { isDelisted: false, isActive: true, isRestricted: false },
    select: { tickerCode: true },
  });
  const tickerCodes = stocks.map((s) => s.tickerCode);
  console.log(`[data] ${tickerCodes.length}銘柄のデータ取得中...`);

  // 2. 日足データ取得
  const allData = await fetchHistoricalFromDB(tickerCodes, startDate, endDate);
  console.log(`[data] ${allData.size}銘柄のデータ取得完了`);

  // 3. VIXデータ取得
  const vixData = await fetchVixFromDB(startDate, endDate);
  if (vixData.size > 0) {
    console.log(`[data] VIXデータ: ${vixData.size}日`);
  }

  // 4. バックテスト実行
  console.log("[sim] シミュレーション実行中...\n");
  const result = runBreakoutBacktest(config, allData, vixData.size > 0 ? vixData : undefined);

  // 5. レポート出力
  printReport(result);

  await prisma.$disconnect();
}

function printReport(result: BreakoutBacktestResult): void {
  const m = result.metrics;
  const cu = calculateCapitalUtilization(result.equityCurve);

  console.log("\n" + "=".repeat(60));
  console.log("バックテスト結果");
  console.log("=".repeat(60));

  printSection("トレード統計", [
    `総トレード数: ${m.totalTrades}`,
    `勝ち: ${m.wins} / 負け: ${m.losses} / 未決済: ${m.stillOpen}`,
    `勝率: ${m.winRate}%`,
    `平均保有日数: ${m.avgHoldingDays}`,
  ]);

  printSection("損益", [
    `総損益: ¥${m.totalPnl.toLocaleString()}`,
    `総リターン: ${m.totalReturnPct}%`,
    `純損益: ¥${m.totalNetPnl.toLocaleString()} (手数料¥${m.totalCommission.toLocaleString()}, 税¥${m.totalTax.toLocaleString()})`,
    `純リターン: ${m.netReturnPct}%`,
    `コストインパクト: ${m.costImpactPct}%`,
  ]);

  printSection("リスク指標", [
    `Profit Factor: ${formatPF(m.profitFactor)}`,
    `期待値: ${m.expectancy}%`,
    `RR比: ${m.riskRewardRatio}`,
    `最大ドローダウン: ${m.maxDrawdown}%${m.maxDrawdownPeriod ? ` (${m.maxDrawdownPeriod.start} → ${m.maxDrawdownPeriod.end})` : ""}`,
    `シャープレシオ: ${m.sharpeRatio ?? "N/A"}`,
    `平均勝ち: +${m.avgWinPct}% / 平均負け: ${m.avgLossPct}%`,
  ]);

  printSection("資金効率", [
    `平均同時ポジション: ${cu.avgConcurrentPositions}`,
    `資金稼働率: ${cu.capitalUtilizationPct}%`,
  ]);

  // レジーム別
  if (Object.keys(m.byRegime).length > 0) {
    console.log("\n[レジーム別]");
    for (const [regime, rm] of Object.entries(m.byRegime)) {
      console.log(`  ${regime}: ${rm.totalTrades}トレード, 勝率${rm.winRate}%, 平均${rm.avgPnlPct}%`);
    }
  }

  // 出口理由の内訳
  const exitCounts: Record<string, number> = {};
  for (const t of result.trades) {
    if (t.exitReason && t.exitReason !== "still_open") {
      exitCounts[t.exitReason] = (exitCounts[t.exitReason] ?? 0) + 1;
    }
  }
  if (Object.keys(exitCounts).length > 0) {
    console.log("\n[出口理由]");
    for (const [reason, count] of Object.entries(exitCounts).sort((a, b) => b[1] - a[1])) {
      console.log(`  ${reason}: ${count}`);
    }
  }

  console.log("\n" + "=".repeat(60));
  printJudgment(m);
}

function printSection(title: string, lines: string[]): void {
  console.log(`\n[${title}]`);
  for (const line of lines) {
    console.log(`  ${line}`);
  }
}

function formatPF(pf: number): string {
  if (pf === Infinity) return "∞";
  return pf.toFixed(2);
}

function printJudgment(m: PerformanceMetrics): void {
  const judgments: string[] = [];

  if (m.profitFactor >= 1.3) {
    judgments.push("PF >= 1.3 ✓");
  } else if (m.profitFactor >= 1.0) {
    judgments.push("PF >= 1.0 △");
  } else {
    judgments.push("PF < 1.0 ✗");
  }

  if (m.expectancy > 0) {
    judgments.push("期待値 > 0 ✓");
  } else {
    judgments.push("期待値 <= 0 ✗");
  }

  if (m.riskRewardRatio >= 1.5) {
    judgments.push("RR >= 1.5 ✓");
  } else {
    judgments.push(`RR = ${m.riskRewardRatio} △`);
  }

  console.log(`判定: ${judgments.join(" / ")}`);
}

main().catch((err) => {
  console.error("バックテスト実行エラー:", err);
  process.exit(1);
});
