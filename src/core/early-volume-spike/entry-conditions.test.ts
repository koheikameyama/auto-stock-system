import { describe, it, expect } from "vitest";
import { isEarlyVolumeSpikeSignal } from "./entry-conditions";

const BASE = {
  todayOpen: 500,
  todayClose: 520,       // +4% 陽線
  todayHigh: 530,
  todayLow: 490,         // range=40
  todayVolume: 600_000,  // 6x surge
  avgVolume25: 100_000,
  high20: 600,           // close/high20 = 520/600 = 0.867 → 80-95%
  atr14: 30,             // range(40) >= atr(30) × 1.0
  volSurgeRatio: 5.0,
  minHigh20Ratio: 0.80,
  maxHigh20Ratio: 0.95,
  minBodyPct: 0.005,
  minRangeAtrRatio: 1.0,
};

describe("isEarlyVolumeSpikeSignal", () => {
  it("全条件を満たすとtrue", () => {
    expect(isEarlyVolumeSpikeSignal(BASE)).toBe(true);
  });

  it("出来高サージ不足でfalse", () => {
    expect(isEarlyVolumeSpikeSignal({ ...BASE, todayVolume: 400_000 })).toBe(false);
  });

  it("20日高値の80%未満でfalse（まだ遠すぎる）", () => {
    expect(isEarlyVolumeSpikeSignal({ ...BASE, todayClose: 470, todayOpen: 460 })).toBe(false);
    // 470/600 = 0.783 < 0.80
  });

  it("20日高値の95%以上でfalse（既にブレイク付近）", () => {
    expect(isEarlyVolumeSpikeSignal({ ...BASE, todayClose: 580, todayOpen: 570, high20: 600 })).toBe(false);
    // 580/600 = 0.967 >= 0.95
  });

  it("陰線でfalse", () => {
    expect(isEarlyVolumeSpikeSignal({ ...BASE, todayClose: 490, todayOpen: 500 })).toBe(false);
  });

  it("陽線幅が不足でfalse", () => {
    expect(isEarlyVolumeSpikeSignal({ ...BASE, todayClose: 500.2, todayOpen: 500 })).toBe(false);
    // 0.2/500 = 0.0004 < 0.005
  });

  it("ATR拡大不足でfalse（レンジが小さい）", () => {
    expect(isEarlyVolumeSpikeSignal({
      ...BASE,
      todayHigh: 510,
      todayLow: 495,  // range=15 < atr(30) × 1.0
    })).toBe(false);
  });

  it("avgVolume25=0ならfalse", () => {
    expect(isEarlyVolumeSpikeSignal({ ...BASE, avgVolume25: 0 })).toBe(false);
  });

  it("atr14=0ならfalse", () => {
    expect(isEarlyVolumeSpikeSignal({ ...BASE, atr14: 0 })).toBe(false);
  });

  it("ちょうど80%でtrue（境界値）", () => {
    // close/high20 = 480/600 = 0.80
    expect(isEarlyVolumeSpikeSignal({
      ...BASE,
      todayOpen: 470,
      todayClose: 480,
      todayHigh: 490,
      todayLow: 450,  // range=40 >= atr=30
    })).toBe(true);
  });

  it("ちょうど95%でfalse（境界値、ブレイク付近は除外）", () => {
    // close/high20 = 570/600 = 0.95
    expect(isEarlyVolumeSpikeSignal({
      ...BASE,
      todayOpen: 560,
      todayClose: 570,
    })).toBe(false);
  });
});
