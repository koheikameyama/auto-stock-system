/**
 * ローソク足パターン認識ロジック
 *
 * 単一ローソク足のパターン分析と、テクニカル指標を組み合わせた総合シグナルを提供。
 * 専門用語には解説を添え、学びながら使えるようにする。
 */

import { ChartPatternResult, detectChartPatterns, PricePoint } from "./chart-patterns"
import {
  RSI_THRESHOLDS,
  CANDLE_BODY,
  CANDLE_WICK,
  CANDLE_STRENGTH,
  CANDLE_SIGNAL,
  COMBINED_SIGNAL,
} from "./constants"

export interface CandlestickData {
  date: string
  open: number
  high: number
  low: number
  close: number
}

export interface PatternResult {
  pattern: string
  signal: "buy" | "sell" | "neutral"
  strength: number // 0-100
  description: string
  learnMore: string
}

export interface CombinedSignal {
  signal: "buy" | "sell" | "neutral"
  strength: number
  reasons: string[]
}

export interface PatternsResponse {
  latest: PatternResult | null
  signals: Array<{
    date: string
    pattern: string
    signal: "buy" | "sell" | "neutral"
    price: number
  }>
  combined: CombinedSignal
  chartPatterns: ChartPatternResult[]
}

/**
 * 引けの強さを計算（0-100%）
 * (close - low) / (high - low) * 100
 * 値が高いほど引けにかけて強い（高値圏で引けた）
 */
export function calculateClosingStrength(candle: CandlestickData): number {
  const range = candle.high - candle.low;
  if (range === 0) return CANDLE_STRENGTH.NEUTRAL_CLOSING;
  return ((candle.close - candle.low) / range) * 100;
}

/**
 * 単一ローソク足のパターンを分析
 */
export function analyzeSingleCandle(candle: CandlestickData): PatternResult {
  const body = Math.abs(candle.close - candle.open)
  const range = candle.high - candle.low
  const upperWick = candle.high - Math.max(candle.open, candle.close)
  const lowerWick = Math.min(candle.open, candle.close) - candle.low
  const isUp = candle.close >= candle.open

  // レンジがほぼゼロの場合（横ばい）
  if (range < CANDLE_BODY.DOJI_THRESHOLD) {
    return {
      pattern: "doji",
      signal: "neutral",
      strength: CANDLE_STRENGTH.DOJI,
      description: "様子見",
      learnMore:
        "始値と終値がほぼ同じで、相場が迷っている状態です。次の動きを見守りましょう。",
    }
  }

  // 実体の大きさ判定
  const bodyRatio = body / range
  const isLargeBody = bodyRatio >= CANDLE_BODY.LARGE_RATIO
  const isSmallBody = bodyRatio <= CANDLE_BODY.SMALL_RATIO

  // ヒゲの判定
  const hasLongUpperWick = upperWick / range >= CANDLE_WICK.LONG_RATIO
  const hasLongLowerWick = lowerWick / range >= CANDLE_WICK.LONG_RATIO

  // 陽線パターン（買いシグナル）
  if (isUp) {
    // 大陽線: 実体が大きく、ヒゲが短い
    if (isLargeBody && !hasLongUpperWick && !hasLongLowerWick) {
      return {
        pattern: "bullish_strong",
        signal: "buy",
        strength: CANDLE_STRENGTH.LARGE_BODY,
        description: "強い上昇",
        learnMore:
          "大きく上がっています。買い手が優勢で、上昇が続く可能性が高いです。",
      }
    }

    // 下ヒゲ陽線: 下ヒゲが長い陽線
    if (hasLongLowerWick && !hasLongUpperWick) {
      return {
        pattern: "bullish_hammer",
        signal: "buy",
        strength: CANDLE_STRENGTH.HAMMER,
        description: "底打ち反発",
        learnMore:
          "一度下がったものの、買い戻されて上昇しました。反発のサインです。",
      }
    }

    // 上ヒゲ陽線: 上ヒゲが長い陽線
    if (hasLongUpperWick && !hasLongLowerWick) {
      return {
        pattern: "bullish_shooting",
        signal: "buy",
        strength: CANDLE_STRENGTH.SHOOTING_STAR,
        description: "押し目",
        learnMore:
          "上昇後に少し戻しました。押し目買いのチャンスかもしれません。",
      }
    }

    // 小陽線: 実体が小さい陽線
    if (isSmallBody) {
      return {
        pattern: "bullish_small",
        signal: "buy",
        strength: CANDLE_STRENGTH.SMALL_BODY,
        description: "じわじわ上昇",
        learnMore:
          "少しずつ上がっています。上昇トレンドが続いている可能性があります。",
      }
    }

    // 普通の陽線
    return {
      pattern: "bullish_normal",
      signal: "buy",
      strength: CANDLE_STRENGTH.NORMAL,
      description: "上昇",
      learnMore: "株価が上がりました。買い手がやや優勢です。",
    }
  }

  // 陰線パターン（売りシグナル）
  // 大陰線: 実体が大きく、ヒゲが短い
  if (isLargeBody && !hasLongUpperWick && !hasLongLowerWick) {
    return {
      pattern: "bearish_strong",
      signal: "sell",
      strength: CANDLE_STRENGTH.LARGE_BODY,
      description: "強い下落",
      learnMore:
        "大きく下がっています。売り手が優勢で、下落が続く可能性があります。",
    }
  }

  // 上ヒゲ陰線: 上ヒゲが長い陰線
  if (hasLongUpperWick && !hasLongLowerWick) {
    return {
      pattern: "bearish_shooting",
      signal: "sell",
      strength: CANDLE_STRENGTH.BEARISH_SHOOTING_STAR,
      description: "戻り売り",
      learnMore:
        "一度上がったものの、売り戻されて下落しました。下落のサインです。",
    }
  }

  // 下ヒゲ陰線: 下ヒゲが長い陰線
  if (hasLongLowerWick && !hasLongUpperWick) {
    return {
      pattern: "bearish_hammer",
      signal: "sell",
      strength: CANDLE_STRENGTH.BEARISH_HAMMER,
      description: "高値からの下落",
      learnMore:
        "下で買い支えられたものの、最終的には下がりました。弱気のサインです。",
    }
  }

  // 小陰線: 実体が小さい陰線
  if (isSmallBody) {
    return {
      pattern: "bearish_small",
      signal: "sell",
      strength: CANDLE_STRENGTH.SMALL_BODY,
      description: "下落の始まり",
      learnMore:
        "少し下がっています。下落トレンドの始まりかもしれません。注意が必要です。",
    }
  }

  // 普通の陰線
  return {
    pattern: "bearish_normal",
    signal: "sell",
    strength: CANDLE_STRENGTH.NORMAL,
    description: "下落",
    learnMore: "株価が下がりました。売り手がやや優勢です。",
  }
}

