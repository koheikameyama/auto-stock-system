/**
 * ストップ高フォロースルー戦略エントリー条件
 *
 * 狙い: 前日ストップ高張付け → 当日ギャップアップ → 続伸 → 当日終値エントリー
 *
 * 条件:
 * 1. 前日終値が stopHighPrice × stopHighThresholdRatio 以上（実質ストップ高張付け引け）
 * 2. 当日ギャップ率 >= minGapPct
 * 3. 当日陽線 且つ minBodyPct <= 陽線幅 < maxBodyPct（ロックアップ再発を除外）
 * 4. 当日出来高 >= avgVolume25 × volSurgeRatio
 */

export function isStopHighSignal(params: {
  /** 前々日の終値（ストップ高価格の算出基準） */
  prevPrevClose: number;
  /** 前日の終値 */
  prevClose: number;
  /** 当日の OHLC */
  todayOpen: number;
  todayClose: number;
  todayHigh: number;
  /** 当日の出来高 */
  todayVolume: number;
  avgVolume25: number;
  /** 当日の高値 = ストップ高の場合、今日もロックアップしているのでエントリー見送り */
  todayStopHighPrice: number;
  stopHighThresholdRatio: number;
  prevStopHighPrice: number;
  minGapPct: number;
  minBodyPct: number;
  maxBodyPct: number;
  volSurgeRatio: number;
}): boolean {
  const {
    prevPrevClose,
    prevClose,
    todayOpen,
    todayClose,
    todayHigh,
    todayVolume,
    avgVolume25,
    todayStopHighPrice,
    stopHighThresholdRatio,
    prevStopHighPrice,
    minGapPct,
    minBodyPct,
    maxBodyPct,
    volSurgeRatio,
  } = params;

  if (prevPrevClose <= 0 || prevClose <= 0 || todayOpen <= 0 || todayClose <= 0) return false;

  // 1. 前日がストップ高張付け引け（prevClose >= limit_up × threshold）
  if (prevClose < prevStopHighPrice * stopHighThresholdRatio) return false;

  // 2. 当日ギャップ率
  const gapPct = todayOpen / prevClose - 1;
  if (gapPct < minGapPct) return false;

  // 3. 陽線 + 陽線幅の範囲チェック
  if (todayClose <= todayOpen) return false;
  const bodyPct = todayClose / todayOpen - 1;
  if (bodyPct < minBodyPct) return false;
  if (bodyPct >= maxBodyPct) return false;

  // 3b. 当日もストップ高ロック（高値=ストップ高 かつ 終値=高値）なら見送り
  if (todayHigh >= todayStopHighPrice && todayClose >= todayStopHighPrice * 0.995) return false;

  // 4. 出来高サージ
  if (avgVolume25 > 0 && todayVolume < avgVolume25 * volSurgeRatio) return false;

  return true;
}
