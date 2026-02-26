# Daily Market Navigator 実装計画

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** 既存のポートフォリオ総評を「市況 + ポートフォリオ健康診断 + Buddyメッセージ」を統合した Daily Market Navigator に完全置き換える。

**Architecture:** 既存の `PortfolioOverallAnalysis` テーブルのカラムを改修し、AI生成ロジック・プロンプト・APIレスポンス・UIを全面書き換え。ダッシュボード最上部に統合カード型で配置。`/portfolio-analysis` ページも新コンポーネントに差し替え。

**Tech Stack:** Next.js 15 (App Router), Prisma, OpenAI API (gpt-4o-mini, structured output), next-intl, Tailwind CSS

**設計書:** `docs/plans/2026-02-26-daily-market-navigator-design.md`

---

## Task 1: DBスキーマ変更（マイグレーション）

**Files:**
- Modify: `prisma/schema.prisma` (行530-561: PortfolioOverallAnalysis モデル)
- Create: `prisma/migrations/YYYYMMDDHHMMSS_daily_market_navigator/migration.sql`

**Step 1: schema.prisma のカラム変更**

`prisma/schema.prisma` の PortfolioOverallAnalysis モデルを以下に変更:

```prisma
model PortfolioOverallAnalysis {
  id     String @id @default(cuid())
  userId String @unique
  user   User   @relation(fields: [userId], references: [id], onDelete: Cascade)

  analyzedAt DateTime

  // 数値指標（既存）
  sectorConcentration   Decimal? @db.Decimal(5, 2)
  sectorCount           Int?
  totalValue            Decimal? @db.Decimal(15, 2)
  totalCost             Decimal? @db.Decimal(15, 2)
  unrealizedGain        Decimal? @db.Decimal(15, 2)
  unrealizedGainPercent Decimal? @db.Decimal(8, 2)
  portfolioVolatility   Decimal? @db.Decimal(8, 2)

  // 市況サマリー（新規）
  marketHeadline  String @db.Text
  marketTone      String              // bullish / bearish / neutral / sector_rotation
  marketKeyFactor String @db.Text

  // ポートフォリオ健康診断（新規）
  portfolioStatus  String             // healthy / caution / warning / critical
  portfolioSummary String @db.Text
  actionPlan       String @db.Text

  // Buddyメッセージ（新規）
  buddyMessage String @db.Text

  // 詳細データ（新規）
  stockHighlights  Json              // 注目銘柄の値動き詳細
  sectorHighlights Json              // セクター動向詳細

  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt

  @@index([userId])
  @@index([analyzedAt(sort: Desc)])
}
```

**Step 2: マイグレーションSQL作成**

手動でマイグレーションファイルを作成（シャドウDBエラー回避）:

```bash
mkdir -p prisma/migrations/$(date +%Y%m%d%H%M%S)_daily_market_navigator
```

`migration.sql` の内容:

```sql
-- 旧カラム削除
ALTER TABLE "PortfolioOverallAnalysis" DROP COLUMN IF EXISTS "overallSummary";
ALTER TABLE "PortfolioOverallAnalysis" DROP COLUMN IF EXISTS "overallStatus";
ALTER TABLE "PortfolioOverallAnalysis" DROP COLUMN IF EXISTS "overallStatusType";
ALTER TABLE "PortfolioOverallAnalysis" DROP COLUMN IF EXISTS "metricsAnalysis";
ALTER TABLE "PortfolioOverallAnalysis" DROP COLUMN IF EXISTS "actionSuggestions";
ALTER TABLE "PortfolioOverallAnalysis" DROP COLUMN IF EXISTS "watchlistSimulation";
ALTER TABLE "PortfolioOverallAnalysis" DROP COLUMN IF EXISTS "dailyCommentary";

-- 新カラム追加
ALTER TABLE "PortfolioOverallAnalysis" ADD COLUMN IF NOT EXISTS "marketHeadline" TEXT NOT NULL DEFAULT '';
ALTER TABLE "PortfolioOverallAnalysis" ADD COLUMN IF NOT EXISTS "marketTone" TEXT NOT NULL DEFAULT 'neutral';
ALTER TABLE "PortfolioOverallAnalysis" ADD COLUMN IF NOT EXISTS "marketKeyFactor" TEXT NOT NULL DEFAULT '';
ALTER TABLE "PortfolioOverallAnalysis" ADD COLUMN IF NOT EXISTS "portfolioStatus" TEXT NOT NULL DEFAULT 'caution';
ALTER TABLE "PortfolioOverallAnalysis" ADD COLUMN IF NOT EXISTS "portfolioSummary" TEXT NOT NULL DEFAULT '';
ALTER TABLE "PortfolioOverallAnalysis" ADD COLUMN IF NOT EXISTS "actionPlan" TEXT NOT NULL DEFAULT '';
ALTER TABLE "PortfolioOverallAnalysis" ADD COLUMN IF NOT EXISTS "buddyMessage" TEXT NOT NULL DEFAULT '';
ALTER TABLE "PortfolioOverallAnalysis" ADD COLUMN IF NOT EXISTS "stockHighlights" JSONB NOT NULL DEFAULT '[]';
ALTER TABLE "PortfolioOverallAnalysis" ADD COLUMN IF NOT EXISTS "sectorHighlights" JSONB NOT NULL DEFAULT '[]';
```

