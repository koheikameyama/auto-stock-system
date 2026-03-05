/**
 * 日次注目銘柄のスコア計算ロジック
 *
 * recommendation-scoring.ts から移行
 * "buy candidate" 概念を除去し、客観スコアリングに変更
 */

import { PERSPECTIVE_BONUS, getSectorGroup } from "@/lib/constants"
import { computeSectorRankBonuses, getSectorScoreBonus, type SectorTrendData } from "@/lib/sector-trend"

// 設定
export const HIGHLIGHT_SCORING_CONFIG = {
  MAX_PER_SECTOR: 5,
  MAX_CANDIDATES_FOR_AI: 15,
  MAX_VOLATILITY: 50,
  BUDGET_ROUND_UP_UNIT: 100_000,
  SECTOR_LIMIT_STRONG_UP: 7,
  SECTOR_LIMIT_UP: 6,
  SECTOR_LIMIT_NEUTRAL: 5,
  SECTOR_LIMIT_DOWN: 3,
  SECTOR_LIMIT_STRONG_DOWN: 2,
}

// 赤字 AND 高ボラティリティ銘柄へのスコアペナルティ（投資スタイル別）
export const RISK_PENALTY: Record<string, number> = {
  AGGRESSIVE: -10,
  BALANCED: -20,
  CONSERVATIVE: -30,
}

type ScoreWeights = {
  weekChangeRate: number
  volumeRatio: number
  volatility: number
  marketCap: number
}

export const SCORE_WEIGHTS: Record<string, ScoreWeights> = {
  AGGRESSIVE: { weekChangeRate: 35, volumeRatio: 30, volatility: 20, marketCap: 15 },
  BALANCED: { weekChangeRate: 25, volumeRatio: 25, volatility: 25, marketCap: 25 },
  CONSERVATIVE: { weekChangeRate: 15, volumeRatio: 15, volatility: 30, marketCap: 40 },
}

// 時間帯別の分析コンテキスト
export const SESSION_CONTEXT: Record<string, {
  intro: string
  focus: string
  timeHorizon: string
  keySignals: string
  analysisContext: string
  cautionSignals: string
}> = {
  morning: {
    intro: "前日の動きを踏まえた今日の注目銘柄です。",
    focus: "今日の前場で注目すべき銘柄",
    timeHorizon: "今日〜今週",
    keySignals: "出来高急増・モメンタム・前日比の方向感・MA乖離率（過熱していないか）",
    analysisContext: "今日の前場で注目すべきデータの変化がある銘柄を客観的に分析する",
    cautionSignals: "前週比+20%以上の急騰銘柄（過熱感あり）・出来高比0.5倍以下の薄商い銘柄",
  },
  afternoon: {
    intro: "前場の動きを踏まえた注目銘柄です。",
    focus: "後場に注目すべき銘柄",
    timeHorizon: "今日の後場〜明日",
    keySignals: "前場の出来高比・前場の高値/安値からのトレンド継続性・MA乖離率の変化",
    analysisContext: "前場の動きを踏まえ、後場で注目すべきデータの変化がある銘柄を客観的に分析する",
    cautionSignals: "前場で急騰後に出来高が細っている銘柄（後場に反落リスク）",
  },
  evening: {
    intro: "本日の取引を踏まえた明日への注目銘柄です。",
    focus: "明日以降に注目すべき銘柄",
    timeHorizon: "明日〜来週",
    keySignals: "週間トレンド・決算予定・セクタートレンドの方向性・ファンダメンタルズの強さ",
    analysisContext: "今日の動きより中長期の視点で、投資スタイルに合った注目銘柄を客観的に分析する",
    cautionSignals: "今日大きく動いた銘柄（翌日の反動リスク）・決算直前で不確実性が高い銘柄",
  },
}

export interface StockForScoring {
  id: string
  tickerCode: string
  name: string
  sector: string | null
  latestPrice: number | null
  weekChangeRate: number | null
  volatility: number | null
  volumeRatio: number | null
  marketCap: number | null
  isProfitable: boolean | null
  maDeviationRate: number | null
  nextEarningsDate: Date | null
  dividendYield: number | null
  pbr: number | null
  per: number | null
  roe: number | null
  revenueGrowth: number | null
  debtEquityRatio: number | null
  currentRatio: number | null
  dividendGrowthRate: number | null
  payoutRatio: number | null
  profitTrend: string | null
}

export interface ScoredStock extends StockForScoring {
  score: number
  scoreBreakdown: Record<string, number>
}

/**
 * 指標を0-100に正規化する
 */
