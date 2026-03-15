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
- 期待値列を先頭（条件の次）に移動

#### 詳細モーダル

```
Before: 初期資金 → 価格上限 → 勝率 → 勝敗 → 累計損益 → リターン → PF → 期待値 → RR比 → 平均利益 → 平均損失 → 最大DD → 取引数 → シャープレシオ → 平均保有日数 → 対象銘柄数 → 期間 → 実行時間
After:  初期資金 → 価格上限 → 期待値 → RR比 → PF → 勝敗 → 累計損益 → リターン → 平均利益 → 平均損失 → 最大DD → 取引数 → シャープレシオ → 平均保有日数 → 対象銘柄数 → 期間 → 実行時間
```

- 「勝率」行を削除
- 「勝敗」（3勝2敗）は残す
- 期待値・RR比・PFを上位にグループ化

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
- AIプロンプト内の「勝率: XX%」行を削除（AIに勝率バイアスを与えない）

#### バックテスト結果通知（slack.ts: notifyBacktestResult）

```
Before: *ベースライン*: 勝率47% | PF 1.30 | +12.5% | DD -8.2% | 23件
After:  *ベースライン*: 期待値+0.52% | PF 1.30 | +12.5% | DD -8.2% | 23件
```

- `勝率XX%` → `期待値+XX%` に置き換え
- ペーパートレード行も同様に変更
- 期待値データを通知関数のインターフェースに追加

### 3. AI精度レポート（accuracy.ts）

#### ランク別精度テーブル

```
Before: ランク | TP | FP | FN | TN | Precision | 出現 | 勝率
After:  ランク | TP | FP | FN | TN | Precision | 出現 | 期待値
```

- `rankDist` 集計に `profitSum` を追加（`ghostProfitPct` の合計）
- 期待値 = `profitSum / total`（全トレードの平均ghostProfitPct）
- 色分け: +1%以上=緑、0〜+1%=青、0未満=赤

#### セクター別成績テーブル

```
Before: セクター | 出現 | 勝ち | 勝率 | 勝ち平均利益率
After:  セクター | 出現 | 勝ち | 期待値 | 勝ち平均利益率
```

- `SectorBucket` に `lossSum` フィールドを追加
- 負けトレードの `ghostProfitPct`（負値）を `lossSum` に加算
- 期待値 = `(profitSum + lossSum) / total`
- 色分け: 勝率と同じ基準（+1%以上=緑、0〜+1%=青、0未満=赤）

## 変更しないもの

| 箇所 | 理由 |
|------|------|
| チャートパターン（chart-patterns.ts, stock-modal.ts） | Bulkowski研究の学術参考値 |
| ログ出力（daily-runner.ts, reporter.ts, diagnose-backtest.ts） | 開発者向け。勝率も見たい場面がある |
| 内部計算（metrics.ts） | winRate は期待値算出の入力値 |
| Walk-forward スクリプト | 開発ツール |
| README.md | 古い記述だが別タスクで対応 |
| DBスキーマ（BacktestDailyResult.winRate） | 既存データとの互換性。カラムは維持 |

## データフロー

### バックテスト結果通知の期待値データ

`notifyBacktestResult` のインターフェースに期待値を追加する必要がある:

```typescript
conditionResults: Array<{
  key: string;
  label: string;
  winRate: number;       // 内部用に維持
  expectancy: number;    // 追加
  profitFactor: number;
  totalReturnPct: number;
  totalPnl: number;
  totalTrades: number;
  maxDrawdown: number;
}>;
```

呼び出し元の `daily-backtest.ts` でも `expectancy` を渡すように修正。

### ペーパートレード通知の期待値データ

```typescript
paperTradeResult?: {
  // 既存フィールド...
  newExpectancy: number;  // 追加
  oldExpectancy: number;  // 追加
};
```

## テスト方針

- バックテスト画面をブラウザで目視確認（テーブル・モーダル・モンテカルロ）
- Slack通知のフォーマットをログ出力で確認
- AI精度レポートをブラウザで目視確認