**Step 3: マイグレーション適用**

```bash
# 接続先確認（必須）
grep DATABASE_URL .env  # localhost であることを確認

npx prisma migrate resolve --applied YYYYMMDDHHMMSS_daily_market_navigator
npx prisma generate
```

**Step 4: ビルド確認**

```bash
npx prisma generate
```

**Step 5: コミット**

```bash
git add prisma/schema.prisma prisma/migrations/
git commit -m "feat: Daily Market Navigator のDBスキーマ変更"
```

---

## Task 2: 型定義とビジネスロジック改修

**Files:**
- Modify: `lib/portfolio-overall-analysis.ts` (全面改修)

**Step 1: 型定義を書き換え**

`lib/portfolio-overall-analysis.ts` の型定義部分（行17-119）を以下に置き換え:

```typescript
// === Daily Market Navigator 型定義 ===

export type MarketTone = "bullish" | "bearish" | "neutral" | "sector_rotation"
export type PortfolioStatus = "healthy" | "caution" | "warning" | "critical"

export interface StockHighlight {
  stockName: string
  tickerCode: string
  sector: string
  dailyChangeRate: number
  weekChangeRate: number
  analysis: string
}

export interface SectorHighlight {
  sector: string
  avgDailyChange: number
  trendDirection: "up" | "down" | "neutral"
  compositeScore: number | null
  commentary: string
}

export interface MarketNavigatorResult {
  hasAnalysis: boolean
  analyzedAt?: string
  isToday?: boolean
  market?: {
    headline: string
    tone: MarketTone
    keyFactor: string
  }
  portfolio?: {
    status: PortfolioStatus
    summary: string
    actionPlan: string
    metrics: {
      totalValue: number
      totalCost: number
      unrealizedGain: number
      unrealizedGainPercent: number
      portfolioVolatility: number | null
      sectorConcentration: number | null
      sectorCount: number | null
    }
  }
  buddyMessage?: string
  details?: {
    stockHighlights: StockHighlight[]
    sectorHighlights: SectorHighlight[]
  }
  portfolioCount?: number
  watchlistCount?: number
}
```

**Step 2: `getPortfolioOverallAnalysis()` 関数を改修（行540-621）**

既存の `getPortfolioOverallAnalysis()` を改修して新しいレスポンス構造を返すようにする。
DBから取得したデータを `MarketNavigatorResult` 形式に変換して返す。

**Step 3: `generateAnalysisWithAI()` 関数を改修（行251-535）**

- JSON Schema を新しい構造（marketHeadline, marketTone, marketKeyFactor, portfolioStatus, portfolioSummary, actionPlan, buddyMessage, stockHighlights, sectorHighlights）に変更
- 温度設定はそのまま 0.3

**Step 4: `generatePortfolioOverallAnalysis()` 関数を改修（行626-930）**

- 投資スタイル情報をDBから取得して渡す（既存のデータ取得フローに追加）
- AI生成結果のDB保存を新しいカラム構造に変更
- 不要になった `simulateWatchlistImpact()` を削除
- 不要になった型定義（MetricAnalysis, ActionSuggestion, WatchlistSimulation等）を削除

**Step 5: ビルド確認**

```bash
npx next build
```

**Step 6: コミット**

```bash
git add lib/portfolio-overall-analysis.ts
git commit -m "feat: Daily Market Navigator のビジネスロジック改修"
```

---

## Task 3: AIプロンプト改修

**Files:**
- Modify: `lib/prompts/portfolio-overall-analysis-prompt.ts` (全面改修)

**Step 1: プロンプトビルダーを書き換え**

`buildPortfolioOverallAnalysisPrompt()` の引数に `investmentStyle` を追加し、プロンプトを3ステップ思考ロジック（市場定義→ポートフォリオ照合→結論）に変更:

- **STEP 1（市場の流れ定義）**: 日経平均データ + セクタートレンドから地合いを判断
  - bullish/bearish/neutral/sector_rotation を選択させる
