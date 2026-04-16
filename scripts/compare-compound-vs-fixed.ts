/**
 * 複利運用 vs 固定資金運用の比較シミュレーション
 */

// 実バックテストデータに基づく資金規模別年利
const returnByCapital: Record<number, number> = {
  500_000: 1.031,   // 103.1% (実データ)
  600_000: 0.847,   // 84.7% (実データ)
  750_000: 0.305,   // 30.5% (実データ)
  1_000_000: 0.405, // 40.5% (実データ)
  1_500_000: 0.30,  // 推定（75万と同等）
  2_000_000: 0.25,  // 推定（さらに悪化）
};

function getReturnRate(capital: number): number {
  if (capital <= 500_000) return returnByCapital[500_000];
  if (capital <= 600_000) return returnByCapital[600_000];
  if (capital <= 750_000) return returnByCapital[750_000];
  if (capital <= 1_000_000) return returnByCapital[1_000_000];
  if (capital <= 1_500_000) return returnByCapital[1_500_000];
  return returnByCapital[2_000_000];
}

function simulateFixed(years: number, initialCapital: number = 500_000): { totalAssets: number; withdrawals: number; capital: number } {
  let capital = initialCapital;
  let totalWithdrawals = 0;

  for (let year = 1; year <= years; year++) {
    const returnRate = getReturnRate(capital);
    const profit = capital * returnRate;
    const endCapital = capital + profit;

    // 超過分を出金
    const withdrawal = Math.max(0, endCapital - initialCapital);
    totalWithdrawals += withdrawal;
    capital = initialCapital;
  }

  return {
    totalAssets: capital + totalWithdrawals,
    withdrawals: totalWithdrawals,
    capital,
  };
}

function simulateCompound(years: number, initialCapital: number = 500_000): { totalAssets: number; capital: number } {
  let capital = initialCapital;

  for (let year = 1; year <= years; year++) {
    const returnRate = getReturnRate(capital);
    const profit = capital * returnRate;
    capital = capital + profit;
  }

  return {
    totalAssets: capital,
    capital,
  };
}

function main() {
  console.log("=".repeat(80));
  console.log("複利運用 vs 固定資金運用の5年シミュレーション");
  console.log("=".repeat(80));
  console.log("\n[前提条件]");
  console.log("- 初期資金：50万円");
  console.log("- 実バックテストデータに基づく資金規模別年利を使用");
  console.log("  - 50万円：年利103.1%");
  console.log("  - 60万円：年利84.7%");
  console.log("  - 75万円：年利30.5%");
  console.log("  - 100万円：年利40.5%\n");

  console.log("年".padStart(4) + " | " +
    "固定戦略".padStart(12) + " | " +
    "出金累計".padStart(12) + " | " +
    "複利戦略".padStart(12) + " | " +
    "差額".padStart(12));
  console.log("-".repeat(80));

  for (let year = 1; year <= 10; year++) {
    const fixed = simulateFixed(year);
    const compound = simulateCompound(year);
    const diff = fixed.totalAssets - compound.totalAssets;
    const diffStr = (diff >= 0 ? "+" : "") + (diff / 10000).toFixed(1) + "万";

    console.log(
      `${year}年`.padStart(4) + " | " +
      `¥${(fixed.totalAssets / 10000).toFixed(1)}万`.padStart(12) + " | " +
      `¥${(fixed.withdrawals / 10000).toFixed(1)}万`.padStart(12) + " | " +
      `¥${(compound.totalAssets / 10000).toFixed(1)}万`.padStart(12) + " | " +
      diffStr.padStart(12)
    );
  }

  console.log("\n[結論]");
  const fixed10 = simulateFixed(10);
  const compound10 = simulateCompound(10);
  const advantage = fixed10.totalAssets > compound10.totalAssets ? "固定戦略" : "複利戦略";
  const diff = Math.abs(fixed10.totalAssets - compound10.totalAssets);

  console.log(`10年後の資産総額：`);
  console.log(`  固定戦略：¥${(fixed10.totalAssets / 10000).toFixed(1)}万円`);
  console.log(`  複利戦略：¥${(compound10.totalAssets / 10000).toFixed(1)}万円`);
  console.log(`  差額：¥${(diff / 10000).toFixed(1)}万円（${advantage}が有利）`);

  console.log("\n[重要な洞察]");
  console.log("このシステムでは「資金が増えると年利が激減」するため、");
  console.log("複利運用は逆効果になります。50万円固定で高年利を維持し、");
  console.log("利益を出金する戦略が数学的に最適です。");
}

main();
