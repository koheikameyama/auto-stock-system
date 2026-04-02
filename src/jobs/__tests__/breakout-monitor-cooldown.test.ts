import { describe, it, expect } from "vitest";
import { shouldSetRetryCooldown } from "../breakout-monitor";

/**
 * JST時刻を指定してDateを生成するヘルパー
 */
function jstTime(hour: number, minute: number): Date {
  // UTC = JST - 9
  return new Date(Date.UTC(2026, 2, 24, hour - 9, minute, 0, 0));
}

describe("shouldSetRetryCooldown", () => {
  it("残り時間がクールダウン時間以上なら true を返す", () => {
    // RETRY_COOLDOWN_MS = 15分, LATEST_ENTRY_TIME = 15:25
    // 15:05 → 残り20分 ≥ 15分 → true
    expect(shouldSetRetryCooldown(jstTime(15, 5))).toBe(true);
  });

  it("残り時間がクールダウン時間未満なら false を返す", () => {
    // 15:15 → 残り10分 < 15分 → false
    expect(shouldSetRetryCooldown(jstTime(15, 15))).toBe(false);
  });

  it("ちょうどクールダウン時間と等しい場合は true を返す", () => {
    // 15:10 → 残り15分 = 15分 → true
    expect(shouldSetRetryCooldown(jstTime(15, 10))).toBe(true);
  });

  it("午前中は常に true を返す", () => {
    // 10:00 → 残り5時間25分 → true
    expect(shouldSetRetryCooldown(jstTime(10, 0))).toBe(true);
  });
});
