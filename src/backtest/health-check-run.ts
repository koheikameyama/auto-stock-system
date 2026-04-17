/**
 * 週次戦略ヘルスチェック
 *
 * 各アクティブ戦略を個別にローリング3ヶ月・6ヶ月で実行し、
 * パフォーマンスの劣化を早期検知する。
 *
 * Usage:
 *   npm run backtest:health-check
 *   npm run backtest:health-check -- --budget 500000
 *   npm run backtest:health-check -- --notify
 */

import dayjs from "dayjs";
import { prisma } from "../lib/prisma";
import { GAPUP_BACKTEST_DEFAULTS } from "./gapup-config";
import { PSC_BACKTEST_DEFAULTS } from "./post-surge-consolidation-config";
import { getMaxBuyablePrice } from "../core/risk-manager";
import { precomputeSimData } from "./breakout-simulation";
import { precomputeGapUpDailySignals, runGapUpBacktest } from "./gapup-simulation";
import { precomputePSCDailySignals, runPSCBacktest } from "./post-surge-consolidation-simulation";
import { fetchHistoricalFromDB, fetchVixFromDB, fetchIndexFromDB } from "./data-fetcher";
import { notifyHealthCheck } from "../lib/slack";
import type { PerformanceMetrics, GapUpBacktestConfig, PostSurgeConsolidationBacktestConfig } from "./types";
import type { OHLCVData } from "../core/technical-analysis";

function getArg(args: string[], flag: string): string | undefined {
  const idx = args.indexOf(flag);
  return idx >= 0 && idx + 1 < args.length ? args[idx + 1] : undefined;
}

type HealthStatus = "stable" | "warning" | "degraded";

interface StrategyHealth {
  name: string;
  metrics6m: PerformanceMetrics;
  metrics3m: PerformanceMetrics;
  status: HealthStatus;
  statusReason: string;
}

function evaluateHealth(m6: PerformanceMetrics, m3: PerformanceMetrics): { status: HealthStatus; statusReason: string } {
  if (m3.totalTrades < 5) {
    return { status: "warning", statusReason: "3m trades < 5（サンプル不足）" };
  }
  if (m3.profitFactor < 1.0) {
    return { status: "degraded", statusReason: `3m PF=${m3.profitFactor.toFixed(2)} < 1.0（エッジ消失）` };
  }
  const pf6 = m6.profitFactor === Infinity ? 9999 : m6.profitFactor;
  const pf3 = m3.profitFactor === Infinity ? 9999 : m3.profitFactor;
  if (pf6 > 0 && pf3 < pf6 * 0.7) {
    const dropPct = ((1 - pf3 / pf6) * 100).toFixed(0);
    return { status: "warning", statusReason: `3m PF=${pf3.toFixed(2)}が6m PF=${pf6.toFixed(2)}より${dropPct}%低下` };
  }
  return { status: "stable", statusReason: "" };
}

function fmtPF(pf: number): string {
  return pf === Infinity || pf >= 9999 ? "  inf" : pf.toFixed(2).padStart(5);
}

function fmtExp(e: number): string {
  return ((e >= 0 ? "+" : "") + e.toFixed(2) + "%").padStart(7);
}

function fmtStatusIcon(s: HealthStatus): string {
  if (s === "stable") return "✓";
  if (s === "warning") return "△";
  return "✗";
}

function printTable(strategies: StrategyHealth[]): void {
  const header = `${"Strategy".padEnd(9)}| ${"Period".padStart(6)} | ${"Trades".padStart(6)} | ${"WinRate".padStart(7)} | ${"PF".padStart(5)} | ${"Expect".padStart(7)} | ${"MaxDD".padStart(6)}`;
  console.log(header);
  console.log("-".repeat(header.length));

  for (const s of strategies) {
    for (const [label, m] of [["6mo", s.metrics6m], ["3mo", s.metrics3m]] as const) {
      console.log(
        `${s.name.padEnd(9)}| ${label.padStart(6)} | ${String(m.totalTrades).padStart(6)} | ${(m.winRate.toFixed(1) + "%").padStart(7)} | ${fmtPF(m.profitFactor)} | ${fmtExp(m.expectancy)} | ${(m.maxDrawdown.toFixed(1) + "%").padStart(6)}`,
      );
    }
  }

  console.log("");
  const statusParts = strategies.map((s) => `${s.name}: ${fmtStatusIcon(s.status)} ${s.status}`);
  console.log(`[Status] ${statusParts.join("  |  ")}`);

  for (const s of strategies) {
    if (s.statusReason) {
      console.log(`  ${fmtStatusIcon(s.status)} ${s.name}: ${s.statusReason}`);
    }
  }
}

