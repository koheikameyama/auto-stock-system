/**
 * 日次バックテスト（16:30 JST / 平日）
 *
 * 1. ScoringRecordからS/Aランク銘柄を選定
 * 2. ヒストリカルデータを取得
 * 3. 13のパラメータ条件でバックテスト実行
 * 4. 結果をDB保存
 * 5. Slackサマリー通知
 */

import { prisma } from "../lib/prisma";
import { getTodayForDB } from "../lib/date-utils";
import { notifyBacktestResult } from "../lib/slack";
import { runDailyBacktest } from "../backtest/daily-runner";

export async function main() {
  console.log("=== Daily Backtest 開始 ===");
  const startTime = Date.now();

  // 1. バックテスト実行
  const result = await runDailyBacktest();

  // 2. DB保存（upsert で冪等）
  console.log("[daily-backtest] DB保存中...");
  const today = getTodayForDB();

  for (const cr of result.conditionResults) {
    const pf =
      cr.metrics.profitFactor === Infinity ? 999.99 : cr.metrics.profitFactor;

    await prisma.backtestDailyResult.upsert({
      where: {
        date_conditionKey: {
          date: today,
          conditionKey: cr.condition.key,
        },
      },
      create: {
        date: today,
        conditionKey: cr.condition.key,
        conditionLabel: cr.condition.label,
        initialBudget: cr.config.initialBudget,
        maxPrice: cr.config.maxPrice,
        maxPositions: cr.config.maxPositions,
        tickerCount: cr.tickerCount,
        totalTrades: cr.metrics.totalTrades,
        wins: cr.metrics.wins,
        losses: cr.metrics.losses,
        winRate: cr.metrics.winRate,
        profitFactor: pf,
        maxDrawdown: cr.metrics.maxDrawdown,
        sharpeRatio: cr.metrics.sharpeRatio,
        totalPnl: cr.metrics.totalPnl,
        totalReturnPct: cr.metrics.totalReturnPct,
        avgHoldingDays: cr.metrics.avgHoldingDays,
        byRank: cr.metrics.byRank as object,
        fullResult: cr.metrics as object,
        periodStart: result.periodStart,
        periodEnd: result.periodEnd,
        executionTimeMs: cr.executionTimeMs,
      },
      update: {
        conditionLabel: cr.condition.label,
        initialBudget: cr.config.initialBudget,
        maxPrice: cr.config.maxPrice,
        maxPositions: cr.config.maxPositions,
        tickerCount: cr.tickerCount,
        totalTrades: cr.metrics.totalTrades,
        wins: cr.metrics.wins,
        losses: cr.metrics.losses,
        winRate: cr.metrics.winRate,
        profitFactor: pf,
        maxDrawdown: cr.metrics.maxDrawdown,
        sharpeRatio: cr.metrics.sharpeRatio,
        totalPnl: cr.metrics.totalPnl,
        totalReturnPct: cr.metrics.totalReturnPct,
        avgHoldingDays: cr.metrics.avgHoldingDays,
        byRank: cr.metrics.byRank as object,
        fullResult: cr.metrics as object,
        periodStart: result.periodStart,
        periodEnd: result.periodEnd,
        executionTimeMs: cr.executionTimeMs,
      },
    });
  }

  // 3. Slack通知
  console.log("[daily-backtest] Slack通知中...");
  await notifyBacktestResult({
    tickers: result.tickers.length,
    period: `${result.periodStart} ~ ${result.periodEnd}`,
    dataFetchTimeMs: result.dataFetchTimeMs,
    totalTimeMs: Date.now() - startTime,
    conditionResults: result.conditionResults.map((cr) => ({
      key: cr.condition.key,
      label: cr.condition.label,
      winRate: cr.metrics.winRate,
      profitFactor: cr.metrics.profitFactor,
      totalReturnPct: cr.metrics.totalReturnPct,
      totalPnl: cr.metrics.totalPnl,
      totalTrades: cr.metrics.totalTrades,
      maxDrawdown: cr.metrics.maxDrawdown,
    })),
  });

  const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
  console.log(`=== Daily Backtest 完了 (${elapsed}秒) ===`);
}

const isDirectRun = process.argv[1]?.includes("daily-backtest");
if (isDirectRun) {
  main()
    .catch((error) => {
      console.error("Daily Backtest エラー:", error);
      process.exit(1);
    })
    .finally(() => prisma.$disconnect());
}
