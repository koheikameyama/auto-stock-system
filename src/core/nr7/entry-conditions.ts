/**
 * NR7ブレイク戦略エントリー条件
 *
 * 条件:
 * 1. NR7: 当日の(high-low)が直近7日間で最小（ボラ収縮）
 * 2. ブレイクアウト: close > 前6日間の最高値
 * 3. 陽線: close > open
 * 4. 出来高サージ: volume >= avgVolume25 × volSurgeRatio
 */

export function isNR7Signal(params: {
  /** 直近7日分のレンジ (high - low)。[0] = 6日前, ..., [6] = 当日 */
  ranges: number[];
  close: number;
  open: number;
  /** 前6日間の最高値（当日除く） */
  prevHigh6: number;
  volume: number;
  avgVolume25: number;
  volSurgeRatio: number;
}): boolean {
  const { ranges, close, open, prevHigh6, volume, avgVolume25, volSurgeRatio } = params;

  if (ranges.length < 7) return false;

  const todayRange = ranges[6];
  if (todayRange <= 0) return false;

  // 1. NR7: 当日レンジが直近7日間で最小
  for (let i = 0; i < 6; i++) {
    if (todayRange >= ranges[i]) return false;
  }

  // 2. ブレイクアウト: close > 前6日の最高値
  if (close <= prevHigh6) return false;

  // 3. 陽線
  if (close <= open) return false;

  // 4. 出来高サージ
  if (avgVolume25 > 0 && volume < avgVolume25 * volSurgeRatio) return false;

  return true;
}
