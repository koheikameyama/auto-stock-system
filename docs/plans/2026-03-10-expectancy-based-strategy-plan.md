# 期待値ベース戦略への移行 Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** 「勝率70%・コツコツ利確」から「正の期待値・損小利大・トレンドフォロー」ベースへ段階的に移行する

**Architecture:** 既存の100点満点スコアリング枠組み・リスク管理機構を維持しつつ、(1) コンセプト文書を更新、(2) スコアリング配点をトレンドフォロー型に調整（RSI・MA・MACD追加）、(3) 固定TP廃止→トレーリング一本化＋タイムストップ＋RRフィルタ追加、(4) KPI定義を期待値ベースに変更する。

**Tech Stack:** TypeScript, Prisma, Next.js, yahoo-finance2

**Design doc:** `docs/plans/2026-03-10-expectancy-based-strategy-design.md`

---

## Task 1: スコアリング定数の配点変更

**Files:**
- Modify: `src/lib/constants/scoring.ts:1-38` (CATEGORY_MAX, SUB_MAX)

**Step 1: 定数を更新**

`src/lib/constants/scoring.ts` のコメントと定数値を変更する:

```typescript
/**
 * スコアリング・損切り検証の定数
 *
 * 4カテゴリ100点満点:
 * - テクニカル指標: 40点
 * - チャート・ローソク足パターン: 20点
 * - 流動性: 25点
 * - ファンダメンタルズ: 15点
 */

export const SCORING = {
  // カテゴリ配点
  CATEGORY_MAX: {
    TECHNICAL: 40,
    PATTERN: 20,
    LIQUIDITY: 25,
    FUNDAMENTAL: 15,
  },

  // サブ項目配点
  SUB_MAX: {
    // テクニカル (40点)
    RSI: 10,
    MA: 15,
    VOLUME_CHANGE: 10,
    MACD: 5,
    // パターン (20点)
    CHART_PATTERN: 14,
    CANDLESTICK: 6,
    // 流動性 (25点) — 変更なし
    TRADING_VALUE: 10,
    SPREAD_PROXY: 8,
    STABILITY: 7,
    // ファンダメンタルズ (15点) — 変更なし
    PER: 5,
    PBR: 4,
    PROFITABILITY: 4,
    MARKET_CAP: 2,
  },
  // ... 以降は変更なし
```

**注意:** VOLUME_DIRECTION.SCORES の最大値もVOLUME_CHANGE(10点)に合わせて調整する:
```typescript
SCORES: {
  HIGH_VOLUME: { accumulation: 10, neutral: 7, distribution: 3 },
  MEDIUM_VOLUME: { accumulation: 8, neutral: 6, distribution: 3 },
  NORMAL_VOLUME: { accumulation: 6, neutral: 5, distribution: 4 },
},
```
→ HIGH_VOLUME.accumulation は既に10なので変更不要。

**Step 2: ビルド確認**

Run: `npx tsc --noEmit`
Expected: エラーなし

**Step 3: コミット**

```bash
git add src/lib/constants/scoring.ts
git commit -m "refactor: スコアリング配点をトレンドフォロー型に変更（40/20/25/15）"
```

---

## Task 2: RSIスコアリングをモメンタム型に変更

**Files:**
- Modify: `src/core/technical-scorer.ts:157-166` (scoreRSI関数)

**Step 1: scoreRSI()を書き換え**

```typescript
/** RSI スコア（0-10点）— モメンタム型: RSI 50-65 に最高得点 */
function scoreRSI(rsi: number | null): number {
  if (rsi == null) return 5;
  if (rsi >= 50 && rsi < 65) return SCORING.SUB_MAX.RSI; // 10点: モメンタム
  if (rsi >= 40 && rsi < 50) return 7;                    // トレンド初動
  if (rsi >= 65 && rsi < 75) return 5;                    // 強いが過熱気味
  if (rsi >= 30 && rsi < 40) return 3;                    // 下降トレンドの可能性
  return 0;                                                // rsi < 30 or rsi >= 75
}
```

