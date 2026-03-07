/**
 * テクニカルスコアリングエンジン
 *
 * TechnicalSummary + チャートパターン + ローソク足パターンを
 * 統一スコア（0-100）に変換し、ロジックだけで銘柄の優先順位を決定する。
 *
 * 全て純粋関数（I/Oなし）。
 */

import type { TechnicalSummary } from "./technical-analysis";
import type { ChartPatternResult, ChartPatternRank } from "../lib/chart-patterns";
import type { PatternResult } from "../lib/candlestick-patterns";
import { SCORING } from "../lib/constants";

// ========================================
// 型定義
// ========================================

export interface ScorerInput {
  summary: TechnicalSummary;
  chartPatterns: ChartPatternResult[];
  candlestickPattern: PatternResult | null;
}

export interface TechnicalScore {
  totalScore: number;
  rank: "S" | "A" | "B" | "C";
  breakdown: {
    trend: number;
    rsiMomentum: number;
    macdMomentum: number;
    bollingerPosition: number;
    chartPattern: number;
    candlestick: number;
    volume: number;
    support: number;
  };
  topPattern: {
    name: string;
    rank: string;
    winRate: number;
    signal: string;
  } | null;
  technicalSignal: "strong_buy" | "buy" | "neutral" | "sell" | "strong_sell";
}

// ========================================
// 個別スコアリング関数
// ========================================

/**
 * 移動平均線の並びを評価
 * パーフェクトオーダー（5>25>75 + 方向一致）= 100、逆 = 0、それ以外 = 50
 */
function scoreTrend(summary: TechnicalSummary): number {
  const { trend, orderAligned, slopesAligned } = summary.maAlignment;

  if (trend === "uptrend" && orderAligned && slopesAligned) return 100;
  if (trend === "uptrend" && orderAligned) return 80;
  if (trend === "uptrend") return 70;
  if (trend === "downtrend" && orderAligned && slopesAligned) return 0;
  if (trend === "downtrend" && orderAligned) return 20;
  if (trend === "downtrend") return 30;
  return 50;
}

/**
 * RSI を評価
 * 30-40 = 100（反発ゾーン）、40-50 = 70、50-60 = 50、<30 = 30（売られすぎ）、>70 = 0
 */
function scoreRSI(rsi: number | null): number {
  if (rsi == null) return 50;
  if (rsi >= 30 && rsi < 40) return 100;
  if (rsi >= 40 && rsi < 50) return 70;
  if (rsi >= 50 && rsi < 60) return 50;
  if (rsi >= 60 && rsi < 70) return 30;
  if (rsi < 30) return 30;
  return 0; // rsi >= 70
}

/**
 * MACD を評価
 * シグナル上抜け = 100、ヒストグラム正 = 70、負 = 30、シグナル下抜け = 0
 */
function scoreMACD(summary: TechnicalSummary): number {
  const { macd, signal, histogram } = summary.macd;
  if (macd == null || signal == null || histogram == null) return 50;

  if (histogram > 0 && macd > signal) return 100;
  if (histogram > 0) return 70;
  if (histogram < 0 && macd < signal) return 0;
  if (histogram < 0) return 30;
  return 50;
}

/**
 * ボリンジャーバンド位置を評価
 * 下限タッチ = 100、下限〜中央 = 70、中央〜上限 = 40、上限超え = 20
 */
function scoreBollinger(summary: TechnicalSummary): number {
  const { upper, middle, lower } = summary.bollingerBands;
  const price = summary.currentPrice;

  if (upper == null || middle == null || lower == null) return 50;

  if (price <= lower) return 100;
  if (price < middle) return 70;
  if (price <= upper) return 40;
  return 20; // price > upper
}

/**
 * チャートパターンを評価
 * 最高ランクの買いパターンを使用。売りパターンはスコアを下げる。
 */
function scoreChartPattern(
  patterns: ChartPatternResult[],
): { score: number; topPattern: TechnicalScore["topPattern"] } {
  if (patterns.length === 0) {
    return { score: 0, topPattern: null };
  }

  const rankScoreMap: Record<ChartPatternRank, number> = {
    S: 100,
    A: 85,
    B: 70,
    C: 55,
    D: 40,
  };

  // 買いパターンの中で最高ランクを選ぶ
  const buyPatterns = patterns.filter((p) => p.signal === "buy");
  const sellPatterns = patterns.filter((p) => p.signal === "sell");

  if (buyPatterns.length > 0) {
    // ランク順にソート（S > A > B > C > D）
    const best = buyPatterns.sort(
      (a, b) => rankScoreMap[b.rank] - rankScoreMap[a.rank],
    )[0];
    return {
      score: rankScoreMap[best.rank],
      topPattern: {
        name: best.patternName,
        rank: best.rank,
        winRate: best.winRate,
        signal: best.signal,
      },
    };
  }

  if (sellPatterns.length > 0) {
    // 売りパターンのみ → スコアを反転（高ランクの売り = 低スコア）
    const best = sellPatterns.sort(
      (a, b) => rankScoreMap[b.rank] - rankScoreMap[a.rank],
    )[0];
    const invertedScore = 100 - rankScoreMap[best.rank];
    return {
      score: invertedScore,
      topPattern: {
        name: best.patternName,
        rank: best.rank,
        winRate: best.winRate,
        signal: best.signal,
      },
    };
  }

  // neutral パターンのみ
  const best = patterns[0];
  return {
    score: 40,
    topPattern: {
      name: best.patternName,
      rank: best.rank,
      winRate: best.winRate,
      signal: best.signal,
    },
  };
}