/**
 * 複数ローソク足のパターンを分析し、シグナルリストを返す
 */
export function analyzePatterns(
  candles: CandlestickData[],
  maxSignals: number = CANDLE_SIGNAL.MAX_SIGNALS
): Array<{
  date: string
  pattern: string
  signal: "buy" | "sell" | "neutral"
  price: number
  strength: number
}> {
  const signals: Array<{
    date: string
    pattern: string
    signal: "buy" | "sell" | "neutral"
    price: number
    strength: number
  }> = []

  for (const candle of candles) {
    const result = analyzeSingleCandle(candle)

    // strength 60以上のシグナルのみ記録
    if (result.strength >= CANDLE_SIGNAL.MIN_STRENGTH) {
      signals.push({
        date: candle.date,
        pattern: result.pattern,
        signal: result.signal,
        price: candle.close,
        strength: result.strength,
      })
    }

    if (signals.length >= maxSignals) break
  }

  return signals
}

/**
 * RSI/MACD/チャートパターンと組み合わせた総合シグナルを計算
 */
export function getCombinedSignal(
  latestPattern: PatternResult | null,
  rsi?: number | null,
  macdHistogram?: number | null,
  chartPatterns?: ChartPatternResult[]
): CombinedSignal {
  const reasons: string[] = []
  let buyScore = 0
  let sellScore = 0

  // ローソク足パターンのシグナル
  if (latestPattern) {
    if (latestPattern.signal === "buy") {
      buyScore += latestPattern.strength
      reasons.push(latestPattern.description)
    } else if (latestPattern.signal === "sell") {
      sellScore += latestPattern.strength
      reasons.push(latestPattern.description)
    }
  }

  // チャートパターン（複数足フォーメーション）のシグナル
  if (chartPatterns && chartPatterns.length > 0) {
    for (const cp of chartPatterns) {
      const weightedScore = Math.round(cp.strength * cp.confidence)
      if (cp.signal === "buy") {
        buyScore += weightedScore
        reasons.push(`${cp.patternName}`)
      } else if (cp.signal === "sell") {
        sellScore += weightedScore
        reasons.push(`${cp.patternName}`)
      }
    }
  }

  // RSIのシグナル
  if (rsi !== undefined && rsi !== null) {
    if (rsi <= RSI_THRESHOLDS.OVERSOLD) {
      buyScore += COMBINED_SIGNAL.RSI_STRONG_SCORE
      reasons.push(`売られすぎ（RSI: ${rsi.toFixed(1)}）`)
    } else if (rsi >= RSI_THRESHOLDS.OVERBOUGHT) {
      sellScore += COMBINED_SIGNAL.RSI_STRONG_SCORE
      reasons.push(`買われすぎ（RSI: ${rsi.toFixed(1)}）`)
    } else if (rsi <= COMBINED_SIGNAL.RSI_MODERATE_LOW) {
      buyScore += COMBINED_SIGNAL.RSI_MODERATE_SCORE
    } else if (rsi >= COMBINED_SIGNAL.RSI_MODERATE_HIGH) {
      sellScore += COMBINED_SIGNAL.RSI_MODERATE_SCORE
    }
  }

  // MACDヒストグラムのシグナル
  if (macdHistogram !== undefined && macdHistogram !== null) {
    if (macdHistogram > 0) {
      buyScore += COMBINED_SIGNAL.MACD_BASE_SCORE
      if (macdHistogram > COMBINED_SIGNAL.MACD_STRONG_THRESHOLD) {
        reasons.push("上昇トレンド（MACD）")
      }
    } else if (macdHistogram < 0) {
      sellScore += COMBINED_SIGNAL.MACD_BASE_SCORE
      if (macdHistogram < COMBINED_SIGNAL.MACD_WEAK_THRESHOLD) {
        reasons.push("下落トレンド（MACD）")
      }
    }
  }

  // 総合判定
  const totalScore = buyScore + sellScore
  if (totalScore === 0) {
    return {
      signal: "neutral",
      strength: 0,
      reasons: ["データ不足"],
    }
  }

  const diff = buyScore - sellScore

  if (diff > COMBINED_SIGNAL.SIGNAL_BUY_THRESHOLD) {
    return {
      signal: "buy",
      strength: Math.min(100, Math.round((buyScore / totalScore) * 100)),
      reasons,
    }
  } else if (diff < -COMBINED_SIGNAL.SIGNAL_SELL_THRESHOLD) {
    return {
      signal: "sell",
      strength: Math.min(100, Math.round((sellScore / totalScore) * 100)),
      reasons,
    }
  }

  return {
    signal: "neutral",
    strength: COMBINED_SIGNAL.NEUTRAL_STRENGTH,
    reasons: reasons.length > 0 ? reasons : ["様子見"],
  }
}

