/**
 * 買い候補シグナル判定
 *
 * チャート分析・ファンダメンタル分析の観点で「買い推奨できるか」を判定。
 * 日次おすすめの候補フィルター、購入判断のコンテキスト、
 * ポートフォリオ分析、銘柄詳細表示など各所で再利用可能。
 */
import { BUY_CANDIDATE_FILTER, MOMENTUM } from "@/lib/constants"
import { type StockForScoring } from "@/lib/recommendation-scoring"

const HIGH_VOLATILITY_THRESHOLD = 50;

// --- 入力・出力の型定義 ---

/** シグナル判定に必要な最小フィールド */
export interface BuySignalInput {
  weekChangeRate: number | null
  maDeviationRate: number | null
  volumeRatio: number | null
  isProfitable: boolean | null
  profitTrend: string | null
  revenueGrowth: number | null
  volatility: number | null
}

/** シグナル判定結果 */
export interface BuySignalResult {
  isBuyCandidate: boolean
  positiveSignals: string[]
  negativeSignals: string[]
}

// --- チャート分析シグナル ---

/**
 * チャート分析の買い候補判定（理由付き）
 *
 * 条件（すべて満たす必要あり）:
 * 1. 過熱でない（MA乖離率 < 15%、AGGRESSIVEはスキップ）
 * 2. 下落トレンドでない（weekChangeRate > スタイル別閾値）
 * 3. 極端な急騰でない（weekChangeRate < スタイル別閾値）
 * 4. 少なくとも1つのポジティブシグナル:
 *    - weekChangeRate > 0（正のモメンタム）
 *    - OR maDeviationRate < -5%（押し目買い圏）
 *    - OR volumeRatio > 1.5（出来高増加）
 */
export function checkChartBuySignal(
  stock: BuySignalInput,
  investmentStyle?: string | null,
): BuySignalResult {
  const style = investmentStyle || "BALANCED"
  const positiveSignals: string[] = []
  const negativeSignals: string[] = []

  // 1. 過熱チェック（AGGRESSIVEはスキップ）
  if (style !== "AGGRESSIVE") {
    if (
      stock.maDeviationRate !== null &&
      stock.maDeviationRate >= BUY_CANDIDATE_FILTER.CHART_OVERHEAT_THRESHOLD
    ) {
      negativeSignals.push(
        `MA乖離率+${stock.maDeviationRate.toFixed(1)}%で過熱圏（閾値: +${BUY_CANDIDATE_FILTER.CHART_OVERHEAT_THRESHOLD}%）`,
      )
      return { isBuyCandidate: false, positiveSignals, negativeSignals }
    }
  }

  // 2. 下落トレンドチェック
  if (stock.weekChangeRate !== null) {
    const declineThreshold = getDeclineThreshold(style)
    if (stock.weekChangeRate <= declineThreshold) {
      negativeSignals.push(
        `週間${stock.weekChangeRate.toFixed(1)}%の下落トレンド（閾値: ${declineThreshold}%）`,
      )
      return { isBuyCandidate: false, positiveSignals, negativeSignals }
    }
  }

  // 3. 極端な急騰チェック
  if (stock.weekChangeRate !== null) {
    const surgeThreshold = getSurgeThreshold(style)
    if (surgeThreshold !== null && stock.weekChangeRate >= surgeThreshold) {
      negativeSignals.push(
        `週間+${stock.weekChangeRate.toFixed(1)}%の急騰（閾値: +${surgeThreshold}%）`,
      )
      return { isBuyCandidate: false, positiveSignals, negativeSignals }
    }
  }

  // 4. ポジティブシグナル収集
  const hasPositiveMomentum =
    stock.weekChangeRate !== null &&
    stock.weekChangeRate > BUY_CANDIDATE_FILTER.POSITIVE_MOMENTUM_THRESHOLD
  if (hasPositiveMomentum) {
    positiveSignals.push(`週間+${stock.weekChangeRate!.toFixed(1)}%の正モメンタム`)
  }

  const isOversold =
    stock.maDeviationRate !== null &&
    stock.maDeviationRate < BUY_CANDIDATE_FILTER.OVERSOLD_THRESHOLD
  if (isOversold) {
    positiveSignals.push(`MA乖離率${stock.maDeviationRate!.toFixed(1)}%で押し目買い圏`)
  }

  const hasVolumeInterest =
    stock.volumeRatio !== null &&
    stock.volumeRatio > BUY_CANDIDATE_FILTER.VOLUME_INTEREST_THRESHOLD
  if (hasVolumeInterest) {
    positiveSignals.push(`出来高比率${stock.volumeRatio!.toFixed(1)}倍で注目度高`)
  }

  // データがすべてnullの場合は判定不能 → 通過
  if (
    stock.weekChangeRate === null &&
    stock.maDeviationRate === null &&
    stock.volumeRatio === null
  ) {
    return { isBuyCandidate: true, positiveSignals: ["データ不足のため判定スキップ"], negativeSignals }
  }

  if (!hasPositiveMomentum && !isOversold && !hasVolumeInterest) {
    negativeSignals.push("ポジティブシグナルなし（モメンタム・押し目・出来高いずれも該当せず）")
  }

  return {
    isBuyCandidate: positiveSignals.length > 0,
    positiveSignals,
    negativeSignals,
  }
}

// --- ファンダメンタル分析シグナル ---

/**
 * ファンダメンタル分析の買い候補判定（理由付き・投資スタイル別）
 *
 * CONSERVATIVE: 黒字必須 + 業績悪化でない
 * BALANCED: 赤字でない（不明はOK）+ 業績悪化かつ減収でない
 * AGGRESSIVE: 赤字×高ボラのみ除外
 */
