#!/usr/bin/env npx tsx
/**
 * セクタートレンド計算スクリプト
 *
 * 機能:
 * - 直近7日間のMarketNewsをセクター別に集計（3日窓・7日窓）
 * - USニュースをJPセクターにマッピング（0.7倍の重み）
 * - 株価モメンタム（セクター内全銘柄の平均）を取得
 * - ニュース + 株価 + 出来高の総合スコア（compositeScore）を算出
 * - SectorTrendテーブルにUPSERT
 */

import { PrismaClient } from "@prisma/client"
import dayjs from "dayjs"
import utc from "dayjs/plugin/utc"
import timezone from "dayjs/plugin/timezone"

dayjs.extend(utc)
dayjs.extend(timezone)

const prisma = new PrismaClient()

const JST = "Asia/Tokyo"

// --- 定数（standalone script 用にインライン定義、lib/constants.ts の SECTOR_MASTER と同期） ---

/** セクターマスタ: グループ名 → 東証業種分類 */
const SECTOR_MASTER: Record<string, readonly string[]> = {
  "半導体・電子部品": ["電気機器", "精密機器"],
  "自動車": ["輸送用機器"],
  "金融": ["銀行業", "証券、商品先物取引業", "保険業", "卸売業"],
  "医薬品": ["医薬品"],
  "IT・サービス": ["情報・通信業", "サービス業"],
  "エネルギー": ["電気・ガス業", "鉱業", "石油・石炭製品"],
  "小売": ["小売業", "食料品"],
  "不動産": ["不動産業", "建設業"],
  "素材": ["化学", "鉄鋼", "非鉄金属", "金属製品", "ガラス・土石製品", "繊維製品"],
  "運輸": ["陸運業", "海運業", "空運業"],
  "その他": ["その他製品"],
}

const JP_SECTORS = Object.keys(SECTOR_MASTER)

/** 全TSE業種のフラットリスト（Stock.sector の groupBy に使用） */
const ALL_TSE_INDUSTRIES = Object.values(SECTOR_MASTER).flat()

/** TSE業種 → セクターグループの逆引き */
const TSE_TO_SECTOR: Record<string, string> = {}
for (const [group, industries] of Object.entries(SECTOR_MASTER)) {
  for (const industry of industries) {
    TSE_TO_SECTOR[industry] = group
  }
}

const US_TO_JP_SECTOR_MAP: Record<string, string[]> = {
  "半導体・電子部品": ["半導体・電子部品", "Technology", "Semiconductor"],
  自動車: ["自動車", "Automotive", "EV"],
  金融: ["金融", "Financial", "Banking"],
  医薬品: ["医薬品", "Healthcare", "Pharma"],
  "IT・サービス": ["IT・サービス", "Technology", "Software"],
  エネルギー: ["エネルギー", "Energy"],
  小売: ["小売", "Retail"],
  不動産: ["不動産", "Real Estate"],
  素材: ["素材", "Materials"],
  運輸: ["運輸", "Transportation", "Airline", "Shipping"],
}

const US_INFLUENCE_WEIGHT = 0.7
const NEWS_WEIGHT = 0.4
const PRICE_WEIGHT = 0.4
const VOLUME_WEIGHT = 0.2
const PRICE_CLAMP = 10
const VOLUME_CLAMP = 1
const UP_THRESHOLD = 20
const DOWN_THRESHOLD = -20

// --- 型定義 ---

interface SectorNewsAgg {
  jpPositive: number
  jpNegative: number
  jpNeutral: number
  usPositive: number
  usNegative: number
  usNeutral: number
  usNewsCount: number
}

interface SectorPriceMomentum {
  avgWeekChangeRate: number | null
  avgDailyChangeRate: number | null
  avgMaDeviationRate: number | null
  avgVolumeRatio: number | null
  avgVolatility: number | null
  stockCount: number
  avgPER: number | null
  avgPBR: number | null
  avgROE: number | null
}

// --- ユーティリティ ---

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value))
}

