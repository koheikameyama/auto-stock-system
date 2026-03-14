# データクリーンアップ Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Railway DB 500MB上限に対する予防的データクリーンアップジョブを新設し、全テーブルのリテンションポリシーを一元管理する。

**Architecture:** `src/lib/constants/retention.ts` でリテンション日数を定義し、`src/jobs/data-cleanup.ts` で各テーブルの `deleteMany` を実行する。既存の news-collector のクリーンアップもここに統合する。GA schedule cron で週1回実行。

**Tech Stack:** TypeScript, Prisma, Hono, Vitest, GitHub Actions

**Spec:** `docs/superpowers/specs/2026-03-14-data-cleanup-design.md`

---

## Chunk 1: Core Implementation

### Task 1: リテンション定数の作成

**Files:**
- Create: `src/lib/constants/retention.ts`
- Modify: `src/lib/constants/index.ts`

- [ ] **Step 1: 定数ファイルを作成**

```typescript
// src/lib/constants/retention.ts
/**
 * データリテンションポリシー（保持日数）
 *
 * 週次クリーンアップジョブ（data-cleanup）で使用。
 * 各テーブルの date < getDaysAgoForDB(DAYS) のデータを削除する。
 */
export const DATA_RETENTION = {
  SCORING_RECORD_DAYS: 365,
  BACKTEST_DAILY_RESULT_DAYS: 365,
  MARKET_ASSESSMENT_DAYS: 90,
  NEWS_ARTICLE_DAYS: 90,
  NEWS_ANALYSIS_DAYS: 90,
  TRADING_DAILY_SUMMARY_DAYS: 365,
  STOCK_STATUS_LOG_DAYS: 180,
  CORPORATE_EVENT_LOG_DAYS: 365,
  DEFENSIVE_EXIT_FOLLOWUP_DAYS: 90,
  UNFILLED_ORDER_FOLLOWUP_DAYS: 90,
} as const;
```

- [ ] **Step 2: バレルエクスポートに追加**

`src/lib/constants/index.ts` の末尾に追加:
```typescript
export * from "./retention";
```

- [ ] **Step 3: コミット**

```bash
git add src/lib/constants/retention.ts src/lib/constants/index.ts
git commit -m "feat: DATA_RETENTION定数を追加"
```

---

### Task 2: クリーンアップジョブのテスト作成

**Files:**
- Create: `src/jobs/__tests__/data-cleanup.test.ts`

- [ ] **Step 1: テストファイルを作成**

