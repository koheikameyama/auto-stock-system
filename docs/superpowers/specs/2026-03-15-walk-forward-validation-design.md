# ウォークフォワード検証 設計書

## 目的

現在のバックテストパラメータ（PF 2.63、ATR×0.8等）が過学習かどうかを判定する。6ヶ月のIn-Sample（IS）期間で得られた成績が、3ヶ月のOut-of-Sample（OOS）期間でも維持されるかを検証する。

## スコープ

- 過学習の検出に特化（パラメータ自動最適化は対象外）
- CLIスクリプトとして実装（DB保存・Web表示なし）
- 既存の `runBacktest()` を変更せずに利用

## アーキテクチャ

### ファイル構成

```
scripts/walk-forward.ts     ← 新規（メインスクリプト）
src/backtest/
  simulation-engine.ts       ← 既存（変更なし）
  data-fetcher.ts            ← 既存（変更なし）
  on-the-fly-scorer.ts       ← 既存（変更なし）
  metrics.ts                 ← 既存（変更なし）
```

既存コードへの変更は不要。`runBacktest()` は startDate/endDate で期間を絞れるため、ウィンドウごとに呼び出すだけで済む。

### 依存関係

- `runBacktest()` from `src/backtest/simulation-engine.ts`
- `fetchMultipleBacktestData()`, `fetchVixData()` from `src/backtest/data-fetcher.ts`
- `buildCandidateMapOnTheFly()` from `src/backtest/on-the-fly-scorer.ts`
- `DAILY_BACKTEST`, `SCREENING` from `src/lib/constants`

## ウィンドウ設計

24ヶ月のデータを IS 6ヶ月 / OOS 3ヶ月、3ヶ月ずつスライドする固定ウィンドウ・ローリング方式で6ウィンドウに分割する。

```
全体データ: 2024-03 〜 2026-03 (24ヶ月)

W1: IS [2024-03 → 2024-08] → OOS [2024-09 → 2024-11]
W2: IS [2024-06 → 2024-11] → OOS [2024-12 → 2025-02]
W3: IS [2024-09 → 2025-02] → OOS [2025-03 → 2025-05]
W4: IS [2024-12 → 2025-05] → OOS [2025-06 → 2025-08]
W5: IS [2025-03 → 2025-08] → OOS [2025-09 → 2025-11]
W6: IS [2025-06 → 2025-11] → OOS [2025-12 → 2026-02]
```

- IS期間は3ヶ月ずつ重複するが、OOS期間は重複しない（独立性確保）
- 各ウィンドウで同一パラメータを使用してIS/OOSの成績を比較

## データフロー

```
1. 銘柄取得（DB: 出来高上位500）
2. データ一括取得（24ヶ月 + lookback 200日）
   - fetchMultipleBacktestData() × 1回
   - fetchVixData() × 1回
3. ウィンドウループ（W1〜W6）:
   a. IS期間のcandidateMap構築（buildCandidateMapOnTheFly）
   b. IS期間のバックテスト実行（runBacktest）→ ISメトリクス
   c. OOS期間のcandidateMap構築
   d. OOS期間のバックテスト実行（runBacktest）→ OOSメトリクス
   e. IS/OOS比較を記録
4. 全ウィンドウの結果をサマリー表示
5. 全パラメータ条件（PARAMETER_CONDITIONS）で3-4を繰り返し
6. 条件別OOS堅牢性を一覧表示
```

データフェッチは1回だけ行い、ウィンドウごとの `runBacktest()` 呼び出しでは startDate/endDate を変えるだけ。

## 過学習判定ロジック

### 比較指標（ウィンドウごと）

- Profit Factor (IS vs OOS)
- 勝率 (IS vs OOS)
- 期待値 (IS vs OOS)
- トレード数
- Max Drawdown

### 判定基準

| 判定 | 条件 | 意味 |
|------|------|------|
| 堅牢 | OOS平均PF >= 1.3 かつ IS/OOS PF比 <= 2.0 | 実運用に耐えるエッジ |
| 要注意 | OOS平均PF >= 1.0 かつ IS/OOS PF比 <= 3.0 | エッジはあるが不安定 |
| 過学習 | OOS平均PF < 1.0 または IS/OOS PF比 > 3.0 | パラメータがデータに合わせ込まれている |

IS/OOS PF比 = IS平均PF / OOS平均PF。この値が大きいほど、IS期間に特化した（過学習した）パラメータである可能性が高い。

## CLI出力

### ウィンドウ別詳細

```
=== ウォークフォワード検証 ===
パラメータ: scoreThreshold=70 atrMultiplier=0.8 TS起動=3.0 ...

Window  | IS期間           | OOS期間          | IS PF | OOS PF | IS勝率 | OOS勝率 | ISトレード | OOSトレード
--------|------------------|------------------|-------|--------|--------|---------|-----------|----------
W1      | 2024-03→2024-08  | 2024-09→2024-11  | 2.41  | 1.52   | 44%    | 38%     | 82        | 35
W2      | 2024-06→2024-11  | 2024-12→2025-02  | 2.78  | 0.89   | 46%    | 32%     | 91        | 28
...
```

### サマリー

```
=== サマリー ===
IS平均PF:  2.63    OOS平均PF: 1.21
IS/OOS比:  2.17
OOS PF最悪: 0.89 (W2)
OOS PF最良: 1.52 (W1)

判定: 要注意 — OOS平均PF 1.21はプラスだがIS比2.17で過学習傾向あり
```

### 条件別OOS堅牢性一覧

PARAMETER_CONDITIONS の全条件をウォークフォワードで検証し、OOSで堅牢な条件を特定する。

```
=== 条件別OOS堅牢性 ===
条件          | OOS平均PF | IS/OOS比 | OOS勝率 | 判定
ベースライン   | 1.21      | 2.17     | 35%     | 要注意
ATR0.8        | 0.95      | 2.77     | 30%     | 過学習
スコア60      | 1.35      | 1.45     | 40%     | 堅牢
...
```

## 実行方法

```bash
npx tsx scripts/walk-forward.ts
```

## 制約・前提

- Yahoo Finance APIのレート制限: 500銘柄×24ヶ月のデータ取得に数分かかる想定
- candidateMapはウィンドウごとに構築するため、IS/OOS間でサバイバーバイアスを除去
- VIXデータも24ヶ月分を一括取得し、レジーム判定に使用
- 実行時間: データ取得5-10分 + シミュレーション（16条件×6ウィンドウ×2 = 192回）で数分
