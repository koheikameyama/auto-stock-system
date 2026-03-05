import { PrismaClient } from "@prisma/client";
import { fetchStockPrices } from "../lib/stock-price-fetcher";

const prisma = new PrismaClient();

// スリープ関数
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * 指数バックオフ付きで株価取得を試行
 */
async function fetchWithRetry(tickers: string[], maxRetries = 5) {
  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      return await fetchStockPrices(tickers);
    } catch (error) {
      if (attempt === maxRetries - 1) throw error;

      const waitTime = Math.pow(2, attempt) * 5000; // 5s, 10s, 20s, 40s, 80s
      console.warn(
        `  Rate limited or error. Retrying in ${waitTime / 1000}s... (Attempt ${attempt + 1}/${maxRetries})`,
      );
      await sleep(waitTime);
    }
  }
  throw new Error("Max retries exceeded");
}

async function cleanupAndMigrateAll() {
  console.log("Starting full database cleanup and migration (TSE focus)...");

  // 1. サフィックスがない日本株、または名証サフィックスを持つ銘柄を取得
  // (方針変更により名証も東証 .T への移行対象、または削除対象となる可能性があるため抽出)
  const allStocks = await prisma.stock.findMany({
    select: { id: true, tickerCode: true, name: true },
    where: {
      OR: [
        { tickerCode: { endsWith: ".NG" } },
        { tickerCode: { endsWith: ".NX" } },
        { tickerCode: { not: { contains: "." } } },
      ],
    },
  });

  console.log(
    `Checking ${allStocks.length} stocks that might need suffix update...`,
  );

  if (allStocks.length === 0) {
    console.log("No stocks in database needing update.");
    return;
  }

  // 2. チャンクに分けて処理
  const BATCH_SIZE = 15; // レート制限回避のため少し小さめに
  let updatedCount = 0;
  let skippedCount = 0;
  let errorCount = 0;

  for (let i = 0; i < allStocks.length; i += BATCH_SIZE) {
    const chunk = allStocks.slice(i, i + BATCH_SIZE);
    const tickers = chunk.map((s) => s.tickerCode);

    console.log(
      `\nProcessing batch ${Math.floor(i / BATCH_SIZE) + 1}/${Math.ceil(allStocks.length / BATCH_SIZE)}...`,
    );

    try {
      // リトライ付きでフェッチ
      const { prices } = await fetchWithRetry(tickers);

      // 取得結果をマップ化 (originalInput -> Result)
      const resultMap = new Map(prices.map((p) => [p.tickerCode, p]));

      for (const stock of chunk) {
        const result = resultMap.get(stock.tickerCode);

        if (result && result.actualTicker) {
          if (result.actualTicker !== stock.tickerCode) {
            // ティッカーが異なる（修正が必要な）場合
            console.log(
              `  UPDATE: ${stock.tickerCode} -> ${result.actualTicker} (${stock.name})`,
            );

            await prisma.$transaction([
              prisma.stock.update({
                where: { id: stock.id },
                data: { tickerCode: result.actualTicker },
              }),
              prisma.stockRequest.updateMany({
                where: { tickerCode: stock.tickerCode },
                data: { tickerCode: result.actualTicker },
              }),
            ]);
            updatedCount++;
          } else {
            // 正しいサフィックスで取得できている場合
            skippedCount++;
          }
        } else {
          // 取得できなかった銘柄
          console.log(
            `  SKIPPING (No data found on Yahoo): ${stock.tickerCode} (${stock.name})`,
          );
          skippedCount++;
        }
      }
    } catch (error) {
      console.error(`  FATAL batch error:`, error);
      errorCount += chunk.length;
    }

    // バッチ間のスリープ（レート制限回避）
    if (i + BATCH_SIZE < allStocks.length) {
      const sleepTime = 10000; // 10秒スリープ
      console.log(`  Waiting ${sleepTime / 1000}s for next batch...`);
      await sleep(sleepTime);
    }
  }

  console.log("\nCleanup and Migration Record:");
  console.log(`- Updated: ${updatedCount}`);
  console.log(`- Valid/Skipped: ${skippedCount}`);
  console.log(`- Errors: ${errorCount}`);
  console.log("Completed.");
}

cleanupAndMigrateAll()
  .catch((e) => console.error(e))
  .finally(async () => await prisma.$disconnect());
