/**
 * JPX CSV同期ジョブ（手動実行）
 *
 * JPXが公開する上場銘柄一覧CSV（data/data_j.csv）を読み込み、
 * Stockテーブルとの同期を行う。
 *
 * 1. CSVパース → 対象市場フィルタ
 * 2. バッチupsert（既存更新 + 新規追加）
 * 3. CSVに存在しない銘柄を isActive = false に更新
 * 4. StockStatusLog に変更ログを記録
 */

import { prisma } from "../lib/prisma";
import { JPX_CSV } from "../lib/constants";
import { normalizeTickerCode } from "../lib/ticker-utils";
import { getTodayForDB } from "../lib/market-date";
import { readFileSync } from "fs";
import { resolve } from "path";

interface JpxStockEntry {
  code: string;
  name: string;
  market: string;
  sectorCode33: string;
  sectorName33: string;
}

/**
 * CSVファイルを読み込み、対象市場の銘柄エントリーを返す
 */
function parseJpxCsv(filePath: string): JpxStockEntry[] {
  const absolutePath = resolve(process.cwd(), filePath);
  const raw = readFileSync(absolutePath, "utf-8");
  const lines = raw.split("\n").filter((line) => line.trim() !== "");

  if (lines.length < 2) {
    throw new Error("CSVファイルにデータがありません");
  }

  // ヘッダー行からカラムインデックスを特定
  const headers = lines[0].split(",").map((h) => h.trim().replace(/^"(.*)"$/, "$1"));
  const colIdx = {
    code: headers.indexOf(JPX_CSV.COLUMNS.CODE),
    name: headers.indexOf(JPX_CSV.COLUMNS.NAME),
    market: headers.indexOf(JPX_CSV.COLUMNS.MARKET),
    sectorCode33: headers.indexOf(JPX_CSV.COLUMNS.SECTOR_CODE_33),
    sectorName33: headers.indexOf(JPX_CSV.COLUMNS.SECTOR_NAME_33),
  };

  // 必須カラムの存在確認
  if (colIdx.code === -1 || colIdx.name === -1 || colIdx.market === -1) {
    throw new Error(
      `CSVに必須カラムが見つかりません。ヘッダー: ${headers.join(", ")}`,
    );
  }

  const entries: JpxStockEntry[] = [];

  for (let i = 1; i < lines.length; i++) {
    // CSVフィールドをパース（ダブルクォート対応）
    const fields = parseCsvLine(lines[i]);
    if (fields.length <= colIdx.code) continue;

    const market = fields[colIdx.market]?.trim() ?? "";

    // 対象市場のみ
    if (!(JPX_CSV.TARGET_MARKETS as readonly string[]).includes(market)) continue;

    const code = fields[colIdx.code]?.trim() ?? "";
    if (!code) continue;

    entries.push({
      code,
      name: fields[colIdx.name]?.trim() ?? "",
      market,
      sectorCode33: colIdx.sectorCode33 >= 0 ? (fields[colIdx.sectorCode33]?.trim() ?? "") : "",
      sectorName33: colIdx.sectorName33 >= 0 ? (fields[colIdx.sectorName33]?.trim() ?? "") : "",
    });
  }

  return entries;
}

/**
 * CSV行をパース（ダブルクォート内のカンマを考慮）
 */
function parseCsvLine(line: string): string[] {
  const fields: string[] = [];
  let current = "";
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const char = line[i];

    if (char === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (char === "," && !inQuotes) {
      fields.push(current);
      current = "";
    } else {
      current += char;
    }
  }
  fields.push(current);

  return fields;
}

/**
 * 市場名をDBの既存フォーマットにマッピング
 * JPX CSV: "プライム（内国株式）" → DB: "東証プライム"
 */
function normalizeMarketName(jpxMarket: string): string {
  if (jpxMarket.includes("プライム")) return "東証プライム";
  if (jpxMarket.includes("スタンダード")) return "東証スタンダード";
  if (jpxMarket.includes("グロース")) return "東証グロース";
  return jpxMarket;
}