**Step 2: ビルド確認**

Run: `npx tsc --noEmit`
Expected: エラーなし

**Step 3: コミット**

```bash
git add src/core/technical-scorer.ts
git commit -m "refactor: RSIスコアリングをモメンタム型に変更（50-65に最高得点）"
```

---

## Task 3: MAスコアリングの配点調整

**Files:**
- Modify: `src/core/technical-scorer.ts:169-180` (scoreMA関数)

**Step 1: scoreMA()の値を15点満点に調整**

```typescript
/** 移動平均線 / 乖離率 スコア（0-15点） */
function scoreMA(summary: TechnicalSummary): number {
  const { trend, orderAligned, slopesAligned } = summary.maAlignment;
  const max = SCORING.SUB_MAX.MA;

  if (trend === "uptrend" && orderAligned && slopesAligned) return max;  // 15
  if (trend === "uptrend" && orderAligned) return 12;
  if (trend === "uptrend") return 10;
  if (trend === "downtrend" && orderAligned && slopesAligned) return 0;
  if (trend === "downtrend" && orderAligned) return 2;
  if (trend === "downtrend") return 3;
  return 7; // none
}
```

**Step 2: ビルド確認**

Run: `npx tsc --noEmit`
Expected: エラーなし

**Step 3: コミット**

```bash
git add src/core/technical-scorer.ts
git commit -m "refactor: MAスコアリングの配点を15点満点に調整"
```

---

## Task 4: MACDスコアリングの追加

**Files:**
- Modify: `src/core/technical-scorer.ts` (scoreMACD関数を追加、scoreTechnicalsに組み込み)

**Step 1: scoreMACD()関数を追加**

`scoreRSI()`の直後（scoreMA()の前）に追加:

```typescript
/** MACD スコア（0-5点）— ヒストグラム上昇・ゴールデンクロスに加点 */
function scoreMACD(summary: TechnicalSummary): number {
  const { macd, signal, histogram } = summary.macd;
  if (macd == null || signal == null || histogram == null) return 2; // データなし→中立

  const max = SCORING.SUB_MAX.MACD;

  // ゴールデンクロス（MACDがシグナルを上抜き）+ ヒストグラム正
  if (macd > signal && histogram > 0) return max; // 5点
  // MACDがシグナル上だがヒストグラム縮小
  if (macd > signal && histogram <= 0) return 3;
  // デッドクロス方向だがヒストグラムが改善中（底打ち）
  if (macd <= signal && histogram > (summary as any)._prevHistogram) return 2;
  // デッドクロス
  if (macd < signal) return 0;

  return 2; // 中立
}
```

**注意:** `summary.macd` のフィールド名が `TechnicalSummary` 型に存在するか確認が必要。`src/core/technical-analysis.ts` で `calculateMACD()` の結果を `summary` に含めているか確認し、含まれていなければ `summary` に追加する。

既存の `technical-analysis.ts` では `analyzeTechnicals()` の返り値 `TechnicalSummary` に `macd` が含まれているかを確認:
- 含まれている場合: `summary.macd.histogram` 等を直接参照
- 含まれていない場合: 新たに `TechnicalSummary` に `macd` フィールドを追加

**シンプルな実装:**

MACDが `TechnicalSummary` にない場合は、`scoreTechnicals()` の入力 `input` に MACD を追加するのではなく、`summary` の既存のMACD計算を参照する形にする。`analyzeTechnicals()` 内で `calculateMACD()` は既に呼ばれているので、返り値に含めるだけでよい。

**Step 2: scoreTechnicals()にMACDスコアを組み込み**

`src/core/technical-scorer.ts` の `scoreTechnicals()` 関数内（行562付近）:

