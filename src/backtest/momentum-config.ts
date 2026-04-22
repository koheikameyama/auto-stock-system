/**
 * モメンタムバックテスト設定 & パラメータグリッド
 */

import { MOMENTUM } from "../lib/constants/momentum";
import { STOP_LOSS, POSITION_SIZING } from "../lib/constants/scoring";
import { SCREENING } from "../lib/constants";
import { getMaxBuyablePrice } from "../core/risk-manager";
import type { MomentumBacktestConfig } from "./types";

/** デフォルト設定 */
export const MOMENTUM_BACKTEST_DEFAULTS: Omit<MomentumBacktestConfig, "startDate" | "endDate"> = {
  initialBudget: 500_000,
  maxPositions: 3,

  // エントリー
  lookbackDays: MOMENTUM.ENTRY.LOOKBACK_DAYS,      // 60
  topN: MOMENTUM.ENTRY.TOP_N,                       // 3
  rebalanceDays: MOMENTUM.ENTRY.REBALANCE_DAYS,    // 20
  minReturnPct: MOMENTUM.ENTRY.MIN_RETURN_PCT,      // 5

  // ストップロス（長期保有のため広め）
  atrMultiplier: MOMENTUM.STOP_LOSS.ATR_MULTIPLIER, // 1.5
  maxLossPct: STOP_LOSS.MAX_LOSS_PCT,                // 0.03

  // トレーリングストップ
  beActivationMultiplier: 1.0,
  trailMultiplier: 1.0,

  // タイムストップ（リバランスが主決済手段なので長め）
  maxHoldingDays: 30,
  maxExtendedHoldingDays: 40,

  // ユニバースフィルター
  maxPrice: getMaxBuyablePrice(500_000),
  minAvgVolume25: MOMENTUM.ENTRY.MIN_AVG_VOLUME_25,
  minAtrPct: MOMENTUM.ENTRY.MIN_ATR_PCT,
  minTurnover: SCREENING.MIN_TURNOVER,
  minPrice: SCREENING.MIN_PRICE,

  // コスト・リスク
  costModelEnabled: true,
  priceLimitEnabled: true,

  // クールダウン
  cooldownDays: 0, // リバランス駆動なのでクールダウン不要

  // マーケットフィルター
  marketTrendFilter: true,
  marketTrendThreshold: MOMENTUM.MARKET_FILTER.BREADTH_THRESHOLD,
  indexTrendFilter: false,
  indexTrendSmaPeriod: 50,
  indexTrendOffBufferPct: 0,
  indexTrendOnBufferPct: 0,

  verbose: false,
  positionCapEnabled: true,
};

/** 1トレードあたりリスク（%） */
export const MOMENTUM_RISK_PER_TRADE_PCT = POSITION_SIZING.RISK_PER_TRADE_PCT; // 2

/**
 * 大型株モメンタム用プリセット（Jegadeesh-Titman 古典派生）
 *
 * 既存の中小型株設定（LOOKBACK_DAYS=60, MIN_RETURN_PCT=5）では小型株ノイズに負けた。
 * 大型株向けに:
 *   - 6ヶ月ルックバック + 最低+15%で "弱い上昇" を弾く
 *   - minMarketCap で TOPIX500相当（時価総額1,000億円以上）に絞る
 *   - maxPrice 制限撤廃、予算¥10M想定
 *
 * 重要な設計判断:
 *   - BEトレーリング事実上無効化（beActivation=999, trail=999）
 *     理由: 古典モメンタムは「伸ばしきる」が本質。BE=1.0×ATR発動はDayトレーディング前提で
 *     大型株(低ATR%)だと2%上昇で即BE→微小押し目で2-3日で損切りになる。
 *     モメンタムの exit は (1) rotation(rebalance落選), (2) wide SL(-10%), (3) 時間
 *   - maxLossPct = 0.10 (10%): 古典論文は -10〜15%ストップが標準
 */
export const MOMENTUM_LARGECAP_PARAMS: Partial<MomentumBacktestConfig> = {
  lookbackDays: 120,             // 6ヶ月
  minReturnPct: 15,              // +15% over 6mo
  topN: 3,
  rebalanceDays: 20,
  minMarketCap: 100_000_000_000, // ¥100B = 1,000億円
  maxPrice: 100_000,             // 実質制限なし
  minPrice: 100,
  minAvgVolume25: 100_000,
  atrMultiplier: 3.0,            // SL = entry - 3×ATR（maxLossPct で 10% にキャップ）
  maxLossPct: 0.10,              // 古典モメンタムは -10% ストップが標準
  beActivationMultiplier: 999,   // 事実上無効化（トレンドを伸ばしきる）
  trailMultiplier: 999,          // 事実上無効化
  maxHoldingDays: 60,
  maxExtendedHoldingDays: 90,
  // 大型株モメンタムは個別株の強さが本質。全市場breadthは使わず indexTrend で十分
  // (combined BTでは全銘柄breadth = 小型株ノイズが入るため特に無効化が重要)
  marketTrendFilter: false,
  indexTrendFilter: true,
};

/** walk-forward パラメータグリッド（エグジット系のみ、27通り） */
export const MOMENTUM_PARAMETER_GRID = {
  atrMultiplier: [1.0, 1.5, 2.0],
  beActivationMultiplier: [0.5, 1.0, 1.5],
  trailMultiplier: [0.8, 1.0, 1.5],
} as const;

/** パラメータグリッドの全組み合わせを生成 */
export function generateMomentumParameterCombinations(): Array<Partial<MomentumBacktestConfig>> {
  const combos: Array<Partial<MomentumBacktestConfig>> = [];

  for (const atrMultiplier of MOMENTUM_PARAMETER_GRID.atrMultiplier) {
    for (const beActivationMultiplier of MOMENTUM_PARAMETER_GRID.beActivationMultiplier) {
      for (const trailMultiplier of MOMENTUM_PARAMETER_GRID.trailMultiplier) {
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
 * 大型株モメンタム用のパラメータグリッド（3通り）
 *
 * BE/trail は無効化（999）で固定。SL幅のみ変える。
 * 理由: 古典モメンタムはBE/trailを使わないのでこのパラメータをグリッド探索する意味がない。
 */
export const MOMENTUM_LARGECAP_PARAMETER_GRID = {
  atrMultiplier: [2.0, 3.0, 4.0],
} as const;

export function generateLargecapMomentumParameterCombinations(): Array<Partial<MomentumBacktestConfig>> {
  return MOMENTUM_LARGECAP_PARAMETER_GRID.atrMultiplier.map((atrMultiplier) => ({
    atrMultiplier,
    beActivationMultiplier: 999,
    trailMultiplier: 999,
  }));
}