/**
 * ニューススコア算出（JP + US重み付き）
 * JPニュースは重み1.0、USニュースは重み US_INFLUENCE_WEIGHT (0.7)
 *
 * weighted_positive = jp_positive + us_positive * 0.7
 * weighted_negative = jp_negative + us_negative * 0.7
 * weighted_total = jp_total + us_total * 0.7
 * newsScore = ((weighted_positive - weighted_negative) / weighted_total) * 100 * log2(weighted_total + 1)
 */
function calcNewsScore(agg: SectorNewsAgg): number {
  const jpTotal = agg.jpPositive + agg.jpNegative + agg.jpNeutral
  const usTotal = agg.usPositive + agg.usNegative + agg.usNeutral

  if (jpTotal + usTotal === 0) return 0

  const weightedPositive = agg.jpPositive + agg.usPositive * US_INFLUENCE_WEIGHT
  const weightedNegative = agg.jpNegative + agg.usNegative * US_INFLUENCE_WEIGHT
  const weightedTotal = jpTotal + usTotal * US_INFLUENCE_WEIGHT

  if (weightedTotal === 0) return 0

  return ((weightedPositive - weightedNegative) / weightedTotal) * 100 * Math.log2(weightedTotal + 1)
}

/** JP/US合算のニュース総数（DB保存用、重みなし） */
function totalNewsCount(agg: SectorNewsAgg): number {
  return agg.jpPositive + agg.jpNegative + agg.jpNeutral + agg.usPositive + agg.usNegative + agg.usNeutral
}

/** JP/US合算のポジティブ件数（DB保存用、重みなし） */
function totalPositive(agg: SectorNewsAgg): number {
  return agg.jpPositive + agg.usPositive
}

/** JP/US合算のネガティブ件数（DB保存用、重みなし） */
function totalNegative(agg: SectorNewsAgg): number {
  return agg.jpNegative + agg.usNegative
}

/** JP/US合算のニュートラル件数（DB保存用、重みなし） */
function totalNeutral(agg: SectorNewsAgg): number {
  return agg.jpNeutral + agg.usNeutral
}

/**
 * USニュースのセクターをJPセクターにマッピング
 * 1つのUSニュースが複数のJPセクターにマッピングされる場合がある
 */
function mapUSNewsToJPSectors(usSector: string | null): string[] {
  if (!usSector) return []
  const matched: string[] = []
  for (const [jpSector, usSectors] of Object.entries(US_TO_JP_SECTOR_MAP)) {
    if (usSectors.some((s) => usSector.includes(s))) {
      matched.push(jpSector)
    }
  }
  return matched
}

// --- メイン処理 ---