function normalizeValues(
  stocks: StockForScoring[],
  key: keyof StockForScoring,
  reverse: boolean = false
): Map<string, number> {
  const values: Array<{ id: string; value: number }> = []

  for (const stock of stocks) {
    const val = stock[key]
    if (typeof val === "number" && val !== null) {
      values.push({ id: stock.id, value: val })
    }
  }

  if (values.length === 0) return new Map()

  const vals = values.map(v => v.value)
  const minVal = Math.min(...vals)
  const maxVal = Math.max(...vals)

  if (maxVal === minVal) {
    return new Map(values.map(v => [v.id, 50]))
  }

  const result = new Map<string, number>()
  for (const { id, value } of values) {
    let score = ((value - minVal) / (maxVal - minVal)) * 100
    if (reverse) score = 100 - score
    result.set(id, score)
  }

  return result
}

/**
 * 投資スタイルに基づいてスコアを計算
 */
export function calculateStockScores(
  stocks: StockForScoring[],
  investmentStyle: string | null,
  sectorTrends?: Record<string, SectorTrendData>,
): ScoredStock[] {
  const style = investmentStyle || "BALANCED"
  const weights = SCORE_WEIGHTS[style] || SCORE_WEIGHTS["BALANCED"]

  const isLowRisk = investmentStyle === "CONSERVATIVE"

  const normalized = {
    weekChangeRate: normalizeValues(stocks, "weekChangeRate"),
    volumeRatio: normalizeValues(stocks, "volumeRatio"),
    volatility: normalizeValues(stocks, "volatility", isLowRisk),
    marketCap: normalizeValues(stocks, "marketCap"),
  }

  const penalty = RISK_PENALTY[style] || -20
  const scoredStocks: ScoredStock[] = []

  const sectorRankBonuses = sectorTrends
    ? computeSectorRankBonuses(sectorTrends)
    : {}

  for (const stock of stocks) {
    let totalScore = 0
    const scoreBreakdown: Record<string, number> = {}

    for (const [weightKey, weight] of Object.entries(weights)) {
      const normalizedMap = normalized[weightKey as keyof typeof normalized]
      const val = normalizedMap.get(stock.id)
      const componentScore = (val !== undefined ? val : 50) * (weight / 100)
      totalScore += componentScore
      scoreBreakdown[weightKey] = Math.round(componentScore * 10) / 10
    }

    const isHighRiskStock = (
      stock.isProfitable === false &&
      stock.volatility !== null &&
      stock.volatility > HIGHLIGHT_SCORING_CONFIG.MAX_VOLATILITY
    )
    if (isHighRiskStock && penalty !== 0) {
      totalScore += penalty
      scoreBreakdown["riskPenalty"] = penalty
    }

    if (stock.isProfitable === null) {
      totalScore -= 5
      scoreBreakdown["unknownEarningsPenalty"] = -5
    }

    const stockSectorGroup = getSectorGroup(stock.sector)
    if (sectorTrends && stockSectorGroup && sectorTrends[stockSectorGroup]) {
      const continuousBonus = getSectorScoreBonus(sectorTrends[stockSectorGroup])
      const rankBonus = sectorRankBonuses[stockSectorGroup] || 0
      if (continuousBonus !== 0) {
        totalScore += continuousBonus
        scoreBreakdown["sectorTrendBonus"] = continuousBonus
      }
      if (rankBonus !== 0) {
        totalScore += rankBonus
        scoreBreakdown["sectorRankBonus"] = rankBonus
      }
    }

    // 投資観点に基づくボーナス/ペナルティ
    if (style === "CONSERVATIVE") {
      const pb = PERSPECTIVE_BONUS.CONSERVATIVE
      if (stock.dividendYield !== null) {
        if (stock.dividendYield >= 4) {
          totalScore += pb.HIGH_DIVIDEND
          scoreBreakdown["dividendBonus"] = pb.HIGH_DIVIDEND
        } else if (stock.dividendYield >= 2) {
          totalScore += pb.NORMAL_DIVIDEND
          scoreBreakdown["dividendBonus"] = pb.NORMAL_DIVIDEND
        } else {
          totalScore += pb.NO_DIVIDEND
          scoreBreakdown["dividendPenalty"] = pb.NO_DIVIDEND
        }
      }
      if (stock.pbr !== null) {
        if (stock.pbr < 1) {
          totalScore += pb.LOW_PBR
          scoreBreakdown["pbrBonus"] = pb.LOW_PBR
        } else if (stock.pbr < 1.5) {
          totalScore += pb.FAIR_PBR
          scoreBreakdown["pbrBonus"] = pb.FAIR_PBR
        } else if (stock.pbr > 3) {
          totalScore += pb.HIGH_PBR
          scoreBreakdown["pbrPenalty"] = pb.HIGH_PBR
        }
      }
      if (stock.per !== null && stock.per > 0 && stock.per < 15) {
        totalScore += pb.LOW_PER
        scoreBreakdown["perBonus"] = pb.LOW_PER
      }
      if (stock.isProfitable === true) {
        totalScore += pb.PROFITABLE
        scoreBreakdown["profitableBonus"] = pb.PROFITABLE
      }
      if (stock.debtEquityRatio !== null) {
        if (stock.debtEquityRatio < 0.5) {
          totalScore += pb.LOW_DEBT
          scoreBreakdown["debtBonus"] = pb.LOW_DEBT
        } else if (stock.debtEquityRatio >= 2.0) {
          totalScore += pb.HIGH_DEBT
          scoreBreakdown["debtPenalty"] = pb.HIGH_DEBT
        }
      }
      if (stock.payoutRatio !== null) {
        if (stock.payoutRatio < 50) {
          totalScore += pb.HEALTHY_PAYOUT
          scoreBreakdown["payoutBonus"] = pb.HEALTHY_PAYOUT
        } else if (stock.payoutRatio >= 80) {
          totalScore += pb.HIGH_PAYOUT
          scoreBreakdown["payoutPenalty"] = pb.HIGH_PAYOUT
        }
      }
      if (stock.dividendGrowthRate !== null && stock.dividendGrowthRate > 0) {
        totalScore += pb.DIVIDEND_GROWTH
        scoreBreakdown["dividendGrowthBonus"] = pb.DIVIDEND_GROWTH
      }
    } else if (style === "BALANCED") {
      const pb = PERSPECTIVE_BONUS.BALANCED
      if (stock.revenueGrowth !== null) {
        if (stock.revenueGrowth >= 20) {
          totalScore += pb.HIGH_GROWTH
          scoreBreakdown["growthBonus"] = pb.HIGH_GROWTH
        } else if (stock.revenueGrowth >= 10) {
          totalScore += pb.MODERATE_GROWTH
          scoreBreakdown["growthBonus"] = pb.MODERATE_GROWTH
        } else if (stock.revenueGrowth < 0) {
          totalScore += pb.NEGATIVE_GROWTH
          scoreBreakdown["growthPenalty"] = pb.NEGATIVE_GROWTH
        }
      }
      if (stock.roe !== null) {
        if (stock.roe >= 15) {
          totalScore += pb.HIGH_ROE
          scoreBreakdown["roeBonus"] = pb.HIGH_ROE
        } else if (stock.roe >= 10) {
          totalScore += pb.GOOD_ROE
          scoreBreakdown["roeBonus"] = pb.GOOD_ROE
        }
      }
      if (stock.pbr !== null && stock.pbr < 1) {
        totalScore += pb.LOW_PBR
        scoreBreakdown["pbrBonus"] = pb.LOW_PBR
      }
      if (stock.per !== null && stock.per >= 15 && stock.per <= 30) {
        totalScore += pb.GROWTH_PER
        scoreBreakdown["perBonus"] = pb.GROWTH_PER
      }
    } else if (style === "AGGRESSIVE") {
      const pb = PERSPECTIVE_BONUS.AGGRESSIVE
      if (stock.revenueGrowth !== null) {
        if (stock.revenueGrowth >= 20) {
          totalScore += pb.HIGH_GROWTH
          scoreBreakdown["growthBonus"] = pb.HIGH_GROWTH
        } else if (stock.revenueGrowth >= 10) {
          totalScore += pb.MODERATE_GROWTH
          scoreBreakdown["growthBonus"] = pb.MODERATE_GROWTH
        }
      }
    }

    scoredStocks.push({
      ...stock,
      score: Math.round(totalScore * 100) / 100,
      scoreBreakdown,
    })
  }

  scoredStocks.sort((a, b) => b.score - a.score)
  return scoredStocks
}

/** 投資予算（総額）で1単元（100株）購入可能な銘柄にフィルタ */
export function filterByTotalBudget(
  stocks: StockForScoring[],
  totalBudget: number | null,
): StockForScoring[] {
  if (!totalBudget) return stocks
  return stocks.filter(s =>
    s.latestPrice !== null && s.latestPrice * 100 <= totalBudget
  )
}

/** セクターキャップを適用（同一セクターから最大maxPerSector銘柄まで） */
export function applySectorCap(
  stocks: ScoredStock[],
  maxPerSector: number = 2,
): ScoredStock[] {
  const counts: Record<string, number> = {}
  return stocks.filter(stock => {
    const sector = getSectorGroup(stock.sector) || "その他"
    counts[sector] = (counts[sector] || 0) + 1
    return counts[sector] <= maxPerSector
  })
}
