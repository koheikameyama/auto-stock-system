# 精度分析ページ Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** `/contrarian`（見送り分析）ページを `/accuracy`（精度分析）ページにリニューアルし、スコアリング精度の4象限分析を中心としたダッシュボードに変更する。

**Architecture:** 既存の `contrarian.ts` をベースに `accuracy.ts` へリネームし、セクション構成とデータソースを差し替える。バッチ処理側の変更はなく、表示層のみの変更。データは `TradingDailySummary.decisionAudit`（JSON）と `ScoringRecord` テーブルから取得。

**Tech Stack:** Hono（Web フレームワーク）、Prisma（ORM）、hono/html テンプレートリテラル

**Spec:** `docs/superpowers/specs/2026-03-15-accuracy-page-design.md`

---

## Chunk 1: ルーティング変更とページ骨格

### Task 1: ファイルリネームとルーティング更新

**Files:**
- Rename: `src/web/routes/contrarian.ts` → `src/web/routes/accuracy.ts`
- Modify: `src/web/app.ts:14,134`
- Modify: `src/web/views/layout.ts:38-41`
- Modify: `prisma/schema.prisma:164`

- [ ] **Step 1: ファイルリネーム**

```bash
git mv src/web/routes/contrarian.ts src/web/routes/accuracy.ts
```

- [ ] **Step 2: `app.ts` の import とルート登録を更新**

`src/web/app.ts` を修正:

```typescript
// 変更前
import contrarianRoute from "./routes/contrarian";
// 変更後
import accuracyRoute from "./routes/accuracy";

// 変更前
app.route("/contrarian", contrarianRoute);
// 変更後
app.route("/accuracy", accuracyRoute);
```

- [ ] **Step 3: ナビゲーションを更新**

`src/web/views/layout.ts` を修正:

```typescript
// 変更前
{
  path: "/contrarian",
  label: "見送り",
  icon: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 17l6-6 4 4 8-8"/><path d="M17 7h4v4"/></svg>`,
},
// 変更後
{
  path: "/accuracy",
  label: "精度",
  icon: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 22c5.523 0 10-4.477 10-10S17.523 2 12 2 2 6.477 2 12s4.477 10 10 10z"/><path d="M12 6v6l4 2"/></svg>`,
},
```

- [ ] **Step 4: schema.prisma のコメント更新**

`prisma/schema.prisma` の `rejectionReason` コメントを修正:

```prisma
// 変更前
rejectionReason String?                     // below_threshold / ai_no_go / disqualified
// 変更後
rejectionReason String?                     // below_threshold / ai_no_go / market_halted / disqualified
```

- [ ] **Step 5: ページタイトル更新**

`src/web/routes/accuracy.ts` の最終行を修正:

```typescript
// 変更前
return c.html(layout("見送り分析", "/contrarian", content));
// 変更後
return c.html(layout("精度分析", "/accuracy", content));
```

- [ ] **Step 6: ビルド確認**

```bash
npx tsc --noEmit
```

Expected: エラーなし

- [ ] **Step 7: コミット**

```bash
git add src/web/routes/accuracy.ts src/web/app.ts src/web/views/layout.ts prisma/schema.prisma
git commit -m "refactor: 見送り分析ページを精度分析ページにリネーム（/contrarian → /accuracy）"
```

---

## Chunk 2: データ取得の差し替え

### Task 2: 不要なクエリ削除と新規クエリ追加

**Files:**
- Modify: `src/web/routes/accuracy.ts`

このタスクでは `accuracy.ts` のルートハンドラ内のクエリ部分を差し替える。セクション1〜2は `decisionAudit` から取得し、セクション3〜5は `ScoringRecord` から取得する。

- [ ] **Step 1: 不要な import を削除**

`src/web/routes/accuracy.ts` 冒頭の import を整理:

```typescript
// 削除
import { CONTRARIAN, SCORING_ACCURACY, SCORING, getSectorGroup } from "../../lib/constants";
import { calculateContrarianBonus } from "../../core/contrarian-analyzer";

