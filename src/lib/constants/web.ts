/**
 * Web UI・ルート設定
 */

// クライアント側の市場時間判定（JST）
export const MARKET_HOURS_CLIENT = {
  START_HOUR: 9,
  END_HOUR: 16,
  START_DAY: 1, // 月曜
  END_DAY: 5, // 金曜
} as const;

// 自動リフレッシュ間隔（ms）
export const REFRESH_INTERVALS = {
  MARKET_HOURS: 30_000,
  OFF_HOURS: 60_000,
} as const;

// チャートSVGパディング
export const CHART_PADDING = {
  TOP: 10,
  RIGHT: 10,
  BOTTOM: 20,
  LEFT: 50,
} as const;

// チャートのx軸ラベル表示閾値
export const CHART_LABEL_THRESHOLD = 15;

// ルートのクエリ制限
export const QUERY_LIMITS = {
  ORDERS_TODAY: 30,
  POSITIONS_CLOSED: 20,
  HISTORY_SUMMARIES: 30,
} as const;

// ルートのルックバック日数
export const ROUTE_LOOKBACK_DAYS = {
  POSITIONS_CLOSED: 7,
  HISTORY: 30,
} as const;
