/**
 * NR7ブレイクバックテスト設定 & パラメータグリッド
 */

import { NR7 } from "../lib/constants/nr7";
import { STOP_LOSS, POSITION_SIZING } from "../lib/constants/scoring";
import { BREAK_EVEN_STOP, TRAILING_STOP, SCREENING } from "../lib/constants";
import { getMaxBuyablePrice } from "../core/risk-manager";
import type { NR7BacktestConfig } from "./types";

/** デフォルト設定 */
export const NR7_BACKTEST_DEFAULTS: Omit<NR7BacktestConfig, "startDate" | "endDate"> = {
  initialBudget: 500_000,
  maxPositions: 3,

  lookbackDays: NR7.ENTRY.LOOKBACK_DAYS,
  volSurgeRatio: NR7.ENTRY.VOL_SURGE_RATIO,

  atrMultiplier: NR7.STOP_LOSS.ATR_MULTIPLIER,
  maxLossPct: STOP_LOSS.MAX_LOSS_PCT,

  beActivationMultiplier: BREAK_EVEN_STOP.ACTIVATION_ATR_MULTIPLIER["nr7"],
  trailMultiplier: TRAILING_STOP.TRAIL_ATR_MULTIPLIER["nr7"],

  maxHoldingDays: NR7.TIME_STOP.MAX_HOLDING_DAYS,
  maxExtendedHoldingDays: NR7.TIME_STOP.MAX_EXTENDED_HOLDING_DAYS,

  maxPrice: getMaxBuyablePrice(500_000),
  minAvgVolume25: NR7.ENTRY.MIN_AVG_VOLUME_25,
  minAtrPct: NR7.ENTRY.MIN_ATR_PCT,
  minTurnover: SCREENING.MIN_TURNOVER,
  minPrice: SCREENING.MIN_PRICE,

  costModelEnabled: true,
  priceLimitEnabled: true,

  cooldownDays: 3,

  marketTrendFilter: true,
  marketTrendThreshold: 0.6,
  indexTrendFilter: true,
  indexTrendSmaPeriod: 50,
  indexTrendOffBufferPct: 0,
  indexTrendOnBufferPct: 0,

  verbose: false,
  positionCapEnabled: true,
};

/** 1トレードあたりリスク（%） */
export const NR7_RISK_PER_TRADE_PCT = POSITION_SIZING.RISK_PER_TRADE_PCT;

/** walk-forward パラメータグリッド（27通り、エグジット系のみ） */
export const NR7_PARAMETER_GRID = {
  atrMultiplier: [0.8, 1.0, 1.2],
  beActivationMultiplier: [0.3, 0.5, 0.8],
  trailMultiplier: [0.5, 0.8, 1.0],
} as const;

/** パラメータグリッドの全組み合わせを生成 */
export function generateNR7ParameterCombinations(): Array<Partial<NR7BacktestConfig>> {
  const combos: Array<Partial<NR7BacktestConfig>> = [];

  for (const atrMultiplier of NR7_PARAMETER_GRID.atrMultiplier) {
    for (const beActivationMultiplier of NR7_PARAMETER_GRID.beActivationMultiplier) {
      for (const trailMultiplier of NR7_PARAMETER_GRID.trailMultiplier) {
        combos.push({ atrMultiplier, beActivationMultiplier, trailMultiplier });
      }
    }
  }

  return combos;
}
