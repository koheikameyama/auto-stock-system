import { describe, it, expect } from "vitest";
import { calculateVolumeSurgeRatio } from "../volume-surge";

describe("calculateVolumeSurgeRatio", () => {
  it("9:30に平均の10%到達 → ratio 1.0", () => {
    // 9:30 → elapsedFraction = 30/300 = 0.1
    // avgVolume25 = 100,000, cumulativeVolume = 10,000
    // ratio = 10,000 / (100,000 * 0.1) = 1.0
    const ratio = calculateVolumeSurgeRatio(10_000, 100_000, 9, 30);
    expect(ratio).toBeCloseTo(1.0);
  });

  it("9:30に平均の20%到達 → ratio 2.0（ブレイクアウト）", () => {
    const ratio = calculateVolumeSurgeRatio(20_000, 100_000, 9, 30);
    expect(ratio).toBeCloseTo(2.0);
  });

  it("昼休み中は前場終了値で計算", () => {
    // 12:00 → elapsedFraction = 150/300 = 0.5
    const ratio = calculateVolumeSurgeRatio(50_000, 100_000, 12, 0);
    expect(ratio).toBeCloseTo(1.0);
  });

  it("場前（elapsedFraction=0）→ ratio 0", () => {
    const ratio = calculateVolumeSurgeRatio(5_000, 100_000, 8, 30);
    expect(ratio).toBe(0);
  });

  it("avgVolume25が0 → ratio 0（ゼロ除算防止）", () => {
    const ratio = calculateVolumeSurgeRatio(5_000, 0, 10, 0);
    expect(ratio).toBe(0);
  });
});