```typescript
// Before:
const technicalTotal = rsiScore + maScore + volumeChangeScore;

// After:
const macdScore = scoreMACD(summary);
const technicalTotal = rsiScore + maScore + volumeChangeScore + macdScore;
```

返り値の `technical` オブジェクトにも追加:

```typescript
technical: {
  total: technicalTotal,
  rsi: rsiScore,
  ma: maScore,
  volume: volumeChangeScore,
  macd: macdScore,         // 追加
  volumeDirection: volumeDir.direction,
},
```

**Step 3: LogicScore型にMACDを追加**

`src/core/technical-scorer.ts` の `LogicScore` インターフェース（ファイル先頭付近）の `technical` に `macd: number` を追加。

**Step 4: TechnicalSummaryにMACDを含める（必要な場合）**

`src/core/technical-analysis.ts` の `analyzeTechnicals()` 返り値に `macd` を追加:

```typescript
macd: {
  macd: macdResult.macd,
  signal: macdResult.signal,
  histogram: macdResult.histogram,
},
```

`TechnicalSummary` インターフェースにも追加:
```typescript
macd: {
  macd: number | null;
  signal: number | null;
  histogram: number | null;
};
```

**Step 5: ビルド確認**

Run: `npx tsc --noEmit`
Expected: エラーなし

**Step 6: コミット**

```bash
git add src/core/technical-scorer.ts src/core/technical-analysis.ts
git commit -m "feat: MACDスコアリング（5点）を追加"
```

---

## Task 5: パターンスコアの配点調整

**Files:**
- Modify: `src/core/technical-scorer.ts` (scoreChartPattern, scoreCandlestick の上限値が SUB_MAX を参照していることを確認)

**Step 1: パターンスコア関数の確認と調整**

`scoreChartPattern()` と `scoreCandlestick()` が `SCORING.SUB_MAX.CHART_PATTERN` (14) と `SCORING.SUB_MAX.CANDLESTICK` (6) を正しく参照しているか確認。

ハードコードされた値がある場合は `SCORING.SUB_MAX` 参照に置き換える。合計が20点を超えないことを確認。

**Step 2: ビルド確認**

Run: `npx tsc --noEmit`
Expected: エラーなし

**Step 3: コミット（変更がある場合のみ）**

```bash
git add src/core/technical-scorer.ts
git commit -m "refactor: パターンスコア配点を20点満点に調整"
```

---

## Task 6: 固定TP廃止 — entry-calculator の変更

**Files:**
- Modify: `src/core/entry-calculator.ts:61-80` (利確計算ロジック)

**Step 1: 利確計算をレジスタンス参考値に変更**

固定3%の最低保証を廃止し、レジスタンスラインを「参考値」として残す（トレーリングストップが実際の利確を担う）:

```typescript
// 2. 利確参考値: レジスタンスライン（トレーリングストップの参考用）
//    固定TP廃止: 実際の利確はトレーリングストップが担う
const nearestResistance =
  summary.resistances.length > 0
    ? summary.resistances
        .filter((r) => r > limitPrice)
        .sort((a, b) => a - b)[0] ?? null
    : null;
const atrTarget = summary.atr14
  ? limitPrice + summary.atr14 * 1.5
  : null;

// レジスタンス参考値（RRフィルタ用。実際のTPはトレーリングストップ）
let takeProfitPrice = nearestResistance
  ? atrTarget
    ? Math.min(nearestResistance, atrTarget)
    : nearestResistance
  : atrTarget ?? Math.round(limitPrice * 1.05); // 参考値としてATRベース or 5%
takeProfitPrice = Math.round(takeProfitPrice);
```

**Step 2: RRフィルタを追加**

`calculateEntryCondition()` の返り値の前に:

```typescript
// 5. リスクリワード比
const risk = limitPrice - stopLossPrice;
const reward = takeProfitPrice - limitPrice;
const riskRewardRatio =
  risk > 0 ? Math.round((reward / risk) * 100) / 100 : 0;

// RRフィルタ: 期待RR < 1.5 → 数量0にしてエントリー見送り
if (riskRewardRatio < 1.5) {
  return {
    limitPrice,
    takeProfitPrice,
    stopLossPrice,
    quantity: 0,
    riskRewardRatio,
    strategy,
  };
}
```

