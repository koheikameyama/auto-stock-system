/**
 * 株価データバックフィル
 *
 * 1. 各銘柄の最新クォート（株価・出来高・ファンダメンタルズ）を更新
 * 2. ヒストリカルOHLCVをバッチ取得 → StockDailyBar に保存 + ATR/volatility計算
 * 3. コーポレートイベント更新
 * 4. TradingConfig の設定同期
 *
 * 注: 銘柄マスタ登録は jpx-csv-sync.ts が担当
 */

import dayjs from "dayjs";

import { prisma } from "../lib/prisma";
import { TRADING_DEFAULTS, YAHOO_FINANCE, STOCK_FETCH, TECHNICAL_MIN_DATA } from "../lib/constants";
import { fetchStockQuotesBatch, fetchHistoricalDataBatch, fetchCorporateEvents } from "../core/market-data";
import { analyzeTechnicals } from "../core/technical-analysis";
import { sleep } from "../lib/retry-utils";
import pLimit from "p-limit";

/** OHLCV保持日数（これより古いバーをpruneする） */
const OHLCV_RETENTION_DAYS = 250;

// Decimal(8,2) の範囲に収める（最大 ±999,999.99、NaN/Infinityはnull）
function clampDecimal8(value: number | null | undefined): number | null {
  if (value == null || !Number.isFinite(value)) return null;
  return Math.max(-999_999.99, Math.min(999_999.99, value));
}

