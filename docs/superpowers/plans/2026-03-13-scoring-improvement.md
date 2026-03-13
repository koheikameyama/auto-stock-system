# スコアリングシステム予測力改善 実装計画

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** スコアリングシステムの配点を再設計し、S/A/Bランク間で勝率差が出るよう予測力を改善する

**Architecture:** 既存4カテゴリ100点満点を維持。テクニカル40→65点に拡大（RS新設含む）、パターン20→15点、流動性25→10点、ファンダ15→10点に縮小。ステップ関数を区分線形関数に変更、nullデフォルトを0点に統一。

**Tech Stack:** TypeScript, Prisma, vitest（新規）, Next.js

**Spec:** `docs/superpowers/specs/2026-03-13-scoring-improvement-design.md`

---

## Chunk 1: Foundation

### Task 1: vitest セットアップ

**Files:**
- Create: `vitest.config.ts`
- Modify: `package.json`

- [ ] **Step 1: vitest をインストール**

```bash
npm install -D vitest
```

- [ ] **Step 2: vitest.config.ts を作成**

```typescript
import { defineConfig } from "vitest/config";
import path from "path";

export default defineConfig({
  test: {
    globals: true,
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
});
```

- [ ] **Step 3: package.json に test スクリプトを追加**

`package.json` の `scripts` に追加:
```json
"test": "vitest run",
"test:watch": "vitest"
```

- [ ] **Step 4: 動作確認用のダミーテストで vitest が動くか確認**

```bash
echo 'import { describe, it, expect } from "vitest"; describe("setup", () => { it("works", () => { expect(1+1).toBe(2); }); });' > src/core/__tests__/setup.test.ts
npx vitest run src/core/__tests__/setup.test.ts
```

Expected: PASS

- [ ] **Step 5: ダミーテストを削除してコミット**

```bash
rm src/core/__tests__/setup.test.ts
git add vitest.config.ts package.json package-lock.json
git commit -m "chore: vitest セットアップ"
```

---

### Task 2: スコアリング定数の更新

**Files:**
- Modify: `src/lib/constants/scoring.ts`

- [ ] **Step 1: SCORING 定数を新配点に更新**

`src/lib/constants/scoring.ts` の `SCORING` オブジェクトを以下に置き換え:

```typescript
export const SCORING = {
  CATEGORY_MAX: {
    TECHNICAL: 65,
    PATTERN: 15,
    LIQUIDITY: 10,
    FUNDAMENTAL: 10,
  },

  SUB_MAX: {
    // テクニカル (65点)
    RSI: 12,
    MA: 18,
    VOLUME_CHANGE: 13,
    MACD: 7,
    RELATIVE_STRENGTH: 15,
    // パターン (15点)
    CHART_PATTERN: 10,
    CANDLESTICK: 5,
    // 流動性 (10点)
    TRADING_VALUE: 5,
    SPREAD_PROXY: 3,
    STABILITY: 2,
    // ファンダメンタルズ (10点)
    PER: 4,
    PBR: 3,
    PROFITABILITY: 2,
    MARKET_CAP: 1,
  },

  THRESHOLDS: {
    S_RANK: 80,
    A_RANK: 65,
    B_RANK: 50,
  },

  DISQUALIFY: {
    MAX_PRICE: 3000,
    MAX_DAILY_SPREAD_PCT: 0.05,
    MAX_WEEKLY_VOLATILITY: 8,
    EARNINGS_DAYS_BEFORE: 5,
    EARNINGS_DAYS_AFTER: 2,
    EX_DIVIDEND_DAYS_BEFORE: 2,
    EX_DIVIDEND_DAYS_AFTER: 1,
  },

  WEEKLY_TREND: {
    PENALTY: 8,
    MIN_WEEKLY_BARS: 14,
  },

  RELATIVE_STRENGTH: {
    MAX_SCORE: 15,
    MIN_SECTOR_STOCKS: 2,
  },

  LIQUIDITY: {
    TRADING_VALUE_TIERS: [500_000_000, 300_000_000, 100_000_000, 50_000_000],
    SPREAD_PROXY_TIERS: [0.01, 0.02, 0.03, 0.05],
    STABILITY_CV_TIERS: [0.3, 0.5, 0.7],
  },

  FUNDAMENTAL: {
    PER_TIERS: [
      { min: 5, max: 15, score: 4 },
      { min: 15, max: 30, score: 3 },
      { min: 0, max: 5, score: 2 },
      { min: 30, max: 50, score: 1 },
    ],
    PER_DEFAULT: 0,
    PBR_TIERS: [
      { min: 0.5, max: 1.5, score: 3 },
      { min: 1.5, max: 3.0, score: 2 },
      { min: 0, max: 0.5, score: 1 },
      { min: 3.0, max: 5.0, score: 1 },
    ],
    PBR_DEFAULT: 0,
    PBR_OVER_5: 0,
    EPS_STRONG_RATIO: 0.05,
    EPS_POSITIVE: 1,
    EPS_NEGATIVE: 0,
    EPS_NULL: 0,
    MARKET_CAP_TIERS: [
      { min: 200_000_000_000, score: 1 },
    ],
    MARKET_CAP_DEFAULT: 0,
  },

  VOLUME_DIRECTION: {
    LOOKBACK_DAYS: 5,
    OBV_PERIOD: 10,
    ACCUMULATION_THRESHOLD: 0.6,
    DISTRIBUTION_THRESHOLD: 0.4,
    MIN_DATA_DAYS: 3,
    SCORES: {
      HIGH_VOLUME: { accumulation: 10, neutral: 7, distribution: 3 },
      MEDIUM_VOLUME: { accumulation: 8, neutral: 6, distribution: 3 },
      NORMAL_VOLUME: { accumulation: 6, neutral: 5, distribution: 4 },
    },
  },

  MAX_CANDIDATES_FOR_AI: 20,
  MIN_CANDIDATES_FOR_AI: 5,
} as const;
```

注意: `VOLUME_DIRECTION.SCORES` は連続スコアリング化で不要になるが、`calculateVolumeDirection` 関数が参照しているため残す。出来高スコア計算自体は新しいロジックに置き換わる。