/**
 * ローソク足パターンを評価
 * 買いシグナル → strength をそのまま使用、売り → 反転、neutral/null → 50
 */
function scoreCandlestick(pattern: PatternResult | null): number {
  if (pattern == null) return 50;

  if (pattern.signal === "buy") return pattern.strength;
  if (pattern.signal === "sell") return 100 - pattern.strength;
  return 50;
}

/**
 * 出来高比率を評価
 * 平均比 2倍以上 = 100、1.5倍 = 80、1.0倍 = 50、0.5倍以下 = 20
 */
function scoreVolume(volumeRatio: number | null): number {
  if (volumeRatio == null) return 50;

  if (volumeRatio >= 2.0) return 100;
  if (volumeRatio >= 1.5) return 80;
  if (volumeRatio >= 1.0) return 50;
  if (volumeRatio > 0.5) return 35;
  return 20;
}

/**
 * サポートラインとの距離を評価
 * サポート付近（1%以内）= 100、2%以内 = 70、5%以内 = 50、遠い = 20
 */
function scoreSupport(summary: TechnicalSummary): number {
  const { currentPrice, supports } = summary;

  if (supports.length === 0) return 20;

  // 現在価格より下のサポートのみ対象
  const belowSupports = supports.filter((s) => s < currentPrice);
  if (belowSupports.length === 0) return 20;

  // 最も近いサポートとの距離（%）
  const nearest = Math.max(...belowSupports);
  const distancePct = ((currentPrice - nearest) / currentPrice) * 100;

  if (distancePct <= 1) return 100;
  if (distancePct <= 2) return 70;
  if (distancePct <= 5) return 50;
  return 20;
}

// ========================================
// メインスコアリング関数
// ========================================

/**
 * ランクを決定
 */
function getRank(score: number): "S" | "A" | "B" | "C" {
  if (score >= SCORING.THRESHOLDS.S_RANK) return "S";
  if (score >= SCORING.THRESHOLDS.A_RANK) return "A";
  if (score >= SCORING.THRESHOLDS.B_RANK) return "B";
  return "C";
}

/**
 * テクニカルシグナルを決定
 */
function getTechnicalSignal(
  score: number,
): "strong_buy" | "buy" | "neutral" | "sell" | "strong_sell" {
  if (score >= 80) return "strong_buy";
  if (score >= 65) return "buy";
  if (score >= 50) return "neutral";
  if (score >= 35) return "sell";
  return "strong_sell";
}

/**
 * テクニカル分析データから統一スコア（0-100）を算出する
 *
 * @param input - TechnicalSummary + チャートパターン + ローソク足パターン
 * @returns TechnicalScore - 総合スコア、ランク、内訳
 */
export function scoreTechnicals(input: ScorerInput): TechnicalScore {
  const { summary, chartPatterns, candlestickPattern } = input;

  // 各指標のスコアを算出
  const trendScore = scoreTrend(summary);
  const rsiScore = scoreRSI(summary.rsi);
  const macdScore = scoreMACD(summary);
  const bollingerScore = scoreBollinger(summary);
  const { score: chartPatternScore, topPattern } =
    scoreChartPattern(chartPatterns);
  const candlestickScore = scoreCandlestick(candlestickPattern);
  const volumeScore = scoreVolume(summary.volumeAnalysis.volumeRatio);
  const supportScore = scoreSupport(summary);

  // 加重平均でトータルスコアを算出
  const totalScore = Math.round(
    trendScore * SCORING.WEIGHTS.TREND +
      rsiScore * SCORING.WEIGHTS.RSI_MOMENTUM +
      macdScore * SCORING.WEIGHTS.MACD_MOMENTUM +
      bollingerScore * SCORING.WEIGHTS.BOLLINGER_POSITION +
      chartPatternScore * SCORING.WEIGHTS.CHART_PATTERN +
      candlestickScore * SCORING.WEIGHTS.CANDLESTICK +
      volumeScore * SCORING.WEIGHTS.VOLUME +
      supportScore * SCORING.WEIGHTS.SUPPORT,
  );

  return {
    totalScore,
    rank: getRank(totalScore),
    breakdown: {
      trend: trendScore,
      rsiMomentum: rsiScore,
      macdMomentum: macdScore,
      bollingerPosition: bollingerScore,
      chartPattern: chartPatternScore,
      candlestick: candlestickScore,
      volume: volumeScore,
      support: supportScore,
    },
    topPattern,
    technicalSignal: getTechnicalSignal(totalScore),
  };
}
