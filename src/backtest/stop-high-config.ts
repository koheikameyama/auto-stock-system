/**
 * ストップ高フォロースルーバックテスト設定 & パラメータグリッド
 */

import { STOP_HIGH } from "../lib/constants/stop-high";
import { STOP_LOSS, POSITION_SIZING } from "../lib/constants/scoring";
import { BREAK_EVEN_STOP, TRAILING_STOP, SCREENING } from "../lib/constants";
import { getMaxBuyablePrice } from "../core/risk-manager";
import type { StopHighBacktestConfig } from "./types";

/** デフォルト設定 */
export const STOP_HIGH_BACKTEST_DEFAULTS: Omit<StopHighBacktestConfig, "startDate" | "endDate"> = {
  initialBudget: 500_000,
  maxPositions: 3,

  stopHighThresholdRatio: STOP_HIGH.ENTRY.STOP_HIGH_THRESHOLD_RATIO,
  minGapPct: STOP_HIGH.ENTRY.MIN_GAP_PCT,
  minBodyPct: STOP_HIGH.ENTRY.MIN_BODY_PCT,
  maxBodyPct: STOP_HIGH.ENTRY.MAX_BODY_PCT,
  volSurgeRatio: STOP_HIGH.ENTRY.VOL_SURGE_RATIO,

  atrMultiplier: STOP_HIGH.STOP_LOSS.ATR_MULTIPLIER,
  maxLossPct: STOP_LOSS.MAX_LOSS_PCT,

  beActivationMultiplier: BREAK_EVEN_STOP.ACTIVATION_ATR_MULTIPLIER["stop-high"],
  trailMultiplier: TRAILING_STOP.TRAIL_ATR_MULTIPLIER["stop-high"],

  maxHoldingDays: STOP_HIGH.TIME_STOP.MAX_HOLDING_DAYS,
  maxExtendedHoldingDays: STOP_HIGH.TIME_STOP.MAX_EXTENDED_HOLDING_DAYS,

  maxPrice: getMaxBuyablePrice(500_000),
  minAvgVolume25: STOP_HIGH.ENTRY.MIN_AVG_VOLUME_25,
  minAtrPct: STOP_HIGH.ENTRY.MIN_ATR_PCT,
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
export const STOP_HIGH_RISK_PER_TRADE_PCT = POSITION_SIZING.RISK_PER_TRADE_PCT;

/** walk-forward パラメータグリッド（27通り、エグジット系のみ） */
export const STOP_HIGH_PARAMETER_GRID = {
  atrMultiplier: [0.8, 1.0, 1.2],
  beActivationMultiplier: [0.3, 0.5, 0.8],
  trailMultiplier: [0.3, 0.5, 0.8],
} as const;

/** パラメータグリッドの全組み合わせを生成 */
export function generateStopHighParameterCombinations(): Array<Partial<StopHighBacktestConfig>> {
  const combos: Array<Partial<StopHighBacktestConfig>> = [];

  for (const atrMultiplier of STOP_HIGH_PARAMETER_GRID.atrMultiplier) {
    for (const beActivationMultiplier of STOP_HIGH_PARAMETER_GRID.beActivationMultiplier) {
      for (const trailMultiplier of STOP_HIGH_PARAMETER_GRID.trailMultiplier) {
        combos.push({ atrMultiplier, beActivationMultiplier, trailMultiplier });
      }
    }
  }

  return combos;
}