- [ ] **Step 2: TypeScript コンパイルが通るか確認**

```bash
npx tsc --noEmit 2>&1 | head -20
```

Expected: 定数の型変更に伴うエラーが出る可能性あり。`FUNDAMENTAL` のティアの `score` 値が変わったため。エラーがあればStep 3で対処。

- [ ] **Step 3: コンパイルエラーがあれば修正してコミット**

```bash
git add src/lib/constants/scoring.ts
git commit -m "refactor: スコアリング定数を新配点に更新"
```

---

## Chunk 2: Core Scoring Rewrites (TDD)

### Task 3: RSI 連続スコアリング

**Files:**
- Create: `src/core/__tests__/technical-scorer.test.ts`
- Modify: `src/core/technical-scorer.ts:173-180`

- [ ] **Step 1: RSI のテストを作成**

`src/core/__tests__/technical-scorer.test.ts`:

```typescript
import { describe, it, expect } from "vitest";
import { scoreRSI } from "../technical-scorer";

// scoreRSI は private なので、scoreTechnicals 経由でテストするか、
// テスト用にエクスポートする。ここでは内部関数を直接テストするため
// technical-scorer.ts から scoreRSI をエクスポートする前提。
// → Step 3 で export を追加する。

describe("scoreRSI", () => {
  it("スイートスポット（50-65）で最高点12を返す", () => {
    expect(scoreRSI(50)).toBe(12);
    expect(scoreRSI(57)).toBe(12);
    expect(scoreRSI(64)).toBe(12);
  });

  it("RSI 40-50 で線形補間（4→12）を返す", () => {
    expect(scoreRSI(40)).toBe(4);
    expect(scoreRSI(45)).toBe(8);
    expect(scoreRSI(49)).toBeGreaterThanOrEqual(11);
  });

  it("RSI 65-75 で線形補間（12→4）を返す", () => {
    expect(scoreRSI(65)).toBe(12);
    expect(scoreRSI(70)).toBe(8);
    expect(scoreRSI(74)).toBeLessThanOrEqual(5);
  });

  it("RSI 30-40 で線形補間（0→4）を返す", () => {
    expect(scoreRSI(30)).toBe(0);
    expect(scoreRSI(35)).toBe(2);
  });

  it("RSI < 30 or >= 75 で 0 を返す", () => {
    expect(scoreRSI(20)).toBe(0);
    expect(scoreRSI(75)).toBe(0);
    expect(scoreRSI(90)).toBe(0);
  });

  it("null で 0 を返す（デフォルト値是正）", () => {
    expect(scoreRSI(null)).toBe(0);
  });
});
```

- [ ] **Step 2: テストを実行して失敗を確認**

```bash
npx vitest run src/core/__tests__/technical-scorer.test.ts
```

Expected: FAIL（scoreRSI が export されていない、または値が異なる）

- [ ] **Step 3: scoreRSI を連続スコアリングに書き換え**

`src/core/technical-scorer.ts` の `scoreRSI` 関数を以下に置き換え、`export` を追加:

```typescript
/** RSI スコア（0-12点）— 区分線形関数: RSI 50-65 にピーク */
export function scoreRSI(rsi: number | null): number {
  if (rsi == null) return 0;
  const max = SCORING.SUB_MAX.RSI; // 12
  if (rsi >= 50 && rsi < 65) return max;
  if (rsi >= 40 && rsi < 50) return Math.round(4 + (rsi - 40) / 10 * (max - 4));
  if (rsi >= 65 && rsi < 75) return Math.round(max - (rsi - 65) / 10 * (max - 4));
  if (rsi >= 30 && rsi < 40) return Math.round((rsi - 30) / 10 * 4);
  return 0;
}
```

- [ ] **Step 4: テストを実行して成功を確認**

```bash
npx vitest run src/core/__tests__/technical-scorer.test.ts
```

Expected: PASS

- [ ] **Step 5: コミット**

```bash
git add src/core/technical-scorer.ts src/core/__tests__/technical-scorer.test.ts
git commit -m "refactor: RSI スコアを区分線形関数に変更（12点満点）"
```

---

### Task 4: MA スコアリング + 週足トレンドペナルティ

**Files:**
- Modify: `src/core/__tests__/technical-scorer.test.ts`
- Modify: `src/core/technical-scorer.ts:200-210`

- [ ] **Step 1: MA のテストを追加**

`src/core/__tests__/technical-scorer.test.ts` のインポートに `scoreMA` を追加:

```typescript
import { scoreRSI, scoreMA } from "../technical-scorer";
```

テストを追加:

```typescript
describe("scoreMA", () => {
  it("パーフェクトオーダー + slopes で 18 を返す", () => {
    const summary = { maAlignment: { trend: "uptrend", orderAligned: true, slopesAligned: true } };
    expect(scoreMA(summary as any)).toBe(18);
  });

  it("uptrend + orderAligned で 14 を返す", () => {
    const summary = { maAlignment: { trend: "uptrend", orderAligned: true, slopesAligned: false } };
    expect(scoreMA(summary as any)).toBe(14);
  });

  it("uptrend のみで 10 を返す", () => {
    const summary = { maAlignment: { trend: "uptrend", orderAligned: false, slopesAligned: false } };
    expect(scoreMA(summary as any)).toBe(10);
  });

  it("neutral で 6 を返す", () => {
    const summary = { maAlignment: { trend: "none", orderAligned: false, slopesAligned: false } };
    expect(scoreMA(summary as any)).toBe(6);
  });

  it("downtrend + aligned + slopes で 0 を返す", () => {
    const summary = { maAlignment: { trend: "downtrend", orderAligned: true, slopesAligned: true } };
    expect(scoreMA(summary as any)).toBe(0);
  });
});
```

- [ ] **Step 2: テスト実行して失敗を確認**

```bash
npx vitest run src/core/__tests__/technical-scorer.test.ts
```

- [ ] **Step 3: scoreMA を新配点に書き換え**

