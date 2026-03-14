import { ATR } from "technicalindicators";
import {
  calculateSMA,
  aggregateDailyToWeekly,
} from "../../lib/technical-indicators";
import { calculateBBWidthPercentile } from "../../lib/technical-indicators/bb-width-history";
import { SCORING } from "../../lib/constants/scoring";
import { checkGates } from "./gates";
import { scoreTrendQuality, countDaysAboveSma25 } from "./trend-quality";
import { scoreEntryTiming } from "./entry-timing";
import {
  scoreRiskQuality,
  calculateAtrCv,
  calculateVolumeCv,
} from "./risk-quality";
import { getRank } from "./types";
import type { ScoringInput, NewLogicScore } from "./types";

export type { ScoringInput, NewLogicScore, ScoringGateResult } from "./types";
export { getRank } from "./types";

/**
 * メインスコアリング関数
 * 3カテゴリ（トレンド品質40 + エントリータイミング35 + リスク品質25）= 100点満点
 */
export function scoreStock(input: ScoringInput): NewLogicScore {
  const { historicalData, latestPrice, summary, avgVolume25 } = input;

  // --- 1. ゲートチェック ---
  const atrPct =
    summary.atr14 != null && latestPrice > 0
      ? (summary.atr14 / latestPrice) * 100
      : null;

  const gate = checkGates({
    latestPrice,
    avgVolume25: avgVolume25 ?? null,
    atrPct,
    nextEarningsDate: input.nextEarningsDate ?? null,
    exDividendDate: input.exDividendDate ?? null,
    today: new Date(),
  });

  const zeroResult: NewLogicScore = {
    totalScore: 0,
    rank: "D",
    gate,
    trendQuality: { total: 0, maAlignment: 0, weeklyTrend: 0, trendContinuity: 0 },
    entryTiming: { total: 0, pullbackDepth: 0, breakout: 0, candlestickSignal: 0 },
    riskQuality: { total: 0, atrStability: 0, rangeContraction: 0, volumeStability: 0 },
    isDisqualified: true,
    disqualifyReason: gate.failedGate,
  };

  if (!gate.passed) return zeroResult;

  // --- 2. 週足データ合成 ---
  const dailyOldestFirst = [...historicalData].reverse();
  const weeklyBars = aggregateDailyToWeekly(dailyOldestFirst);

  let weeklyClose: number | null = null;
  let weeklySma13: number | null = null;
  let prevWeeklySma13: number | null = null;

  if (weeklyBars.length >= 14) {
    const weeklyNewestFirst = [...weeklyBars].reverse().map((b) => ({ close: b.close }));
    weeklySma13 = calculateSMA(weeklyNewestFirst, 13);
    weeklyClose = weeklyNewestFirst[0].close;

    // 前週のSMA13: 1本ずらして計算
    if (weeklyNewestFirst.length >= 14) {
      prevWeeklySma13 = calculateSMA(weeklyNewestFirst.slice(1), 13);
    }
  }

  // --- 3. SMA25上の連続日数 ---
  const daysAboveSma25 = countDaysAboveSma25(historicalData);

  // --- 4. ATR14のCV ---
  const atr14Values = computeAtr14Series(historicalData);
  const atrCv = calculateAtrCv(atr14Values);

  // --- 5. 出来高CV ---
  const volumes = historicalData.map((d) => d.volume);
  const volumeCv = calculateVolumeCv(volumes);

  // --- 6. 出来高MA ---
  const volumeNewestFirst = historicalData.map((d) => ({ close: d.volume }));
  const volumeMA5 = calculateSMA(volumeNewestFirst, 5);
  const volumeMA25 = calculateSMA(volumeNewestFirst, 25);

  // --- 7. BB幅パーセンタイル ---
  const closePrices = historicalData.map((d) => d.close);
  const bbWidthPercentile = calculateBBWidthPercentile(
    closePrices,
    20,
    SCORING.RISK.BB_WIDTH_LOOKBACK,
  );

  // --- 8. 各カテゴリスコアリング ---
  const trendQuality = scoreTrendQuality({
    close: latestPrice,
    sma5: summary.sma5,
    sma25: summary.sma25,
    sma75: summary.sma75,
    weeklyClose,
    weeklySma13,
    prevWeeklySma13,
    daysAboveSma25,
  });

  const entryTiming = scoreEntryTiming({
    close: latestPrice,
    sma5: summary.sma5,
    sma25: summary.sma25,
    deviationRate25: summary.deviationRate25,
    bars: historicalData,
    avgVolume25: avgVolume25 ?? null,
  });

  const riskQuality = scoreRiskQuality({
    atrCv,
    bbWidthPercentile,
    volumeMA5,
    volumeMA25,
    volumeCv,
  });

  // --- 9. 合計 & ランク ---
  const totalScore = trendQuality.total + entryTiming.total + riskQuality.total;

  return {
    totalScore,
    rank: getRank(totalScore),
    gate,
    trendQuality,
    entryTiming,
    riskQuality,
    isDisqualified: false,
    disqualifyReason: null,
  };
}

/**
 * ATR(14)の直近20日分の時系列を計算
 * @param data OHLCVデータ（newest-first）
 * @returns ATR14値の配列（newest-first）
 */
function computeAtr14Series(data: OHLCVData[]): number[] {
  if (data.length < 34) return []; // 14(ATR期間) + 20(CV計算) = 34

  const reversed = [...data].reverse();
  const result = ATR.calculate({
    high: reversed.map((d) => d.high),
    low: reversed.map((d) => d.low),
    close: reversed.map((d) => d.close),
    period: 14,
  });

  // oldest-first → newest-first
  return [...result].reverse();
}

type OHLCVData = ScoringInput["historicalData"][0];
