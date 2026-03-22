/**
 * 取引コスト定数
 *
 * 立花証券 e-Supportプラン手数料 + 税金
 */

/** 手数料ティア（固定額 or 料率） */
interface CommissionTierFixed {
  maxTradeValue: number;
  commission: number;
}

interface CommissionTierRate {
  maxTradeValue: number;
  rate: number;
  maxCommission?: number;
}

export type CommissionTier = CommissionTierFixed | CommissionTierRate;

export const TRADING_COSTS = {
  /**
   * 立花証券 e支店 現物定額コース 手数料テーブル（税込）
   * ※ 定額コースは本来1日の約定代金合計で計算（100万ごとに253円追加、50万まで253円など）。
   * ※ シミュレーション上は1約定ごとの計算となるため、定額料金を概算で按分したテーブルを設定。
   */
  COMMISSION_TIERS: [
    { maxTradeValue: 120_000, commission: 0 },
    { maxTradeValue: 500_000, commission: 126 }, // 50万定額(253円)の約半分
    { maxTradeValue: 1_000_000, commission: 253 }, // 100万定額(506円)の約半分
    { maxTradeValue: Infinity, rate: 0.000253 }, // 100万ごとに253円追加
  ] as CommissionTier[],

  /** 譲渡益課税（特定口座・源泉徴収あり） */
  TAX: {
    RATE: 0.20315,
  },
} as const;