// 追加
import { CONTRARIAN, SCORING, getSectorGroup } from "../../lib/constants";
```

- [ ] **Step 2: DecisionAuditData 型定義を拡張**

既存の `DecisionAuditData` 型を、`decisionAudit` の完全な構造に置き換える:

```typescript
type DecisionAuditData = {
  scoringSummary: {
    totalScored: number;
    aiApproved: number;
    rankBreakdown: Record<string, number>;
  };
  marketHalt: {
    wasHalted: boolean;
    sentiment: string;
    nikkeiChange: number | null;
    totalScored: number;
    risingCount: number;
    risingRate: number | null;
  } | null;
  aiRejection: {
    total: number;
    correctlyRejected: number;
    falselyRejected: number;
    accuracy: number | null;
  };
  scoreThreshold: {
    total: number;
    rising: number;
    avgRisingPct: number | null;
  };
  confusionMatrix: {
    tp: number;
    fp: number;
    fn: number;
    tn: number;
    precision: number | null;
    recall: number | null;
    f1: number | null;
  };
  byRank: Record<string, {
    tp: number;
    fp: number;
    fn: number;
    tn: number;
    precision: number | null;
  }>;
  fpAnalysis: Array<{
    tickerCode: string;
    score: number;
    rank: string;
    profitPct: number;
    misjudgmentType: string;
  }>;
  overallVerdict: string;
};
```

- [ ] **Step 3: メインクエリを差し替え**

既存の `Promise.all` ブロック（`todayAssessment`, `todayCandidates`, `missedStocks`, `recentBonusRecords`, `allHaltedRecords`, `todaySummary`）を以下に置き換える:

```typescript
app.get("/", async (c) => {
  const since90 = getDaysAgoForDB(CONTRARIAN.LOOKBACK_DAYS);

  // 最新の decisionAudit 日付を取得
  // 注: 現行は MarketAssessment から latestDate を取得しているが、
  // 精度分析ページでは decisionAudit の存在する最新日を基準にする（意図的な変更）
  const latestSummary = await prisma.tradingDailySummary.findFirst({
    where: { decisionAudit: { not: null } },
    orderBy: { date: "desc" },
    select: { date: true, decisionAudit: true },
  });
  const latestDate = latestSummary?.date ?? getTodayForDB();
  const latestDateLabel = dayjs(latestDate).format("M月D日");
  const audit = latestSummary?.decisionAudit
    ? (latestSummary.decisionAudit as unknown as DecisionAuditData)
    : null;

  const [
    missedStocks,
    fpStocks,
    highScoreTrendRecords,
  ] = await Promise.all([
    // FN: 全棄却理由で上昇した銘柄（直近30件）
    prisma.scoringRecord.findMany({
      where: {
        rejectionReason: { not: null },
        ghostProfitPct: { gt: 0 },
        closingPrice: { not: null },
        entryPrice: { not: null },
      },
      orderBy: { date: "desc" },
      take: 30,
    }),
    // FP: 承認したが下落した銘柄（直近30件）
    // 注: rejectionReason IS NULL で承認済みを判定（aiDecision は使わない — spec準拠）
    prisma.scoringRecord.findMany({
      where: {
        rejectionReason: null,
        ghostProfitPct: { lt: 0 },
        closingPrice: { not: null },
      },
      orderBy: { date: "desc" },
      take: 30,
    }),
    // 傾向分析: Bランク以上で購入しなかった全銘柄
    // 注: 現行は nextDayProfitPct を select に含めていたが、翌日継続率を削除するため除外
    prisma.scoringRecord.findMany({
      where: {
        rejectionReason: { not: null },
        totalScore: { gte: SCORING.THRESHOLDS.B_RANK },
        closingPrice: { not: null },
        date: { gte: since90 },
      },
      select: {
        tickerCode: true,
        date: true,
        ghostProfitPct: true,
        totalScore: true,
        trendQualityScore: true,
        entryTimingScore: true,
        riskQualityScore: true,
        rank: true,
        closingPrice: true,
        rejectionReason: true,
      },
    }),
  ]);
```

- [ ] **Step 4: 不要な後続クエリ・集計ロジックを削除**

以下のブロックを全て削除:

1. `lowScoreWinners` クエリ（120-140行付近）
2. `lowScoreDates` / `marketAssessments` / `nikkeiChangeMap` / `baselineNikkeiAvg`（143-165行付近）
3. 逆行実績ランキング集計（`buckets` → `ranking`）（183-219行付近）
4. `lowScoreSectorBuckets` / `lowScoreSectorStats`（321-342行付近）
5. `lowScoreAvgTrend` / `lowScoreAvgEntry` / `lowScoreAvgRisk` / `lowScoreAvgPct`（344-359行付近）
6. `isNoTradeDay` 変数（180行付近）
7. `nextDayContinuationRate` / `nextDayContinued` / `winnersWithNextDay`（248-255行付近）

- [ ] **Step 5: 傾向分析のセクター取得を維持**

傾向分析用の `Stock` テーブルからのセクター取得ロジックは維持する。ただし `lowScoreWinners` の ticker を含めないよう修正:

```typescript
// 傾向分析用: Stock テーブルからセクター情報を一括取得（N+1 回避）
const trendTickers = [...new Set(highScoreTrendRecords.map((r) => r.tickerCode))];
const stocksForTrend = await prisma.stock.findMany({
  where: { tickerCode: { in: trendTickers } },
  select: { tickerCode: true, jpxSectorName: true, sector: true },
});
const sectorMap = new Map(stocksForTrend.map((s) => [s.tickerCode, s.jpxSectorName ?? s.sector]));
```

- [ ] **Step 6: 傾向分析の集計ロジックを簡素化**

`trendSummary` から `nextDayContinuationRate` / `nextDaySampleSize` を削除:

```typescript
const trendSummary = {
  analyzed: analyzedRecords.length,
  winners: winners.length,
  losers: losers.length,
  winnerAvgScore: avgOf(winners, "totalScore"),
  loserAvgScore: avgOf(losers, "totalScore"),
  winnerAvgTrend: avgOf(winners, "trendQualityScore"),
  loserAvgTrend: avgOf(losers, "trendQualityScore"),
  winnerAvgEntry: avgOf(winners, "entryTimingScore"),
  loserAvgEntry: avgOf(losers, "entryTimingScore"),
  winnerAvgRisk: avgOf(winners, "riskQualityScore"),
  loserAvgRisk: avgOf(losers, "riskQualityScore"),
  winnerAvgPct: avgPct(winners),
  loserAvgPct: avgPct(losers),
};
```

- [ ] **Step 7: ビルド確認**

```bash
npx tsc --noEmit
```

Expected: エラーなし

- [ ] **Step 8: コミット**

```bash
git add src/web/routes/accuracy.ts
git commit -m "refactor: 精度分析ページのデータ取得を4象限分析ベースに差し替え"
```

---

## Chunk 3: HTML テンプレートの差し替え

### Task 3: セクション1〜2 — 判断整合性サマリーと4象限詳細

**Files:**
- Modify: `src/web/routes/accuracy.ts`（`content` の HTML テンプレート部分）

- [ ] **Step 1: セクション0（判断整合性）を書き換え**

既存の「セクション0: 判断整合性」ブロックを以下に置き換える:

```typescript
const content = html`
  <!-- セクション1: 判断整合性サマリー -->
  <p class="section-title">${latestDateLabel}の判断整合性</p>
  ${audit == null
    ? html`<div class="card">
        ${emptyState("scoring-accuracy 実行後に更新されます（16:10 JST 以降）")}
      </div>`
    : html`
        <div class="card">
          <!-- Precision / Recall / F1 概要 -->
          <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:1rem;margin-bottom:1rem;padding-bottom:1rem;border-bottom:1px solid #1e293b">
            <div style="text-align:center">
              <p style="font-size:0.75rem;color:#94a3b8;margin:0 0 0.25rem">${tt("Precision", "承認銘柄のうち実際に上昇した割合")}</p>
              <p style="font-size:1.2rem;font-weight:700;margin:0;color:${audit.confusionMatrix.precision != null && audit.confusionMatrix.precision >= 60 ? "#22c55e" : audit.confusionMatrix.precision != null ? "#ef4444" : "#64748b"}">
                ${audit.confusionMatrix.precision != null ? `${audit.confusionMatrix.precision.toFixed(1)}%` : "-"}
              </p>
            </div>
            <div style="text-align:center">
              <p style="font-size:0.75rem;color:#94a3b8;margin:0 0 0.25rem">${tt("Recall", "上昇銘柄のうち承認できた割合")}</p>
              <p style="font-size:1.2rem;font-weight:700;margin:0;color:${audit.confusionMatrix.recall != null && audit.confusionMatrix.recall >= 50 ? "#22c55e" : audit.confusionMatrix.recall != null ? "#ef4444" : "#64748b"}">
                ${audit.confusionMatrix.recall != null ? `${audit.confusionMatrix.recall.toFixed(1)}%` : "-"}
              </p>
            </div>
            <div style="text-align:center">
              <p style="font-size:0.75rem;color:#94a3b8;margin:0 0 0.25rem">${tt("F1", "PrecisionとRecallの調和平均")}</p>
              <p style="font-size:1.2rem;font-weight:700;margin:0;color:${audit.confusionMatrix.f1 != null && audit.confusionMatrix.f1 >= 50 ? "#22c55e" : audit.confusionMatrix.f1 != null ? "#ef4444" : "#64748b"}">
                ${audit.confusionMatrix.f1 != null ? `${audit.confusionMatrix.f1.toFixed(1)}%` : "-"}
              </p>
            </div>
          </div>

          <!-- 既存の判断整合性 3カラム -->
          <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:1rem;margin-bottom:1rem">
            <!-- 市場停止判断 -->
            <div>
              <p style="font-size:0.75rem;color:#94a3b8;margin:0 0 0.25rem">市場停止判断</p>
              ${audit.marketHalt != null
                ? html`
                    <p style="font-size:0.85rem;font-weight:600;margin:0 0 0.25rem">
                      ${audit.marketHalt.wasHalted
                        ? html`<span style="color:#f59e0b">停止</span>`
                        : html`<span style="color:#22c55e">取引実行</span>`}
                      <span style="font-weight:400;color:#94a3b8;font-size:0.75rem">
                        (${audit.marketHalt.sentiment})
                      </span>
                    </p>
                    <p style="font-size:0.82rem;margin:0;color:${audit.marketHalt.risingRate != null && audit.marketHalt.risingRate > 50 ? "#f59e0b" : "#64748b"}">
                      上昇率 ${audit.marketHalt.risingRate ?? "-"}%
                      <span style="font-size:0.72rem;color:#94a3b8">
                        (${audit.marketHalt.risingCount}/${audit.marketHalt.totalScored}件)
                      </span>
                    </p>
                  `
                : html`<p style="font-size:0.82rem;color:#64748b;margin:0">市場評価データなし</p>`}
            </div>

            <!-- AI却下精度 -->
            <div>
              <p style="font-size:0.75rem;color:#94a3b8;margin:0 0 0.25rem">AI却下精度</p>
              <p style="font-size:1.1rem;font-weight:700;margin:0 0 0.25rem;color:${audit.aiRejection.accuracy != null && audit.aiRejection.accuracy >= 60 ? "#22c55e" : audit.aiRejection.accuracy != null ? "#ef4444" : "#64748b"}">
                ${audit.aiRejection.accuracy != null ? `${audit.aiRejection.accuracy}%` : "-"}
              </p>
              <p style="font-size:0.75rem;color:#94a3b8;margin:0">
                正確 ${audit.aiRejection.correctlyRejected}件 /
                誤却下 ${audit.aiRejection.falselyRejected}件
              </p>
            </div>

            <!-- スコアリング閾値 -->
            <div>
              <p style="font-size:0.75rem;color:#94a3b8;margin:0 0 0.25rem">閾値未達で上昇</p>
              <p style="font-size:1.1rem;font-weight:700;margin:0 0 0.25rem;color:${audit.scoreThreshold.rising > 5 ? "#f59e0b" : "#64748b"}">
                ${audit.scoreThreshold.rising}件
              </p>
              <p style="font-size:0.75rem;color:#94a3b8;margin:0">
                ${audit.scoreThreshold.total}件中
                ${audit.scoreThreshold.avgRisingPct != null
                  ? `/ 平均 +${audit.scoreThreshold.avgRisingPct.toFixed(2)}%`
                  : ""}
              </p>
            </div>
          </div>

          ${audit.overallVerdict
            ? html`<p style="font-size:0.82rem;color:#cbd5e1;background:#1e293b;padding:0.75rem;border-radius:6px;margin:0;line-height:1.6">
                ${audit.overallVerdict}
              </p>`
            : ""}
        </div>

        <!-- セクション2: 4象限詳細 -->
        <p class="section-title">4象限分析</p>

        <!-- 2a. 混同行列 -->
        <div class="card" style="display:grid;grid-template-columns:1fr 1fr;gap:0.5rem">
          <div style="text-align:center;padding:1rem;background:#22c55e15;border-radius:8px">
            <p style="font-size:0.72rem;color:#94a3b8;margin:0 0 0.25rem">TP（正しく承認）</p>
            <p style="font-size:1.5rem;font-weight:700;color:#22c55e;margin:0">${audit.confusionMatrix.tp}</p>
          </div>
          <div style="text-align:center;padding:1rem;background:#ef444415;border-radius:8px">
            <p style="font-size:0.72rem;color:#94a3b8;margin:0 0 0.25rem">FP（誤って承認）</p>
            <p style="font-size:1.5rem;font-weight:700;color:#ef4444;margin:0">${audit.confusionMatrix.fp}</p>
          </div>
          <div style="text-align:center;padding:1rem;background:#f59e0b15;border-radius:8px">
            <p style="font-size:0.72rem;color:#94a3b8;margin:0 0 0.25rem">FN（見逃し）</p>
            <p style="font-size:1.5rem;font-weight:700;color:#f59e0b;margin:0">${audit.confusionMatrix.fn}</p>
          </div>
          <div style="text-align:center;padding:1rem;background:#64748b15;border-radius:8px">
            <p style="font-size:0.72rem;color:#94a3b8;margin:0 0 0.25rem">TN（正しく棄却）</p>
            <p style="font-size:1.5rem;font-weight:700;color:#64748b;margin:0">${audit.confusionMatrix.tn}</p>
          </div>
        </div>

        <!-- 2b. ランク別精度 -->
        <div class="card table-wrap">
          <p style="font-size:0.8rem;color:#94a3b8;margin:0 0 0.75rem">ランク別精度</p>
          <table>
            <thead>
              <tr>
                <th>ランク</th>
                <th>TP</th>
                <th>FP</th>
                <th>FN</th>
                <th>TN</th>
                <th>${tt("Precision", "承認銘柄の正解率")}</th>
              </tr>
            </thead>
            <tbody>
              ${Object.entries(audit.byRank)
                .sort(([a], [b]) => a.localeCompare(b))
                .map(
                  ([rank, v]) => html`
                    <tr>
                      <td>${rankBadge(rank)}</td>
                      <td style="color:#22c55e">${v.tp}</td>
                      <td style="color:#ef4444">${v.fp}</td>
                      <td style="color:#f59e0b">${v.fn}</td>
                      <td style="color:#64748b">${v.tn}</td>
                      <td style="font-weight:600;color:${v.precision != null && v.precision >= 60 ? "#22c55e" : v.precision != null ? "#ef4444" : "#64748b"}">
                        ${v.precision != null ? `${v.precision.toFixed(0)}%` : "-"}
                      </td>
                    </tr>
                  `,
                )}
            </tbody>
          </table>
        </div>
      `}
`;
```

- [ ] **Step 2: 既存のセクション1（上昇確認銘柄）を削除**

「セクション1: 今日の上昇確認銘柄」の HTML ブロック全体を削除。

- [ ] **Step 3: ビルド確認**

```bash
npx tsc --noEmit
```

- [ ] **Step 4: コミット**

```bash
git add src/web/routes/accuracy.ts
git commit -m "feat: 精度分析ページにPrecision/Recall/F1と4象限分析セクションを追加"
```

### Task 4: セクション3 — FN分析（見逃し銘柄）

**Files:**
- Modify: `src/web/routes/accuracy.ts`

- [ ] **Step 1: 見逃し銘柄セクションを書き換え**

既存の「セクション2: 見逃し銘柄」ブロックを以下に置き換え。棄却理由バッジのヘルパー関数を追加:

```typescript
// 棄却理由バッジ（ファイル先頭のヘルパー関数群に追加）
function rejectionBadge(reason: string | null) {
  if (!reason) return html`<span style="color:#64748b">-</span>`;
  const map: Record<string, { label: string; bg: string; color: string }> = {
    ai_no_go: { label: "AI却下", bg: "#ef444420", color: "#ef4444" },
    below_threshold: { label: "スコア不足", bg: "#f59e0b20", color: "#f59e0b" },
    market_halted: { label: "市場停止", bg: "#fb923c20", color: "#fb923c" },
    disqualified: { label: "即死", bg: "#a855f720", color: "#a855f7" },
  };
  const info = map[reason] ?? { label: reason, bg: "#64748b20", color: "#64748b" };
  return html`<span class="badge" style="background:${info.bg};color:${info.color}">${info.label}</span>`;
}
```

ghostAnalysis のパースヘルパー関数も追加:

```typescript
// ghostAnalysis パースヘルパー（ファイル先頭のヘルパー関数群に追加）
function parseGhostAnalysis(raw: string | null): { analysis: string; recommendation: string; misjudgmentType: string | null } | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw);
    if (parsed.analysis) return { analysis: parsed.analysis, recommendation: parsed.recommendation ?? "", misjudgmentType: parsed.misjudgmentType ?? null };
  } catch {}
  return null;
}
```

セクション HTML:

```html
<!-- セクション3: FN分析（見逃し銘柄） -->
<p class="section-title">見逃し銘柄（棄却したが上昇）</p>
${missedStocks.length > 0
  ? html`
      <div class="card table-wrap">
        <table>
          <thead>
            <tr>
              <th>日付</th>
              <th>銘柄</th>
              <th>棄却理由</th>
              <th>スコア</th>
              <th>ランク</th>
              <th>騰落率</th>
            </tr>
          </thead>
          <tbody>
            ${missedStocks.map((r) => {
              const ghost = parseGhostAnalysis(r.ghostAnalysis);
              return html`
                <tr>
                  <td>${dayjs(r.date).format("M/D")}</td>
                  <td>${tickerLink(r.tickerCode)}</td>
                  <td>${rejectionBadge(r.rejectionReason)}</td>
                  <td>${r.totalScore}</td>
                  <td>${rankBadge(r.rank)}</td>
                  <td>
                    ${pnlPercent(Number(r.ghostProfitPct))}
                    ${ghost ? html`<span class="ghost-toggle" onclick="toggleGhost(this)" style="cursor:pointer;margin-left:4px">💡</span>` : ""}
                  </td>
                </tr>
                ${ghost ? html`
                  <tr class="ghost-detail" style="display:none">
                    <td colspan="6" style="background:#1e293b;padding:0.75rem;font-size:0.82rem;line-height:1.6">
                      <p style="margin:0 0 0.5rem;color:#cbd5e1">${ghost.analysis}</p>
                      ${ghost.recommendation ? html`<p style="margin:0;color:#94a3b8"><strong>改善提案:</strong> ${ghost.recommendation}</p>` : ""}
                    </td>
                  </tr>
                ` : ""}
              `;
            })}
          </tbody>
        </table>
      </div>
    `
  : html`<div class="card">
      ${emptyState("見逃し銘柄はまだありません")}
    </div>`}
