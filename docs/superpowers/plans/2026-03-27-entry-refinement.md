# エントリー精緻化 + ユニバース絞り込み 実装計画

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** ブレイクアウト強度・出来高トレンドの2フィルターを追加し、ユニバースを流動性の高い銘柄に絞ることで、OOS PFを0.72から1.0以上に改善する。

**Architecture:** `PrecomputedSignal` に `breakoutStrength` と `volumeTrendRatio` を追加し、事前計算は1回/ウィンドウを維持。新エントリーパラメータはwalk-forwardグリッドに含め、シミュレーション実行時にフィルター適用する。出口グリッドを安定領域に縮小し、合計288通り（現状240と同等）。

**Tech Stack:** TypeScript, Prisma, tsx

---

### Task 1: 型定義の追加

**Files:**
- Modify: `src/backtest/types.ts:59-75`

- [ ] **Step 1: BreakoutBacktestConfig に新フィールドを追加**

`src/backtest/types.ts` の `BreakoutBacktestConfig` インターフェースに以下を追加する。`confirmationVolumeFilter` の後（75行目付近）に挿入:

```typescript
  /** ブレイクアウト強度フィルター: (close - highN) / atr14 >= this でのみエントリー。0=無効 */
  minBreakoutAtr?: number;
  /** 出来高トレンドフィルター: avgVolume5 / avgVolume25 >= this でのみエントリー。1.0=最も緩い */
  volumeTrendThreshold?: number;
```

- [ ] **Step 2: PrecomputedSignal に事前計算フィールドを追加**

`src/backtest/breakout-simulation.ts` の `PrecomputedSignal` インターフェース（154行目付近）に追加:

```typescript
export interface PrecomputedSignal {
  ticker: string;
  entryPrice: number;
  /** SL計算用: SL = entryPrice - atr14 * config.atrMultiplier */
  atr14: number;
  volumeSurgeRatio: number;
  /** ブレイクアウト強度: (signalClose - highN) / atr14 */
  breakoutStrength: number;
  /** 出来高トレンド: avgVolume5 / avgVolume25 */
  volumeTrendRatio: number;
}
```

- [ ] **Step 3: TypeScriptコンパイルチェック**

Run: `npx tsc --noEmit --pretty 2>&1 | head -30`
Expected: コンパイルエラーなし（新フィールドは optional なので既存コードに影響しない）

- [ ] **Step 4: コミット**

```bash
git add src/backtest/types.ts src/backtest/breakout-simulation.ts
git commit -m "feat: BreakoutBacktestConfig に minBreakoutAtr・volumeTrendThreshold 型を追加"
```

---

### Task 2: デフォルト設定とパラメータグリッドの更新

**Files:**
- Modify: `src/backtest/breakout-config.ts`

- [ ] **Step 1: BREAKOUT_BACKTEST_DEFAULTS を更新**

`src/backtest/breakout-config.ts` で以下の変更:

1. `minAvgVolume25` を `50_000` → `200_000` に変更（34行目）
2. `confirmationVolumeFilter` の後（既存のエントリーフィルターセクション末尾、51行目付近）に追加:

```typescript
  indexMomentumFilter: false,
  indexMomentumDays: 60,
  minBreakoutAtr: 0,
  volumeTrendThreshold: 1.0,
```

注: `indexMomentumFilter` と `indexMomentumDays` がデフォルトに含まれていない場合は追加する。

- [ ] **Step 2: PARAMETER_GRID を更新**

出口グリッドを縮小し、エントリーグリッドを追加:

```typescript
/** walk-forward パラメータグリッド（エグジット+エントリー） */
export const PARAMETER_GRID = {
  // エグジット系（安定領域に縮小）
  atrMultiplier: [0.8, 1.0, 1.2],
  beActivationMultiplier: [0.3, 0.5],
  trailMultiplier: [0.3, 0.5],
  tsActivationMultiplier: [1.0, 1.5],
  // エントリー系（新規）
  minBreakoutAtr: [0.0, 0.2, 0.3, 0.5],
  volumeTrendThreshold: [1.0, 1.2, 1.5],
} as const;
```

- [ ] **Step 3: generateParameterCombinations を更新**

6重ループに変更:

