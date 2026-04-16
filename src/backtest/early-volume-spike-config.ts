/**
 * Early Volume Spike バックテスト設定 & パラメータグリッド
 */

import { EARLY_VOLUME_SPIKE } from "../lib/constants/early-volume-spike";
import { STOP_LOSS, POSITION_SIZING } from "../lib/constants/scoring";
import { BREAK_EVEN_STOP, TRAILING_STOP, SCREENING } from "../lib/constants";
import { getMaxBuyablePrice } from "../core/risk-manager";
import type { EarlyVolumeSpikeBacktestConfig } from "./types";

/** デフォルト設定 */
export const EVS_BACKTEST_DEFAULTS: Omit<EarlyVolumeSpikeBacktestConfig, "startDate" | "endDate"> = {
  initialBudget: 500_000,
  maxPositions: 3,

  volSurgeRatio: EARLY_VOLUME_SPIKE.ENTRY.VOL_SURGE_RATIO,
  minHigh20Ratio: EARLY_VOLUME_SPIKE.ENTRY.MIN_HIGH20_RATIO,
  maxHigh20Ratio: EARLY_VOLUME_SPIKE.ENTRY.MAX_HIGH20_RATIO,
  highLookbackDays: EARLY_VOLUME_SPIKE.ENTRY.HIGH_LOOKBACK_DAYS,
  minBodyPct: EARLY_VOLUME_SPIKE.ENTRY.MIN_BODY_PCT,
  minRangeAtrRatio: EARLY_VOLUME_SPIKE.ENTRY.MIN_RANGE_ATR_RATIO,

  atrMultiplier: EARLY_VOLUME_SPIKE.STOP_LOSS.ATR_MULTIPLIER,
  maxLossPct: STOP_LOSS.MAX_LOSS_PCT,

  beActivationMultiplier: BREAK_EVEN_STOP.ACTIVATION_ATR_MULTIPLIER["early-volume-spike"],
  trailMultiplier: TRAILING_STOP.TRAIL_ATR_MULTIPLIER["early-volume-spike"],

  maxHoldingDays: EARLY_VOLUME_SPIKE.TIME_STOP.MAX_HOLDING_DAYS,
  maxExtendedHoldingDays: EARLY_VOLUME_SPIKE.TIME_STOP.MAX_EXTENDED_HOLDING_DAYS,

  maxPrice: getMaxBuyablePrice(500_000),
  minAvgVolume25: EARLY_VOLUME_SPIKE.ENTRY.MIN_AVG_VOLUME_25,
  minAtrPct: EARLY_VOLUME_SPIKE.ENTRY.MIN_ATR_PCT,
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
export const EVS_RISK_PER_TRADE_PCT = POSITION_SIZING.RISK_PER_TRADE_PCT;

/** walk-forward パラメータグリッド（27通り、エグジット系のみ） */
export const EVS_PARAMETER_GRID = {
  atrMultiplier: [0.8, 1.0, 1.2],
  beActivationMultiplier: [0.3, 0.5, 0.8],
  trailMultiplier: [0.5, 0.8, 1.0],
} as const;

/** パラメータグリッドの全組み合わせを生成 */
export function generateEvsParameterCombinations(): Array<Partial<EarlyVolumeSpikeBacktestConfig>> {
  const combos: Array<Partial<EarlyVolumeSpikeBacktestConfig>> = [];

  for (const atrMultiplier of EVS_PARAMETER_GRID.atrMultiplier) {
    for (const beActivationMultiplier of EVS_PARAMETER_GRID.beActivationMultiplier) {
      for (const trailMultiplier of EVS_PARAMETER_GRID.trailMultiplier) {
        combos.push({ atrMultiplier, beActivationMultiplier, trailMultiplier });
      }
    }
  }

  return combos;
}
