# 期待値ファーストUI改修

## 概要

プロダクトコンセプト「期待値ファースト」に合わせ、UI上で「勝率」を主指標として表示している箇所を「期待値」に置き換える。勝率を見ると「勝率を上げたい」バイアスが生まれるため、プロのトレーダーが重視すべき期待値を前面に出す。

## 変更方針

- **アプローチA**: 勝率を削除し、期待値に置き換える（補助情報として「勝敗」は残す）
- 内部計算の `winRate` は期待値算出に必要なため維持
- ログ・開発者向け出力は変更しない
- チャートパターンのBulkowski勝率は学術データのため変更しない

## 変更対象

### 1. バックテスト画面（backtest.ts）

#### テーブル（一覧）

```
Before: 条件 | 勝率 | PF | リターン | 期待値 | RR | 詳細
After:  条件 | 期待値 | PF | リターン | RR | 詳細
```

- 勝率列（ヘッダー + データセル）を削除
- 既存の期待値列を条件の直後（先頭）に移動

#### 詳細モーダル

```
Before: 初期資金 → 価格上限 → 勝率 → 勝敗 → 累計損益 → リターン → PF → 期待値 → RR比 → 平均利益 → 平均損失 → 最大DD → 取引数 → シャープレシオ → 平均保有日数 → 対象銘柄数 → 期間 → 実行時間
After:  初期資金 → 価格上限 → 期待値 → RR比 → PF → 勝敗 → 累計損益 → リターン → 平均利益 → 平均損失 → 最大DD → 取引数 → シャープレシオ → 平均保有日数 → 対象銘柄数 → 期間 → 実行時間
```

変更内容:
- 「勝率」行を削除
- 「勝敗」（3勝2敗）は残す
- 期待値・RR比を累計損益の前に移動（現在は PF の後にある）
- PFも上位にグループ化

#### モンテカルロ入力データ表示

```
Before: 入力: 勝率XX% / 平均利益+XX% / 平均損失XX% / サンプルXXトレード / 期待値XX%
After:  入力: 期待値XX% / 平均利益+XX% / 平均損失XX% / サンプルXXトレード
```

- 勝率を削除、期待値を先頭に移動

### 2. Slack通知

#### 日次レポート（slack.ts: notifyDailyReport）

```
Before: フィールド「勝率」= "3勝2敗 (60%)"
After:  フィールド「勝敗」= "3勝2敗"
```

- フィールド名を「勝率」→「勝敗」に変更
- パーセンテージ表示を削除

#### 週次レビュー（weekly-review.ts）

```
Before: フィールド「勝率」= "5勝3敗 (62%)"
After:  フィールド「勝敗」= "5勝3敗"
```

- フィールド名を「勝率」→「勝敗」に変更
- AIプロンプト内の「- 勝率: XX%」行を単純に削除（置き換えなし。AIに勝率バイアスを与えないため）

#### バックテスト結果通知（slack.ts: notifyBacktestResult）

**ベースライン行:**
```
Before: *ベースライン*: 勝率47% | PF 1.30 | +12.5% | DD -8.2% | 23件
After:  *ベースライン*: 期待値+0.52% | PF 1.30 | +12.5% | DD -8.2% | 23件
```

**ペーパートレード行:**
```
Before: 新条件: PF 1.30 | 勝率47% | +12.5% | DD -8.2% | 23件
After:  新条件: PF 1.30 | 期待値+0.52% | +12.5% | DD -8.2% | 23件
```

- `勝率XX%` → `期待値+XX%` に置き換え（符号付き、小数点2桁）
- 期待値データを通知関数のインターフェースに追加（後述）

### 3. AI精度レポート（accuracy.ts）

#### ランク別精度テーブル

```
Before: ランク | TP | FP | FN | TN | Precision | 出現 | 勝率
After:  ランク | TP | FP | FN | TN | Precision | 出現 | 期待値
```

データソース: ランク別精度テーブルの「勝率」列はローカルの `rankDist` 集計を使用（`audit.byRank` はTP/FP等の分類精度用）。

変更内容:
- `rankDist` の型に `pnlSum: number` を追加
- ループ内で全トレード（勝ち・負け両方）の `ghostProfitPct` を `pnlSum` に加算
- 期待値 = `total > 0 ? pnlSum / total : null`
- `total === 0` の場合は `"-"` を表示
- 色分け: +1%以上=緑(#22c55e)、0〜+1%=青(#3b82f6)、0未満=赤(#ef4444)、null=グレー(#64748b)

#### セクター別成績テーブル

```
Before: セクター | 出現 | 勝ち | 勝率 | 勝ち平均利益率
After:  セクター | 出現 | 勝ち | 期待値 | 勝ち平均利益率
```

変更内容:
- `SectorBucket` に `totalPnlSum: number` フィールドを追加
- ループ内で全トレード（勝ち・負け両方）の `ghostProfitPct` を `totalPnlSum` に加算
- 既存の `profitSum`（勝ちトレードのみ）は「勝ち平均利益率」列で引き続き使用するため維持
- 期待値 = `total > 0 ? totalPnlSum / total : null`
- `total === 0` の場合は `"-"` を表示
- 色分け: ランク別と同じ基準

## 変更しないもの

| 箇所 | ファイル | 理由 |
|------|----------|------|
| チャートパターン参考勝率 | `chart-patterns.ts`, `constants/chart-patterns.ts` | Bulkowski研究の学術参考値 |
| 銘柄モーダルのパターン表示 | `stock-modal.ts` L354 | 上記チャートパターンの表示部分 |
| ログ出力 | `daily-runner.ts`, `reporter.ts`, `diagnose-backtest.ts` | 開発者向け。勝率も見たい場面がある |
| 内部計算 | `metrics.ts` | winRate は期待値算出の入力値 |
| Walk-forward スクリプト | `scripts/walk-forward.ts` | 開発ツール |
| README.md | `README.md` | 古い記述だが別タスクで対応 |
| DBスキーマ | `prisma/schema.prisma` (BacktestDailyResult.winRate) | 既存データとの互換性。カラムは維持 |

## データフロー

### バックテスト結果通知の期待値データ

`notifyBacktestResult` のインターフェースに期待値を追加:

```typescript
conditionResults: Array<{
  key: string;
  label: string;
  winRate: number;       // 内部用に維持（Slack表示からは除外）
  expectancy: number;    // 追加: cr.metrics.expectancy から取得
  profitFactor: number;
  totalReturnPct: number;
  totalPnl: number;
  totalTrades: number;
  maxDrawdown: number;
}>;
```

呼び出し元の `daily-backtest.ts` で `expectancy: cr.metrics.expectancy` を追加。
`cr.metrics.expectancy` は `src/backtest/metrics.ts` L89 で既に算出済み。

### ペーパートレード通知の期待値データ

```typescript
paperTradeResult?: {
  // 既存フィールド...
  newExpectancy: number;  // 追加: result.paperTradeResult.newBaseline.metrics.expectancy
  oldExpectancy: number;  // 追加: result.paperTradeResult.oldBaseline.metrics.expectancy
};
```

呼び出し元の `daily-backtest.ts` で上記フィールドを追加。

## テスト方針

- `tsc --noEmit` でインターフェース変更の型チェック
- バックテスト画面をブラウザで目視確認（テーブル・モーダル・モンテカルロ）
- Slack通知のフォーマットをログ出力で確認
- AI精度レポートをブラウザで目視確認（ランク別・セクター別）
- 既存のモンテカルロテスト（monte-carlo.test.ts）が通ることを確認
