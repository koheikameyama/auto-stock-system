/**
 * Early Volume Spike 戦略エントリー条件
 *
 * 狙い: 出来高異常急増 → 20日高値の80-95%位置 → ブレイクアウト前の仕込み
 *
 * 条件:
 * 1. 当日出来高 >= avgVolume25 × volSurgeRatio（出来高異常サージ）
 * 2. 当日終値が20日高値の80-95%位置（ブレイク前だがトレンドは上向き）
 * 3. 当日陽線（close > open かつ bodyPct >= minBodyPct）
 * 4. 当日レンジ(high-low) >= ATR14 × minRangeAtrRatio（ATR拡大、ボラ発生確認）
 */

export function isEarlyVolumeSpikeSignal(params: {
  todayOpen: number;
  todayClose: number;
  todayHigh: number;
  todayLow: number;
  todayVolume: number;
  avgVolume25: number;
  high20: number;
  atr14: number;
  volSurgeRatio: number;
  minHigh20Ratio: number;
  maxHigh20Ratio: number;
  minBodyPct: number;
  minRangeAtrRatio: number;
}): boolean {
  const {
    todayOpen,
    todayClose,
    todayHigh,
    todayLow,
    todayVolume,
    avgVolume25,
    high20,
    atr14,
    volSurgeRatio,
    minHigh20Ratio,
    maxHigh20Ratio,
    minBodyPct,
    minRangeAtrRatio,
  } = params;

  if (todayOpen <= 0 || todayClose <= 0 || high20 <= 0 || atr14 <= 0) return false;

  // 1. 出来高サージ
  if (avgVolume25 <= 0 || todayVolume < avgVolume25 * volSurgeRatio) return false;

  // 2. 20日高値の80-95%位置
  const high20Ratio = todayClose / high20;
  if (high20Ratio < minHigh20Ratio) return false;
  if (high20Ratio >= maxHigh20Ratio) return false;

  // 3. 陽線
  if (todayClose <= todayOpen) return false;
  const bodyPct = todayClose / todayOpen - 1;
  if (bodyPct < minBodyPct) return false;

  // 4. ATR拡大（当日レンジ >= ATR × minRangeAtrRatio）
  const todayRange = todayHigh - todayLow;
  if (todayRange < atr14 * minRangeAtrRatio) return false;

  return true;
}
