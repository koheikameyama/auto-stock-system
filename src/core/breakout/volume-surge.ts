import { getElapsedFraction } from "./elapsed-trading-minutes";

/**
 * 出来高サージ比率を計算
 *
 * volumeSurgeRatio = cumulativeVolume / (avgVolume25 × elapsedFraction)
 *
 * この比率は、平均出来高に比べて現在どれくらい出来高が増加しているか、
 * かつ1営業日の進捗を正規化した値を返す。
 *
 * 例:
 * - 9:30に平均出来高の10%到達 → ratio = 1.0
 * - 9:30に平均出来高の20%到達 → ratio = 2.0（ブレイクアウトトリガー）
 * - 昼休み中は前場終了値で計算
 *
 * @param cumulativeVolume - 本日の累積出来高（Tachibana APIの`pDV`フィールド）
 * @param avgVolume25 - 25日間の平均出来高
 * @param hour - 時刻（0-23, JST）
 * @param minute - 分（0-59）
 * @returns 出来高サージ比率（0.0以上）
 */
export function calculateVolumeSurgeRatio(
  cumulativeVolume: number,
  avgVolume25: number,
  hour: number,
  minute: number,
): number {
  if (avgVolume25 <= 0) return 0;
  const fraction = getElapsedFraction(hour, minute);
  if (fraction <= 0) return 0;
  return cumulativeVolume / (avgVolume25 * fraction);
}