```typescript
// src/jobs/__tests__/data-cleanup.test.ts
import { describe, it, expect, vi, beforeEach } from "vitest";
import { DATA_RETENTION } from "../../lib/constants/retention";

// Prisma をモック（テーブルごとに個別のモック関数）
const mockScoringDelete = vi.fn().mockResolvedValue({ count: 0 });
const mockBacktestDelete = vi.fn().mockResolvedValue({ count: 0 });
const mockMarketDelete = vi.fn().mockResolvedValue({ count: 0 });
const mockArticleDelete = vi.fn().mockResolvedValue({ count: 0 });
const mockAnalysisDelete = vi.fn().mockResolvedValue({ count: 0 });
const mockSummaryDelete = vi.fn().mockResolvedValue({ count: 0 });
const mockStatusLogDelete = vi.fn().mockResolvedValue({ count: 0 });
const mockEventLogDelete = vi.fn().mockResolvedValue({ count: 0 });
const mockDefensiveDelete = vi.fn().mockResolvedValue({ count: 0 });
const mockUnfilledDelete = vi.fn().mockResolvedValue({ count: 0 });

vi.mock("../../lib/prisma", () => ({
  prisma: {
    scoringRecord: { deleteMany: mockScoringDelete },
    backtestDailyResult: { deleteMany: mockBacktestDelete },
    marketAssessment: { deleteMany: mockMarketDelete },
    newsArticle: { deleteMany: mockArticleDelete },
    newsAnalysis: { deleteMany: mockAnalysisDelete },
    tradingDailySummary: { deleteMany: mockSummaryDelete },
    stockStatusLog: { deleteMany: mockStatusLogDelete },
    corporateEventLog: { deleteMany: mockEventLogDelete },
    defensiveExitFollowUp: { deleteMany: mockDefensiveDelete },
    unfilledOrderFollowUp: { deleteMany: mockUnfilledDelete },
  },
}));

const allMocks = [
  mockScoringDelete, mockBacktestDelete, mockMarketDelete,
  mockArticleDelete, mockAnalysisDelete, mockSummaryDelete,
  mockStatusLogDelete, mockEventLogDelete, mockDefensiveDelete, mockUnfilledDelete,
];

// getDaysAgoForDB をモック
vi.mock("../../lib/date-utils", () => ({
  getDaysAgoForDB: vi.fn((days: number) => new Date(`2026-01-01T00:00:00Z`)),
}));

import { runDataCleanup } from "../data-cleanup";

describe("runDataCleanup", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("全テーブルに対して deleteMany を呼ぶ", async () => {
    const result = await runDataCleanup();

    for (const mock of allMocks) {
      expect(mock).toHaveBeenCalledTimes(1);
    }
    expect(result.totalDeleted).toBe(0);
    expect(Object.keys(result.deletedCounts)).toHaveLength(10);
  });

  it("各テーブルで正しい日付カラムと lt を使う", async () => {
    await runDataCleanup();

    // date カラムを使うテーブル
    expect(mockScoringDelete).toHaveBeenCalledWith({ where: { date: { lt: expect.any(Date) } } });
    expect(mockBacktestDelete).toHaveBeenCalledWith({ where: { date: { lt: expect.any(Date) } } });
    expect(mockMarketDelete).toHaveBeenCalledWith({ where: { date: { lt: expect.any(Date) } } });
    expect(mockAnalysisDelete).toHaveBeenCalledWith({ where: { date: { lt: expect.any(Date) } } });
    expect(mockSummaryDelete).toHaveBeenCalledWith({ where: { date: { lt: expect.any(Date) } } });

    // publishedAt カラム
    expect(mockArticleDelete).toHaveBeenCalledWith({ where: { publishedAt: { lt: expect.any(Date) } } });

    // createdAt カラム
    expect(mockStatusLogDelete).toHaveBeenCalledWith({ where: { createdAt: { lt: expect.any(Date) } } });

    // eventDate カラム
    expect(mockEventLogDelete).toHaveBeenCalledWith({ where: { eventDate: { lt: expect.any(Date) } } });
  });

  it("DefensiveExitFollowUp は isComplete=true のみ削除", async () => {
    await runDataCleanup();

    expect(mockDefensiveDelete).toHaveBeenCalledWith({
      where: {
        exitDate: { lt: expect.any(Date) },
        isComplete: true,
      },
    });
  });

  it("UnfilledOrderFollowUp は isComplete=true のみ削除", async () => {
    await runDataCleanup();

    expect(mockUnfilledDelete).toHaveBeenCalledWith({
      where: {
        orderDate: { lt: expect.any(Date) },
        isComplete: true,
      },
    });
  });

  it("削除件数を正しく集計する", async () => {
    mockScoringDelete.mockResolvedValueOnce({ count: 100 });
    mockBacktestDelete.mockResolvedValueOnce({ count: 50 });
    mockMarketDelete.mockResolvedValueOnce({ count: 10 });
    mockArticleDelete.mockResolvedValueOnce({ count: 200 });
    mockAnalysisDelete.mockResolvedValueOnce({ count: 5 });
    mockSummaryDelete.mockResolvedValueOnce({ count: 0 });
    mockStatusLogDelete.mockResolvedValueOnce({ count: 3 });
    mockEventLogDelete.mockResolvedValueOnce({ count: 1 });
    mockDefensiveDelete.mockResolvedValueOnce({ count: 2 });
    mockUnfilledDelete.mockResolvedValueOnce({ count: 0 });

    const result = await runDataCleanup();

    expect(result.totalDeleted).toBe(371);
    expect(result.deletedCounts.scoringRecord).toBe(100);
    expect(result.deletedCounts.newsArticle).toBe(200);
  });
});
```

- [ ] **Step 2: テスト実行で失敗を確認**

Run: `npx vitest run src/jobs/__tests__/data-cleanup.test.ts`
Expected: FAIL — `runDataCleanup` が存在しない

- [ ] **Step 3: コミット**

```bash
git add src/jobs/__tests__/data-cleanup.test.ts
git commit -m "test: data-cleanupテストを追加"
```

---

### Task 3: クリーンアップジョブの実装

**Files:**
- Create: `src/jobs/data-cleanup.ts`