```typescript
/** 移動平均線スコア（0-18点） */
export function scoreMA(summary: TechnicalSummary): number {
  const { trend, orderAligned, slopesAligned } = summary.maAlignment;
  if (trend === "uptrend" && orderAligned && slopesAligned) return 18;
  if (trend === "uptrend" && orderAligned) return 14;
  if (trend === "uptrend") return 10;
  if (trend === "downtrend" && orderAligned && slopesAligned) return 0;
  if (trend === "downtrend" && orderAligned) return 1;
  if (trend === "downtrend") return 3;
  return 6; // neutral
}
```

- [ ] **Step 4: 週足トレンドペナルティを -8 に更新**

`scoreTechnicals` 関数内のペナルティ適用箇所（現在 line 588付近）:

```typescript
weeklyTrendPenalty = -SCORING.WEEKLY_TREND.PENALTY; // -8
```

変更不要（定数側を 7→8 に変更済みのため、コードは SCORING.WEEKLY_TREND.PENALTY を参照している）。定数ファイルが Task 2 で更新済みか確認する。

- [ ] **Step 5: テスト実行して成功を確認してコミット**

```bash
npx vitest run src/core/__tests__/technical-scorer.test.ts
git add src/core/technical-scorer.ts src/core/__tests__/technical-scorer.test.ts
git commit -m "refactor: MA スコアを18点満点に変更、ペナルティを-8に調整"
```

---

### Task 5: 出来高×方向性 連続スコアリング

**Files:**
- Modify: `src/core/__tests__/technical-scorer.test.ts`
- Modify: `src/core/technical-scorer.ts:314-330`

- [ ] **Step 1: 出来高スコアのテストを追加**

インポートに `scoreVolumeChange` を追加:

```typescript
import { scoreRSI, scoreMA, scoreVolumeChange } from "../technical-scorer";
```

テスト:

```typescript
describe("scoreVolumeChange", () => {
  it("null で 0 を返す（デフォルト値是正）", () => {
    expect(scoreVolumeChange(null, "neutral")).toBe(0);
  });

  it("volumeRatio 2.0 + accumulation で 13 を返す", () => {
    expect(scoreVolumeChange(2.0, "accumulation")).toBe(13);
  });

  it("volumeRatio 1.0 + neutral で 5 を返す", () => {
    expect(scoreVolumeChange(1.0, "neutral")).toBe(5);
  });

  it("volumeRatio 1.0 + distribution で 3 を返す", () => {
    expect(scoreVolumeChange(1.0, "distribution")).toBe(3);
  });

  it("volumeRatio 0.5 + accumulation で 3 を返す", () => {
    expect(scoreVolumeChange(0.5, "accumulation")).toBe(3);
  });
});
```

- [ ] **Step 2: テスト実行して失敗を確認**

- [ ] **Step 3: scoreVolumeChange を連続関数に書き換え**

```typescript
/** 出来高変化スコア（0-13点）— volumeRatio × 方向性倍率 */
export function scoreVolumeChange(
  volumeRatio: number | null,
  direction: VolumeDirection,
): number {
  if (volumeRatio == null) return 0;
  const baseScore = Math.max(0, Math.min(10, volumeRatio * 5));
  const multiplier =
    direction === "accumulation" ? 1.3 :
    direction === "distribution" ? 0.5 :
    1.0;
  return Math.min(SCORING.SUB_MAX.VOLUME_CHANGE, Math.round(baseScore * multiplier));
}
```

- [ ] **Step 4: テスト実行して成功を確認してコミット**

```bash
npx vitest run src/core/__tests__/technical-scorer.test.ts
git add src/core/technical-scorer.ts src/core/__tests__/technical-scorer.test.ts
git commit -m "refactor: 出来高スコアを連続関数に変更（13点満点）"
```

---

### Task 6: MACD 加速度スコアリング

**Files:**
- Modify: `src/core/__tests__/technical-scorer.test.ts`
- Modify: `src/core/technical-scorer.ts:182-197`

- [ ] **Step 1: MACD スコアのテストを追加**

注意: `prevHistogram` の算出には36日分以上のOHLCVデータから `calculateMACD` を呼ぶ必要がある。テスト容易性のため、`scoreMACD` の引数に `prevHistogram: number | null` を追加する設計に変更。`scoreTechnicals` 内で `getPrevHistogram()` を呼び、その結果を `scoreMACD` に渡す。

インポートに `scoreMACD` を追加:

```typescript
import { scoreRSI, scoreMA, scoreVolumeChange, scoreMACD } from "../technical-scorer";
```

テスト:

```typescript
describe("scoreMACD", () => {
  it("null MACD で 0 を返す", () => {
    const summary = { macd: null };
    expect(scoreMACD(summary as any, null)).toBe(0);
  });

  it("ゴールデンクロス + 正ヒストグラム + 加速 で 7", () => {
    const summary = { macd: { macd: 1.5, signal: 1.0, histogram: 0.5 } };
    expect(scoreMACD(summary as any, 0.3)).toBe(7); // histogram(0.5) > prevHistogram(0.3)
  });

  it("ゴールデンクロス + 正ヒストグラム + 減速 で 5", () => {
    const summary = { macd: { macd: 1.5, signal: 1.0, histogram: 0.3 } };
    expect(scoreMACD(summary as any, 0.5)).toBe(5); // histogram(0.3) < prevHistogram(0.5)
  });

  it("MACDがシグナル上 + ヒストグラム負 で 3", () => {
    const summary = { macd: { macd: 1.5, signal: 1.0, histogram: -0.1 } };
    expect(scoreMACD(summary as any, null)).toBe(3);
  });

  it("デッドクロス + 改善中 で 1", () => {
    const summary = { macd: { macd: 0.8, signal: 1.0, histogram: -0.1 } };
    expect(scoreMACD(summary as any, -0.3)).toBe(1); // histogram(-0.1) > prevHistogram(-0.3)
  });

  it("デッドクロス + 悪化中 で 0", () => {
    const summary = { macd: { macd: 0.8, signal: 1.0, histogram: -0.5 } };
    expect(scoreMACD(summary as any, -0.3)).toBe(0);
  });
});
```

