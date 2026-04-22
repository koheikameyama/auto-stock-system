/**
 * 週足レンジブレイクバックテスト設定 & パラメータグリッド
 */

import { WEEKLY_BREAK } from "../lib/constants/weekly-break";
import { STOP_LOSS, POSITION_SIZING } from "../lib/constants/scoring";
import { SCREENING } from "../lib/constants";
import { getMaxBuyablePrice } from "../core/risk-manager";
import type { WeeklyBreakBacktestConfig } from "./types";

/** デフォルト設定 */
export const WEEKLY_BREAK_BACKTEST_DEFAULTS: Omit<WeeklyBreakBacktestConfig, "startDate" | "endDate"> = {
  initialBudget: 500_000,
  maxPositions: 3,

  // エントリー
  weeklyHighLookback: WEEKLY_BREAK.ENTRY.HIGH_LOOKBACK_WEEKS, // 13
  weeklyVolSurgeRatio: WEEKLY_BREAK.ENTRY.VOL_SURGE_RATIO,    // 1.3

  // ストップロス（週足は広め）
  atrMultiplier: WEEKLY_BREAK.STOP_LOSS.ATR_MULTIPLIER, // 1.5
  maxLossPct: STOP_LOSS.MAX_LOSS_PCT,                    // 0.03

  // トレーリングストップ（WF最適値: atr=1.0, be=0.5, trail=0.8）
  beActivationMultiplier: 0.5,
  trailMultiplier: 0.8,

  // タイムストップ（週足は長め）
  maxHoldingDays: 15,
  maxExtendedHoldingDays: 25,

  // ユニバースフィルター
  maxPrice: getMaxBuyablePrice(500_000),
  minAvgVolume25: WEEKLY_BREAK.ENTRY.MIN_AVG_VOLUME_25,
  minAtrPct: WEEKLY_BREAK.ENTRY.MIN_ATR_PCT,
  minTurnover: SCREENING.MIN_TURNOVER,
  minPrice: SCREENING.MIN_PRICE,

  // コスト・リスク
  costModelEnabled: true,
  priceLimitEnabled: true,

  // クールダウン
  cooldownDays: 5,

  // マーケットフィルター
  marketTrendFilter: true,
  marketTrendThreshold: WEEKLY_BREAK.MARKET_FILTER.BREADTH_THRESHOLD,
  indexTrendFilter: true,
  indexTrendSmaPeriod: 50,
  indexTrendOffBufferPct: 0,
  indexTrendOnBufferPct: 0,

  verbose: false,
  positionCapEnabled: true,
};

/** 1トレードあたりリスク（%） */
export const WEEKLY_BREAK_RISK_PER_TRADE_PCT = POSITION_SIZING.RISK_PER_TRADE_PCT; // 2

/**
 * 大型株週足ブレイク用プリセット
 *
 * 中小型株ユニバースではWF堅牢(PF 3.12)だったが、小型株の保有3-5日×資金拘束で
 * 本番見送り。大型株ユニバース(marketCap≥¥100B)なら1トレードの絶対金額が大きく
 * 効率改善の期待がある(momentumと同じ発想)。
 *
 * 設計判断:
 *   - WF最適(atr=1.0, be=0.5, trail=0.8)は小型株ベースなので大型株向けに広げる
 *   - 大型株はATR%が低いためmaxLossPctを5%に拡大
 *   - 大型株モメンタムと同様、全市場breadthフィルターは無効化(日経SMA50のみ)
 *   - weeklyVolSurgeRatioは1.3のまま(まず試行、発火頻度で調整)
 */
export const WEEKLY_BREAK_LARGECAP_PARAMS: Partial<WeeklyBreakBacktestConfig> = {
  weeklyHighLookback: 13,
  weeklyVolSurgeRatio: 1.3,
  minMarketCap: 100_000_000_000, // ¥100B = 1,000億円
  maxPrice: 100_000,
  minPrice: 100,
  minAvgVolume25: 100_000,
  atrMultiplier: 2.0,              // 大型株はATR%低いので SL 幅 2×ATR
  maxLossPct: 0.10,                // 10% (momentum大型株と同じ論拠)
  beActivationMultiplier: 999,     // 事実上無効化(momentumで学んだ教訓)
  trailMultiplier: 999,            // 事実上無効化
  maxHoldingDays: 25,
  maxExtendedHoldingDays: 40,
  cooldownDays: 5,
  marketTrendFilter: false,        // 個別株ブレイクは全市場breadth不要
  indexTrendFilter: true,          // 日経SMA50は維持
};

/** walk-forward パラメータグリッド（エグジット系のみ、27通り） */
export const WEEKLY_BREAK_PARAMETER_GRID = {
  atrMultiplier: [1.0, 1.5, 2.0],
  beActivationMultiplier: [0.5, 0.8, 1.2],
  trailMultiplier: [0.8, 1.0, 1.5],
} as const;

/** パラメータグリッドの全組み合わせを生成 */
export function generateWeeklyBreakParameterCombinations(): Array<Partial<WeeklyBreakBacktestConfig>> {
  const combos: Array<Partial<WeeklyBreakBacktestConfig>> = [];

  for (const atrMultiplier of WEEKLY_BREAK_PARAMETER_GRID.atrMultiplier) {
    for (const beActivationMultiplier of WEEKLY_BREAK_PARAMETER_GRID.beActivationMultiplier) {
      for (const trailMultiplier of WEEKLY_BREAK_PARAMETER_GRID.trailMultiplier) {
        combos.push({
          atrMultiplier,
          beActivationMultiplier,
          trailMultiplier,
        });
      }
    }
  }

  return combos;
}

/**
 * 大型株週足ブレイク用のパラメータグリッド（3通り）
 *
 * BE/trailは無効化(999)で固定。SL幅のみ変える(momentumと同じ方針)。
 */
export const WEEKLY_BREAK_LARGECAP_PARAMETER_GRID = {
  atrMultiplier: [1.5, 2.0, 2.5],
} as const;

export function generateLargecapWeeklyBreakParameterCombinations(): Array<Partial<WeeklyBreakBacktestConfig>> {
  return WEEKLY_BREAK_LARGECAP_PARAMETER_GRID.atrMultiplier.map((atrMultiplier) => ({
    atrMultiplier,
    beActivationMultiplier: 999,
    trailMultiplier: 999,
  }));
}
