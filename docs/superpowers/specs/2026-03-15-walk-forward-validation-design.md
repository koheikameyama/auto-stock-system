# ウォークフォワード検証 設計書

## 目的

現在のバックテストパラメータ（PF 2.63、ATR×0.8等）が過学習かどうかを判定する。6ヶ月のIn-Sample（IS）期間で得られた成績が、3ヶ月のOut-of-Sample（OOS）期間でも維持されるかを検証する。

## スコープ

- 過学習の検出に特化（パラメータ自動最適化は対象外）
- CLIスクリプトとして実装（DB書き込み・Web表示なし。DB読み取りは銘柄・ファンダメンタルズ取得のみ）
- 既存の `runBacktest()` を変更せずに利用

## アーキテクチャ

### ファイル構成

```
scripts/walk-forward.ts     <- 新規（メインスクリプト）
src/backtest/
  simulation-engine.ts       <- 既存（変更なし）
  data-fetcher.ts            <- 既存（変更なし）
  on-the-fly-scorer.ts       <- 既存（変更なし）
  metrics.ts                 <- 既存（変更なし）
```

既存コードへの変更は不要。`runBacktest()` は startDate/endDate で期間を絞れるため、ウィンドウごとに呼び出すだけで済む。

### 依存関係

- `runBacktest()` from `src/backtest/simulation-engine.ts`
- `fetchMultipleBacktestData()`, `fetchVixData()` from `src/backtest/data-fetcher.ts`
- `buildCandidateMapOnTheFly()` from `src/backtest/on-the-fly-scorer.ts`
- `DAILY_BACKTEST`, `SCREENING` from `src/lib/constants`
- `prisma` from `src/lib/prisma`（銘柄・ファンダメンタルズ読み取りのみ）

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
- ウィンドウ境界でオープン中のポジションは `still_open` として扱われ、メトリクス計算から除外される（最大3ポジション分。スイング戦略では影響は軽微）

## データフロー

```
1. 銘柄・ファンダメンタルズ取得（DB読み取り）
   - Prismaで出来高上位500銘柄を取得（isActive, !isDelisted, !isRestricted, minPrice, minVolume）
   - fundamentalsMap構築（per, pbr, eps, marketCap, volatility, nextEarningsDate, exDividendDate）
   - sectorMap構築（tickerCode → sectorGroup）

2. データ一括取得（24ヶ月 + lookback 200日）
   - fetchMultipleBacktestData() × 1回
   - fetchVixData() × 1回

3. candidateMap事前構築（12マップ）
   - 6ウィンドウ × IS/OOS = 12期間分のcandidateMapを事前構築
   - buildCandidateMapOnTheFly(allData, fundamentalsMap, stocks, startDate, endDate, targetRanks, fallbackRanks, minTickers)
   - candidateMapはS/A/Bランクによるサバイバーバイアス除去フィルタ
   - 条件（PARAMETER_CONDITIONS）のscoreThresholdとは独立 → 条件ごとの再構築は不要

4. 条件ループ（22条件: PARAMETER_CONDITIONS）:
   a. ウィンドウループ（W1〜W6）:
      i.  IS期間のバックテスト実行（runBacktest + 事前構築済みcandidateMap）→ ISメトリクス
      ii. OOS期間のバックテスト実行（runBacktest + 事前構築済みcandidateMap）→ OOSメトリクス
      iii. IS/OOS比較を記録
   b. 全ウィンドウの結果をサマリー集計

5. 条件別OOS堅牢性を一覧表示
```

### パフォーマンス最適化

- データフェッチは1回だけ（ステップ2）
- candidateMap構築は12回のみ（ステップ3）。条件ごとに再構築しない
  - candidateMapはランクベースのフィルタであり、scoreThreshold等の条件パラメータとは独立
  - これにより 22条件×12マップ = 264回の構築を12回に削減
- バックテスト実行: 22条件 × 6ウィンドウ × 2(IS/OOS) = 264回

## 過学習判定ロジック

### 比較指標（ウィンドウごと）

