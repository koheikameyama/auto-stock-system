/**
 * Down-Day Reversal バックテスト設定 & パラメータグリッド
 */

import { DOWN_DAY_REVERSAL } from "../lib/constants/down-day-reversal";
import { STOP_LOSS, POSITION_SIZING } from "../lib/constants/scoring";
import { BREAK_EVEN_STOP, TRAILING_STOP, SCREENING } from "../lib/constants";
import { getMaxBuyablePrice } from "../core/risk-manager";
import type { DownDayReversalBacktestConfig } from "./types";

/** デフォルト設定 */
export const DDR_BACKTEST_DEFAULTS: Omit<DownDayReversalBacktestConfig, "startDate" | "endDate"> = {
  initialBudget: 500_000,
  maxPositions: 3,

  minDropPct: DOWN_DAY_REVERSAL.ENTRY.MIN_DROP_PCT,
  volSurgeRatio: DOWN_DAY_REVERSAL.ENTRY.VOL_SURGE_RATIO,
  minBodyPct: DOWN_DAY_REVERSAL.ENTRY.MIN_BODY_PCT,
  maxBreadth: DOWN_DAY_REVERSAL.ENTRY.MAX_BREADTH,

  atrMultiplier: DOWN_DAY_REVERSAL.STOP_LOSS.ATR_MULTIPLIER,
  maxLossPct: STOP_LOSS.MAX_LOSS_PCT,

  beActivationMultiplier: BREAK_EVEN_STOP.ACTIVATION_ATR_MULTIPLIER["down-day-reversal"],
  trailMultiplier: TRAILING_STOP.TRAIL_ATR_MULTIPLIER["down-day-reversal"],

  maxHoldingDays: DOWN_DAY_REVERSAL.TIME_STOP.MAX_HOLDING_DAYS,
  maxExtendedHoldingDays: DOWN_DAY_REVERSAL.TIME_STOP.MAX_EXTENDED_HOLDING_DAYS,

  maxPrice: getMaxBuyablePrice(500_000),
  minAvgVolume25: DOWN_DAY_REVERSAL.ENTRY.MIN_AVG_VOLUME_25,
  minAtrPct: DOWN_DAY_REVERSAL.ENTRY.MIN_ATR_PCT,
  minTurnover: SCREENING.MIN_TURNOVER,
  minPrice: SCREENING.MIN_PRICE,

  costModelEnabled: true,
  priceLimitEnabled: true,

  cooldownDays: 3,

  // DDR uses index below SMA50 (inverted from normal strategies)
  indexTrendFilter: true,
  indexTrendSmaPeriod: 50,
  indexTrendOffBufferPct: 0,
  indexTrendOnBufferPct: 0,

  verbose: false,
  positionCapEnabled: true,
};

/** 1トレードあたりリスク（%） */
export const DDR_RISK_PER_TRADE_PCT = POSITION_SIZING.RISK_PER_TRADE_PCT;

/** walk-forward パラメータグリッド（27通り、エグジット系のみ） */
export const DDR_PARAMETER_GRID = {
  atrMultiplier: [0.8, 1.0, 1.2],
  beActivationMultiplier: [0.3, 0.5, 0.8],
  trailMultiplier: [0.3, 0.5, 0.8],
} as const;

/** パラメータグリッドの全組み合わせを生成 */
export function generateDdrParameterCombinations(): Array<Partial<DownDayReversalBacktestConfig>> {
  const combos: Array<Partial<DownDayReversalBacktestConfig>> = [];

  for (const atrMultiplier of DDR_PARAMETER_GRID.atrMultiplier) {
    for (const beActivationMultiplier of DDR_PARAMETER_GRID.beActivationMultiplier) {
      for (const trailMultiplier of DDR_PARAMETER_GRID.trailMultiplier) {
        combos.push({ atrMultiplier, beActivationMultiplier, trailMultiplier });
      }
    }
  }

  return combos;
}