export async function main() {
  console.log("=== Backfill Prices 開始 ===");

  const allStocks = await prisma.stock.findMany({
    where: { isDelisted: false, isActive: true },
  });

  if (allStocks.length === 0) {
    console.warn("  ⚠ アクティブな銘柄が0件です。先に jpx-csv-sync を実行してください。");
    return;
  }

  console.log(`  対象銘柄: ${allStocks.length}件`);

  // ================================================================
  // [1/4] クォート更新（バッチ取得）
  // ================================================================
  console.log("[1/4] クォート更新中...");
  const quoteMap = new Map<string, Awaited<ReturnType<typeof fetchStockQuotesBatch>> extends Map<string, infer V> ? V : never>();
  let quotesFailed = 0;

  const totalBatches = Math.ceil(allStocks.length / YAHOO_FINANCE.BATCH_SIZE);
  for (let i = 0; i < allStocks.length; i += YAHOO_FINANCE.BATCH_SIZE) {
    const batchNum = Math.floor(i / YAHOO_FINANCE.BATCH_SIZE) + 1;
    const batch = allStocks.slice(i, i + YAHOO_FINANCE.BATCH_SIZE);
    const tickers = batch.map((s) => s.tickerCode);
    console.log(`  バッチ ${batchNum}/${totalBatches}（${tickers.length}件）`);
    const batchResult = await fetchStockQuotesBatch(tickers);
    for (const [key, value] of batchResult) {
      quoteMap.set(key, value);
    }
    if (i + YAHOO_FINANCE.BATCH_SIZE < allStocks.length) {
      await sleep(YAHOO_FINANCE.RATE_LIMIT_DELAY_MS);
    }
  }

  // クォート失敗銘柄の fetchFailCount を一括更新
  const failedStocks = allStocks.filter((s) => {
    const q = quoteMap.get(s.tickerCode);
    return !q || !Number.isFinite(q.price) || q.price <= 0;
  });
  quotesFailed = failedStocks.length;

  if (failedStocks.length > 0) {
    await prisma.stock.updateMany({
      where: { id: { in: failedStocks.map((s) => s.id) } },
      data: { fetchFailCount: { increment: 1 } },
    });
    const delistIds = failedStocks
      .filter((s) => s.fetchFailCount + 1 >= STOCK_FETCH.FAIL_THRESHOLD)
      .map((s) => s.id);
    if (delistIds.length > 0) {
      await prisma.stock.updateMany({
        where: { id: { in: delistIds } },
        data: { isDelisted: true },
      });
    }
  }

  console.log(`  クォート取得: ${quoteMap.size}件, 失敗: ${quotesFailed}件`);

  // クォート成功銘柄のみを対象にする
  const validStocks = allStocks.filter((s) => {
    const q = quoteMap.get(s.tickerCode);
    return q && Number.isFinite(q.price) && q.price > 0;
  });

  // ================================================================
  // [2/4] ヒストリカルOHLCV取得 → StockDailyBar保存 + ATR/volatility計算
  // ================================================================
  console.log("[2/4] ヒストリカルOHLCV取得 + DB保存中...");
  const validTickers = validStocks.map((s) => s.tickerCode);
  const historicalMap = await fetchHistoricalDataBatch(validTickers);

  console.log(`  ヒストリカル取得: ${historicalMap.size}/${validTickers.length}銘柄`);

  // StockDailyBar にバルク保存
  console.log("  [2a] StockDailyBar upsert（最新5日分）...");
  const allUpserts = [];
  const allOlderBars: { tickerCode: string; date: Date; open: number; high: number; low: number; close: number; volume: bigint }[] = [];
  let barsSaved = 0;

  for (const stock of validStocks) {
    const bars = historicalMap.get(stock.tickerCode);
    if (!bars || bars.length === 0) continue;

    // 最新5日分はupsert（株式分割等でデータが修正される場合）
    const recentBars = bars.slice(0, 5); // newest-first なので先頭5個が最新
    for (const bar of recentBars) {
      allUpserts.push(
        prisma.stockDailyBar.upsert({
          where: {
            tickerCode_date: {
              tickerCode: stock.tickerCode,
              date: new Date(bar.date + "T00:00:00Z"),
            },
          },
          update: {
            open: bar.open,
            high: bar.high,
            low: bar.low,
            close: bar.close,
            volume: BigInt(Math.round(bar.volume)),
          },
          create: {
            tickerCode: stock.tickerCode,
            date: new Date(bar.date + "T00:00:00Z"),
            open: bar.open,
            high: bar.high,
            low: bar.low,
            close: bar.close,
            volume: BigInt(Math.round(bar.volume)),
          },
        }),
      );
    }

    // 古いバーは一括で収集
    const olderBars = bars.slice(5);
    for (const bar of olderBars) {
      allOlderBars.push({
        tickerCode: stock.tickerCode,
        date: new Date(bar.date + "T00:00:00Z"),
        open: bar.open,
        high: bar.high,
        low: bar.low,
        close: bar.close,
        volume: BigInt(Math.round(bar.volume)),
      });
    }

    barsSaved += bars.length;
  }

  // upsert を50件ずつトランザクション実行
  const UPSERT_BATCH = 50;
  for (let i = 0; i < allUpserts.length; i += UPSERT_BATCH) {
    await prisma.$transaction(allUpserts.slice(i, i + UPSERT_BATCH));
    if ((i + UPSERT_BATCH) % 500 === 0 || i + UPSERT_BATCH >= allUpserts.length) {
      console.log(`    upsert: ${Math.min(i + UPSERT_BATCH, allUpserts.length)}/${allUpserts.length}件`);
    }
  }

  // 古いバーは一括 createMany（skipDuplicates）
  if (allOlderBars.length > 0) {
    console.log(`  [2b] olderBars一括保存: ${allOlderBars.length}件...`);
    const CREATE_BATCH = 1000;
    for (let i = 0; i < allOlderBars.length; i += CREATE_BATCH) {
      await prisma.stockDailyBar.createMany({
        data: allOlderBars.slice(i, i + CREATE_BATCH),
        skipDuplicates: true,
      });
    }
  }

  console.log(`  StockDailyBar保存完了: 約${barsSaved}バー`);

  // Stock テーブルの ATR/volatility/weekChange を一括更新
  console.log("  [2c] Stock テーブル更新中...");
  const now = new Date();
  const stockUpdateOps = validStocks.map((stock) => {
    const quote = quoteMap.get(stock.tickerCode)!;
    const historical = historicalMap.get(stock.tickerCode);

    let atr14: number | null = null;
    let weekChange: number | null = null;
    let volatility: number | null = null;

    if (historical && historical.length >= TECHNICAL_MIN_DATA.SCANNER_MIN_BARS) {
      const summary = analyzeTechnicals(historical);
      atr14 = summary.atr14;

      if (historical.length >= STOCK_FETCH.WEEKLY_CHANGE_MIN_DAYS) {
        const current = historical[0].close;
        const weekAgo = historical[4].close;
        weekChange = Math.round(((current - weekAgo) / weekAgo) * 10000) / 100;
      }

      if (atr14 && quote.price > 0) {
        volatility = Math.round((atr14 / quote.price) * 10000) / 100;
      }
    }

    return prisma.stock.update({
      where: { id: stock.id },
      data: {
        latestPrice: quote.price,
        latestVolume: BigInt(quote.volume),
        dailyChangeRate: clampDecimal8(quote.changePercent),
        weekChangeRate: clampDecimal8(weekChange),
        volatility: clampDecimal8(volatility),
        atr14,
        latestPriceDate: now,
        priceUpdatedAt: now,
        fetchFailCount: 0,
        per: clampDecimal8(quote.per),
        pbr: clampDecimal8(quote.pbr),
        eps: quote.eps != null && Number.isFinite(quote.eps) ? quote.eps : null,
        marketCap: quote.marketCap != null && Number.isFinite(quote.marketCap) ? quote.marketCap : null,
        isProfitable: quote.eps != null ? quote.eps > 0 : null,
      },
    });
  });

  const STOCK_BATCH = 50;
  for (let i = 0; i < stockUpdateOps.length; i += STOCK_BATCH) {
    await prisma.$transaction(stockUpdateOps.slice(i, i + STOCK_BATCH));
    if ((i + STOCK_BATCH) % 500 === 0 || i + STOCK_BATCH >= stockUpdateOps.length) {
      console.log(`    Stock更新: ${Math.min(i + STOCK_BATCH, stockUpdateOps.length)}/${stockUpdateOps.length}件`);
    }
  }

  // ================================================================
  // [3/4] コーポレートイベント更新
  // ================================================================
  console.log("[3/4] コーポレートイベント更新中...");
  const eventLimit = pLimit(10);
  const eventNow = new Date();
  const needsUpdateStocks = allStocks.filter((stock) =>
    !stock.nextEarningsDate ||
    stock.nextEarningsDate < eventNow ||
    !stock.exDividendDate ||
    stock.exDividendDate < eventNow,
  );
  console.log(`  更新対象: ${needsUpdateStocks.length}/${allStocks.length}件`);

  // API取得結果を収集
  const eventResults: { id: string; data: Record<string, unknown> }[] = [];
  let eventProcessed = 0;

  await Promise.all(
    needsUpdateStocks.map((stock) =>
      eventLimit(async () => {
        try {
          const events = await fetchCorporateEvents(stock.tickerCode);
          const updateData: Record<string, unknown> = {};
          if (events.nextEarningsDate !== null) updateData.nextEarningsDate = events.nextEarningsDate;
          if (events.exDividendDate !== null) updateData.exDividendDate = events.exDividendDate;
          if (events.dividendPerShare !== null) updateData.dividendPerShare = events.dividendPerShare;

          if (Object.keys(updateData).length > 0) {
            eventResults.push({ id: stock.id, data: updateData });
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

  console.log(`  イベント更新: ${eventResults.length}件`);

  // ================================================================
  // [3.5] 古いOHLCVデータのprune
  // ================================================================
  const cutoffDate = dayjs().subtract(OHLCV_RETENTION_DAYS, "day").toDate();
  const pruned = await prisma.stockDailyBar.deleteMany({
    where: { date: { lt: cutoffDate } },
  });
  if (pruned.count > 0) {
    console.log(`  古いOHLCVデータ削除: ${pruned.count}件（${OHLCV_RETENTION_DAYS}日以前）`);
  }

  // ================================================================
  // [4/4] TradingConfig 初期設定
  // ================================================================
  console.log("[4/4] TradingConfig 確認...");
  const config = await prisma.tradingConfig.findFirst();

  if (!config) {
    await prisma.tradingConfig.create({
      data: {
        totalBudget: TRADING_DEFAULTS.TOTAL_BUDGET,
        realizedPnl: 0,
        maxPositions: TRADING_DEFAULTS.MAX_POSITIONS,
        maxPositionPct: TRADING_DEFAULTS.MAX_POSITION_PCT,
        maxDailyLossPct: TRADING_DEFAULTS.MAX_DAILY_LOSS_PCT,
        isActive: true,
      },
    });
    console.log(
      `  TradingConfig作成: 予算¥${TRADING_DEFAULTS.TOTAL_BUDGET.toLocaleString()}`,
    );
  } else {
    await prisma.tradingConfig.update({
      where: { id: config.id },
      data: {
        maxPositions: TRADING_DEFAULTS.MAX_POSITIONS,
        maxPositionPct: TRADING_DEFAULTS.MAX_POSITION_PCT,
        maxDailyLossPct: TRADING_DEFAULTS.MAX_DAILY_LOSS_PCT,
      },
    });
    console.log(
      `  TradingConfig更新: 最大保有数=${TRADING_DEFAULTS.MAX_POSITIONS}, 最大比率=${TRADING_DEFAULTS.MAX_POSITION_PCT}%`,
    );
  }

  console.log("=== Backfill Prices 終了 ===");
}

const isDirectRun = process.argv[1]?.includes("backfill-prices");
if (isDirectRun) {
  main()
    .catch((error) => {
      console.error("Backfill Prices エラー:", error);
      process.exit(1);
    })
    .finally(() => prisma.$disconnect());
}