async function main(): Promise<void> {
  console.log("=".repeat(60))
  console.log("セクタートレンド計算スクリプト")
  console.log("=".repeat(60))

  // JSTの日付をそのままUTC 00:00のDateとして作成（@db.Date用）
  const jstToday = dayjs().tz(JST).startOf("day")
  const today = new Date(Date.UTC(jstToday.year(), jstToday.month(), jstToday.date()))
  const jst3d = dayjs().tz(JST).subtract(3, "day").startOf("day")
  const threeDaysAgo = new Date(Date.UTC(jst3d.year(), jst3d.month(), jst3d.date()))
  const jst7d = dayjs().tz(JST).subtract(7, "day").startOf("day")
  const sevenDaysAgo = new Date(Date.UTC(jst7d.year(), jst7d.month(), jst7d.date()))

  console.log(`\n対象期間: ${dayjs(sevenDaysAgo).format("YYYY-MM-DD")} 〜 ${dayjs(today).format("YYYY-MM-DD")}`)

  // -------------------------------------------------------
  // 1. 直近7日間のニュースを一括取得
  // -------------------------------------------------------
  console.log("\n[1/4] ニュースデータ取得中...")
  const allNews = await prisma.marketNews.findMany({
    where: {
      publishedAt: { gte: sevenDaysAgo },
    },
    select: {
      sector: true,
      sentiment: true,
      market: true,
      publishedAt: true,
      impactSectors: true,
      category: true,
    },
  })
  console.log(`  取得件数: ${allNews.length}件`)

  // -------------------------------------------------------
  // 2. セクター別にニュースを集計（3日窓・7日窓）
  // -------------------------------------------------------
  console.log("\n[2/4] セクター別ニュース集計中...")

  // 初期化
  const agg3d: Record<string, SectorNewsAgg> = {}
  const agg7d: Record<string, SectorNewsAgg> = {}
  const emptyAgg = (): SectorNewsAgg => ({
    jpPositive: 0, jpNegative: 0, jpNeutral: 0,
    usPositive: 0, usNegative: 0, usNeutral: 0,
    usNewsCount: 0,
  })
  for (const sector of JP_SECTORS) {
    agg3d[sector] = emptyAgg()
    agg7d[sector] = emptyAgg()
  }

  for (const news of allNews) {
    const isWithin3d = news.publishedAt >= threeDaysAgo
    const sentiment = news.sentiment as string | null

    if (news.market === "JP") {
      // JPニュース: セクターが直接一致するものを集計
      const sector = news.sector
      if (sector && sector in agg7d) {
        addSentiment(agg7d[sector], sentiment, false)
        if (isWithin3d) {
          addSentiment(agg3d[sector], sentiment, false)
        }
      }
    } else if (news.market === "US") {
      // USニュース: JPセクターにマッピング（重み 0.7）
      const jpSectors = mapUSNewsToJPSectors(news.sector)
      for (const jpSector of jpSectors) {
        if (jpSector in agg7d) {
          addSentiment(agg7d[jpSector], sentiment, true)
          if (isWithin3d) {
            addSentiment(agg3d[jpSector], sentiment, true)
          }
        }
      }
    }

    // impactSectors展開集計（sectorと同じセクターは二重カウント回避）
    if (news.impactSectors) {
      try {
        const sectors: string[] = JSON.parse(news.impactSectors as string)
        const isUS = news.market === "US"
        for (const impactSector of sectors) {
          if (impactSector === news.sector) continue
          if (impactSector in agg7d) {
            addSentiment(agg7d[impactSector], sentiment, isUS)
            if (isWithin3d) {
              addSentiment(agg3d[impactSector], sentiment, isUS)
            }
          }
        }
      } catch {
        // JSONパースエラーは無視
      }
    }
  }

  for (const sector of JP_SECTORS) {
    const a7 = agg7d[sector]
    const a3 = agg3d[sector]
    console.log(
      `  ${sector}: 7d=${totalNewsCount(a7)}件(+${totalPositive(a7)}/-${totalNegative(a7)}/=${totalNeutral(a7)}, US=${a7.usNewsCount}), 3d=${totalNewsCount(a3)}件(+${totalPositive(a3)}/-${totalNegative(a3)}/=${totalNeutral(a3)}, US=${a3.usNewsCount})`
    )
  }

  // -------------------------------------------------------
  // 3. 株価モメンタム取得（セクター別 groupBy）
  // -------------------------------------------------------
  console.log("\n[3/4] 株価モメンタム取得中...")

  // TSE業種分類で groupBy し、セクターグループに集約
  const stockGroupBy = await prisma.stock.groupBy({
    by: ["sector"],
    where: {
      sector: { in: ALL_TSE_INDUSTRIES },
      isDelisted: false,
      weekChangeRate: { not: null },
    },
    _avg: {
      weekChangeRate: true,
      dailyChangeRate: true,
      maDeviationRate: true,
      volumeRatio: true,
      volatility: true,
      per: true,
      pbr: true,
      roe: true,
    },
    _count: {
      id: true,
    },
  })

  // セクターグループ別にマッピング（複数のTSE業種を加重平均で集約）
  const priceMomentum: Record<string, SectorPriceMomentum> = {}
  for (const sector of JP_SECTORS) {
    priceMomentum[sector] = {
      avgWeekChangeRate: null,
      avgDailyChangeRate: null,
      avgMaDeviationRate: null,
      avgVolumeRatio: null,
      avgVolatility: null,
      stockCount: 0,
      avgPER: null,
      avgPBR: null,
      avgROE: null,
    }
  }

  // TSE業種の結果をセクターグループに集約（銘柄数による加重平均）
  const groupSums: Record<string, {
    weekChangeRate: number; dailyChangeRate: number; maDeviationRate: number;
    volumeRatio: number; volatility: number; per: number; pbr: number; roe: number;
    weekCount: number; dailyCount: number; maCount: number;
    volCount: number; volatCount: number; perCount: number; pbrCount: number; roeCount: number;
    totalCount: number;
  }> = {}
  for (const sector of JP_SECTORS) {
    groupSums[sector] = {
      weekChangeRate: 0, dailyChangeRate: 0, maDeviationRate: 0,
      volumeRatio: 0, volatility: 0, per: 0, pbr: 0, roe: 0,
      weekCount: 0, dailyCount: 0, maCount: 0,
      volCount: 0, volatCount: 0, perCount: 0, pbrCount: 0, roeCount: 0,
      totalCount: 0,
    }
  }

  for (const row of stockGroupBy) {
    const tseSector = row.sector as string
    const group = TSE_TO_SECTOR[tseSector]
    if (!group || !(group in groupSums)) continue

    const s = groupSums[group]
    const count = row._count.id
    s.totalCount += count

    if (row._avg.weekChangeRate !== null) { s.weekChangeRate += Number(row._avg.weekChangeRate) * count; s.weekCount += count }
    if (row._avg.dailyChangeRate !== null) { s.dailyChangeRate += Number(row._avg.dailyChangeRate) * count; s.dailyCount += count }
    if (row._avg.maDeviationRate !== null) { s.maDeviationRate += Number(row._avg.maDeviationRate) * count; s.maCount += count }
    if (row._avg.volumeRatio !== null) { s.volumeRatio += Number(row._avg.volumeRatio) * count; s.volCount += count }
    if (row._avg.volatility !== null) { s.volatility += Number(row._avg.volatility) * count; s.volatCount += count }
    if (row._avg.per !== null) { s.per += Number(row._avg.per) * count; s.perCount += count }
    if (row._avg.pbr !== null) { s.pbr += Number(row._avg.pbr) * count; s.pbrCount += count }
    if (row._avg.roe !== null) { s.roe += Number(row._avg.roe) * count; s.roeCount += count }
  }

  for (const sector of JP_SECTORS) {
    const s = groupSums[sector]
    if (s.totalCount > 0) {
      priceMomentum[sector] = {
        avgWeekChangeRate: s.weekCount > 0 ? s.weekChangeRate / s.weekCount : null,
        avgDailyChangeRate: s.dailyCount > 0 ? s.dailyChangeRate / s.dailyCount : null,
        avgMaDeviationRate: s.maCount > 0 ? s.maDeviationRate / s.maCount : null,
        avgVolumeRatio: s.volCount > 0 ? s.volumeRatio / s.volCount : null,
        avgVolatility: s.volatCount > 0 ? s.volatility / s.volatCount : null,
        stockCount: s.totalCount,
        avgPER: s.perCount > 0 ? s.per / s.perCount : null,
        avgPBR: s.pbrCount > 0 ? s.pbr / s.pbrCount : null,
        avgROE: s.roeCount > 0 ? s.roe / s.roeCount : null,
      }
    }
  }

  for (const sector of JP_SECTORS) {
    const m = priceMomentum[sector]
    console.log(
      `  ${sector}: 銘柄数=${m.stockCount}, 週間=${m.avgWeekChangeRate?.toFixed(2) ?? "N/A"}%, 日次=${m.avgDailyChangeRate?.toFixed(2) ?? "N/A"}%, 出来高比=${m.avgVolumeRatio?.toFixed(2) ?? "N/A"}`
    )
  }

  // -------------------------------------------------------
  // 4. 総合スコア算出 & UPSERT
  // -------------------------------------------------------
  console.log("\n[4/4] 総合スコア算出・保存中...")

  const upsertPromises = JP_SECTORS.map((sector) => {
    const a3 = agg3d[sector]
    const a7 = agg7d[sector]
    const m = priceMomentum[sector]

    // ニューススコア（7d窓をベースに総合スコア算出）
    const newsScore = calcNewsScore(a7)

    // 株価スコア
    const priceScore =
      m.avgWeekChangeRate !== null ? clamp(m.avgWeekChangeRate, -PRICE_CLAMP, PRICE_CLAMP) * 10 : 0

    // 出来高スコア
    const volumeScore =
      m.avgVolumeRatio !== null ? clamp(m.avgVolumeRatio - 1.0, -VOLUME_CLAMP, VOLUME_CLAMP) * 100 : 0

    // 総合スコア
    const compositeScore = newsScore * NEWS_WEIGHT + priceScore * PRICE_WEIGHT + volumeScore * VOLUME_WEIGHT

    // トレンド方向
    let trendDirection: string
    if (compositeScore >= UP_THRESHOLD) {
      trendDirection = "up"
    } else if (compositeScore <= DOWN_THRESHOLD) {
      trendDirection = "down"
    } else {
      trendDirection = "neutral"
    }

    // ニューススコア（3d, 7d個別）
    const score3d = calcNewsScore(a3)
    const score7d = calcNewsScore(a7)

    console.log(
      `  ${sector}: news=${newsScore.toFixed(1)}, price=${priceScore.toFixed(1)}, vol=${volumeScore.toFixed(1)} → composite=${compositeScore.toFixed(1)} (${trendDirection})`
    )

    const data = {
      score3d,
      newsCount3d: totalNewsCount(a3),
      positive3d: totalPositive(a3),
      negative3d: totalNegative(a3),
      neutral3d: totalNeutral(a3),
      score7d,
      newsCount7d: totalNewsCount(a7),
      positive7d: totalPositive(a7),
      negative7d: totalNegative(a7),
      neutral7d: totalNeutral(a7),
      usNewsCount3d: a3.usNewsCount,
      usNewsCount7d: a7.usNewsCount,
      avgWeekChangeRate: m.avgWeekChangeRate,
      avgDailyChangeRate: m.avgDailyChangeRate,
      avgMaDeviationRate: m.avgMaDeviationRate,
      avgVolumeRatio: m.avgVolumeRatio,
      avgVolatility: m.avgVolatility,
      stockCount: m.stockCount,
      avgPER: m.avgPER,
      avgPBR: m.avgPBR,
      avgROE: m.avgROE,
      compositeScore,
      trendDirection,
    }

    return prisma.sectorTrend.upsert({
      where: { date_sector: { date: today, sector } },
      update: data,
      create: { date: today, sector, ...data },
    })
  })

  await Promise.all(upsertPromises)

  console.log(`\n${"=".repeat(60)}`)
  console.log(`セクタートレンド計算完了: ${JP_SECTORS.length}セクター保存`)
  console.log("=".repeat(60))
}

/**
 * センチメントを集計に加算する
 * JP/USを分離して記録し、スコア計算時に重み付けする
 */
function addSentiment(agg: SectorNewsAgg, sentiment: string | null, isUS: boolean): void {
  if (isUS) {
    agg.usNewsCount++
    switch (sentiment) {
      case "positive": agg.usPositive++; break
      case "negative": agg.usNegative++; break
      case "neutral": agg.usNeutral++; break
    }
  } else {
    switch (sentiment) {
      case "positive": agg.jpPositive++; break
      case "negative": agg.jpNegative++; break
      case "neutral": agg.jpNeutral++; break
    }
  }
}

main()
  .catch((error) => {
    console.error("Error:", error)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })

export {}
