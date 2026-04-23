/**
 * 本番の約定ログから スリッページ統計を算出する分析スクリプト
 *
 * TradingOrder.slippageBps (entry 引け成行のみ記録済み) + exit 側の実績差分を集計する。
 * 結果をBTのslippageModelキャリブレーションに使う。
 *
 * 使い方:
 *   npx tsx scripts/analyze-execution-slippage.ts
 *
 * 注意:
 *   - DATABASE_URL が本番を指していること (SELECTのみ。書き込みなし)
 */

import { prisma } from "../src/lib/prisma";

function percentile(values: number[], p: number): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const idx = Math.max(0, Math.min(sorted.length - 1, Math.floor((sorted.length - 1) * p)));
  return sorted[idx];
}

function fmtBps(v: number): string {
  return `${v >= 0 ? "+" : ""}${v.toFixed(0)}bps (${(v / 100).toFixed(2)}%)`;
}

async function analyzeEntrySlippage() {
  // entry側 = buy orderで filled + slippageBps 記録済み
  const orders = await prisma.tradingOrder.findMany({
    where: {
      side: "buy",
      status: "filled",
      slippageBps: { not: null },
    },
    select: { strategy: true, slippageBps: true, filledPrice: true, referencePrice: true },
  });

  if (orders.length === 0) {
    console.log("【Entry slippage】データなし");
    return;
  }

  console.log(`\n=== Entry Slippage (buy 引け成行) === ${orders.length}件`);

  const byStrategy = new Map<string, number[]>();
  for (const o of orders) {
    const list = byStrategy.get(o.strategy) ?? [];
    list.push(o.slippageBps!);
    byStrategy.set(o.strategy, list);
  }
  byStrategy.set("__all__", orders.map((o) => o.slippageBps!));

  for (const [strategy, values] of byStrategy) {
    const n = values.length;
    const avg = values.reduce((s, v) => s + v, 0) / n;
    const abs = values.map((v) => Math.abs(v));
    const absAvg = abs.reduce((s, v) => s + v, 0) / n;
    console.log(`\n[${strategy}] n=${n}`);
    console.log(`  平均: ${fmtBps(avg)} / 平均絶対値: ${fmtBps(absAvg)}`);
    console.log(`  中央値: ${fmtBps(percentile(values, 0.5))}`);
    console.log(`  P10: ${fmtBps(percentile(values, 0.10))}  P25: ${fmtBps(percentile(values, 0.25))}`);
    console.log(`  P75: ${fmtBps(percentile(values, 0.75))}  P90: ${fmtBps(percentile(values, 0.90))}  P95: ${fmtBps(percentile(values, 0.95))}`);
    console.log(`  MIN: ${fmtBps(Math.min(...values))}  MAX: ${fmtBps(Math.max(...values))}`);
  }
}

async function analyzeExitSlippage() {
  // exit側 = sell orderで filled
  // DBに exit時の referencePrice は持たないので、ポジションの TradingPosition.exitSnapshot から
  // exitReason別統計を取って「どの程度の滑りに相当するか」を見る。
  //
  // 近似計算: sell order の filledPrice と position.trailingStopPrice (or stopLossPrice)
  // を比較して、SL執行ケースの滑り幅を測る。
  const positions = await prisma.tradingPosition.findMany({
    where: { status: "closed", exitPrice: { not: null } },
    select: {
      strategy: true,
      entryPrice: true,
      exitPrice: true,
      stopLossPrice: true,
      trailingStopPrice: true,
      exitSnapshot: true,
    },
    take: 500,
    orderBy: { exitedAt: "desc" },
  });

  if (positions.length === 0) {
    console.log("\n【Exit slippage】データなし");
    return;
  }

  console.log(`\n=== Exit Slippage (実績 vs 想定決済価格) === ${positions.length}件`);

  // exitReason別に「想定決済価格」を求め、実際のexitPriceとのbps差分を測る。
  // stopLoss: SL価格より低く約定した分
  // trailing_stop: trailing より低く約定した分
  const byReason = new Map<string, number[]>();

  for (const p of positions) {
    const snap = (p.exitSnapshot as Record<string, unknown> | null) ?? null;
    const reason = String(snap?.exitReason ?? "unknown");
    const exitPrice = Number(p.exitPrice);

    let expected: number | null = null;
    if (reason === "stop_loss" && p.stopLossPrice) {
      expected = Number(p.stopLossPrice);
    } else if (reason === "trailing_stop" && p.trailingStopPrice) {
      expected = Number(p.trailingStopPrice);
    }

    if (expected && expected > 0 && exitPrice > 0) {
      // sell側: 想定より低く約定 = 負のbps (不利)
      const slippageBps = Math.round(((exitPrice - expected) / expected) * 10000);
      const list = byReason.get(reason) ?? [];
      list.push(slippageBps);
      byReason.set(reason, list);
    }
  }

  if (byReason.size === 0) {
    console.log("【Exit slippage】SL/TS決済の実績データなし (想定決済価格との比較不能)");
    return;
  }

  for (const [reason, values] of byReason) {
    const n = values.length;
    const avg = values.reduce((s, v) => s + v, 0) / n;
    const abs = values.map((v) => Math.abs(v));
    const absAvg = abs.reduce((s, v) => s + v, 0) / n;
    console.log(`\n[${reason}] n=${n}`);
    console.log(`  平均: ${fmtBps(avg)} / 平均絶対値: ${fmtBps(absAvg)}`);
    console.log(`  中央値: ${fmtBps(percentile(values, 0.5))}`);
    console.log(`  P10: ${fmtBps(percentile(values, 0.10))}  P25: ${fmtBps(percentile(values, 0.25))}`);
    console.log(`  P75: ${fmtBps(percentile(values, 0.75))}  P90: ${fmtBps(percentile(values, 0.90))}`);
    console.log(`  MIN: ${fmtBps(Math.min(...values))}  MAX: ${fmtBps(Math.max(...values))}`);
  }
}

async function main() {
  const dbUrl = process.env.DATABASE_URL ?? "";
  const isProd = dbUrl.includes("railway") || dbUrl.includes("shinkansen");
  console.log(`DB: ${isProd ? "🟡 PRODUCTION (Railway)" : "🟢 LOCAL"}`);

  await analyzeEntrySlippage();
  await analyzeExitSlippage();

  console.log("\n--- SELECT-only 分析完了 (DBへの書き込みなし) ---");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