```

- [ ] **Step 2: ビルド確認**

```bash
npx tsc --noEmit
```

- [ ] **Step 3: コミット**

```bash
git add src/web/routes/accuracy.ts
git commit -m "feat: FN分析セクションを全棄却理由対応に拡張（ghostAnalysisアコーディオン付き）"
```

### Task 5: セクション4 — FP分析（誤エントリー）

**Files:**
- Modify: `src/web/routes/accuracy.ts`

- [ ] **Step 1: FP分析セクションを追加**

FN分析セクションの直後に以下を追加:

```html
<!-- セクション4: FP分析（誤エントリー） -->
<p class="section-title">誤エントリー（承認したが下落）</p>
${fpStocks.length > 0
  ? html`
      <div class="card table-wrap">
        <table>
          <thead>
            <tr>
              <th>日付</th>
              <th>銘柄</th>
              <th>スコア</th>
              <th>ランク</th>
              <th>騰落率</th>
              <th>${tt("誤判断タイプ", "AI分析による誤判断の分類")}</th>
            </tr>
          </thead>
          <tbody>
            ${fpStocks.map((r) => {
              const ghost = parseGhostAnalysis(r.ghostAnalysis);
              return html`
                <tr>
                  <td>${dayjs(r.date).format("M/D")}</td>
                  <td>${tickerLink(r.tickerCode)}</td>
                  <td>${r.totalScore}</td>
                  <td>${rankBadge(r.rank)}</td>
                  <td>
                    ${pnlPercent(Number(r.ghostProfitPct))}
                    ${ghost ? html`<span class="ghost-toggle" onclick="toggleGhost(this)" style="cursor:pointer;margin-left:4px">💡</span>` : ""}
                  </td>
                  <td>
                    ${ghost?.misjudgmentType
                      ? html`<span class="badge" style="background:#ef444420;color:#ef4444">${ghost.misjudgmentType}</span>`
                      : html`<span style="color:#64748b">-</span>`}
                  </td>
                </tr>
                ${ghost ? html`
                  <tr class="ghost-detail" style="display:none">
                    <td colspan="6" style="background:#1e293b;padding:0.75rem;font-size:0.82rem;line-height:1.6">
                      <p style="margin:0 0 0.5rem;color:#cbd5e1">${ghost.analysis}</p>
                      ${ghost.recommendation ? html`<p style="margin:0;color:#94a3b8"><strong>改善提案:</strong> ${ghost.recommendation}</p>` : ""}
                    </td>
                  </tr>
                ` : ""}
              `;
            })}
          </tbody>
        </table>
      </div>
    `
  : html`<div class="card">
      ${emptyState("誤エントリーはまだありません")}
    </div>`}
