# セクターモメンタムのスコアリング統合

## 概要

セクター相対強度（対日経225の週間パフォーマンス差）をスコアリングシステムに組み込む。現在セクター情報はスコア外のフィルタとして使われているが、これをスコアに一本化し、弱セクター除外フィルタを廃止する。

## 背景

### 現状の課題

- スコアは100%テクニカル指標。セクターの追い風/逆風がスコアに反映されない
- 弱セクターは二値判定（除外 or 通過）で、強セクターにいるメリットがスコアに表れない
- 「強いセクターの強い銘柄を買う」というプロの基本戦略がスコアに組み込まれていない

### 設計方針

- 既存100点満点の中で再配分（合計点は変えない）
- テクニカルデータのみ使用（バックテスト可能性を維持）
- ニュースセンチメントはスコア外（AI審判層に留める）
- 弱セクター除外フィルタを廃止し、スコアに一本化

## 配点変更

### Before → After

| カテゴリ | 変更前 | 変更後 |
|----------|--------|--------|
| トレンド品質 | 40 | 40（変更なし） |
| エントリータイミング | 35 | 35（変更なし） |
| リスク品質 | 25 | **20** |
| セクターモメンタム | - | **5** |
| **合計** | **100** | **100** |

### リスク品質の内訳変更

| サブ項目 | 変更前 | 変更後 |
|----------|--------|--------|
| ATR安定性 | 10 | 10（変更なし） |
| レンジ収縮 | 8 | 8（変更なし） |
| ボリューム安定性 | 7 | **2** |

削減理由: ボリューム安定性は3指標の中で最も予測力が弱く、ゲート条件（最低出来高5万株）で最低限の流動性は担保されている。

### ボリューム安定性のスコア変換（7→2に圧縮）

現在のロジック（0/3/5/7の4段階）を0/2の2段階に簡略化する：

| 条件 | 変更前 | 変更後 |
|------|--------|--------|
| CV > 0.8（不安定） | 0 | 0 |
| CV ≤ 0.8 かつ 出来高非増加 | 3 | 0 |
| CV ≤ 0.8 かつ 出来高増加 かつ CV < 0.5 | 5 | 2 |
| CV < 0.5 かつ 出来高増加 | 7 | 2 |

実装: `scoreVolumeStability()` を「出来高増加 かつ CV < 0.5 なら 2、それ以外 0」のシンプルなロジックに変更。

## セクターモメンタムスコア

### 入力

`calculateSectorMomentum()` が返す `relativeStrength`（セクター平均週間変化率 - 日経225週間変化率）

### スコア変換テーブル

上位の条件から順にマッチする（`>=` 比較）：

| 相対強度（%） | スコア | 解釈 |
|---|---|---|
| >= +3.0% | 5 | セクター大幅アウトパフォーム |
| >= +1.5% | 4 | 明確にアウトパフォーム |
| >= +0.5% | 3 | やや強い |
| >= -0.5% | 2 | 市場並み |
| >= -2.0% | 1 | やや弱い |
| < -2.0% | 0 | 弱セクター |

### セクター不明時の扱い

`getSectorGroup()` が `null` を返す場合（`jpxSectorName` が null またはマッピング不明）：

- `sectorRelativeStrength` を `null` として渡す
- スコアは **2点**（市場並み）をデフォルトとする
- 理由: 0点にするとセクター不明だけでペナルティになり不公平。市場中立の2点が妥当

### セクターの最小銘柄数

セクターグループの銘柄数が3未満の場合は統計的に不安定なため、デフォルトの2点を適用する。

### 定数定義

```typescript
SECTOR_MOMENTUM_SCORING: {
  CATEGORY_MAX: 5,
  TIERS: [
    { min: 3.0, score: 5 },
    { min: 1.5, score: 4 },
    { min: 0.5, score: 3 },
    { min: -0.5, score: 2 },
    { min: -2.0, score: 1 },
  ],
  DEFAULT_SCORE: 2,          // セクター不明時・銘柄数不足時
  MIN_SECTOR_STOCK_COUNT: 3, // 最低銘柄数
}
```

## 変更ファイル一覧

### 定数・型定義

| ファイル | 変更内容 |
|----------|----------|
| `src/lib/constants/scoring.ts` | リスク品質カテゴリ最大25→20、ボリューム安定性7→2、セクターモメンタム定数追加 |
| `src/core/scoring/types.ts` | `ScoringInput` に `sectorRelativeStrength?: number \| null` 追加（optional）、`NewLogicScore` に `sectorMomentumScore: number` 追加 |

### スコアリングロジック

| ファイル | 変更内容 |
|----------|----------|
| `src/core/scoring/sector-momentum.ts` | **新規**: `scoreSectorMomentum(relativeStrength: number \| null \| undefined): number` 純粋関数 |
| `src/core/scoring/risk-quality.ts` | `scoreVolumeStability()` を2点満点のロジックに変更。`scoreRiskQuality()` のコメント「0-25」→「0-20」更新 |
| `src/core/scoring/index.ts` | `scoreStock()` でセクターモメンタムスコアを計算し合計に加算。`zeroResult` に `sectorMomentumScore: 0` 追加。`formatScoreForAI()` にセクターモメンタムの表示を追加 |

### market-scanner

