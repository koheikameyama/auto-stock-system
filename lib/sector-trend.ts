/**
 * セクタートレンド取得・フォーマットユーティリティ
 */

import { prisma } from "@/lib/prisma"
import { getTodayForDB } from "@/lib/date-utils"
import { SECTOR_TREND } from "@/lib/constants"

export interface SectorTrendData {
  sector: string
  score3d: number
  score7d: number
  newsCount3d: number
  newsCount7d: number
  positive3d: number
  negative3d: number
  neutral3d: number
  positive7d: number
  negative7d: number
  neutral7d: number
  usNewsCount3d: number
  usNewsCount7d: number
  avgWeekChangeRate: number | null
  avgDailyChangeRate: number | null
  avgMaDeviationRate: number | null
  avgVolumeRatio: number | null
  avgVolatility: number | null
  stockCount: number
  compositeScore: number | null
  trendDirection: string
  avgPER: number | null
  avgPBR: number | null
  avgROE: number | null
}

/**
 * 特定セクターのトレンドを取得
 */
export async function getSectorTrend(sector: string): Promise<SectorTrendData | null> {
  const today = getTodayForDB()
  const trend = await prisma.sectorTrend.findUnique({
    where: { date_sector: { date: today, sector } },
  })
  return trend
}

/**
 * 全セクターのトレンドを取得（ダッシュボード用）
 * 最新の日付のデータを返す
 */
export async function getAllSectorTrends(): Promise<{ date: Date | null; trends: SectorTrendData[] }> {
  const latest = await prisma.sectorTrend.findFirst({
    orderBy: { date: "desc" },
    select: { date: true },
  })
  if (!latest) return { date: null, trends: [] }

  const trends = await prisma.sectorTrend.findMany({
    where: { date: latest.date },
    orderBy: { compositeScore: "desc" },
  })
  return { date: latest.date, trends }
}

/**
 * トレンド方向の矢印を取得
 */
function getTrendArrow(direction: string): string {
  if (direction === "up") return "▲"
  if (direction === "down") return "▼"
  return "▶"
}

/**
 * トレンド強度のラベルを取得
 */
function getTrendLabel(score: number | null): string {
  if (score === null) return "データ不足"
  if (score >= SECTOR_TREND.STRONG_UP_THRESHOLD) return "強い追い風"
  if (score >= SECTOR_TREND.UP_THRESHOLD) return "追い風"
  if (score <= SECTOR_TREND.STRONG_DOWN_THRESHOLD) return "強い逆風"
  if (score <= SECTOR_TREND.DOWN_THRESHOLD) return "逆風"
  return "中立"
}

/**
 * 特定セクターのトレンドをAIプロンプト用テキストに変換
 */
export function formatSectorTrendForPrompt(trend: SectorTrendData): string {
  const arrow = getTrendArrow(trend.trendDirection)
  const score = trend.compositeScore ?? trend.score3d
  const label = getTrendLabel(trend.compositeScore)
  const usNote = trend.usNewsCount3d > 0
    ? ` / 米国関連ニュース${trend.usNewsCount3d}件`
    : ""
  const priceNote = trend.avgWeekChangeRate !== null
    ? ` / セクター平均週間${trend.avgWeekChangeRate >= 0 ? "+" : ""}${trend.avgWeekChangeRate.toFixed(1)}%`
    : ""
  const volumeNote = trend.avgVolumeRatio !== null
    ? `、出来高${trend.avgVolumeRatio.toFixed(1)}倍`
    : ""

  const fundamentalParts = [
    trend.avgPER !== null ? `PER${trend.avgPER.toFixed(1)}倍` : null,
    trend.avgPBR !== null ? `PBR${trend.avgPBR.toFixed(1)}倍` : null,
    trend.avgROE !== null ? `ROE${(trend.avgROE * 100).toFixed(1)}%` : null,
  ].filter(Boolean)
  const fundamentalNote = fundamentalParts.length > 0 ? `\n  ファンダメンタル平均: ${fundamentalParts.join("、")}` : ""

  return `【${trend.sector}】${arrow} ${label}（総合スコア${score >= 0 ? "+" : ""}${score.toFixed(0)}）
  ニュース: ポジティブ${trend.positive3d}件/${trend.newsCount3d}件（スコア${trend.score3d >= 0 ? "+" : ""}${trend.score3d.toFixed(0)}）${usNote}
  株価: ${priceNote ? priceNote.replace(" / ", "") : "データなし"}${volumeNote}${fundamentalNote}`
}

/**
 * 全セクタートレンドをAIプロンプト用テキストに変換（おすすめ生成用）
 */
export function formatAllSectorTrendsForPrompt(trends: SectorTrendData[]): string {
  if (trends.length === 0) return ""

  const lines = trends.map(formatSectorTrendForPrompt)
  return `
## 市場セクター動向
以下は直近のセクター別トレンド（ニュース + 株価統合）です。銘柄選定の参考にしてください。
${lines.join("\n")}
`
}

/**
 * おすすめスコアリング用のセクターボーナスを計算
 */
export function getSectorScoreBonus(trend: SectorTrendData | null): number {
  if (!trend) return 0
  const score = trend.compositeScore ?? trend.score3d

  if (score >= SECTOR_TREND.STRONG_UP_THRESHOLD) return SECTOR_TREND.STRONG_UP_BONUS
  if (score >= SECTOR_TREND.UP_THRESHOLD) return SECTOR_TREND.UP_BONUS
  if (score <= SECTOR_TREND.STRONG_DOWN_THRESHOLD) return SECTOR_TREND.STRONG_DOWN_PENALTY
  if (score <= SECTOR_TREND.DOWN_THRESHOLD) return SECTOR_TREND.DOWN_PENALTY
  return 0
}
