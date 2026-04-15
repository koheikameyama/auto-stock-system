/**
 * ギャップダウンリバーサルエントリー条件の共通モジュール
 *
 * 条件:
 * 1. ギャップダウン: open <= prevClose * (1 - gapMinPct)
 * 2. 陽線: close > open
 * 3. 出来高サージ: volume >= avgVolume25 * volSurgeRatio
 */

export function isGapDownReversalSignal(params: {
  open: number;
  close: number;
  prevClose: number;
  volume: number;
  avgVolume25: number;
  gapMinPct: number;
  volSurgeRatio: number;
}): boolean {
  const { open, close, prevClose, volume, avgVolume25, gapMinPct, volSurgeRatio } = params;

  if (prevClose <= 0) return false;

  // 1. ギャップダウン
  if (open >= prevClose * (1 - gapMinPct)) return false;

  // 2. 陽線（リバーサル確認）
  if (close <= open) return false;

  // 3. 出来高サージ
  if (avgVolume25 > 0 && volume < avgVolume25 * volSurgeRatio) return false;

  return true;
}