```typescript
export function generateParameterCombinations(): Array<Partial<BreakoutBacktestConfig>> {
  const combos: Array<Partial<BreakoutBacktestConfig>> = [];

  for (const atrMultiplier of PARAMETER_GRID.atrMultiplier) {
    for (const beActivationMultiplier of PARAMETER_GRID.beActivationMultiplier) {
      for (const trailMultiplier of PARAMETER_GRID.trailMultiplier) {
        for (const tsActivationMultiplier of PARAMETER_GRID.tsActivationMultiplier) {
          for (const minBreakoutAtr of PARAMETER_GRID.minBreakoutAtr) {
            for (const volumeTrendThreshold of PARAMETER_GRID.volumeTrendThreshold) {
              combos.push({
                atrMultiplier,
                beActivationMultiplier,
                trailMultiplier,
                tsActivationMultiplier,
                minBreakoutAtr,
                volumeTrendThreshold,
              });
            }
          }
        }
      }
    }
  }

  return combos;
}
```

- [ ] **Step 4: コンパイルチェック**

Run: `npx tsc --noEmit --pretty 2>&1 | head -30`
Expected: エラーなし

- [ ] **Step 5: コミット**

```bash
git add src/backtest/breakout-config.ts
git commit -m "feat: パラメータグリッドにエントリーフィルター追加、出口グリッド縮小（288通り）"
```

---

### Task 3: precomputeDailySignals に breakoutStrength・volumeTrendRatio を追加

**Files:**
- Modify: `src/backtest/breakout-simulation.ts:175-270`

**重要**: `minBreakoutAtr` と `volumeTrendThreshold` はwalk-forwardコンボごとに異なるため、`precomputeDailySignals` ではフィルターとして適用しない。値を計算して `PrecomputedSignal` に格納し、シミュレーション実行時にフィルター適用する。これにより事前計算は1回/ウィンドウを維持できる。

- [ ] **Step 1: precomputeDailySignals 内でbreakoutStrengthとvolumeTrendRatioを計算**

`precomputeDailySignals` 関数内、`daySignals.push` の直前（255行目付近）に以下を追加。

高値ブレイク判定後（`signalBar.close <= highN` の continue の後、241行目付近）に `breakoutStrength` を計算:

```typescript
      // ブレイクアウト強度: (close - highN) / atr14
      const breakoutStrength = atr14 > 0 ? (signalBar.close - highN) / atr14 : 0;
```

`avgVolume25` 取得後（227行目付近）に `avgVolume5` を計算:

```typescript
      // 出来高トレンド: avgVolume5 / avgVolume25
      const vol5Start = Math.max(0, signalIdx - 4);
      const vol5Bars = bars.slice(vol5Start, signalIdx + 1);
      const avgVolume5 = vol5Bars.reduce((s, b) => s + b.volume, 0) / vol5Bars.length;
      const volumeTrendRatio = avgVolume25 > 0 ? avgVolume5 / avgVolume25 : 0;
```

`daySignals.push` を更新:

```typescript
      daySignals.push({
        ticker,
        entryPrice,
        atr14,
        volumeSurgeRatio: Math.round(volumeSurgeRatio * 100) / 100,
        breakoutStrength: Math.round(breakoutStrength * 100) / 100,
        volumeTrendRatio: Math.round(volumeTrendRatio * 100) / 100,
      });
```

- [ ] **Step 2: コンパイルチェック**

Run: `npx tsc --noEmit --pretty 2>&1 | head -30`
Expected: エラーなし

- [ ] **Step 3: コミット**

```bash
git add src/backtest/breakout-simulation.ts
git commit -m "feat: PrecomputedSignal に breakoutStrength・volumeTrendRatio を追加"
```

---

### Task 4: シミュレーション実行時のエントリーフィルター適用

**Files:**
- Modify: `src/backtest/breakout-simulation.ts:556-580` (fast path)
- Modify: `src/backtest/breakout-simulation.ts:688-832` (detectBreakoutEntries fallback)

- [ ] **Step 1: fast path（precomputedSignals使用時）にフィルター追加**

`runBreakoutBacktest` 内の precomputedSignals ループ（560行目付近）、`if (openPositions.some(...)) continue;` の直後に追加:

```typescript
            // エントリーフィルター（コンボ別）
            const minBA = config.minBreakoutAtr ?? 0;
            if (minBA > 0 && signal.breakoutStrength < minBA) continue;
            const vtt = config.volumeTrendThreshold ?? 1.0;
            if (signal.volumeTrendRatio < vtt) continue;
```

