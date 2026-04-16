/**
 * バックテスト結果からピーク同時保有数を分析
 */
import { prisma } from "../src/lib/prisma";

async function main() {
  const latest = await prisma.backtestRun.findFirst({
    where: { strategy: "combined" },
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      createdAt: true,
      configJson: true,
      equityCurveJson: true,
    },
  });

  if (!latest) {
    console.log("バックテスト結果が見つかりません");
    await prisma.$disconnect();
    return;
  }

  const equityCurve = latest.equityCurveJson as Array<{
    date: string;
    cash: number;
    positionsValue: number;
    totalEquity: number;
    openPositionCount: number;
  }>;

  if (!equityCurve || !equityCurve.length) {
    console.log("エクイティカーブデータがありません");
    await prisma.$disconnect();
    return;
  }

  const positions = equityCurve.map(e => e.openPositionCount);
  const maxPos = Math.max(...positions);
  const avgPos = positions.reduce((a, b) => a + b, 0) / positions.length;

  console.log(`\n[バックテスト結果分析]`);
  console.log(`実行日時: ${latest.createdAt.toISOString().substring(0, 19)}`);
  console.log(`\nピーク同時保有数: ${maxPos}枠`);
  console.log(`平均同時保有数: ${avgPos.toFixed(2)}枠`);

  // ヒストグラム
  const hist: Record<number, number> = {};
  for (const p of positions) {
    hist[p] = (hist[p] || 0) + 1;
  }

  console.log(`\n[同時保有数の分布]`);
  for (const [pos, count] of Object.entries(hist).sort((a, b) => Number(a[0]) - Number(b[0]))) {
    const pct = ((count / positions.length) * 100).toFixed(1);
    const bar = "■".repeat(Math.floor(Number(pct) / 2));
    console.log(`${pos}枠: ${count.toString().padStart(4)}日 (${pct.padStart(5)}%) ${bar}`);
  }

  // ピーク時の詳細
  const peakDays = equityCurve.filter(e => e.openPositionCount === maxPos);
  console.log(`\nピーク${maxPos}枠保有日:`);
  for (const day of peakDays.slice(0, 5)) {
    const utilPct = day.totalEquity > 0 ? (day.positionsValue / day.totalEquity * 100).toFixed(1) : "0.0";
    console.log(`  ${day.date}: ¥${day.positionsValue.toLocaleString()} / ¥${day.totalEquity.toLocaleString()} (${utilPct}%)`);
  }
  if (peakDays.length > 5) {
    console.log(`  ... 他${peakDays.length - 5}日`);
  }

  await prisma.$disconnect();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