- [ ] **Step 2: テスト実行して失敗を確認**

- [ ] **Step 3: scoreMACD と getPrevHistogram を実装**

```typescript
/**
 * 前日のMACDヒストグラムを算出（加速度判定用）
 * historicalData[0]が最新日、historicalData[1]が前日。
 * 前日までのデータでMACDを算出し、そのヒストグラムを返す。
 */
export function getPrevHistogram(historicalData: OHLCVData[]): number | null {
  // calculateMACD には最低35日分のデータが必要（26+9）
  // 前日ベースなので historicalData[1:] から算出 → 36日分必要
  if (historicalData.length < 36) return null;
  const prevData = historicalData.slice(1);
  const prices = prevData.map((d) => ({ close: d.close }));
  const result = calculateMACD(prices);
  return result.histogram;
}

/** MACD スコア（0-7点）— 加速度を考慮 */
export function scoreMACD(
  summary: TechnicalSummary,
  prevHistogram: number | null,
): number {
  const macd = summary.macd;
  if (!macd || macd.macd == null || macd.signal == null || macd.histogram == null) return 0;

  // MACDがシグナル上
  if (macd.macd > macd.signal) {
    if (macd.histogram > 0) {
      // ゴールデンクロス + 正ヒストグラム: 加速度で5-7点
      return (prevHistogram !== null && macd.histogram > prevHistogram) ? 7 : 5;
    }
    return 3; // シグナル上だがヒストグラム負
  }

  // MACDがシグナル下 + 改善中
  if (prevHistogram !== null && macd.histogram > prevHistogram) return 1;

  return 0; // デッドクロス
}
```

`calculateMACD` のインポートを `technical-scorer.ts` の先頭に追加:

```typescript
import { calculateMACD } from "../lib/technical-indicators";
```

- [ ] **Step 4: scoreTechnicals 内の scoreMACD 呼び出しを更新**

`scoreTechnicals` 関数内で:

```typescript
const prevHistogram = getPrevHistogram(historicalData);
const macdScore = scoreMACD(summary, prevHistogram);
```

- [ ] **Step 5: テスト実行して成功を確認してコミット**

```bash
npx vitest run src/core/__tests__/technical-scorer.test.ts
git add src/core/technical-scorer.ts src/core/__tests__/technical-scorer.test.ts
git commit -m "refactor: MACD スコアに加速度判定を追加（7点満点）"
```

---

### Task 7: 相対強度（RS）スコア関数

**Files:**
- Modify: `src/core/__tests__/technical-scorer.test.ts`
- Modify: `src/core/technical-scorer.ts`

- [ ] **Step 1: RS スコアのテストを追加**

インポートに `scoreRS`, `calculateRsScores` を追加:

```typescript
import {
  scoreRSI, scoreMA, scoreVolumeChange, scoreMACD,
  scoreRS, calculateRsScores,
} from "../technical-scorer";
```

テスト:

```typescript
describe("scoreRS", () => {
  it("rsScore が未提供で 0 を返す", () => {
    expect(scoreRS(undefined)).toBe(0);
  });

  it("rsScore をそのまま返す（0-15の範囲内）", () => {
    expect(scoreRS(15)).toBe(15);
    expect(scoreRS(8)).toBe(8);
    expect(scoreRS(0)).toBe(0);
  });

  it("15を超える値はクランプ", () => {
    expect(scoreRS(20)).toBe(15);
  });
});

describe("calculateRsScores", () => {
  it("セクター別パーセンタイルでスコアを算出する", () => {
    const candidates = [
      { tickerCode: "1001", weekChangeRate: 5.0, sector: "IT" },
      { tickerCode: "1002", weekChangeRate: 3.0, sector: "IT" },
      { tickerCode: "1003", weekChangeRate: 1.0, sector: "IT" },
      { tickerCode: "2001", weekChangeRate: 2.0, sector: "金融" },
    ];
    const sectorAvgs = { IT: 3.0, "金融": 2.0 };
    const result = calculateRsScores(candidates, sectorAvgs);

    // 1001: RS = 5-3 = +2（IT内で最強）→ 高パーセンタイル
    // 1003: RS = 1-3 = -2（IT内で最弱）→ 低パーセンタイル
    expect(result.get("1001")).toBeGreaterThan(result.get("1003")!);
    // 2001: セクター内1銘柄のみ → MIN_SECTOR_STOCKS未満 → 0
    expect(result.get("2001")).toBe(0);
  });
});
```

- [ ] **Step 2: テスト実行して失敗を確認**

- [ ] **Step 3: scoreRS と calculateRsScores を実装**

`src/core/technical-scorer.ts` に追加:

```typescript
/** RS スコア（0-15点）— 事前計算済みスコアを受け取る */
export function scoreRS(rsScore: number | undefined): number {
  if (rsScore == null) return 0;
  return Math.min(SCORING.SUB_MAX.RELATIVE_STRENGTH, Math.max(0, Math.round(rsScore)));
}

/**
 * 全候補銘柄のRSスコアを一括算出（market-scannerから呼ぶ）
 *
 * @param candidates - { tickerCode, weekChangeRate, sector }[] の配列
 * @param sectorAvgs - セクター別平均weekChangeRate
 * @returns Map<tickerCode, rsScore (0-15)>
 */
export function calculateRsScores(
  candidates: { tickerCode: string; weekChangeRate: number | null; sector: string }[],
  sectorAvgs: Record<string, number>,
): Map<string, number> {
  const result = new Map<string, number>();
  const maxScore = SCORING.RELATIVE_STRENGTH.MAX_SCORE;
  const minStocks = SCORING.RELATIVE_STRENGTH.MIN_SECTOR_STOCKS;

  // 各銘柄のRS値を算出
  const rsValues: { tickerCode: string; rs: number }[] = [];
  for (const c of candidates) {
    if (c.weekChangeRate == null || sectorAvgs[c.sector] == null) {
      result.set(c.tickerCode, 0);
      continue;
    }

    // セクター内銘柄数チェック
    const sectorCount = candidates.filter(
      (x) => x.sector === c.sector && x.weekChangeRate != null,
    ).length;
    if (sectorCount < minStocks) {
      result.set(c.tickerCode, 0);
      continue;
    }

    rsValues.push({
      tickerCode: c.tickerCode,
      rs: c.weekChangeRate - sectorAvgs[c.sector],
    });
  }

  if (rsValues.length === 0) return result;

  // パーセンタイル算出
  const sorted = [...rsValues].sort((a, b) => a.rs - b.rs);
  for (let i = 0; i < sorted.length; i++) {
    const percentile = sorted.length === 1 ? 50 : (i / (sorted.length - 1)) * 100;
    const score = Math.round((percentile / 100) * maxScore);
    result.set(sorted[i].tickerCode, score);
  }

  return result;
}
```