async function main() {
  const args = process.argv.slice(2);
  const endDate = getArg(args, "--end") ?? dayjs().format("YYYY-MM-DD");
  const budget = Number(getArg(args, "--budget") ?? 500_000);
  const notify = args.includes("--notify");

  const start6m = dayjs(endDate).subtract(6, "month").format("YYYY-MM-DD");
  const start3m = dayjs(endDate).subtract(3, "month").format("YYYY-MM-DD");
  const maxPrice = getMaxBuyablePrice(budget);

  console.log("=".repeat(50));
  console.log("Strategy Health Check");
  console.log("=".repeat(50));
  console.log(`Date: ${endDate}  |  Budget: ¥${budget.toLocaleString()}`);
  console.log(`6mo: ${start6m} → ${endDate}`);
  console.log(`3mo: ${start3m} → ${endDate}`);
  console.log("");

  // データ一括取得（6ヶ月分）
  const stocks = await prisma.stock.findMany({
    where: { isDelisted: false, isActive: true, isRestricted: false },
    select: { tickerCode: true },
  });
  let tickerCodes: string[];
  if (stocks.length > 0) {
    tickerCodes = stocks.map((s) => s.tickerCode);
  } else {
    const distinctTickers = await prisma.stockDailyBar.findMany({
      where: { market: "JP" },
      distinct: ["tickerCode"],
      select: { tickerCode: true },
    });
    tickerCodes = distinctTickers.map((s) => s.tickerCode);
  }
  console.log(`[data] ${tickerCodes.length}銘柄のデータ取得中...`);

  const [rawData, vixData, indexData] = await Promise.all([
    fetchHistoricalFromDB(tickerCodes, start6m, endDate),
    fetchVixFromDB(start6m, endDate),
    fetchIndexFromDB("^N225", start6m, endDate),
  ]);

  const allData = new Map<string, OHLCVData[]>();
  for (const [ticker, bars] of rawData) {
    if (bars.some((b) => b.close <= maxPrice && b.close > 0)) {
      allData.set(ticker, bars);
    }
  }
  console.log(`[data] ${allData.size}銘柄（フィルタ後）, VIX ${vixData.size}日, N225 ${indexData.size}日`);

  const vixArg = vixData.size > 0 ? vixData : undefined;
  const indexArg = indexData.size > 0 ? indexData : undefined;

  // コンフィグ
  const guConfigBase: Omit<GapUpBacktestConfig, "startDate" | "endDate"> = {
    ...GAPUP_BACKTEST_DEFAULTS,
    initialBudget: budget,
    maxPrice,
    verbose: false,
  };

  const pscConfigBase: Omit<PostSurgeConsolidationBacktestConfig, "startDate" | "endDate"> = {
    ...PSC_BACKTEST_DEFAULTS,
    initialBudget: budget,
    maxPrice,
    verbose: false,
    // WF最適パラメータ（combined-run.ts と同一）
    atrMultiplier: 0.8,
    beActivationMultiplier: 0.3,
    trailMultiplier: 0.5,
  };

  // 各期間でシミュレーション
  const results: StrategyHealth[] = [];

  for (const [periodLabel, startDate] of [["6mo", start6m], ["3mo", start3m]] as const) {
    console.log(`\n[sim] ${periodLabel}期間のシミュレーション実行中...`);

    const precomputed = precomputeSimData(
      startDate, endDate, allData,
      true, true,
      guConfigBase.indexTrendSmaPeriod ?? 50,
      indexArg,
      false, 60, 0, 0,
    );

    const guConfig: GapUpBacktestConfig = { ...guConfigBase, startDate, endDate };
    const pscConfig: PostSurgeConsolidationBacktestConfig = { ...pscConfigBase, startDate, endDate };

    const guSignals = precomputeGapUpDailySignals(guConfig, allData, precomputed);
    const pscSignals = precomputePSCDailySignals(pscConfig, allData, precomputed);

    const guResult = runGapUpBacktest(guConfig, allData, vixArg, indexArg, precomputed, guSignals);
    const pscResult = runPSCBacktest(pscConfig, allData, vixArg, indexArg, precomputed, pscSignals);

    if (periodLabel === "6mo") {
      results.push(
        { name: "GapUp", metrics6m: guResult.metrics, metrics3m: null!, status: "stable", statusReason: "" },
        { name: "PSC", metrics6m: pscResult.metrics, metrics3m: null!, status: "stable", statusReason: "" },
      );
    } else {
      results[0].metrics3m = guResult.metrics;
      results[1].metrics3m = pscResult.metrics;
    }
  }

  // 劣化判定
  for (const s of results) {
    const { status, statusReason } = evaluateHealth(s.metrics6m, s.metrics3m);
    s.status = status;
    s.statusReason = statusReason;
  }

  // コンソール出力
  console.log("");
  printTable(results);

  // Slack通知
  if (notify) {
    console.log("\n[slack] 通知送信中...");
    await notifyHealthCheck({
      date: endDate,
      strategies: results.map((s) => ({
        name: s.name,
        pf6m: s.metrics6m.profitFactor,
        pf3m: s.metrics3m.profitFactor,
        winRate6m: s.metrics6m.winRate,
        winRate3m: s.metrics3m.winRate,
        expectancy6m: s.metrics6m.expectancy,
        expectancy3m: s.metrics3m.expectancy,
        trades6m: s.metrics6m.totalTrades,
        trades3m: s.metrics3m.totalTrades,
        maxDD6m: s.metrics6m.maxDrawdown,
        maxDD3m: s.metrics3m.maxDrawdown,
        status: s.status,
        statusReason: s.statusReason,
      })),
    });
    console.log("[slack] 送信完了");
  }

  await prisma.$disconnect();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
