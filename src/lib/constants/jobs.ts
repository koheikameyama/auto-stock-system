/**
 * ジョブ設定
 */

// ポジションのデフォルト利確/損切り
export const POSITION_DEFAULTS = {
  TAKE_PROFIT_RATIO: 1.03, // 3%利確
  STOP_LOSS_RATIO: 0.98, // 2%損切り
} as const;

// 注文有効期限
export const ORDER_EXPIRY = {
  SWING_DAYS: 3, // スイングトレード注文の有効日数
} as const;

// 株価取得関連
export const STOCK_FETCH = {
  FAIL_THRESHOLD: 5, // 上場廃止判定の失敗回数
  WEEKLY_CHANGE_MIN_DAYS: 5, // 週間変化率計算の最低日数
} as const;

// ジョブの同時実行数
export const JOB_CONCURRENCY = {
  MARKET_SCANNER: 5,
} as const;

// 週次レビュー
export const WEEKLY_REVIEW = {
  LOOKBACK_DAYS: 7,
} as const;
