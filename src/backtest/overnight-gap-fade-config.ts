/**
 * Overnight Gap-Fade バックテスト設定 & パラメータグリッド
 */

import { OVERNIGHT_GAP_FADE } from "../lib/constants/overnight-gap-fade";
import { STOP_LOSS, POSITION_SIZING } from "../lib/constants/scoring";
import { BREAK_EVEN_STOP, TRAILING_STOP, SCREENING } from "../lib/constants";
import { getMaxBuyablePrice } from "../core/risk-manager";
import type { OvernightGapFadeBacktestConfig } from "./types";

/** デフォルト設定 */
export const OGF_BACKTEST_DEFAULTS: Omit<OvernightGapFadeBacktestConfig, "startDate" | "endDate"> = {
  initialBudget: 500_000,
  maxPositions: 3,

  prevMinBodyPct: OVERNIGHT_GAP_FADE.ENTRY.PREV_MIN_BODY_PCT,
  minGapDownPct: OVERNIGHT_GAP_FADE.ENTRY.MIN_GAP_DOWN_PCT,
  maxGapDownPct: OVERNIGHT_GAP_FADE.ENTRY.MAX_GAP_DOWN_PCT,
  minBodyPct: OVERNIGHT_GAP_FADE.ENTRY.MIN_BODY_PCT,
  prevVolSurgeRatio: OVERNIGHT_GAP_FADE.ENTRY.PREV_VOL_SURGE_RATIO,

  atrMultiplier: OVERNIGHT_GAP_FADE.STOP_LOSS.ATR_MULTIPLIER,
  maxLossPct: STOP_LOSS.MAX_LOSS_PCT,

  beActivationMultiplier: BREAK_EVEN_STOP.ACTIVATION_ATR_MULTIPLIER["overnight-gap-fade"],
  trailMultiplier: TRAILING_STOP.TRAIL_ATR_MULTIPLIER["overnight-gap-fade"],

  maxHoldingDays: OVERNIGHT_GAP_FADE.TIME_STOP.MAX_HOLDING_DAYS,
  maxExtendedHoldingDays: OVERNIGHT_GAP_FADE.TIME_STOP.MAX_EXTENDED_HOLDING_DAYS,

  maxPrice: getMaxBuyablePrice(500_000),
  minAvgVolume25: OVERNIGHT_GAP_FADE.ENTRY.MIN_AVG_VOLUME_25,
  minAtrPct: OVERNIGHT_GAP_FADE.ENTRY.MIN_ATR_PCT,
  minTurnover: SCREENING.MIN_TURNOVER,
  minPrice: SCREENING.MIN_PRICE,

  costModelEnabled: true,
  priceLimitEnabled: true,

  cooldownDays: 3,

  marketTrendFilter: false,
  marketTrendThreshold: 0.5,
  indexTrendFilter: true,
  indexTrendSmaPeriod: 50,
  indexTrendOffBufferPct: 0,
  indexTrendOnBufferPct: 0,

  verbose: false,
  positionCapEnabled: true,
};

/** 1トレードあたりリスク（%） */
export const OGF_RISK_PER_TRADE_PCT = POSITION_SIZING.RISK_PER_TRADE_PCT;

/** walk-forward パラメータグリッド（27通り、エグジット系のみ） */
export const OGF_PARAMETER_GRID = {
  atrMultiplier: [0.8, 1.0, 1.2],
  beActivationMultiplier: [0.3, 0.5, 0.8],
  trailMultiplier: [0.3, 0.5, 0.8],
} as const;

/** パラメータグリッドの全組み合わせを生成 */
export function generateOgfParameterCombinations(): Array<Partial<OvernightGapFadeBacktestConfig>> {
  const combos: Array<Partial<OvernightGapFadeBacktestConfig>> = [];

  for (const atrMultiplier of OGF_PARAMETER_GRID.atrMultiplier) {
    for (const beActivationMultiplier of OGF_PARAMETER_GRID.beActivationMultiplier) {
      for (const trailMultiplier of OGF_PARAMETER_GRID.trailMultiplier) {
        combos.push({ atrMultiplier, beActivationMultiplier, trailMultiplier });
      }
    }
  }

  return combos;
}