- **STEP 2（ポートフォリオ照合）**: 保有銘柄と市場の突き合わせ
  - 市場と逆行している銘柄の指摘
  - スタイル設定に対するリスク水準チェック
- **STEP 3（結論）**: 投資スタイルに基づくアクション断定
  - 「攻める日」か「守る日」か

プロンプトに含める指示:
- `marketHeadline`: 1文で市況を要約（ニュースの創作禁止）
- `marketKeyFactor`: 主要因を1-2文で説明
- `portfolioSummary`: ポートフォリオの状態を1-2文で説明
- `actionPlan`: 投資スタイル（{スタイル名}）に基づく具体的アクション1-2文
- `buddyMessage`: 親しみやすい口調で寄り添う1文（初心者向け）
- `stockHighlights`: 保有銘柄のうち注目すべきものだけ
- `sectorHighlights`: 保有銘柄に関連するセクターだけ

**Step 2: ビルド確認**

```bash
npx next build
```

**Step 3: コミット**

```bash
git add lib/prompts/portfolio-overall-analysis-prompt.ts
git commit -m "feat: Daily Market Navigator のAIプロンプト改修"
```

---

## Task 4: APIレスポンス改修

**Files:**
- Modify: `app/api/portfolio/overall-analysis/route.ts` (行13-67)

**Step 1: GET ハンドラーのレスポンス構造を変更**

`getPortfolioOverallAnalysis()` の戻り値が `MarketNavigatorResult` 型に変わっているので、そのまま返却。

**Step 2: POST ハンドラーの戻り値も同様に更新**

`generatePortfolioOverallAnalysis()` の戻り値を新しい構造で返却。

**Step 3: ビルド確認**

```bash
npx next build
```

**Step 4: コミット**

```bash
git add app/api/portfolio/overall-analysis/route.ts
git commit -m "feat: Daily Market Navigator のAPIレスポンス改修"
```

---

## Task 5: i18n 翻訳キー追加

**Files:**
- Modify: `locales/ja/dashboard.json`

**Step 1: 翻訳キーを追加/変更**

既存の `dailyCommentary` キーを削除し、新しい `marketNavigator` キーを追加:

```json
{
  "marketNavigator": {
    "title": "Daily Market Navigator",
    "portfolioSection": "あなたのポートフォリオ",
    "actionPlanLabel": "アクションプラン",
    "showDetails": "詳細を見る",
    "hideDetails": "閉じる",
    "stockHighlights": "注目銘柄",
    "sectorHighlights": "セクター動向",
    "tone": {
      "bullish": "リスクオン",
      "bearish": "リスクオフ",
      "neutral": "様子見",
      "sector_rotation": "セクターローテーション"
    },
    "status": {
      "healthy": "好調",
      "caution": "注意",
      "warning": "警戒",
      "critical": "要対応"
    },
    "noAnalysis": "分析はまだ生成されていません",
    "minStocksRequired": "3銘柄以上登録するとDaily Market Navigatorが利用できます",
    "dailyChange": "前日比",
    "weekChange": "週間"
  }
}
```

**Step 2: コミット**

```bash
git add locales/ja/dashboard.json
git commit -m "feat: Daily Market Navigator の翻訳キー追加"
```

---

## Task 6: UIコンポーネント作成

**Files:**
- Create: `app/dashboard/DailyMarketNavigator.tsx` (新規作成)
- Delete: `app/dashboard/PortfolioOverallAnalysis.tsx` (既存削除)

**Step 1: DailyMarketNavigator.tsx を作成**

統合カード型のUIコンポーネント:

- **Props**: `portfolioCount: number`, `watchlistCount: number`
- **State**: `data: MarketNavigatorResult | null`, `loading: boolean`, `showDetails: boolean`
- **データ取得**: `useEffect` で `GET /api/portfolio/overall-analysis` をfetch
- **表示条件**: 3銘柄以上で表示（既存と同じ）

**レンダリング構成**:
1. 市況セクション（ヘッドライン + トーンバッジ + 主要因）
2. ポートフォリオセクション（ステータスバッジ + サマリー + アクションプラン）
3. Buddyメッセージ（吹き出し風）
4. 折りたたみ詳細（銘柄ハイライト + セクターハイライト）

**バッジスタイル**:
- トーンバッジ: bullish=green, bearish=red, neutral=gray, sector_rotation=amber
- ステータスバッジ: healthy=green, caution=amber, warning=orange, critical=red

**スケルトン**: 3セクション分のスケルトン表示

**i18n**: `useTranslations('dashboard')` で翻訳キーを取得

**Step 2: PortfolioOverallAnalysis.tsx を削除**

既存のコンポーネントを削除。