export async function main() {
  console.log("=== JPX CSV同期 開始 ===");

  // 1. CSVパース
  console.log(`[1/4] CSV読み込み: ${JPX_CSV.CSV_FILE_PATH}`);
  const entries = parseJpxCsv(JPX_CSV.CSV_FILE_PATH);
  console.log(`  パース完了: ${entries.length}銘柄（対象市場のみ）`);

  const today = getTodayForDB();
  let created = 0;
  let updated = 0;
  let removed = 0;

  // 2. バッチupsert
  console.log("[2/4] 銘柄マスタ同期中...");
  const statusLogs: Array<{
    tickerCode: string;
    changeType: string;
    oldValue: string | null;
    newValue: string | null;
    source: string;
    detail: string | null;
  }> = [];

  // 既存銘柄のtickercodeセットを取得（新規判定用）
  const existingStocks = await prisma.stock.findMany({
    select: { tickerCode: true },
  });
  const existingTickerSet = new Set(existingStocks.map((s) => s.tickerCode));

  for (let i = 0; i < entries.length; i += JPX_CSV.UPSERT_BATCH_SIZE) {
    const batch = entries.slice(i, i + JPX_CSV.UPSERT_BATCH_SIZE);

    // Prismaのトランザクション内でバッチupsert
    await prisma.$transaction(
      batch.map((entry) => {
        const tickerCode = normalizeTickerCode(entry.code);
        const market = normalizeMarketName(entry.market);
        const isNew = !existingTickerSet.has(tickerCode);

        if (isNew) {
          created++;
          statusLogs.push({
            tickerCode,
            changeType: "jpx_added",
            oldValue: null,
            newValue: "active",
            source: "jpx_csv",
            detail: `${entry.name} (${market})`,
          });
        } else {
          updated++;
        }

        return prisma.stock.upsert({
          where: { tickerCode },
          create: {
            tickerCode,
            name: entry.name,
            market,
            sector: entry.sectorName33 || null,
            jpxSectorCode: entry.sectorCode33 || null,
            jpxSectorName: entry.sectorName33 || null,
            jpxLastSyncDate: today,
            isActive: true,
          },
          update: {
            name: entry.name,
            market,
            sector: entry.sectorName33 || null,
            jpxSectorCode: entry.sectorCode33 || null,
            jpxSectorName: entry.sectorName33 || null,
            jpxLastSyncDate: today,
            isActive: true,
            // JPX一覧に存在する = 上場中。fetchFail起因の誤廃止をリセット
            isDelisted: false,
            fetchFailCount: 0,
          },
        });
      }),
    );

    if ((i + JPX_CSV.UPSERT_BATCH_SIZE) % 500 === 0 || i + JPX_CSV.UPSERT_BATCH_SIZE >= entries.length) {
      console.log(`  処理中: ${Math.min(i + JPX_CSV.UPSERT_BATCH_SIZE, entries.length)}/${entries.length}`);
    }
  }

  // 3. CSVに存在しない銘柄を isActive = false に更新
  console.log("[3/4] CSVに存在しない銘柄を非アクティブ化...");
  const removedStocks = await prisma.stock.findMany({
    where: {
      isActive: true,
      OR: [
        { jpxLastSyncDate: null },
        { jpxLastSyncDate: { lt: today } },
      ],
    },
    select: { tickerCode: true, name: true },
  });

  if (removedStocks.length > 0) {
    await prisma.stock.updateMany({
      where: {
        isActive: true,
        OR: [
          { jpxLastSyncDate: null },
          { jpxLastSyncDate: { lt: today } },
        ],
      },
      data: { isActive: false },
    });

    removed = removedStocks.length;
    for (const stock of removedStocks) {
      statusLogs.push({
        tickerCode: stock.tickerCode,
        changeType: "jpx_removed",
        oldValue: "active",
        newValue: "inactive",
        source: "jpx_csv",
        detail: `JPX CSVに存在しないため非アクティブ化: ${stock.name}`,
      });
    }
  }

  // 4. ステータスログ保存
  console.log("[4/4] ステータスログ保存...");
  if (statusLogs.length > 0) {
    await prisma.stockStatusLog.createMany({
      data: statusLogs,
    });
  }

  // サマリー
  console.log("\n=== JPX CSV同期 完了 ===");
  console.log(`  CSV銘柄数: ${entries.length}`);
  console.log(`  新規追加: ${created}件`);
  console.log(`  更新: ${updated}件`);
  console.log(`  非アクティブ化: ${removed}件`);
  console.log(`  ステータスログ: ${statusLogs.length}件`);

  if (removed > 0) {
    console.log("\n  非アクティブ化された銘柄:");
    for (const stock of removedStocks.slice(0, 20)) {
      console.log(`    - ${stock.tickerCode} ${stock.name}`);
    }
    if (removedStocks.length > 20) {
      console.log(`    ... 他${removedStocks.length - 20}件`);
    }
  }
}

const isDirectRun = process.argv[1]?.includes("jpx-csv-sync");
if (isDirectRun) {
  main()
    .catch((error) => {
      console.error("JPX CSV同期 エラー:", error);
      process.exit(1);
    })
    .finally(() => prisma.$disconnect());
}