- [ ] **Step 4: LogicScoreInput に rsScore フィールドを追加**

```typescript
export interface LogicScoreInput {
  // ... 既存フィールド
  rsScore?: number; // 0-15, callerが事前計算
}
```

- [ ] **Step 5: LogicScore.technical に rs フィールドを追加**

```typescript
technical: {
  total: number;
  rsi: number;
  ma: number;
  volume: number;
  volumeDirection: VolumeDirection;
  macd: number;
  rs: number; // NEW
};
```

- [ ] **Step 6: テスト実行して成功を確認してコミット**

```bash
npx vitest run src/core/__tests__/technical-scorer.test.ts
git add src/core/technical-scorer.ts src/core/__tests__/technical-scorer.test.ts
git commit -m "feat: 相対強度（RS）スコア関数を追加（15点満点）"
```

---

### Task 8: パターンスコア + ローソク足 null デフォルト

**Files:**
- Modify: `src/core/__tests__/technical-scorer.test.ts`
- Modify: `src/core/technical-scorer.ts:337-410`

- [ ] **Step 1: パターンスコアのテストを追加**

インポートに `scoreChartPattern`, `scoreCandlestick` を追加:

```typescript
import {
  scoreRSI, scoreMA, scoreVolumeChange, scoreMACD,
  scoreRS, calculateRsScores,
  scoreChartPattern, scoreCandlestick,
} from "../technical-scorer";
```

テスト:

```typescript
describe("scoreChartPattern", () => {
  it("パターンなしで 0 を返す", () => {
    expect(scoreChartPattern([]).score).toBe(0);
  });

  it("S ランク買いパターンで 10 を返す", () => {
    const patterns = [{ rank: "S", signal: "buy", patternName: "test", winRate: 89 }];
    expect(scoreChartPattern(patterns).score).toBe(10);
  });

  it("ニュートラルパターンで 4 を返す", () => {
    const patterns = [{ rank: "B", signal: "neutral", patternName: "test", winRate: 50 }];
    expect(scoreChartPattern(patterns).score).toBe(4);
  });
});

describe("scoreCandlestick", () => {
  it("null で 0 を返す（デフォルト値是正）", () => {
    expect(scoreCandlestick(null)).toBe(0);
  });

  it("買いシグナル strength 80 で 4 を返す", () => {
    expect(scoreCandlestick({ signal: "buy", strength: 80 } as any)).toBe(4);
  });
});
```

- [ ] **Step 2: テスト実行して失敗を確認**

- [ ] **Step 3: チャートパターンとローソク足スコアを更新**

チャートパターン — rankScoreMap を新配点に変更し、neutral フォールバックも更新:

```typescript
export function scoreChartPattern(
  patterns: ChartPatternResult[],
): { score: number; topPattern: LogicScore["topPattern"] } {
  if (patterns.length === 0) {
    return { score: 0, topPattern: null };
  }

  const max = SCORING.SUB_MAX.CHART_PATTERN; // 10
  const rankScoreMap: Record<ChartPatternRank, number> = {
    S: max,  // 10
    A: 8,
    B: 6,
    C: 4,
    D: 2,
  };

  const buyPatterns = patterns.filter((p) => p.signal === "buy");
  const sellPatterns = patterns.filter((p) => p.signal === "sell");

  if (buyPatterns.length > 0) {
    const best = buyPatterns.sort(
      (a, b) => rankScoreMap[b.rank] - rankScoreMap[a.rank],
    )[0];
    return {
      score: rankScoreMap[best.rank],
      topPattern: {
        name: best.patternName, rank: best.rank,
        winRate: best.winRate, signal: best.signal,
      },
    };
  }

  if (sellPatterns.length > 0) {
    const best = sellPatterns.sort(
      (a, b) => rankScoreMap[b.rank] - rankScoreMap[a.rank],
    )[0];
    const invertedScore = max - rankScoreMap[best.rank];
    return {
      score: invertedScore,
      topPattern: {
        name: best.patternName, rank: best.rank,
        winRate: best.winRate, signal: best.signal,
      },
    };
  }

  // neutral パターンのみ: 旧 6 → 新 4（max 10 の 40%）
  const best = patterns[0];
  return {
    score: Math.round(max * 0.4), // 4
    topPattern: {
      name: best.patternName, rank: best.rank,
      winRate: best.winRate, signal: best.signal,
    },
  };
}
```

ローソク足 — null を 0 に:

```typescript
export function scoreCandlestick(pattern: PatternResult | null): number {
  const max = SCORING.SUB_MAX.CANDLESTICK; // 5
  if (pattern == null) return 0;
  if (pattern.signal === "buy") return Math.round(pattern.strength * max / 100);
  if (pattern.signal === "sell") return Math.round((100 - pattern.strength) * max / 100);
  return 0; // neutral
}
```

- [ ] **Step 4: テスト実行して成功を確認してコミット**

```bash
npx vitest run src/core/__tests__/technical-scorer.test.ts
git add src/core/technical-scorer.ts src/core/__tests__/technical-scorer.test.ts
git commit -m "refactor: パターンスコアを15点満点に変更、null=0に統一"
```

---

### Task 9: 流動性 + ファンダメンタルズスコア更新