**Step 3: ビルド確認**

Run: `npx tsc --noEmit`
Expected: エラーなし

**Step 4: コミット**

```bash
git add src/core/entry-calculator.ts
git commit -m "feat: 固定TP廃止、RRフィルタ(1.5未満見送り)追加"
```

---

## Task 7: トレーリングストップのパラメータ変更

**Files:**
- Modify: `src/lib/constants/jobs.ts:29-43` (TRAILING_STOP)

**Step 1: スイングのパラメータを更新**

```typescript
export const TRAILING_STOP = {
  ACTIVATION_ATR_MULTIPLIER: {
    day_trade: 0.5,
    swing: 0.5,   // 0.75 → 0.5（より早く発動）
  },
  TRAIL_ATR_MULTIPLIER: {
    day_trade: 1.0,
    swing: 1.2,   // 1.5 → 1.2（やや引き締め）
  },
  ACTIVATION_PCT: { day_trade: 0.01, swing: 0.01 },   // 0.015 → 0.01
  TRAIL_PCT: { day_trade: 0.015, swing: 0.02 },        // 0.025 → 0.02
} as const;
```

**Step 2: ビルド確認**

Run: `npx tsc --noEmit`
Expected: エラーなし

**Step 3: コミット**

```bash
git add src/lib/constants/jobs.ts
git commit -m "refactor: トレーリングストップのスイングパラメータ調整（発動0.5ATR、幅1.2ATR）"
```

---

## Task 8: position-monitor — 固定TP判定の無効化 + タイムストップ追加

**Files:**
- Modify: `src/jobs/position-monitor.ts` (固定TP参照箇所、タイムストップ追加)
- Modify: `src/lib/constants/jobs.ts` (POSITION_DEFAULTS, TIME_STOP定数追加)

**Step 1: POSITION_DEFAULTS を更新し TIME_STOP を追加**

`src/lib/constants/jobs.ts`:

```typescript
export const POSITION_DEFAULTS = {
  TAKE_PROFIT_RATIO: 1.05, // 参考値（トレーリングストップが実際の利確を担う）
  STOP_LOSS_RATIO: 0.98,   // 2%損切り（ATR不明時フォールバック）
} as const;

// タイムストップ
export const TIME_STOP = {
  MAX_HOLDING_DAYS: 10, // 最大保有営業日数
} as const;
```

**Step 2: position-monitor にタイムストップを追加**

`src/jobs/position-monitor.ts` のオープンポジション処理ループ内（行136-264付近のTP/SL判定後）に追加:

```typescript
// タイムストップ: 最大保有日数超過で強制決済
if (!exitPrice) {
  const entryDate = dayjs(position.entryDate);
  const now = dayjs().tz("Asia/Tokyo");
  // 営業日数の簡易算出（土日除外）
  let businessDays = 0;
  let d = entryDate.add(1, "day");
  while (d.isBefore(now, "day") || d.isSame(now, "day")) {
    const dow = d.day();
    if (dow !== 0 && dow !== 6) businessDays++;
    d = d.add(1, "day");
  }
  if (businessDays >= TIME_STOP.MAX_HOLDING_DAYS) {
    // タイムストップ発動: 成行決済
    exitReason = "time_stop";
    exitPrice = currentPrice; // 現在価格で決済
  }
}
```

**注意:** `exitReason` の型に `"time_stop"` を追加する必要がある（Position モデルの exitReason フィールド）。

**Step 3: ビルド確認**

Run: `npx tsc --noEmit`
Expected: エラーなし

**Step 4: コミット**

