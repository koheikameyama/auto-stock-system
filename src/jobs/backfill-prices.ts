/**
 * 株価データ初期取得 / バックフィル
 *
 * 1. 日経225主要銘柄をStockテーブルに登録
 * 2. 各銘柄の最新株価・出来高を更新
 * 3. TradingConfig の初期設定（存在しない場合）
 */

import { prisma } from "../lib/prisma";
import { TRADING_DEFAULTS, YAHOO_FINANCE, SCREENING, STOCK_FETCH, TECHNICAL_MIN_DATA, JOB_CONCURRENCY } from "../lib/constants";
import { fetchStockQuote, fetchHistoricalData } from "../core/market-data";
import { analyzeTechnicals } from "../core/technical-analysis";
import { normalizeTickerCode } from "../lib/ticker-utils";
import pLimit from "p-limit";

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// 日経225主要銘柄（時価総額上位・高流動性 約90銘柄）
const NIKKEI_TICKERS = [
  // 半導体・電子部品
  { ticker: "6857", name: "アドバンテスト", market: "東証プライム", sector: "電気機器" },
  { ticker: "6920", name: "レーザーテック", market: "東証プライム", sector: "電気機器" },
  { ticker: "8035", name: "東京エレクトロン", market: "東証プライム", sector: "電気機器" },
  { ticker: "6723", name: "ルネサスエレクトロニクス", market: "東証プライム", sector: "電気機器" },
  { ticker: "6146", name: "ディスコ", market: "東証プライム", sector: "機械" },
  { ticker: "7735", name: "SCREENホールディングス", market: "東証プライム", sector: "電気機器" },
  { ticker: "6976", name: "太陽誘電", market: "東証プライム", sector: "電気機器" },
  { ticker: "6479", name: "ミネベアミツミ", market: "東証プライム", sector: "電気機器" },
  // 自動車・輸送用機器
  { ticker: "7203", name: "トヨタ自動車", market: "東証プライム", sector: "輸送用機器" },
  { ticker: "7267", name: "本田技研工業", market: "東証プライム", sector: "輸送用機器" },
  { ticker: "7269", name: "スズキ", market: "東証プライム", sector: "輸送用機器" },
  { ticker: "7201", name: "日産自動車", market: "東証プライム", sector: "輸送用機器" },
  { ticker: "7270", name: "SUBARU", market: "東証プライム", sector: "輸送用機器" },
  { ticker: "6902", name: "デンソー", market: "東証プライム", sector: "輸送用機器" },
  // 金融
  { ticker: "8306", name: "三菱UFJフィナンシャル・グループ", market: "東証プライム", sector: "銀行業" },
  { ticker: "8316", name: "三井住友フィナンシャルグループ", market: "東証プライム", sector: "銀行業" },
  { ticker: "8411", name: "みずほフィナンシャルグループ", market: "東証プライム", sector: "銀行業" },
  { ticker: "8766", name: "東京海上ホールディングス", market: "東証プライム", sector: "保険業" },
  { ticker: "8750", name: "第一生命ホールディングス", market: "東証プライム", sector: "保険業" },
  { ticker: "8725", name: "MS&ADインシュアランスグループHD", market: "東証プライム", sector: "保険業" },
  { ticker: "8591", name: "オリックス", market: "東証プライム", sector: "その他金融業" },
  // 商社
  { ticker: "8001", name: "伊藤忠商事", market: "東証プライム", sector: "卸売業" },
  { ticker: "8058", name: "三菱商事", market: "東証プライム", sector: "卸売業" },
  { ticker: "8031", name: "三井物産", market: "東証プライム", sector: "卸売業" },
  { ticker: "8053", name: "住友商事", market: "東証プライム", sector: "卸売業" },
  // IT・通信
  { ticker: "9984", name: "ソフトバンクグループ", market: "東証プライム", sector: "情報・通信業" },
  { ticker: "9433", name: "KDDI", market: "東証プライム", sector: "情報・通信業" },
  { ticker: "9432", name: "日本電信電話", market: "東証プライム", sector: "情報・通信業" },
  { ticker: "9434", name: "ソフトバンク", market: "東証プライム", sector: "情報・通信業" },
  { ticker: "4755", name: "楽天グループ", market: "東証プライム", sector: "サービス業" },
  { ticker: "4689", name: "LINEヤフー", market: "東証プライム", sector: "情報・通信業" },
  { ticker: "6098", name: "リクルートホールディングス", market: "東証プライム", sector: "サービス業" },
  { ticker: "4307", name: "野村総合研究所", market: "東証プライム", sector: "情報・通信業" },
  // 医薬品・ヘルスケア
  { ticker: "4502", name: "武田薬品工業", market: "東証プライム", sector: "医薬品" },
  { ticker: "4519", name: "中外製薬", market: "東証プライム", sector: "医薬品" },
  { ticker: "4568", name: "第一三共", market: "東証プライム", sector: "医薬品" },
  { ticker: "4523", name: "エーザイ", market: "東証プライム", sector: "医薬品" },
  { ticker: "4578", name: "大塚ホールディングス", market: "東証プライム", sector: "医薬品" },
  { ticker: "4543", name: "テルモ", market: "東証プライム", sector: "精密機器" },
  // 小売・サービス
  { ticker: "9983", name: "ファーストリテイリング", market: "東証プライム", sector: "小売業" },
  { ticker: "7974", name: "任天堂", market: "東証プライム", sector: "その他製品" },
  { ticker: "3382", name: "セブン&アイ・ホールディングス", market: "東証プライム", sector: "小売業" },
  { ticker: "8267", name: "イオン", market: "東証プライム", sector: "小売業" },
  { ticker: "4661", name: "オリエンタルランド", market: "東証プライム", sector: "サービス業" },
  { ticker: "9843", name: "ニトリホールディングス", market: "東証プライム", sector: "小売業" },
  { ticker: "7832", name: "バンダイナムコホールディングス", market: "東証プライム", sector: "その他製品" },
  // 食品・日用品
  { ticker: "2801", name: "キッコーマン", market: "東証プライム", sector: "食料品" },
  { ticker: "2802", name: "味の素", market: "東証プライム", sector: "食料品" },
  { ticker: "2502", name: "アサヒグループホールディングス", market: "東証プライム", sector: "食料品" },
  { ticker: "2503", name: "キリンホールディングス", market: "東証プライム", sector: "食料品" },
  { ticker: "2914", name: "日本たばこ産業", market: "東証プライム", sector: "食料品" },
  { ticker: "4452", name: "花王", market: "東証プライム", sector: "化学" },
  // 電機・精密
  { ticker: "6758", name: "ソニーグループ", market: "東証プライム", sector: "電気機器" },
  { ticker: "6501", name: "日立製作所", market: "東証プライム", sector: "電気機器" },
  { ticker: "6702", name: "富士通", market: "東証プライム", sector: "電気機器" },
  { ticker: "6861", name: "キーエンス", market: "東証プライム", sector: "電気機器" },
  { ticker: "6971", name: "京セラ", market: "東証プライム", sector: "電気機器" },
  { ticker: "6762", name: "TDK", market: "東証プライム", sector: "電気機器" },
  { ticker: "6752", name: "パナソニックホールディングス", market: "東証プライム", sector: "電気機器" },
  { ticker: "6503", name: "三菱電機", market: "東証プライム", sector: "電気機器" },
  { ticker: "7751", name: "キヤノン", market: "東証プライム", sector: "電気機器" },
  { ticker: "6594", name: "ニデック", market: "東証プライム", sector: "電気機器" },
  { ticker: "6645", name: "オムロン", market: "東証プライム", sector: "電気機器" },
  { ticker: "7741", name: "HOYA", market: "東証プライム", sector: "精密機器" },
  { ticker: "7733", name: "オリンパス", market: "東証プライム", sector: "精密機器" },
  // 機械
  { ticker: "6367", name: "ダイキン工業", market: "東証プライム", sector: "機械" },
  { ticker: "6273", name: "SMC", market: "東証プライム", sector: "機械" },
  { ticker: "6301", name: "小松製作所", market: "東証プライム", sector: "機械" },
  // 不動産・建設
  { ticker: "8830", name: "住友不動産", market: "東証プライム", sector: "不動産業" },
  { ticker: "8801", name: "三井不動産", market: "東証プライム", sector: "不動産業" },
  { ticker: "8802", name: "三菱地所", market: "東証プライム", sector: "不動産業" },
  { ticker: "1925", name: "大和ハウス工業", market: "東証プライム", sector: "建設業" },
  { ticker: "1801", name: "大成建設", market: "東証プライム", sector: "建設業" },
  // 素材・化学
  { ticker: "5401", name: "日本製鉄", market: "東証プライム", sector: "鉄鋼" },
  { ticker: "4063", name: "信越化学工業", market: "東証プライム", sector: "化学" },
  { ticker: "4901", name: "富士フイルムホールディングス", market: "東証プライム", sector: "化学" },
  { ticker: "4911", name: "資生堂", market: "東証プライム", sector: "化学" },
  { ticker: "3407", name: "旭化成", market: "東証プライム", sector: "化学" },
  { ticker: "4188", name: "三菱ケミカルグループ", market: "東証プライム", sector: "化学" },
  { ticker: "6988", name: "日東電工", market: "東証プライム", sector: "化学" },
  { ticker: "5108", name: "ブリヂストン", market: "東証プライム", sector: "ゴム製品" },
  // 運輸・物流
  { ticker: "9020", name: "東日本旅客鉄道", market: "東証プライム", sector: "陸運業" },
  { ticker: "9022", name: "東海旅客鉄道", market: "東証プライム", sector: "陸運業" },
  { ticker: "9021", name: "西日本旅客鉄道", market: "東証プライム", sector: "陸運業" },
  { ticker: "9201", name: "日本航空", market: "東証プライム", sector: "空運業" },
  { ticker: "9101", name: "日本郵船", market: "東証プライム", sector: "海運業" },
  { ticker: "9104", name: "商船三井", market: "東証プライム", sector: "海運業" },
  // エネルギー・電力
  { ticker: "5020", name: "ENEOSホールディングス", market: "東証プライム", sector: "石油・石炭製品" },
  { ticker: "9501", name: "東京電力ホールディングス", market: "東証プライム", sector: "電気・ガス業" },
  { ticker: "9531", name: "東京ガス", market: "東証プライム", sector: "電気・ガス業" },
];