**Files:**
- Modify: `src/core/__tests__/technical-scorer.test.ts`
- Modify: `src/core/technical-scorer.ts:416-515`

- [ ] **Step 1: 流動性・ファンダスコアのテストを追加**

インポートに流動性・ファンダ関数を追加:

```typescript
import {
  scoreRSI, scoreMA, scoreVolumeChange, scoreMACD,
  scoreRS, calculateRsScores,
  scoreChartPattern, scoreCandlestick,
  scoreTradingValue, scoreSpreadProxy, scoreStability,
  scorePER, scorePBR, scoreProfitability,
} from "../technical-scorer";
```

テスト:

```typescript
describe("scoreTradingValue", () => {
  it("5億円以上で 5 を返す", () => {
    expect(scoreTradingValue(1000, 600000)).toBe(5); // 6億円
  });
});

describe("scoreSpreadProxy", () => {
  it("データなしで 0 を返す（デフォルト値是正）", () => {
    expect(scoreSpreadProxy([])).toBe(0);
  });
});

describe("scoreStability", () => {
  it("データ不足で 0 を返す（デフォルト値是正）", () => {
    expect(scoreStability([])).toBe(0);
  });
});

describe("scorePER", () => {
  it("PER null で 0 を返す（デフォルト値是正）", () => {
    expect(scorePER(null)).toBe(0);
  });

  it("PER 10 で 4 を返す（割安〜適正）", () => {
    expect(scorePER(10)).toBe(4);
  });
});

describe("scorePBR", () => {
  it("PBR null で 0 を返す（デフォルト値是正）", () => {
    expect(scorePBR(null)).toBe(0);
  });
});

describe("scoreProfitability", () => {
  it("EPS null で 0 を返す（デフォルト値是正）", () => {
    expect(scoreProfitability(null, 500)).toBe(0);
  });
});
```

- [ ] **Step 2: テスト実行して失敗を確認**

- [ ] **Step 3: 各スコア関数を新配点に更新**

流動性:

```typescript
export function scoreTradingValue(price: number, volume: number): number {
  const tradingValue = price * volume;
  const tiers = SCORING.LIQUIDITY.TRADING_VALUE_TIERS;
  const scores = [5, 4, 3, 1]; // 新配点（max 5）
  for (let i = 0; i < tiers.length; i++) {
    if (tradingValue >= tiers[i]) return scores[i];
  }
  return 0;
}

export function scoreSpreadProxy(historicalData: OHLCVData[]): number {
  if (historicalData.length === 0) return 0; // 4→0
  const latest = historicalData[0];
  if (latest.close <= 0) return 0;
  const spreadPct = (latest.high - latest.low) / latest.close;
  const tiers = SCORING.LIQUIDITY.SPREAD_PROXY_TIERS;
  const scores = [3, 2, 1, 0]; // 新配点（max 3）
  for (let i = 0; i < tiers.length; i++) {
    if (spreadPct <= tiers[i]) return scores[i];
  }
  return 0;
}

export function scoreStability(historicalData: OHLCVData[]): number {
  const days = Math.min(historicalData.length, 5);
  if (days < 2) return 0; // 4→0
  const tradingValues = historicalData.slice(0, days).map((d) => d.close * d.volume);
  const mean = tradingValues.reduce((s, v) => s + v, 0) / tradingValues.length;
  if (mean === 0) return 0;
  const variance = tradingValues.reduce((s, v) => s + (v - mean) ** 2, 0) / tradingValues.length;
  const cv = Math.sqrt(variance) / mean;
  const tiers = SCORING.LIQUIDITY.STABILITY_CV_TIERS;
  const scores = [2, 1, 1]; // 新配点（max 2）
  for (let i = 0; i < tiers.length; i++) {
    if (cv <= tiers[i]) return scores[i];
  }
  return 0;
}
```

ファンダメンタルズ:

```typescript
export function scorePER(per: number | null): number {
  if (per == null || per <= 0) return SCORING.FUNDAMENTAL.PER_DEFAULT; // 0
  for (const tier of SCORING.FUNDAMENTAL.PER_TIERS) {
    if (per >= tier.min && per < tier.max) return tier.score;
  }
  return SCORING.FUNDAMENTAL.PER_DEFAULT;
}

export function scorePBR(pbr: number | null): number {
  if (pbr == null) return SCORING.FUNDAMENTAL.PBR_DEFAULT; // 0
  if (pbr > 5.0) return SCORING.FUNDAMENTAL.PBR_OVER_5; // 0
  for (const tier of SCORING.FUNDAMENTAL.PBR_TIERS) {
    if (pbr >= tier.min && pbr < tier.max) return tier.score;
  }
  return SCORING.FUNDAMENTAL.PBR_DEFAULT;
}

export function scoreProfitability(eps: number | null, latestPrice: number): number {
  if (eps == null) return SCORING.FUNDAMENTAL.EPS_NULL; // 0
  if (eps <= 0) return SCORING.FUNDAMENTAL.EPS_NEGATIVE; // 0
  if (latestPrice > 0 && eps >= latestPrice * SCORING.FUNDAMENTAL.EPS_STRONG_RATIO) {
    return SCORING.SUB_MAX.PROFITABILITY; // 2（強い収益力）
  }
  // EPS > 0（黒字）→ 1点（good/positive を統合: max=2のため2段階で十分）
  return SCORING.FUNDAMENTAL.EPS_POSITIVE; // 1
}

export function scoreMarketCapFundamental(marketCap: number | null): number {
  if (marketCap == null) return SCORING.FUNDAMENTAL.MARKET_CAP_DEFAULT; // 0
  for (const tier of SCORING.FUNDAMENTAL.MARKET_CAP_TIERS) {
    if (marketCap >= tier.min) return tier.score;
  }
  return SCORING.FUNDAMENTAL.MARKET_CAP_DEFAULT;
}
```

- [ ] **Step 4: テスト実行して成功を確認してコミット**