```bash
git add src/lib/constants/jobs.ts src/jobs/position-monitor.ts
git commit -m "feat: タイムストップ（10営業日）追加、POSITION_DEFAULTS.TAKE_PROFIT_RATIOを参考値に変更"
```

---

## Task 9: バックテスト — タイムストップ対応 + 固定TP無効化

**Files:**
- Modify: `src/backtest/simulation-engine.ts:136-211` (TP/SL判定ループ)
- Modify: `src/backtest/types.ts:40-46` (exitReason型)
- Modify: `src/backtest/metrics.ts:17-22` (time_stop を集計対象に追加)
- Modify: `src/lib/constants/backtest.ts:25-33` (DEFAULT_PARAMS)

**Step 1: backtest types に time_stop 追加**

`src/backtest/types.ts` のexitReason:

```typescript
exitReason:
  | "take_profit"
  | "stop_loss"
  | "trailing_profit"
  | "time_stop"      // 追加
  | "expired"
  | "still_open"
  | null;
```

**Step 2: simulation-engine にタイムストップを追加**

`src/backtest/simulation-engine.ts` の TP/SL 判定ループ内（行212-218付近、デイトレ強制決済の直後）:

```typescript
// スイング: タイムストップ（最大保有日数）
if (!exitPrice && config.strategy === "swing") {
  const entryDayIdx = tradingDays.indexOf(pos.entryDate);
  const holdingDays = entryDayIdx >= 0 ? dayIdx - entryDayIdx : 0;
  if (holdingDays >= 10) {
    exitPrice = todayBar.close;
    exitReason = "time_stop";
  }
}
```

**Step 3: backtest DEFAULT_PARAMS の takeProfitRatio を更新**

`src/lib/constants/backtest.ts`:

```typescript
DEFAULT_PARAMS: {
  scoreThreshold: 65,
  takeProfitRatio: 1.05,  // 1.03 → 1.05（参考値。実際はトレーリングストップ）
  stopLossRatio: 0.98,
  atrMultiplier: 1.0,
  strategy: "swing" as const,
  trailingStopEnabled: true,
},
```

**Step 4: metrics の集計に time_stop を追加**

`src/backtest/metrics.ts` 行17-22:

```typescript
const closedTrades = trades.filter(
  (t) =>
    t.exitReason === "take_profit" ||
    t.exitReason === "stop_loss" ||
    t.exitReason === "trailing_profit" ||
    t.exitReason === "time_stop",         // 追加
);
```

**Step 5: metrics に期待値・RR比を追加**

`src/backtest/metrics.ts` の `calculateMetrics()` 返り値に追加:

```typescript
// 期待値 = (勝率 × 平均利益%) - (敗率 × 平均損失%)
const winRateDecimal = closedTrades.length > 0 ? wins.length / closedTrades.length : 0;
const lossRateDecimal = 1 - winRateDecimal;
const expectancy = (winRateDecimal * avgWinPct) + (lossRateDecimal * avgLossPct);

// リスクリワード実績 = |平均利益%| / |平均損失%|
const riskRewardRatio = avgLossPct !== 0
  ? Math.abs(avgWinPct / avgLossPct)
  : avgWinPct > 0 ? Infinity : 0;

return {
  // ... 既存フィールド
  expectancy: round2(expectancy),         // 追加
  riskRewardRatio: round2(riskRewardRatio), // 追加
};
```

**PerformanceMetrics 型にも追加** (`src/backtest/types.ts`):

```typescript
expectancy: number;
riskRewardRatio: number;
```

**Step 6: ビルド確認**

Run: `npx tsc --noEmit`
Expected: エラーなし

**Step 7: コミット**

```bash
git add src/backtest/simulation-engine.ts src/backtest/types.ts src/backtest/metrics.ts src/lib/constants/backtest.ts
git commit -m "feat: バックテストにタイムストップ・期待値・RR比を追加"
```

---

## Task 10: AIプロンプトのコンセプト更新