- [ ] **Step 2: detectBreakoutEntries（フォールバックパス）にフィルター追加**

`detectBreakoutEntries` 関数内、高値追いフィルターの後・確認足チェックの前（771行目付近、`if (config.maxChaseAtr != null ...` の後）に追加:

```typescript
    // ブレイクアウト強度フィルター
    const minBA = config.minBreakoutAtr ?? 0;
    if (minBA > 0 && atr14 > 0) {
      const breakoutStrength = (signalBar.close - highN) / atr14;
      if (breakoutStrength < minBA) continue;
    }

    // 出来高トレンドフィルター
    const vtt = config.volumeTrendThreshold ?? 1.0;
    if (avgVolume25 > 0) {
      const vol5Start = Math.max(0, signalIdx - 4);
      const vol5Bars = bars.slice(vol5Start, signalIdx + 1);
      const avgVolume5 = vol5Bars.reduce((s, b) => s + b.volume, 0) / vol5Bars.length;
      if (avgVolume5 / avgVolume25 < vtt) continue;
    }
```

- [ ] **Step 3: コンパイルチェック**

Run: `npx tsc --noEmit --pretty 2>&1 | head -30`
Expected: エラーなし

- [ ] **Step 4: 単体バックテストでサニティチェック**

Run: `npx tsx src/backtest/breakout-run.ts --start 2025-01-01 --end 2025-12-31 2>&1 | tail -20`
Expected: エラーなく実行完了し、トレード結果が表示される。minAvgVolume25=200,000 の影響でトレード数が減少している可能性あり。

- [ ] **Step 5: コミット**

```bash
git add src/backtest/breakout-simulation.ts
git commit -m "feat: エントリーフィルター（breakoutStrength・volumeTrend）をシミュレーションに適用"
```

---

### Task 5: walk-forward スクリプトの更新

**Files:**
- Modify: `scripts/walk-forward-breakout.ts`

- [ ] **Step 1: paramComboKey を6次元に拡張**

`paramComboKey` 関数（50行目）を更新:

```typescript
function paramComboKey(params: Partial<BreakoutBacktestConfig>): string {
  return `${params.atrMultiplier}_${params.beActivationMultiplier}_${params.trailMultiplier}_${params.tsActivationMultiplier}_${params.minBreakoutAtr ?? 0}_${params.volumeTrendThreshold ?? 1.0}`;
}
```

- [ ] **Step 2: selectByRobustness を N次元対応に汎化**

`selectByRobustness` 関数（74行目付近）を以下に置換:

```typescript
/** 近傍中央値PFで選択（ロバスト方式） */
function selectByRobustness(comboResults: Map<string, ComboResult>): ComboResult | null {
  const gridArrays: number[][] = [
    [...PARAMETER_GRID.atrMultiplier],
    [...PARAMETER_GRID.beActivationMultiplier],
    [...PARAMETER_GRID.trailMultiplier],
    [...PARAMETER_GRID.tsActivationMultiplier],
    [...PARAMETER_GRID.minBreakoutAtr],
    [...PARAMETER_GRID.volumeTrendThreshold],
  ];
  const gridSizes = gridArrays.map((a) => a.length);

  let bestScore = -Infinity;
  let best: ComboResult | null = null;

  for (const result of comboResults.values()) {
    const p = result.params;
    const indices = [
      gridArrays[0].indexOf(p.atrMultiplier!),
      gridArrays[1].indexOf(p.beActivationMultiplier!),
      gridArrays[2].indexOf(p.trailMultiplier!),
      gridArrays[3].indexOf(p.tsActivationMultiplier!),
      gridArrays[4].indexOf(p.minBreakoutAtr ?? 0),
      gridArrays[5].indexOf(p.volumeTrendThreshold ?? 1.0),
    ];

    // 近傍 (±1 grid step in each dimension) のPFを収集
    const neighborPFs: number[] = [];
    const ranges = indices.map((idx, dim) => {
      const vals: number[] = [];
      for (let i = Math.max(0, idx - 1); i <= Math.min(gridSizes[dim] - 1, idx + 1); i++) {
        vals.push(i);
      }
      return vals;
    });

    // 6次元の近傍を再帰的に列挙
    function collectNeighbors(dim: number, current: number[]): void {
      if (dim === ranges.length) {
        const nKey = current.map((i, d) => gridArrays[d][i]).join("_");
        const nResult = comboResults.get(nKey);
        if (nResult) neighborPFs.push(nResult.metrics.profitFactor);
        return;
      }
      for (const idx of ranges[dim]) {
        collectNeighbors(dim + 1, [...current, idx]);
      }
    }
    collectNeighbors(0, []);

    const score = calcMedian(neighborPFs);
    if (score > bestScore) {
      bestScore = score;
      best = result;
    }
  }

  return best;
}
```

