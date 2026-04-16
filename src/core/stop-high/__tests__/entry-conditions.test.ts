import { isStopHighSignal } from "../entry-conditions";

describe("isStopHighSignal", () => {
  // 前々日終値 500 → ストップ高価格 580 (limit=80)
  // 前日終値 580 = ストップ高張付け引け
  // 前日終値 580 ベースのストップ高価格は 680 (limit=100)
  // 当日寄付 600（+3.4% gap）, 高値 640, 終値 620（+3.3% 陽線、ロックなし）
  const base = {
    prevPrevClose: 500,
    prevClose: 580,
    todayOpen: 600,
    todayClose: 620,
    todayHigh: 640,
    todayVolume: 200_000,
    avgVolume25: 100_000,
    todayStopHighPrice: 680,
    stopHighThresholdRatio: 0.97,
    prevStopHighPrice: 580,
    minGapPct: 0.02,
    minBodyPct: 0.005,
    maxBodyPct: 0.15,
    volSurgeRatio: 1.0,
  };

  it("全条件を満たす場合 true", () => {
    expect(isStopHighSignal(base)).toBe(true);
  });

  it("前日がストップ高未達（閾値以下）で false", () => {
    expect(isStopHighSignal({ ...base, prevClose: 550 })).toBe(false);
  });

  it("ギャップ不足で false", () => {
    expect(isStopHighSignal({ ...base, todayOpen: 590 })).toBe(false);
  });

  it("陰線引けで false", () => {
    expect(isStopHighSignal({ ...base, todayClose: 595 })).toBe(false);
  });

  it("陽線幅が小さすぎて false", () => {
    expect(isStopHighSignal({ ...base, todayClose: 601 })).toBe(false);
  });

  it("陽線幅が大きすぎて（ロックアップ除外）false", () => {
    expect(isStopHighSignal({ ...base, todayClose: 700, todayHigh: 700 })).toBe(false);
  });

  it("当日もストップ高ロック（高値=ストップ高かつ終値≈高値）で false", () => {
    expect(isStopHighSignal({
      ...base, todayHigh: 680, todayClose: 678, todayOpen: 620,
    })).toBe(false);
  });

  it("出来高不足で false", () => {
    expect(isStopHighSignal({ ...base, todayVolume: 50_000 })).toBe(false);
  });

  it("prevPrevClose=0 で false", () => {
    expect(isStopHighSignal({ ...base, prevPrevClose: 0 })).toBe(false);
  });
});
