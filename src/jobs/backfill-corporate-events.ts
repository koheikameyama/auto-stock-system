/**
 * 株価データバックフィル — コーポレートイベント更新
 *
 * 各銘柄の決算発表日・配当権利落ち日・配当額を更新
 * 異常値（Decimalオーバーフロー）検知時は fetchFailCount を積み上げ、
 * 閾値超過で上場廃止扱いにする。
 */

import { prisma } from "../lib/prisma";
import { fetchCorporateEvents } from "../core/market-data";
import { isDecimalOverflow, incrementFailAndMarkDelisted } from "../lib/decimal-utils";
import pLimit from "p-limit";

export async function main() {
  console.log("=== Backfill Corporate Events 開始 ===");

  const allStocks = await prisma.stock.findMany({
    where: { isDelisted: false, isActive: true },
  });

  if (allStocks.length === 0) {
    console.warn("  ⚠ アクティブな銘柄が0件です。");
    return;
  }

  const eventLimit = pLimit(20);
  const now = new Date();
  const needsUpdateStocks = allStocks.filter((stock) =>
    !stock.nextEarningsDate || stock.nextEarningsDate < now,
  );
  console.log(`  更新対象: ${needsUpdateStocks.length}/${allStocks.length}件`);

  // API取得結果を収集
  const eventResults: { id: string; data: Record<string, unknown> }[] = [];
  const anomalyStockIds: string[] = []; // 異常値を返した銘柄
  let eventProcessed = 0;

  await Promise.all(
    needsUpdateStocks.map((stock) =>
      eventLimit(async () => {
        try {
          const events = await fetchCorporateEvents(stock.tickerCode);

          // dividendPerShare の異常値チェック（Decimal(10,2) オーバーフロー）
          if (isDecimalOverflow(events.dividendPerShare, "10,2")) {
            console.warn(
              `  ⚠ 異常値検知: ${stock.tickerCode} dividendPerShare=${events.dividendPerShare}`,
            );
            anomalyStockIds.push(stock.id);
            // 異常値の銘柄はDB更新をスキップ
          } else {
            const updateData: Record<string, unknown> = {};
            if (events.nextEarningsDate !== null) updateData.nextEarningsDate = events.nextEarningsDate;
            if (events.exDividendDate !== null) updateData.exDividendDate = events.exDividendDate;
            if (events.dividendPerShare !== null) updateData.dividendPerShare = events.dividendPerShare;

            if (Object.keys(updateData).length > 0) {
              eventResults.push({ id: stock.id, data: updateData });
            }
          }
        } catch {
          // fetchCorporateEvents 内部でエラーログ済み
        }

        eventProcessed++;
        if (eventProcessed % 100 === 0 || eventProcessed === needsUpdateStocks.length) {
          console.log(`    取得中: ${eventProcessed}/${needsUpdateStocks.length}件`);
        }
      }),
    ),
  );

  // DB更新をバッチ実行
  if (eventResults.length > 0) {
    const EVENT_BATCH = 50;
    for (let i = 0; i < eventResults.length; i += EVENT_BATCH) {
      await prisma.$transaction(
        eventResults.slice(i, i + EVENT_BATCH).map((r) =>
          prisma.stock.update({ where: { id: r.id }, data: r.data }),
        ),
      );
    }
  }

  // 異常値銘柄の fetchFailCount インクリメント & 廃止判定
  if (anomalyStockIds.length > 0) {
    const anomalyStocks = needsUpdateStocks.filter((s) => anomalyStockIds.includes(s.id));
    const currentCounts = new Map(anomalyStocks.map((s) => [s.id, s.fetchFailCount]));
    const delistedCount = await incrementFailAndMarkDelisted(anomalyStockIds, currentCounts);
    console.log(
      `  異常値検知: ${anomalyStockIds.length}件（うち廃止扱い: ${delistedCount}件）`,
    );
  }

  console.log(`  イベント更新: ${eventResults.length}件`);
  console.log("=== Backfill Corporate Events 終了 ===");
}

const isDirectRun = process.argv[1]?.includes("backfill-corporate-events");
if (isDirectRun) {
  main()
    .catch((error) => {
      console.error("Backfill Corporate Events エラー:", error);
      process.exit(1);
    })
    .finally(() => prisma.$disconnect());
}