- [ ] **Step 1: ジョブファイルを作成**

```typescript
// src/jobs/data-cleanup.ts
/**
 * データクリーンアップジョブ（週次）
 *
 * 各テーブルのリテンション期間超過データを削除する。
 * GA schedule cron で毎週日曜に実行。
 */

import { prisma } from "../lib/prisma";
import { getDaysAgoForDB } from "../lib/date-utils";
import { DATA_RETENTION } from "../lib/constants";

interface DataCleanupResult {
  deletedCounts: Record<string, number>;
  totalDeleted: number;
}

export async function runDataCleanup(): Promise<DataCleanupResult> {
  console.log("=== データクリーンアップ開始 ===");

  const deletedCounts: Record<string, number> = {};

  // ScoringRecord (365日)
  const scoringResult = await prisma.scoringRecord.deleteMany({
    where: { date: { lt: getDaysAgoForDB(DATA_RETENTION.SCORING_RECORD_DAYS) } },
  });
  deletedCounts.scoringRecord = scoringResult.count;

  // BacktestDailyResult (365日)
  const backtestResult = await prisma.backtestDailyResult.deleteMany({
    where: { date: { lt: getDaysAgoForDB(DATA_RETENTION.BACKTEST_DAILY_RESULT_DAYS) } },
  });
  deletedCounts.backtestDailyResult = backtestResult.count;

  // MarketAssessment (90日)
  const marketResult = await prisma.marketAssessment.deleteMany({
    where: { date: { lt: getDaysAgoForDB(DATA_RETENTION.MARKET_ASSESSMENT_DAYS) } },
  });
  deletedCounts.marketAssessment = marketResult.count;

  // NewsArticle (90日)
  const articleResult = await prisma.newsArticle.deleteMany({
    where: { publishedAt: { lt: getDaysAgoForDB(DATA_RETENTION.NEWS_ARTICLE_DAYS) } },
  });
  deletedCounts.newsArticle = articleResult.count;

  // NewsAnalysis (90日)
  const analysisResult = await prisma.newsAnalysis.deleteMany({
    where: { date: { lt: getDaysAgoForDB(DATA_RETENTION.NEWS_ANALYSIS_DAYS) } },
  });
  deletedCounts.newsAnalysis = analysisResult.count;

  // TradingDailySummary (365日)
  const summaryResult = await prisma.tradingDailySummary.deleteMany({
    where: { date: { lt: getDaysAgoForDB(DATA_RETENTION.TRADING_DAILY_SUMMARY_DAYS) } },
  });
  deletedCounts.tradingDailySummary = summaryResult.count;

  // StockStatusLog (180日)
  const statusLogResult = await prisma.stockStatusLog.deleteMany({
    where: { createdAt: { lt: getDaysAgoForDB(DATA_RETENTION.STOCK_STATUS_LOG_DAYS) } },
  });
  deletedCounts.stockStatusLog = statusLogResult.count;

  // CorporateEventLog (365日)
  const eventLogResult = await prisma.corporateEventLog.deleteMany({
    where: { eventDate: { lt: getDaysAgoForDB(DATA_RETENTION.CORPORATE_EVENT_LOG_DAYS) } },
  });
  deletedCounts.corporateEventLog = eventLogResult.count;

  // DefensiveExitFollowUp (90日, isComplete=true のみ)
  const defensiveResult = await prisma.defensiveExitFollowUp.deleteMany({
    where: {
      exitDate: { lt: getDaysAgoForDB(DATA_RETENTION.DEFENSIVE_EXIT_FOLLOWUP_DAYS) },
      isComplete: true,
    },
  });
  deletedCounts.defensiveExitFollowUp = defensiveResult.count;

  // UnfilledOrderFollowUp (90日, isComplete=true のみ)
  const unfilledResult = await prisma.unfilledOrderFollowUp.deleteMany({
    where: {
      orderDate: { lt: getDaysAgoForDB(DATA_RETENTION.UNFILLED_ORDER_FOLLOWUP_DAYS) },
      isComplete: true,
    },
  });
  deletedCounts.unfilledOrderFollowUp = unfilledResult.count;

  const totalDeleted = Object.values(deletedCounts).reduce((a, b) => a + b, 0);

  // ログ出力
  for (const [table, count] of Object.entries(deletedCounts)) {
    if (count > 0) {
      console.log(`  ${table}: ${count}件削除`);
    }
  }
  console.log(`  合計: ${totalDeleted}件削除`);
  console.log("=== データクリーンアップ終了 ===");

  return { deletedCounts, totalDeleted };
}

// main エクスポート（cron.ts から呼び出し用）
export async function main(): Promise<void> {
  await runDataCleanup();
}

// 直接実行サポート
const isDirectRun = process.argv[1]?.includes("data-cleanup");
if (isDirectRun) {
  main()
    .catch((error) => {
      console.error("データクリーンアップエラー:", error);
      process.exit(1);
    })
    .finally(() => prisma.$disconnect());
}
```

