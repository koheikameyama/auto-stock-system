/**
 * MA押し目買いバックテスト設定 & パラメータグリッド
 */

import { MA_PULLBACK } from "../lib/constants/ma-pullback";
import { STOP_LOSS, POSITION_SIZING } from "../lib/constants/scoring";
import { BREAK_EVEN_STOP, TRAILING_STOP, SCREENING } from "../lib/constants";
import { getMaxBuyablePrice } from "../core/risk-manager";
import type { MaPullbackBacktestConfig } from "./types";

/** デフォルト設定 */
export const MA_PULLBACK_BACKTEST_DEFAULTS: Omit<MaPullbackBacktestConfig, "startDate" | "endDate"> = {
  initialBudget: 500_000,
  maxPositions: 3,

  // エントリー（固定）
  maPeriod: MA_PULLBACK.ENTRY.MA_PERIOD,
  maTouchBuffer: MA_PULLBACK.ENTRY.MA_TOUCH_BUFFER,
  trendMaPeriod: MA_PULLBACK.ENTRY.TREND_MA_PERIOD,
  recentHighLookback: MA_PULLBACK.ENTRY.RECENT_HIGH_LOOKBACK,
  volumeDryupRatio: MA_PULLBACK.ENTRY.VOLUME_DRYUP_RATIO,

  // ストップロス
  atrMultiplier: MA_PULLBACK.STOP_LOSS.ATR_MULTIPLIER,
  maxLossPct: STOP_LOSS.MAX_LOSS_PCT,

  // トレーリングストップ（weekly-break相当の初期値）
  beActivationMultiplier: BREAK_EVEN_STOP.ACTIVATION_ATR_MULTIPLIER["weekly-break"],
  trailMultiplier: TRAILING_STOP.TRAIL_ATR_MULTIPLIER["weekly-break"],

  // タイムストップ（10日 / 15日）
  maxHoldingDays: 10,
  maxExtendedHoldingDays: 15,

  // ユニバースフィルター
  maxPrice: getMaxBuyablePrice(500_000),
  minAvgVolume25: MA_PULLBACK.ENTRY.MIN_AVG_VOLUME_25,
  minAtrPct: MA_PULLBACK.ENTRY.MIN_ATR_PCT,
  minTurnover: SCREENING.MIN_TURNOVER,
  minPrice: SCREENING.MIN_PRICE,

  // コスト・リスク
  costModelEnabled: true,
  priceLimitEnabled: true,
  cooldownDays: 3,

  // マーケットフィルター
  marketTrendFilter: true,
  marketTrendThreshold: MA_PULLBACK.MARKET_FILTER.BREADTH_THRESHOLD,
  indexTrendFilter: true,
  indexTrendSmaPeriod: 50,
  indexTrendOffBufferPct: 0,
  indexTrendOnBufferPct: 0,

  verbose: false,
  positionCapEnabled: true,
};

/** 1トレードあたりリスク（%） */
export const MA_PULLBACK_RISK_PER_TRADE_PCT = POSITION_SIZING.RISK_PER_TRADE_PCT;

/** WFパラメータグリッド（エグジット系のみ、27通り） */
export const MA_PULLBACK_PARAMETER_GRID = {
  atrMultiplier: [0.8, 1.0, 1.2],
  beActivationMultiplier: [0.3, 0.5, 0.8],
  trailMultiplier: [0.5, 0.8, 1.0],
} as const;

/** パラメータグリッドの全組み合わせを生成 */
export function generateMaPullbackParameterCombinations(): Array<Partial<MaPullbackBacktestConfig>> {
  const combos: Array<Partial<MaPullbackBacktestConfig>> = [];
  for (const atrMultiplier of MA_PULLBACK_PARAMETER_GRID.atrMultiplier) {
    for (const beActivationMultiplier of MA_PULLBACK_PARAMETER_GRID.beActivationMultiplier) {
      for (const trailMultiplier of MA_PULLBACK_PARAMETER_GRID.trailMultiplier) {
        combos.push({ atrMultiplier, beActivationMultiplier, trailMultiplier });
      }
    }
  }
  return combos;
}
