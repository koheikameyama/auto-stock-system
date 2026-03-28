/**
 * ギャップアップ戦略の定数
 */
export const GAPUP = {
  ENTRY: {
    GAP_MIN_PCT: 0.03,
    VOL_SURGE_RATIO: 1.5,
    MAX_PRICE: 5000,
    MIN_AVG_VOLUME_25: 100_000,
    MIN_ATR_PCT: 1.5,
  },
  STOP_LOSS: {
    ATR_MULTIPLIER: 1.0,
  },
} as const;