- [ ] **Step 3: サマリー出力を更新**

`printSummary` 関数内のウィンドウ別一覧（351行目付近）を更新:

ヘッダー行:
```typescript
  console.log("Window | IS PF   | OOS PF  | OOS勝率 | OOSトレード | 最適パラメータ");
```
（変更なし — パラメータ文字列を更新するだけ）

パラメータ文字列（351行目の `paramStr`）を更新:
```typescript
    const paramStr = `atr=${p.atrMultiplier} be=${p.beActivationMultiplier} trail=${p.trailMultiplier} ts=${p.tsActivationMultiplier} ba=${p.minBreakoutAtr ?? 0} vt=${p.volumeTrendThreshold ?? 1.0}`;
```

パラメータ安定性分析（359行目付近）を更新:
```typescript
  const paramKeys = ["atrMultiplier", "beActivationMultiplier", "trailMultiplier", "tsActivationMultiplier", "minBreakoutAtr", "volumeTrendThreshold"] as const;
  for (const key of paramKeys) {
    const values = results.map((r) => r.bestIsParams[key] ?? (key === "volumeTrendThreshold" ? 1.0 : 0));
    const uniqueValues = [...new Set(values)];
    const stability = uniqueValues.length === 1 ? "安定" : uniqueValues.length <= 2 ? "やや安定" : "不安定";
    console.log(`  ${key}: ${uniqueValues.join(", ")} → ${stability}`);
  }
```

- [ ] **Step 4: スクリプト冒頭コメントの組み合わせ数を更新**

1行目付近のコメントを更新:
```typescript
 * パラメータグリッド（288通り）を IS で最適化し、
```

- [ ] **Step 5: コンパイルチェック**

Run: `npx tsc --noEmit --pretty 2>&1 | head -30`
Expected: エラーなし

- [ ] **Step 6: コミット**

```bash
git add scripts/walk-forward-breakout.ts
git commit -m "feat: walk-forward を6次元グリッド対応に更新（288通り）"
```

---

### Task 6: ドキュメント更新

**Files:**
- Modify: `.claude/rules/backtest.md`

- [ ] **Step 1: backtest.md のパラメータグリッド説明を更新**

`.claude/rules/backtest.md` のパラメータグリッドセクションを以下に更新:

```markdown
#### パラメータグリッド（288通り、エグジット+エントリー）

| パラメータ | 値 |
|-----------|-----|
| atrMultiplier | 0.8, 1.0, 1.2 |
| beActivationMultiplier | 0.3, 0.5 |
| trailMultiplier | 0.3, 0.5 |
| tsActivationMultiplier | 1.0, 1.5 |
| minBreakoutAtr | 0.0, 0.2, 0.3, 0.5 |
| volumeTrendThreshold | 1.0, 1.2, 1.5 |
```

「81パラメータ × 6ウィンドウ」の記述があれば「288パラメータ × 6ウィンドウ」に更新。
「エグジット系のみ」の記述があれば削除。

- [ ] **Step 2: コミット**

```bash
git add .claude/rules/backtest.md
git commit -m "docs: backtest.md にエントリーフィルター追加を反映"
```

---

### Task 7: walk-forward 実行と検証

**Files:** なし（実行のみ）

- [ ] **Step 1: walk-forward を実行**

Run: `npm run walk-forward:breakout`
Expected: 288通り × 6ウィンドウが実行され、数分〜十数分で完了。

- [ ] **Step 2: 結果を確認**

以下を確認:
1. OOS集計PF >= 1.0（最低目標）
2. IS/OOS PF比 <= 3.0（過学習でない）
3. `minBreakoutAtr` と `volumeTrendThreshold` の安定性（全ウィンドウで同じ値が選ばれれば堅牢）
4. 各ウィンドウのOOSトレード数 >= 5（統計的意義）

- [ ] **Step 3: 結果を記録・報告**

walk-forward の出力結果をユーザーに報告し、判定（堅牢/要注意/過学習）を共有する。