- [ ] **Step 2: テスト実行で成功を確認**

Run: `npx vitest run src/jobs/__tests__/data-cleanup.test.ts`
Expected: ALL PASS

- [ ] **Step 3: コミット**

```bash
git add src/jobs/data-cleanup.ts
git commit -m "feat: data-cleanupジョブを実装"
```

---

### Task 4: cronルート登録 & package.json

**Files:**
- Modify: `src/web/routes/cron.ts`
- Modify: `package.json`

- [ ] **Step 1: cronルートにインポートとジョブ定義を追加**

`src/web/routes/cron.ts` に以下を追加:

import追加（L26の `runUnfilledOrderFollowup` の後）:
```typescript
import { main as runDataCleanup } from "../../jobs/data-cleanup";
```

JOBSオブジェクト追加（L50の `"jpx-delisting-sync"` の後）:
```typescript
  "data-cleanup": { fn: runDataCleanup, requiresMarketDay: false },
```

- [ ] **Step 2: package.json にスクリプト追加**

`package.json` の `"scripts"` セクション、`"daily-backtest"` の後に追加:
```json
"data-cleanup": "tsx src/jobs/data-cleanup.ts",
```

- [ ] **Step 3: コミット**

```bash
git add src/web/routes/cron.ts package.json
git commit -m "feat: data-cleanupをcronルートとnpmスクリプトに登録"
```

---

## Chunk 2: Migration & Workflow

### Task 5: news-collectorからクリーンアップ処理を削除

**Files:**
- Modify: `src/jobs/news-collector.ts`
- Modify: `src/lib/constants/news.ts`

- [ ] **Step 1: news-collector.ts のクリーンアップセクションを削除**

`src/jobs/news-collector.ts` の以下を削除（L275-292）:

```typescript
  // 3. クリーンアップ
  console.log("[3/3] クリーンアップ中...");

  const articleRetentionDate = getDaysAgoForDB(NEWS_RETENTION.ARTICLE_DAYS);
  const deletedArticles = await prisma.newsArticle.deleteMany({
    where: { publishedAt: { lt: articleRetentionDate } },
  });
  if (deletedArticles.count > 0) {
    console.log(`  古い記事削除: ${deletedArticles.count}件`);
  }

  const analysisRetentionDate = getDaysAgoForDB(NEWS_RETENTION.ANALYSIS_DAYS);
  const deletedAnalyses = await prisma.newsAnalysis.deleteMany({
    where: { date: { lt: analysisRetentionDate } },
  });
  if (deletedAnalyses.count > 0) {
    console.log(`  古い分析結果削除: ${deletedAnalyses.count}件`);
  }
```

- [ ] **Step 2: news-collector.ts のimportから NEWS_RETENTION を削除**

L14 を変更:
```typescript
// Before:
import { OPENAI_CONFIG, NEWS_RETENTION, NEWS_AI_MAX_ARTICLES, DELISTING_NEWS_KEYWORDS } from "../lib/constants";

// After:
import { OPENAI_CONFIG, NEWS_AI_MAX_ARTICLES, DELISTING_NEWS_KEYWORDS } from "../lib/constants";
```

注意: `getDaysAgoForDB` は L96 の重複チェックで引き続き使用するため、import を残すこと。

- [ ] **Step 3: news-collector.ts のコメントとステップ番号を更新**

L1-8 のコメント更新:
```typescript
/**
 * ニュースコレクター（8:00 JST / 平日）
 *
 * 1. 3ソースからニュースをフェッチ・重複排除・DB保存・AI分析
 * 2. 上場廃止ニュース検知
 * 3. Slack通知
 */
```

`main()` 内のステップ番号ログも更新:
- `"[1/3]"` → `"[1/2]"`（ニュース収集・AI分析）
- `"[2/3]"` → `"[2/2]"`（上場廃止ニュース検知）
- `"[3/3]"` は削除済み