- Profit Factor (IS vs OOS)
- 勝率 (IS vs OOS)
- 期待値 (IS vs OOS)
- トレード数
- Max Drawdown

### PF集計方法

OOS平均PFは**全OOSウィンドウのトレードをプール**して算出する（ウィンドウ別PFの算術平均ではない）。

```
OOS集計PF = 全OOSウィンドウの総利益 / |全OOSウィンドウの総損失|
```

これにより、トレード数が少ないウィンドウや、損失ゼロでPF=Infinityとなるウィンドウの影響を排除できる。

### 最低トレード数

- OOSウィンドウのトレード数が10未満の場合、そのウィンドウは「データ不足」として判定対象から除外
- 除外されたウィンドウは出力テーブルに表示するが、サマリーのPF集計には含めない

### 判定基準

| 判定 | 条件 | 意味 |
|------|------|------|
| 堅牢 | OOS集計PF >= 1.3 かつ IS/OOS PF比 <= 2.0 | 実運用に耐えるエッジ |
| 要注意 | OOS集計PF >= 1.0 かつ IS/OOS PF比 <= 3.0 | エッジはあるが不安定 |
| 過学習 | OOS集計PF < 1.0 または IS/OOS PF比 > 3.0 | パラメータがデータに合わせ込まれている |

IS/OOS PF比 = IS集計PF / OOS集計PF。この値が大きいほど、IS期間に特化した（過学習した）パラメータである可能性が高い。

## CLI出力

### ウィンドウ別詳細（ベースライン条件）

```
=== ウォークフォワード検証 ===
パラメータ: scoreThreshold=70 atrMultiplier=0.8 TS起動=3.0 ...

Window  | IS期間           | OOS期間          | IS PF | OOS PF | IS勝率 | OOS勝率 | IS件数 | OOS件数
--------|------------------|------------------|-------|--------|--------|---------|--------|--------
W1      | 2024-03→2024-08  | 2024-09→2024-11  | 2.41  | 1.52   | 44%    | 38%     | 82     | 35
W2      | 2024-06→2024-11  | 2024-12→2025-02  | 2.78  | 0.89   | 46%    | 32%     | 91     | 28
...
```

### サマリー

```
=== サマリー ===
IS集計PF:  2.63    OOS集計PF: 1.21
IS/OOS比:  2.17
OOS PF最悪: 0.89 (W2)
OOS PF最良: 1.52 (W1)

判定: 要注意 — OOS集計PF 1.21はプラスだがIS比2.17で過学習傾向あり
```

### 条件別OOS堅牢性一覧

PARAMETER_CONDITIONS の全22条件をウォークフォワードで検証し、OOSで堅牢な条件を特定する。OOS集計PF降順でソートし、最も堅牢な条件が上に来る。

```
=== 条件別OOS堅牢性（OOS PF降順） ===
条件              | OOS集計PF | IS/OOS比 | OOS勝率 | OOS件数 | 判定
スコア60          | 1.35      | 1.45     | 40%     | 210     | 堅牢
ベースライン       | 1.21      | 2.17     | 35%     | 155     | 要注意
ATR0.8            | 0.95      | 2.77     | 30%     | 142     | 過学習
...
```

## 実行方法

```bash
npx tsx scripts/walk-forward.ts
```

## 制約・前提

- Yahoo Finance APIのレート制限: 500銘柄×24ヶ月のデータ取得に数分かかる想定
- candidateMapはウィンドウ・期間ごとに構築するため、IS/OOS間でサバイバーバイアスを除去
- VIXデータも24ヶ月分を一括取得し、レジーム判定に使用
- 実行時間: データ取得5-10分 + candidateMap構築（12マップ）数分 + シミュレーション（22条件×6ウィンドウ×2 = 264回）数分。合計15-20分程度

## 制限事項

- 24ヶ月の検証期間が特定の市場環境（強気・弱気）に偏っている場合、OOS結果もその影響を受ける。これはウォークフォワード検証の固有の制限
- ウィンドウ境界でのstill_openポジション（最大3件/ウィンドウ）はメトリクスから除外される
