/**
 * Down-Day Reversal 戦略エントリー条件
 *
 * 条件:
 * 1. 前日終値から-5%以上の急落（当日安値 or 始値が大幅安）
 * 2. 当日出来高 >= avgVolume25 × volSurgeRatio（出来高3倍）
 * 3. 当日大陽線（close > open × (1 + minBodyPct)）— 反転確認
 * 4. 当日終値 > 当日安値 + (高値-安値) × 0.5 — 下半分で引けてない（反転の強さ）
 */

export function isDownDayReversalSignal(params: {
  prevClose: number;
  todayOpen: number;
  todayClose: number;
  todayHigh: number;
  todayLow: number;
  todayVolume: number;
  avgVolume25: number;
  minDropPct: number;
  volSurgeRatio: number;
  minBodyPct: number;
}): boolean {
  const {
    prevClose,
    todayOpen,
    todayClose,
    todayHigh,
    todayLow,
    todayVolume,
    avgVolume25,
    minDropPct,
    volSurgeRatio,
    minBodyPct,
  } = params;

  if (prevClose <= 0 || todayOpen <= 0 || todayClose <= 0) return false;

  // 1. 急落: 当日安値が前日終値から-5%以上下落
  const dropPct = (todayLow - prevClose) / prevClose;
  if (dropPct > -minDropPct) return false;

  // 2. 出来高サージ
  if (avgVolume25 <= 0 || todayVolume < avgVolume25 * volSurgeRatio) return false;

  // 3. 大陽線（反転確認）
  if (todayClose <= todayOpen) return false;
  const bodyPct = todayClose / todayOpen - 1;
  if (bodyPct < minBodyPct) return false;

  // 4. 終値が日中レンジの上半分（反転の強さ）
  const range = todayHigh - todayLow;
  if (range <= 0) return false;
  if (todayClose < todayLow + range * 0.5) return false;

  return true;
}