- [ ] **Step 4: news.ts から NEWS_RETENTION を削除**

`src/lib/constants/news.ts` の以下を削除（L22-26）:
```typescript
// 保持期間
export const NEWS_RETENTION = {
  ARTICLE_DAYS: 90,
  ANALYSIS_DAYS: 90,
} as const;
```

- [ ] **Step 5: コミット**

```bash
git add src/jobs/news-collector.ts src/lib/constants/news.ts
git commit -m "refactor: news-collectorのクリーンアップをdata-cleanupに移管"
```

---

### Task 6: GA Workflow作成

**Files:**
- Create: `.github/workflows/scheduled_data-cleanup.yml`

- [ ] **Step 1: ワークフローファイルを作成**

```yaml
name: "[Scheduled] Data Cleanup"

on:
  schedule:
    # 日曜 18:00 UTC = 月曜 3:00 JST
    - cron: "0 18 * * 0"
  workflow_dispatch:

concurrency:
  group: data-cleanup
  cancel-in-progress: false

env:
  DATABASE_URL: ${{ secrets.DATABASE_URL }}

jobs:
  data-cleanup:
    runs-on: ubuntu-latest
    timeout-minutes: 10
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version-file: ".tool-versions"
          cache: "npm"
      - run: npm ci
      - run: npx prisma generate
      - run: npm run data-cleanup

  notify-success:
    needs: data-cleanup
    if: success()
    runs-on: ubuntu-latest
    steps:
      - name: Notify Slack on success
        uses: rtCamp/action-slack-notify@v2
        env:
          SLACK_WEBHOOK: ${{ secrets.SLACK_WEBHOOK_URL }}
          SLACK_TITLE: "Data Cleanup 完了"
          SLACK_MESSAGE: "週次データクリーンアップが正常に完了しました"
          SLACK_COLOR: good
          SLACK_FOOTER: "Stock Buddy"

  notify-failure:
    needs: data-cleanup
    if: failure()
    runs-on: ubuntu-latest
    steps:
      - name: Notify Slack on failure
        uses: rtCamp/action-slack-notify@v2
        env:
          SLACK_WEBHOOK: ${{ secrets.SLACK_WEBHOOK_URL }}
          SLACK_TITLE: "Data Cleanup 失敗"
          SLACK_MESSAGE: |
            週次データクリーンアップが失敗しました。
            詳細はGitHub Actionsログを確認してください。
          SLACK_COLOR: danger
          SLACK_FOOTER: "Stock Buddy"
```

- [ ] **Step 2: コミット**

```bash
git add .github/workflows/scheduled_data-cleanup.yml
git commit -m "ci: 週次データクリーンアップworkflowを追加"
```

---

### Task 7: ドキュメント更新

**Files:**
- Modify: `docs/specs/batch-processing.md`

- [ ] **Step 1: batch-processing.md にdata-cleanupを追記**

ワークフロー一覧テーブルに追加:

| ジョブ名 | スケジュール | 実行方式 | 内容 |
|---------|------------|---------|------|
| data-cleanup | 毎週日曜 18:00 UTC | GA schedule cron | 全テーブルのリテンション期間超過データ削除 |

- [ ] **Step 2: News Collectorセクションのクリーンアップ記述を削除**

既存のNews Collectorセクションから「クリーンアップ: 90日超の古い記事・分析結果を削除」の記述と、データフロー内の `Delete: 90日超の NewsArticle, NewsAnalysis` を削除し、data-cleanupに移管済みであることを記載。

- [ ] **Step 3: コミット**

```bash
git add docs/specs/batch-processing.md
git commit -m "docs: batch-processing.mdにdata-cleanupを追記"
```

---

### Task 8: 最終確認

- [ ] **Step 1: 全テスト実行**

Run: `npx vitest run`
Expected: ALL PASS

- [ ] **Step 2: TypeScript型チェック**

Run: `npx tsc --noEmit`
Expected: エラーなし

- [ ] **Step 3: 設計ファイルを削除**

`docs/superpowers/` ディレクトリを削除（coding-standards.md ルール: 実装された設計ファイルはコミット前に削除）:

```bash
rm -rf docs/superpowers/
git add -A docs/superpowers/
git commit -m "chore: 実装済み設計ファイルを削除"
```