```

- [ ] **Step 2: FP クエリに `ghostAnalysis` を select に追加**

Task 2 Step 3 の FP クエリを確認し、`ghostAnalysis` が取得できていることを確認。もし `select` で絞っている場合は `ghostAnalysis` を追加する。（`findMany` に `select` なし = 全カラム取得なので問題なし）

- [ ] **Step 3: ビルド確認**

```bash
npx tsc --noEmit
```

- [ ] **Step 4: ghostAnalysis アコーディオン用 JavaScript を追加**

ページ末尾の `<script>` ブロック内に以下を追加:

```javascript
// ghostAnalysis アコーディオン展開
function toggleGhost(el) {
  var row = el.closest('tr');
  var detail = row.nextElementSibling;
  if (detail && detail.classList.contains('ghost-detail')) {
    detail.style.display = detail.style.display === 'none' ? '' : 'none';
  }
}
```

- [ ] **Step 5: ビルド確認**

```bash
npx tsc --noEmit
```

- [ ] **Step 6: コミット**

```bash
git add src/web/routes/accuracy.ts
git commit -m "feat: FP分析（誤エントリー）セクションを追加（ghostAnalysisアコーディオン付き）"
```

### Task 6: セクション5 — 傾向分析の簡素化

**Files:**
- Modify: `src/web/routes/accuracy.ts`

- [ ] **Step 1: 不要なセクションを削除**

以下の HTML ブロックを削除:

1. 「逆行実績ランキング」セクション全体
2. 「逆行ボーナス適用銘柄」セクション全体
3. 傾向分析内の「翌日継続率」行
4. 「低スコア上昇銘柄」セクション全体（サマリーグリッド、セクター分布テーブル含む）

- [ ] **Step 2: 傾向分析のタイトルを更新**

```html
<!-- 変更前 -->
<p class="section-title">
  傾向分析（過去${CONTRARIAN.LOOKBACK_DAYS}日 / スコア80点以上・未購入）
