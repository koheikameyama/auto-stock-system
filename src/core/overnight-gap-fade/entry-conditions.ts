/**
 * Overnight Gap-Fade 戦略エントリー条件
 *
 * 条件:
 * 1. 前日が大陽線（+5%以上）
 * 2. 前日の出来高 >= avgVolume25 × prevVolSurgeRatio
 * 3. 当日gapdown（-1%〜-5%の調整）
 * 4. 当日陽線（引けで戻る）
 */

export function isOvernightGapFadeSignal(params: {
  prevOpen: number;
  prevClose: number;
  prevVolume: number;
  todayOpen: number;
  todayClose: number;
  avgVolume25: number;
  prevMinBodyPct: number;
  minGapDownPct: number;
  maxGapDownPct: number;
  minBodyPct: number;
  prevVolSurgeRatio: number;
}): boolean {
  const {
    prevOpen,
    prevClose,
    prevVolume,
    todayOpen,
    todayClose,
    avgVolume25,
    prevMinBodyPct,
    minGapDownPct,
    maxGapDownPct,
    minBodyPct,
    prevVolSurgeRatio,
  } = params;

  if (prevOpen <= 0 || prevClose <= 0 || todayOpen <= 0 || todayClose <= 0) return false;

  // 1. 前日大陽線
  if (prevClose <= prevOpen) return false;
  const prevBodyPct = prevClose / prevOpen - 1;
  if (prevBodyPct < prevMinBodyPct) return false;

  // 2. 前日出来高サージ
  if (avgVolume25 <= 0 || prevVolume < avgVolume25 * prevVolSurgeRatio) return false;

  // 3. 当日gapdown（調整レンジ内）
  const gapPct = todayOpen / prevClose - 1;
  if (gapPct > -minGapDownPct) return false;  // gapdownが小さすぎる
  if (gapPct < -maxGapDownPct) return false;  // gapdownが大きすぎる（暴落）

  // 4. 当日陽線（引けで戻る）
  if (todayClose <= todayOpen) return false;
  const bodyPct = todayClose / todayOpen - 1;
  if (bodyPct < minBodyPct) return false;

  return true;
}