| ファイル | 変更内容 |
|----------|----------|
| `src/jobs/market-scanner.ts` | セクターモメンタム計算結果を `scoreStock()` に渡す。Stage 5の弱セクター除外フィルタを削除 |

### バックテスト

| ファイル | 変更内容 |
|----------|----------|
| `src/backtest/on-the-fly-scorer.ts` | `scoreDayForAllStocks()` の引数に日経225のOHLCVを追加（optional）。各対象日でセクター平均週間変化率を計算し、スコアに反映。`ScoredRecord` 型に `sectorMomentumScore` フィールド追加。`buildCandidateMapOnTheFly()` も日経225データ引数に対応 |
| `src/backtest/daily-runner.ts` | `scoreDayForAllStocks()` 呼び出し時に日経225データを渡す |
| `scripts/backfill-scoring-records.ts` | `scoreDayForAllStocks()` の新引数に対応 |
| `scripts/walk-forward.ts` | `scoreDayForAllStocks()` / `buildCandidateMapOnTheFly()` の新引数に対応 |
| `scripts/diagnose-backtest.ts` | `scoreDayForAllStocks()` / `buildCandidateMapOnTheFly()` の新引数に対応 |

### データベース

| ファイル | 変更内容 |
|----------|----------|
| `prisma/schema.prisma` | `ScoringRecord` に `sectorMomentumScore Int @default(0)` 追加。`riskQualityScore` のコメント更新 |
| マイグレーション | `prisma migrate dev --name add-sector-momentum-score` |

### DB保存・表示

| ファイル | 変更内容 |
|----------|----------|
| `ScoringRecord` 保存箇所（market-scanner内） | `sectorMomentumScore` フィールドを保存 |
| `src/web/routes/scoring.ts` | スコアリング一覧のUI表示にセクターモメンタムスコアを追加 |

### 精度追跡

| ファイル | 変更内容 |
|----------|----------|
| `src/jobs/scoring-accuracy.ts` | FN/FP分析のコンテキストにセクターモメンタムスコアを含める（影響確認） |

### テスト

| ファイル | 変更内容 |
|----------|----------|
| `src/core/__tests__/scoring/risk-quality.test.ts` | ボリューム安定性のテストケースを2点満点に更新 |
| `src/core/__tests__/scoring/sector-momentum.test.ts` | **新規**: セクターモメンタムスコアのテスト（各tier、null、銘柄数不足） |

## データフロー

### ライブスコアリング（market-scanner）

```
calculateSectorMomentum(nikkeiWeekChange)
  → SectorMomentum[] (セクター別 relativeStrength + stockCount)

各候補銘柄:
  → jpxSectorName → getSectorGroup() → セクターグループ特定
  → getSectorGroup() が null → sectorRelativeStrength = null → DEFAULT_SCORE(2)
  → セクターの stockCount < 3 → sectorRelativeStrength = null → DEFAULT_SCORE(2)
  → それ以外 → 該当セクターの relativeStrength を取得
  → scoreStock({ ..., sectorRelativeStrength }) に渡す
  → scoreSectorMomentum(relativeStrength) → 0-5点
  → totalScore = trend(40) + entry(35) + risk(20) + sector(5)
```

### バックテスト（on-the-fly-scorer）

```
scoreDayForAllStocks(targetDate, allOhlcv, fundamentalsMap, stocks, nikkei225Ohlcv?)
  → nikkei225Ohlcv が未指定の場合: 全銘柄に DEFAULT_SCORE(2) を適用
  → nikkei225Ohlcv が指定されている場合:
    ① 全銘柄のOHLCVから週間変化率を計算（5営業日前終値 vs 当日終値）
    ② セクターグループごとに平均週間変化率を算出（stockCount < 3 のグループは除外）
    ③ 日経225のOHLCVから週間変化率を算出
    ④ relativeStrength = セクター平均 - 日経225
    → scoreSectorMomentum(relativeStrength) → 0-5点
```

日経225のOHLCVデータ: バックテスト用データフェッチ時にティッカー `^N225` を追加して取得する。`fetchMultipleBacktestData()` の呼び出し元で対応。バックテスト開始時のデータ不足（5営業日未満）はデフォルトスコア(2)を適用。

## 削除するロジック

- `market-scanner.ts` Stage 5: `calculateSectorMomentum` + `getNewsSectorSentiment` による候補除外フィルタ
- `calculateSectorMomentum()` 関数自体は残す（スコアリングで使用）
- `getNewsSectorSentiment()` はAI審判のコンテキストとして引き続き使用

## 仕様書の更新

- `docs/specs/scoring-system.md`: 配点表、セクターモメンタムカテゴリの追加、ボリューム安定性の変更
- `docs/specs/batch-processing.md`: market-scannerのフロー変更（Stage 5削除）を反映

## ロールバック

`sectorMomentumScore` カラムは `@default(0)` なので、スコアリングロジックを元に戻すだけでロールバック可能。マイグレーションの巻き戻しは不要（カラムは残しても害がない）。

## 段階的改善の余地

5点で開始し、バックテストで効果を確認した後に以下を検討可能:
- 配点を7-10点に増加（リスク品質またはエントリータイミングからさらに移管）
- セクターローテーション（相対強度の変化方向）の追加
- ニュースセンチメントとの組み合わせ（ただしバックテスト可能性とのトレードオフ）