```bash
npx vitest run src/core/__tests__/technical-scorer.test.ts
git add src/core/technical-scorer.ts src/core/__tests__/technical-scorer.test.ts
git commit -m "refactor: 流動性・ファンダスコアを新配点に更新、null=0に統一"
```

---

### Task 10: scoreTechnicals 統合 + 全体テスト

**Files:**
- Modify: `src/core/__tests__/technical-scorer.test.ts`
- Modify: `src/core/technical-scorer.ts:543-653`

- [ ] **Step 1: scoreTechnicals の統合テストを追加**

インポートに `scoreTechnicals` を追加:

```typescript
import {
  scoreRSI, scoreMA, scoreVolumeChange, scoreMACD,
  scoreRS, calculateRsScores,
  scoreChartPattern, scoreCandlestick,
  scoreTradingValue, scoreSpreadProxy, scoreStability,
  scorePER, scorePBR, scoreProfitability,
  scoreTechnicals,
} from "../technical-scorer";
```

テスト:

```typescript
describe("scoreTechnicals", () => {

  // 最小限の入力を作成するヘルパー
  function makeInput(overrides = {}) {
    return {
      summary: {
        rsi: 55,
        maAlignment: { trend: "uptrend", orderAligned: true, slopesAligned: true },
        macd: { macd: 1.5, signal: 1.0, histogram: 0.5 },
        volumeAnalysis: { volumeRatio: 1.5 },
      },
      chartPatterns: [],
      candlestickPattern: null,
      historicalData: Array.from({ length: 50 }, (_, i) => ({
        date: new Date(2026, 0, 50 - i),
        open: 500 + i,
        high: 510 + i,
        low: 490 + i,
        close: 505 + i,
        volume: 100000,
      })),
      latestPrice: 500,
      latestVolume: 200000,
      weeklyVolatility: 3,
      rsScore: 10,
      ...overrides,
    };
  }

  it("totalScore が 100 以下であること", () => {
    const result = scoreTechnicals(makeInput());
    expect(result.totalScore).toBeLessThanOrEqual(100);
    expect(result.totalScore).toBeGreaterThan(0);
  });

  it("technical.rs が rsScore を反映していること", () => {
    const result = scoreTechnicals(makeInput({ rsScore: 12 }));
    expect(result.technical.rs).toBe(12);
  });

  it("rsScore 未提供で technical.rs が 0", () => {
    const result = scoreTechnicals(makeInput({ rsScore: undefined }));
    expect(result.technical.rs).toBe(0);
  });

  it("即死ルール該当で totalScore が 0", () => {
    const result = scoreTechnicals(makeInput({ latestPrice: 5000 }));
    expect(result.totalScore).toBe(0);
    expect(result.isDisqualified).toBe(true);
  });

  it("テクニカル合計が 65 以下", () => {
    const result = scoreTechnicals(makeInput());
    expect(result.technical.total).toBeLessThanOrEqual(65);
  });
});
```

- [ ] **Step 2: scoreTechnicals 本体を更新**

主な変更点:

1. RSスコアの統合:
```typescript
const rsScoreValue = scoreRS(input.rsScore);
```

2. MACD呼び出しの更新:
```typescript
const prevHistogram = getPrevHistogram(historicalData);
const macdScore = scoreMACD(summary, prevHistogram);
```

3. テクニカル合計にRS追加:
```typescript
const technicalTotal = rsiScore + maScore + volumeChangeScore + macdScore + rsScoreValue;
```

4. 返り値にrs追加:
```typescript
technical: {
  total: technicalTotal,
  rsi: rsiScore,
  ma: maScore,
  volume: volumeChangeScore,
  volumeDirection: volumeDir.direction,
  macd: macdScore,
  rs: rsScoreValue,
},
```

5. 即死ルール時の返り値（line 557-569）のtechnicalにも `rs: 0` を追加:
```typescript
technical: { total: 0, rsi: 0, ma: 0, volume: 0, volumeDirection: "neutral", macd: 0, rs: 0 },
```

- [ ] **Step 3: TypeScript コンパイルチェック**

```bash
npx tsc --noEmit 2>&1 | head -30
```

型エラーがあれば修正。特に `LogicScore` の `technical.rs` がない箇所（spread演算子で使われている箇所など）。

- [ ] **Step 4: 全テスト実行して成功を確認してコミット**

```bash
npx vitest run src/core/__tests__/technical-scorer.test.ts
git add src/core/technical-scorer.ts src/core/__tests__/technical-scorer.test.ts
git commit -m "refactor: scoreTechnicals を新配点に統合（RS, 連続化, null=0）"
```

---

## Chunk 3: Integration

### Task 11: market-scanner RS 2パス処理

**Files:**
- Modify: `src/jobs/market-scanner.ts:448-543`

- [ ] **Step 1: RS事前計算をスコアリングループの前に追加**

`market-scanner.ts` のスコアリングループ（line 448付近）の直前に追加:

```typescript
// === Pass 1.5: RS スコア事前計算 ===
const rsScoreMap = await calculateRsScoresFromDB(candidates);
```

ヘルパー関数を同ファイル内に追加:

```typescript
import { calculateRsScores } from "../core/technical-scorer";

async function calculateRsScoresFromDB(
  candidates: { tickerCode: string; sector: string }[],
): Promise<Map<string, number>> {
  // 全候補のweekChangeRateを取得
  const stocks = await prisma.stock.findMany({
    where: { tickerCode: { in: candidates.map((c) => c.tickerCode) } },
    select: { tickerCode: true, weekChangeRate: true, sector: true },
  });

  // セクター別平均を算出
  const sectorMap: Record<string, number[]> = {};
  for (const s of stocks) {
    if (s.weekChangeRate == null) continue;
    const sector = s.sector ?? "その他";
    if (!sectorMap[sector]) sectorMap[sector] = [];
    sectorMap[sector].push(Number(s.weekChangeRate));
  }

  const sectorAvgs: Record<string, number> = {};
  for (const [sector, rates] of Object.entries(sectorMap)) {
    sectorAvgs[sector] = rates.reduce((a, b) => a + b, 0) / rates.length;
  }

  // RS スコア算出
  const rsInput = stocks.map((s) => ({
    tickerCode: s.tickerCode,
    weekChangeRate: s.weekChangeRate ? Number(s.weekChangeRate) : null,
    sector: s.sector ?? "その他",
  }));

  return calculateRsScores(rsInput, sectorAvgs);
}
```