export async function main() {
  console.log("=== Backfill Prices 開始 ===");

  // 1. 銘柄マスタ登録
  console.log(`[1/3] 銘柄マスタ登録... (${NIKKEI_TICKERS.length}銘柄)`);

  for (const stock of NIKKEI_TICKERS) {
    const tickerCode = normalizeTickerCode(stock.ticker);

    await prisma.stock.upsert({
      where: { tickerCode },
      create: {
        tickerCode,
        name: stock.name,
        market: stock.market,
        sector: stock.sector,
      },
      update: {
        name: stock.name,
        market: stock.market,
        sector: stock.sector,
      },
    });
  }
  console.log("  銘柄マスタ登録完了");

  // 2. 株価データ更新
  console.log("[2/3] 株価データ更新中...");
  const allStocks = await prisma.stock.findMany({ where: { isDelisted: false } });
  const limit = pLimit(JOB_CONCURRENCY.MARKET_SCANNER);
  let updated = 0;
  let failed = 0;

  for (let i = 0; i < allStocks.length; i += YAHOO_FINANCE.BATCH_SIZE) {
    const batch = allStocks.slice(i, i + YAHOO_FINANCE.BATCH_SIZE);

    await Promise.all(
      batch.map((stock) =>
        limit(async () => {
          try {
            const quote = await fetchStockQuote(stock.tickerCode);
            if (!quote) {
              failed++;
              // 失敗カウント更新
              await prisma.stock.update({
                where: { id: stock.id },
                data: {
                  fetchFailCount: stock.fetchFailCount + 1,
                  isDelisted: stock.fetchFailCount + 1 >= STOCK_FETCH.FAIL_THRESHOLD,
                },
              });
              return;
            }

            // ヒストリカルデータからATRを計算
            let atr14: number | null = null;
            let weekChange: number | null = null;
            let volatility: number | null = null;

            const historical = await fetchHistoricalData(stock.tickerCode);
            if (historical && historical.length >= TECHNICAL_MIN_DATA.SCANNER_MIN_BARS) {
              const summary = analyzeTechnicals(historical);
              atr14 = summary.atr14;

              // 週間変化率
              if (historical.length >= STOCK_FETCH.WEEKLY_CHANGE_MIN_DAYS) {
                const current = historical[0].close;
                const weekAgo = historical[4].close;
                weekChange =
                  Math.round(((current - weekAgo) / weekAgo) * 10000) / 100;
              }

              // ボラティリティ（ATR / 株価 %）
              if (atr14 && quote.price > 0) {
                volatility =
                  Math.round((atr14 / quote.price) * 10000) / 100;
              }
            }

            await prisma.stock.update({
              where: { id: stock.id },
              data: {
                latestPrice: quote.price,
                latestVolume: BigInt(quote.volume),
                dailyChangeRate: quote.changePercent,
                weekChangeRate: weekChange,
                volatility,
                atr14,
                latestPriceDate: new Date(),
                priceUpdatedAt: new Date(),
                fetchFailCount: 0,
              },
            });

            updated++;
            console.log(
              `  ✓ ${stock.tickerCode} ${stock.name}: ¥${quote.price.toLocaleString()}`,
            );
          } catch (error) {
            failed++;
            console.error(`  ✗ ${stock.tickerCode}: ${error}`);
          }
        }),
      ),
    );

    if (i + YAHOO_FINANCE.BATCH_SIZE < allStocks.length) {
      await sleep(YAHOO_FINANCE.RATE_LIMIT_DELAY_MS);
    }
  }

  console.log(`  更新: ${updated}件, 失敗: ${failed}件`);

  // 3. TradingConfig 初期設定
  console.log("[3/3] TradingConfig 確認...");
  const config = await prisma.tradingConfig.findFirst();

  if (!config) {
    await prisma.tradingConfig.create({
      data: {
        totalBudget: TRADING_DEFAULTS.TOTAL_BUDGET,
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
    console.log(
      `  TradingConfig存在: 予算¥${Number(config.totalBudget).toLocaleString()}`,
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