**Files:**
- Modify: `src/prompts/market-assessment.ts:8` (戦略説明)
- Modify: `src/prompts/midday-reassessment.ts:12` (戦略説明)

**Step 1: market-assessment.ts を更新**

```typescript
// Before:
// 本システムは「小さな利確をコツコツ積み重ねる（勝率70%以上）」戦略です。

// After:
// 本システムは「損小利大で期待値を積み上げる」トレンドフォロー戦略です。
```

**Step 2: midday-reassessment.ts を更新**

```typescript
// Before:
// 本システムは「小さな利確をコツコツ積み重ねる（勝率70%以上）」戦略です。

// After:
// 本システムは「損小利大で期待値を積み上げる」トレンドフォロー戦略です。
```

**Step 3: コミット**

```bash
git add src/prompts/market-assessment.ts src/prompts/midday-reassessment.ts
git commit -m "refactor: AIプロンプトの戦略説明を期待値ベースに更新"
```

---

## Task 11: CLAUDE.md のプロダクトコンセプト更新

**Files:**
- Modify: `CLAUDE.md:13-71` (プロダクトコンセプトセクション)

**Step 1: コンセプト・コアバリュー・設計思想を更新**

主な変更点:
- 「コツコツ確実に、毎日勝つ」→「損小利大で、期待値を積み上げる」
- 勝率目標70% → 期待値プラス（PF 1.5以上）
- 利確目標: 数%の小さな利益 → トレンドに乗り利益を伸ばす
- 設計思想: 利確は欲張らず → トレーリングストップで利益を伸ばす
- バックテスト基準: 勝率70%以上 → 期待値プラス・PF 1.3以上

**Step 2: コミット**

```bash
git add CLAUDE.md
git commit -m "docs: プロダクトコンセプトを期待値ベース戦略に更新"
```

---

## Task 12: 仕様書の更新

**Files:**
- Modify: `docs/specs/scoring-system.md` (配点表、RSI評価基準、MACD追加)
- Modify: `docs/specs/trading-architecture.md` (利確/損切りセクション、KPI定義)

**Step 1: scoring-system.md を更新**

- カテゴリ配点を 40/20/25/15 に更新
- RSI評価基準をモメンタム型に更新
- MACDサブ項目を追加

**Step 2: trading-architecture.md を更新**

- 固定TP廃止・トレーリング一本化を記載
- タイムストップ（10営業日）を追加
- RRフィルタ（1.5未満見送り）を追加
- KPI定義セクション（期待値・PF・RR比）を更新

**Step 3: コミット**

```bash
git add docs/specs/scoring-system.md docs/specs/trading-architecture.md
git commit -m "docs: スコアリング・トレーディング仕様書を期待値ベースに更新"
```

---

## Task 13: バックテストで検証

**Step 1: バックテストを実行**

```bash
# 主要銘柄でバックテスト実行
npm run backtest -- --tickers 5401,9501,7203,8306,6758 --start-date 2025-09-01

# 感度分析
npm run backtest -- --tickers 5401,9501,7203 --sensitivity
```

**Step 2: 結果を確認**

- 期待値がプラスか
- PF が 1.3 以上か
- RR比が 1.5 以上か
- 最大ドローダウンが 20% 以下か

**Step 3: 必要に応じてパラメータ調整**

感度分析の結果に基づき、以下を調整:
- スコア閾値（65 → 調整）
- トレーリングストップのアクティベーション/トレール幅
- RRフィルタ閾値（1.5 → 調整）

---

## Task 14: Linearタスクの整理

**Step 1: 吸収タスクをクローズ**

- KOH-291（RSIスコアリング戦略整合性修正）→ Done（本タスクに吸収）
- KOH-311（分割利確の導入）→ Cancelled（固定TP廃止で不要に）

**Step 2: 関連タスクのスコープ更新**

- KOH-294（デイトレ/スイング戦略別パラメータ分離）→ 説明にスイング主体に絞る旨を追記
