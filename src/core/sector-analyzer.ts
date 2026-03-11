/**
 * セクター分析モジュール
 *
 * セクター集中リスク管理とセクターモメンタム（相対パフォーマンス）を提供する。
 */

import { prisma } from "../lib/prisma";
import { getDaysAgoForDB } from "../lib/date-utils";
import { getSectorGroup, SECTOR_RISK } from "../lib/constants";

// ========================================
// セクター集中チェック
// ========================================

export interface SectorConcentration {
  sectorGroup: string;
  positionCount: number;
  stockIds: string[];
}

/**
 * 現在のオープンポジションのセクター集中度を計算する
 */
export async function getSectorConcentration(): Promise<
  SectorConcentration[]
> {
  const openPositions = await prisma.tradingPosition.findMany({
    where: { status: "open" },
    include: { stock: { select: { id: true, jpxSectorName: true } } },
  });

  const sectorMap = new Map<
    string,
    { count: number; stockIds: string[] }
  >();

  for (const pos of openPositions) {
    const group = getSectorGroup(pos.stock.jpxSectorName);
    if (!group) continue;

    const entry = sectorMap.get(group) ?? { count: 0, stockIds: [] };
    entry.count++;
    entry.stockIds.push(pos.stockId);
    sectorMap.set(group, entry);
  }

  return Array.from(sectorMap.entries()).map(([sectorGroup, data]) => ({
    sectorGroup,
    positionCount: data.count,
    stockIds: data.stockIds,
  }));
}

/**
 * 新規ポジションのセクター集中チェック
 *
 * 同一セクターグループに既にMAX_SAME_SECTOR_POSITIONS以上のポジションがある場合は不許可。
 */
export async function canAddToSector(
  stockId: string,
): Promise<{ allowed: boolean; reason: string }> {
  const stock = await prisma.stock.findUnique({
    where: { id: stockId },
    select: { jpxSectorName: true, tickerCode: true },
  });

  if (!stock) {
    return { allowed: false, reason: "銘柄が見つかりません" };
  }

  const sectorGroup = getSectorGroup(stock.jpxSectorName);
  if (!sectorGroup) {
    // セクター不明の場合は許可（集中チェック不能）
    return { allowed: true, reason: "OK" };
  }

  const concentration = await getSectorConcentration();
  const existing = concentration.find((c) => c.sectorGroup === sectorGroup);

  if (
    existing &&
    existing.positionCount >= SECTOR_RISK.MAX_SAME_SECTOR_POSITIONS
  ) {
    return {
      allowed: false,
      reason: `セクター集中制限: ${sectorGroup}に既に${existing.positionCount}ポジション保有中（上限: ${SECTOR_RISK.MAX_SAME_SECTOR_POSITIONS}）`,
    };
  }

  return { allowed: true, reason: "OK" };
}

// ========================================
// セクターモメンタム（相対パフォーマンス）
// ========================================

export interface SectorMomentum {
  sectorGroup: string;
  avgWeekChange: number;
  relativeStrength: number; // vs 日経225（正=強、負=弱）
  stockCount: number;
  isStrong: boolean;
  isWeak: boolean;
}

/**
 * StockテーブルのweekChangeRateをセクターグループ別に平均し、
 * 日経225との相対パフォーマンスを算出する。
 *
 * isWeak = relativeStrength < WEAK_SECTOR_THRESHOLD（日経比2%以上アンダーパフォーム）
 */
export async function calculateSectorMomentum(
  nikkeiWeekChange: number,
): Promise<SectorMomentum[]> {
  const stocks = await prisma.stock.findMany({
    where: {
      isDelisted: false,
      isActive: true,
      jpxSectorName: { not: null },
      weekChangeRate: { not: null },
    },
    select: {
      jpxSectorName: true,
      weekChangeRate: true,
    },
  });

  // セクターグループ別に集計
  const sectorData = new Map<string, number[]>();

  for (const stock of stocks) {
    const group = getSectorGroup(stock.jpxSectorName);
    if (!group) continue;

    const changes = sectorData.get(group) ?? [];
    changes.push(Number(stock.weekChangeRate));
    sectorData.set(group, changes);
  }

  return Array.from(sectorData.entries()).map(([sectorGroup, changes]) => {
    const avgWeekChange =
      changes.reduce((sum, c) => sum + c, 0) / changes.length;
    const relativeStrength = avgWeekChange - nikkeiWeekChange;

    return {
      sectorGroup,
      avgWeekChange,
      relativeStrength,
      stockCount: changes.length,
      isStrong: relativeStrength > Math.abs(SECTOR_RISK.WEAK_SECTOR_THRESHOLD),
      isWeak: relativeStrength < SECTOR_RISK.WEAK_SECTOR_THRESHOLD,
    };
  });
}

// ========================================
// ニュースセクターセンチメント（複数日集約）
// ========================================

export interface NewsSectorSentiment {
  sectorGroup: string;
  positiveCount: number;
  negativeCount: number;
  neutralCount: number;
  score: number; // positive(+1) - negative(-1) の合計
  isNewsNegative: boolean;
}

/**
 * 直近N日分のNewsAnalysis.sectorImpactsを集約し、
 * セクターごとのニュースセンチメントを返す。
 */
export async function getNewsSectorSentiment(
  days: number = SECTOR_RISK.NEWS_SENTIMENT_DAYS,
): Promise<NewsSectorSentiment[]> {
  const analyses = await prisma.newsAnalysis.findMany({
    where: { date: { gte: getDaysAgoForDB(days) } },
    select: { sectorImpacts: true },
  });

  const sectorMap = new Map<
    string,
    { positive: number; negative: number; neutral: number }
  >();

  for (const analysis of analyses) {
    const impacts = analysis.sectorImpacts as Array<{
      sector: string;
      impact: "positive" | "neutral" | "negative";
    }> | null;
    if (!impacts) continue;

    for (const { sector, impact } of impacts) {
      const entry = sectorMap.get(sector) ?? {
        positive: 0,
        negative: 0,
        neutral: 0,
      };
      entry[impact]++;
      sectorMap.set(sector, entry);
    }
  }

  return Array.from(sectorMap.entries()).map(([sectorGroup, counts]) => {
    const score = counts.positive - counts.negative;
    return {
      sectorGroup,
      positiveCount: counts.positive,
      negativeCount: counts.negative,
      neutralCount: counts.neutral,
      score,
      isNewsNegative: score < 0,
    };
  });
}