/**
 * チャートデータからパターン分析結果を生成
 */
export function generatePatternsResponse(
  chartData: Array<{
    date: string
    open: number
    high: number
    low: number
    close: number
    rsi: number | null
    histogram: number | null
  }>
): PatternsResponse {
  if (chartData.length === 0) {
    return {
      latest: null,
      signals: [],
      combined: {
        signal: "neutral",
        strength: 0,
        reasons: ["データがありません"],
      },
      chartPatterns: [],
    }
  }

  // 最新のローソク足パターンを分析
  const latestCandle = chartData[chartData.length - 1]
  const latestPattern = analyzeSingleCandle({
    date: latestCandle.date,
    open: latestCandle.open,
    high: latestCandle.high,
    low: latestCandle.low,
    close: latestCandle.close,
  })

  // 過去のシグナルを分析（新しい順）
  const candles: CandlestickData[] = chartData.map((d) => ({
    date: d.date,
    open: d.open,
    high: d.high,
    low: d.low,
    close: d.close,
  }))
  const signals = analyzePatterns([...candles].reverse(), CANDLE_SIGNAL.MAX_SIGNALS)

  // チャートパターン（複数足フォーメーション）を検出
  const pricePoints: PricePoint[] = chartData.map((d) => ({
    date: d.date,
    open: d.open,
    high: d.high,
    low: d.low,
    close: d.close,
  }))
  const chartPatterns = detectChartPatterns(pricePoints)

  // RSI/MACDとチャートパターンを組み合わせた総合シグナル
  const combined = getCombinedSignal(
    latestPattern,
    latestCandle.rsi,
    latestCandle.histogram,
    chartPatterns
  )

  return {
    latest: latestPattern,
    signals,
    combined,
    chartPatterns,
  }
}