**Step 3: ビルド確認**

```bash
npx next build
```

**Step 4: コミット**

```bash
git add app/dashboard/DailyMarketNavigator.tsx
git rm app/dashboard/PortfolioOverallAnalysis.tsx
git commit -m "feat: DailyMarketNavigator UIコンポーネント作成"
```

---

## Task 7: ダッシュボード配置変更

**Files:**
- Modify: `app/dashboard/page.tsx` (行63-226)

**Step 1: DailyMarketNavigator をインポートして最上部に配置**

`app/dashboard/page.tsx` に以下を追加:

1. `import DailyMarketNavigator from "./DailyMarketNavigator"` を追加
2. `<main>` 内のタイトル直後（投資スタイル表示の前）に `<DailyMarketNavigator>` を配置

配置位置: タイトル（行77）の直後、投資スタイルプロンプト（行80）の前。
Props: `portfolioCount={portfolioCount}`, `watchlistCount={watchlistCount}`

※ `portfolioCount` と `watchlistCount` は既存のServerComponent内で取得済み（ページ内のDB query で取得可能）。

**Step 2: portfolioCount と watchlistCount を取得するクエリを追加**

`page.tsx` の Server Component 部分で保有銘柄数とウォッチリスト数を取得するクエリを追加。

**Step 3: ビルド確認**

```bash
npx next build
```

**Step 4: コミット**

```bash
git add app/dashboard/page.tsx
git commit -m "feat: ダッシュボードにDailyMarketNavigatorを配置"
```

---

## Task 8: /portfolio-analysis ページ更新

**Files:**
- Modify: `app/portfolio-analysis/PortfolioAnalysisClient.tsx`

**Step 1: import を更新**

```typescript
// 旧
import PortfolioOverallAnalysis from "@/app/dashboard/PortfolioOverallAnalysis"
// 新
import DailyMarketNavigator from "@/app/dashboard/DailyMarketNavigator"
```

**Step 2: コンポーネント参照を更新**

```typescript
// 旧
<PortfolioOverallAnalysis portfolioCount={portfolioCount} watchlistCount={watchlistCount} />
// 新
<DailyMarketNavigator portfolioCount={portfolioCount} watchlistCount={watchlistCount} />
```

**Step 3: ページタイトルを更新**

「ポートフォリオ総評」→「Daily Market Navigator」

**Step 4: ビルド確認**

```bash
npx next build
```

**Step 5: コミット**

```bash
git add app/portfolio-analysis/PortfolioAnalysisClient.tsx
git commit -m "feat: /portfolio-analysis ページをDailyMarketNavigatorに更新"
```

---

## Task 9: 仕様書更新

**Files:**
- Modify: `docs/specs/portfolio-analysis.md`
- Modify: `docs/specs/dashboard.md`

**Step 1: portfolio-analysis.md を更新**

既存の「ポートフォリオ総評」仕様を「Daily Market Navigator」に書き換え。
新しいデータモデル、APIレスポンス、UI構成を反映。

**Step 2: dashboard.md を更新**

ダッシュボードのコンポーネント配置にDailyMarketNavigatorを追加。

**Step 3: コミット**

```bash
git add docs/specs/portfolio-analysis.md docs/specs/dashboard.md
git commit -m "docs: Daily Market Navigator の仕様書更新"
```

---

## Task 10: 動作確認

**Step 1: ローカルで POST API を呼び出してAI生成をテスト**

```bash
curl -X POST http://localhost:3000/api/portfolio/overall-analysis \
  -H "Cookie: <session_cookie>" \
  -H "Content-Type: application/json"
```

レスポンスが新しい構造（market, portfolio, buddyMessage, details）で返ることを確認。

**Step 2: GET API でキャッシュされた結果を確認**

```bash
curl http://localhost:3000/api/portfolio/overall-analysis \
  -H "Cookie: <session_cookie>"
```

**Step 3: ダッシュボード画面で表示確認**

- ブラウザで `/dashboard` を開く
- Daily Market Navigator カードが最上部に表示されることを確認
- トーンバッジ、ステータスバッジの色分けが正しいこと
- 詳細の折りたたみが動作すること
- スケルトン表示が正しいこと

**Step 4: /portfolio-analysis ページの表示確認**

- `/portfolio-analysis` で同じコンポーネントが表示されることを確認

**Step 5: 最終ビルド確認**

```bash
npx next build
```

**Step 6: 設計ファイル削除 & コミット**

```bash
rm docs/plans/2026-02-26-daily-market-navigator-design.md
rm docs/plans/2026-02-26-daily-market-navigator.md
git add -A
git commit -m "chore: Daily Market Navigator の設計ファイルを削除"
```