</p>

<!-- 変更後 -->
<p class="section-title">
  傾向分析（過去${CONTRARIAN.LOOKBACK_DAYS}日 / Bランク以上・未購入）
</p>
```

- [ ] **Step 3: ビルド確認**

```bash
npx tsc --noEmit
```

- [ ] **Step 4: コミット**

```bash
git add src/web/routes/accuracy.ts
git commit -m "refactor: 傾向分析から逆行分析・低スコア分析セクションを削除"
```

---

## Chunk 4: 動作確認とクリーンアップ

### Task 7: 最終ビルドと動作確認

**Files:**
- Read: `src/web/routes/accuracy.ts`（最終確認）

- [ ] **Step 1: TypeScript ビルド確認**

```bash
npx tsc --noEmit
```

Expected: エラーなし

- [ ] **Step 2: ローカルサーバー起動確認**

```bash
npm run dev
```

ブラウザで `http://localhost:3000/accuracy` にアクセスし、ページが表示されることを確認。

- [ ] **Step 3: 旧URLが404になることを確認**

`http://localhost:3000/contrarian` にアクセスし、404になることを確認。

- [ ] **Step 4: 仕様書の機能一覧を更新**

設計書で指定されていないが、CLAUDE.md の仕様書テーブルに「精度分析」の行がない。必要に応じて `docs/specs/` に仕様を追加（スコープ外の場合はスキップ）。

- [ ] **Step 5: 設計ファイルを削除**

実装完了後、設計ファイルを削除:

```bash
rm docs/superpowers/specs/2026-03-15-accuracy-page-design.md
rm docs/superpowers/plans/2026-03-15-accuracy-page.md
```

- [ ] **Step 6: 最終コミット**

```bash
git add -A
git commit -m "feat: 見送り分析ページを精度分析ページにリニューアル"
```