- [ ] **Step 2: scoreTechnicals 呼び出しに rsScore を追加**

スコアリングループ内（line 497-515付近）:

```typescript
const score = scoreTechnicals({
  // ... 既存フィールド
  rsScore: rsScoreMap.get(stock.tickerCode) ?? 0,
});
```

- [ ] **Step 3: ScoringRecord の technicalBreakdown に rs を追加**

`buildScoringFields`（line 698-734付近）の `technicalBreakdown` に追加:

```typescript
technicalBreakdown: {
  rsi: c.score.technical.rsi,
  ma: c.score.technical.ma,
  volume: c.score.technical.volume,
  volumeDirection: c.score.technical.volumeDirection,
  macd: c.score.technical.macd,
  rs: c.score.technical.rs, // NEW
  weeklyTrendPenalty: c.score.weeklyTrendPenalty,
},
```

- [ ] **Step 4: TypeScript コンパイルチェック**

```bash
npx tsc --noEmit 2>&1 | head -30
```

- [ ] **Step 5: コミット**

```bash
git add src/jobs/market-scanner.ts
git commit -m "feat: market-scanner に RS 2パス処理を追加"
```

---

### Task 12: formatScoreForAI + 表示系の更新

**Files:**
- Modify: `src/core/technical-analysis.ts:312-370`
- Modify: `src/web/routes/scoring.ts:49-89`
- Modify: `prisma/schema.prisma:127-181`

- [ ] **Step 1: formatScoreForAI の最大値を更新**

`src/core/technical-analysis.ts` の `formatScoreForAI` 関数を更新:

```
テクニカル: /40 → /65
  RSI: /10 → /12
  移動平均: /15 → /18
  出来高変化: /10 → /13
  MACD: /5 → /7
  相対強度: 新規行追加 → /15
パターン: /20 → /15
  チャートパターン: /14 → /10
  ローソク足: /6 → /5
流動性: /25 → /10
  売買代金: /10 → /5
  値幅率: /8 → /3
  安定性: /7 → /2
ファンダメンタルズ: /15 → /10
  PER: /5 → /4
  PBR: /4 → /3
  収益性: /4 → /2
  時価総額: /2 → /1
```

テクニカルセクションに相対強度の行を追加:

```typescript
`    相対強度: ${score.technical.rs}/${SCORING.SUB_MAX.RELATIVE_STRENGTH}`
```

- [ ] **Step 2: breakdownDetail に macd と rs フィールドを追加**

`src/web/routes/scoring.ts` の `breakdownDetail` 関数（line 57-64）の `if (technical)` ブロック内に2行追加:

```typescript
  if (technical) {
    const parts = [];
    if (technical.rsi != null) parts.push(`RSI:${technical.rsi}`);
    if (technical.ma != null) parts.push(`MA:${technical.ma}`);
    if (technical.volume != null) parts.push(`出来高:${technical.volume}`);
    if (technical.macd != null) parts.push(`MACD:${technical.macd}`);       // NEW
    if (technical.rs != null) parts.push(`RS:${technical.rs}`);             // NEW
    if (technical.volumeDirection != null) parts.push(`方向:${technical.volumeDirection}`);
    if (technical.weeklyTrendPenalty) parts.push(`週足減点:${technical.weeklyTrendPenalty}`);
    if (parts.length > 0) items.push(`技術: ${parts.join(" / ")}`);
  }
```

- [ ] **Step 3: Prisma スキーマのコメントを修正**

`prisma/schema.prisma` の ScoringRecord モデル（line 127-181）のコメントを修正:

```prisma
technicalScore    Int   // 0-65
patternScore      Int   // 0-15
liquidityScore    Int   // 0-10
fundamentalScore  Int   @default(0) // 0-10
```

- [ ] **Step 4: TypeScript コンパイルチェック**

```bash
npx tsc --noEmit 2>&1 | head -30
```

- [ ] **Step 5: コミット**

```bash
git add src/core/technical-analysis.ts src/web/routes/scoring.ts prisma/schema.prisma
git commit -m "refactor: formatScoreForAI, breakdownDetail, スキーマコメントを新配点に更新"
```

---

### Task 13: 仕様書 scoring-system.md の更新

**Files:**
- Modify: `docs/specs/scoring-system.md`

- [ ] **Step 1: scoring-system.md を新配点に合わせて更新**

主な更新箇所:

1. **カテゴリ配点テーブル** — 新配点に更新
2. **各サブ項目の配点・算出ルール** — RSI連続化、MA18点、Volume連続化、MACD加速度、RS新設
3. **null デフォルト値** — 全項目0点に統一した旨を記載
4. **週足トレンドペナルティ** — -7→-8
5. **定数定義** — 新しい SCORING 定数を反映
6. **相対強度（RS）セクション** — 新規追加
7. **80点突破のシミュレーション** — 新配点で再計算

- [ ] **Step 2: コミット**

```bash
git add docs/specs/scoring-system.md
git commit -m "docs: scoring-system.md を新配点に合わせて更新"
```

---

### Task 14: 最終確認

- [ ] **Step 1: 全テスト実行**

```bash
npx vitest run
```

Expected: ALL PASS

- [ ] **Step 2: TypeScript コンパイルチェック**

```bash
npx tsc --noEmit
```

Expected: エラーなし

- [ ] **Step 3: ビルド確認**

```bash
npm run build
```

Expected: ビルド成功

- [ ] **Step 4: 設計ファイルを削除**

コーディング規約に従い、実装済みの設計ファイルを削除:

```bash
rm docs/superpowers/specs/2026-03-13-scoring-improvement-design.md
```

- [ ] **Step 5: 最終コミット**

```bash
git add -A
git commit -m "chore: スコアリング改善の設計ファイルを削除"
```
