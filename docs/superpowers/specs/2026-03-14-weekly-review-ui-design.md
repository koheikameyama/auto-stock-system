# 週次レビューUI表示

## 背景

週次レビュージョブ（`src/jobs/weekly-review.ts`）は毎週土曜に `TradingDailySummary` を7日分集計し、AIレビューを生成してSlackに通知している。しかしDBに保存されず、UI上にも表示されないため、過去の振り返りができない。

## 目的

- 週次レビュー結果をDBに永続化し、`/weekly` ページで閲覧可能にする
- 過去の週次レビューを一覧で振り返れるようにする
- 週ごとの累積損益チャートでトレンドを可視化する

## 設計

### DBモデル: `TradingWeeklySummary`

```prisma
model TradingWeeklySummary {
  id             String   @id @default(cuid())
  weekStart      DateTime @db.Date           // 月曜日
  weekEnd        DateTime @db.Date @unique   // 金曜日
  tradingDays    Int
  totalTrades    Int      @default(0)
  wins           Int      @default(0)
  losses         Int      @default(0)
  totalPnl       Decimal  @default(0) @db.Decimal(12, 2)
  portfolioValue Decimal  @db.Decimal(12, 0)
  cashBalance    Decimal  @db.Decimal(12, 0)
  aiReview       Json                        // 構造化AIレビュー
  createdAt      DateTime @default(now())

  @@index([weekEnd(sort: Desc)])
}
```

**aiReview JSON構造:**

```typescript
type WeeklyAIReview = {
  performance: string;      // 今週のパフォーマンス評価
  strengths: string;        // 良かった点
  improvements: string;     // 改善すべき点
  nextWeekStrategy: string; // 来週の戦略提案
};
```

### ジョブ変更: `weekly-review.ts`

**変更内容:**

1. OpenAI呼び出しに `response_format`（構造化出力）を適用し、上記JSON構造で返す
2. AIレビュー結果を `TradingWeeklySummary` に `upsert`（weekEnd基準）で保存
3. Slack通知は既存通り維持

**構造化出力スキーマ:**

```typescript
const SCHEMA = {
  type: "json_schema",
  json_schema: {
    name: "weekly_review",
    strict: true,
    schema: {
      type: "object",
      properties: {
        performance: { type: "string", description: "今週のパフォーマンス評価" },
        strengths: { type: "string", description: "良かった点" },
        improvements: { type: "string", description: "改善すべき点" },
        nextWeekStrategy: { type: "string", description: "来週の戦略提案" },
      },
      required: ["performance", "strengths", "improvements", "nextWeekStrategy"],
      additionalProperties: false,
    },
  },
};
```

### UIページ: `/weekly`

**場所:** `src/web/routes/weekly.ts`

**レイアウト構成（上から順に）:**

1. **最新週サマリーカード**
   - 期間（MM/DD〜MM/DD）
   - 4つの統計: 週間損益（pnlText）/ 勝率（W-L形式）/ 取引数 / ポートフォリオ時価
   - 既存の `detail-row` コンポーネントを使用

2. **AIレビューセクション**
   - 4つのカードに分けて表示:
     - 📊 パフォーマンス評価
     - 💪 良かった点
     - 🔧 改善すべき点
     - 🎯 来週の戦略
   - 各カード内はテキスト表示

3. **累積損益チャート**
   - 既存の `sparklineChart` コンポーネントを再利用
   - X軸: 週（MM/DD形式）、Y軸: 累積PnL（¥）
   - 直近12週分を表示

4. **過去の週次レビュー一覧**
   - テーブル形式（既存の `responsive-table` パターン）
   - カラム: 期間 / 取引数 / 勝敗 / 損益
   - 行の下にAIレビュー（performance フィールド）を展開表示（`review-row` パターン、historyと同じ）
   - 直近12週分を表示

**データ取得:**

```typescript
const summaries = await prisma.tradingWeeklySummary.findMany({
  orderBy: { weekEnd: "desc" },
  take: 12,
});
```

### ナビゲーション

`src/web/views/layout.ts` の `NAV_ITEMS` に追加:

```typescript
{
  path: "/weekly",
  label: "週次",
  icon: `<svg ...>...</svg>`, // カレンダーアイコン
}
```

**挿入位置:** `/history`（履歴）の後ろ。日次履歴 → 週次レビューの流れが自然。

### ルート登録

`src/web/app.ts` に追加:

```typescript
import weeklyRoute from "./routes/weekly";
app.route("/weekly", weeklyRoute);
```

### 定数

`src/lib/constants/jobs.ts` の `WEEKLY_REVIEW` に追加:

```typescript
export const WEEKLY_REVIEW = {
  LOOKBACK_DAYS: 7,
  DISPLAY_WEEKS: 12, // UI表示の週数
} as const;
```

## ファイル変更一覧

| ファイル | 変更内容 |
|---------|---------|
| `prisma/schema.prisma` | `TradingWeeklySummary` モデル追加 |
| `src/jobs/weekly-review.ts` | 構造化出力 + DB保存追加 |
| `src/web/routes/weekly.ts` | 新規ページ作成 |
| `src/web/views/layout.ts` | ナビに `/weekly` 追加 |
| `src/web/app.ts` | ルート登録 |
| `src/lib/constants/jobs.ts` | `DISPLAY_WEEKS` 定数追加 |

## 考慮事項

- **DB容量**: 年52件 × ~1KB = ~52KB/年。Railway 500MB制限に影響なし
- **既存Slack通知**: 変更なし。DB保存を追加するだけ
- **マイグレーション**: `prisma migrate dev --name add_trading_weekly_summary` で作成
- **仕様書更新**: `docs/specs/batch-processing.md` に週次レビューのDB保存を追記