export function checkFundamentalBuySignal(
  stock: BuySignalInput,
  investmentStyle?: string | null,
): BuySignalResult {
  const style = investmentStyle || "BALANCED"
  const positiveSignals: string[] = []
  const negativeSignals: string[] = []

  switch (style) {
    case "CONSERVATIVE":
      if (stock.isProfitable !== true) {
        negativeSignals.push("安定配当型: 黒字企業のみ対象（赤字または業績不明）")
        return { isBuyCandidate: false, positiveSignals, negativeSignals }
      }
      positiveSignals.push("黒字企業")
      if (stock.profitTrend === "decreasing") {
        negativeSignals.push("業績悪化トレンド（profitTrend: decreasing）")
        return { isBuyCandidate: false, positiveSignals, negativeSignals }
      }
      if (stock.profitTrend === "increasing") {
        positiveSignals.push("業績改善トレンド")
      }
      break

    case "BALANCED":
      if (stock.isProfitable === false) {
        negativeSignals.push("成長投資型: 赤字企業は対象外")
        return { isBuyCandidate: false, positiveSignals, negativeSignals }
      }
      if (stock.isProfitable === true) {
        positiveSignals.push("黒字企業")
      }
      if (
        stock.profitTrend === "decreasing" &&
        stock.revenueGrowth !== null &&
        stock.revenueGrowth < 0
      ) {
        negativeSignals.push(
          `業績悪化かつ減収（売上成長率: ${stock.revenueGrowth.toFixed(1)}%）`,
        )
        return { isBuyCandidate: false, positiveSignals, negativeSignals }
      }
      if (stock.revenueGrowth !== null && stock.revenueGrowth > 0) {
        positiveSignals.push(`売上成長率+${stock.revenueGrowth.toFixed(1)}%`)
      }
      break

    case "AGGRESSIVE":
      if (
        stock.isProfitable === false &&
        stock.volatility !== null &&
        stock.volatility > HIGH_VOLATILITY_THRESHOLD
      ) {
        negativeSignals.push(
          `赤字×高ボラティリティ（${stock.volatility.toFixed(0)}%）`,
        )
        return { isBuyCandidate: false, positiveSignals, negativeSignals }
      }
      if (stock.isProfitable === true) {
        positiveSignals.push("黒字企業")
      }
      break
  }

  return {
    isBuyCandidate: true,
    positiveSignals,
    negativeSignals,
  }
}

// --- 統合判定 ---

/** チャート・ファンダメンタル統合の買いシグナル判定結果 */
export interface CombinedBuySignalResult {
  isBuyCandidate: boolean
  chart: BuySignalResult
  fundamental: BuySignalResult
}

/**
 * チャート分析・ファンダメンタル分析の統合判定（理由付き）
 * 両方を通過した場合のみ isBuyCandidate = true
 */
export function checkBuySignal(
  stock: BuySignalInput,
  investmentStyle?: string | null,
): CombinedBuySignalResult {
  const chart = checkChartBuySignal(stock, investmentStyle)
  const fundamental = checkFundamentalBuySignal(stock, investmentStyle)

  return {
    isBuyCandidate: chart.isBuyCandidate && fundamental.isBuyCandidate,
    chart,
    fundamental,
  }
}

// --- フィルター（日次おすすめ用） ---

/**
 * チャート分析・ファンダメンタル分析の両方を通過した銘柄のみ返す
 */
export function filterBuyCandidates(
  stocks: StockForScoring[],
  investmentStyle?: string | null,
): StockForScoring[] {
  let chartExcluded = 0
  let fundamentalExcluded = 0

  const result = stocks.filter((stock) => {
    const chart = checkChartBuySignal(stock, investmentStyle)
    const fundamental = checkFundamentalBuySignal(stock, investmentStyle)
    if (!chart.isBuyCandidate) chartExcluded++
    if (!fundamental.isBuyCandidate) fundamentalExcluded++
    return chart.isBuyCandidate && fundamental.isBuyCandidate
  })

  console.log(
    `  Buy candidate filter: ${result.length}/${stocks.length} passed ` +
    `(chart excluded: ${chartExcluded}, fundamental excluded: ${fundamentalExcluded})`,
  )

  return result
}

// --- ヘルパー ---

/** 投資スタイルに応じた下落閾値を取得 */
function getDeclineThreshold(style: string): number {
  switch (style) {
    case "CONSERVATIVE":
      return MOMENTUM.CONSERVATIVE_DECLINE_THRESHOLD
    case "BALANCED":
      return MOMENTUM.BALANCED_DECLINE_THRESHOLD
    case "AGGRESSIVE":
      return MOMENTUM.AGGRESSIVE_DECLINE_THRESHOLD
    default:
      return MOMENTUM.DEFAULT_DECLINE_THRESHOLD
  }
}

/** 投資スタイルに応じた急騰閾値を取得 */
function getSurgeThreshold(style: string): number | null {
  switch (style) {
    case "CONSERVATIVE":
      return MOMENTUM.CONSERVATIVE_SURGE_THRESHOLD
    case "BALANCED":
      return MOMENTUM.BALANCED_SURGE_THRESHOLD
    case "AGGRESSIVE":
      return MOMENTUM.AGGRESSIVE_SURGE_THRESHOLD
    default:
      return MOMENTUM.DEFAULT_SURGE_THRESHOLD
  }
}
