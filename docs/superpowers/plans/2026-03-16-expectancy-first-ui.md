# 期待値ファーストUI改修 Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** UI上の「勝率」表示を「期待値」に置き換え、プロダクトコンセプト「期待値ファースト」を一貫させる

**Architecture:** バックテスト画面・Slack通知・AI精度レポートの3箇所で、勝率列を期待値に置き換える。内部の `winRate` 計算は維持し、表示レイヤーのみ変更。Slack通知はインターフェースに `expectancy` フィールドを追加。

**Tech Stack:** TypeScript, Hono (SSR HTML), Slack Webhook

**Spec:** `docs/superpowers/specs/2026-03-16-expectancy-first-ui-design.md`

**重要な注意:** この改修は「表示レイヤーのみ」の変更。以下のデータは内部で維持し、削除しない:
- `detailDataJson` 内の `winRate`（モーダルデータのJSON）→ 表示しないが保持
- `inputStats.winRate`（モンテカルロAPIレスポンス）→ 表示しないが保持
- `metrics.winRate`（バックテスト計算結果）→ 期待値の算出に必要
- `BacktestDailyResult.winRate`（DBカラム）→ 既存データとの互換性

---

## Chunk 1: バックテスト画面

### Task 1: テーブルから勝率列を削除し期待値を先頭に移動

**Files:**
- Modify: `src/web/routes/backtest.ts:150-195`

- [ ] **Step 1: テーブルヘッダーから勝率列を削除し、期待値を条件の直後に移動**

`src/web/routes/backtest.ts` L152-159 のテーブルヘッダーを以下に変更:

```html
<tr>
  <th>${tt("条件", "パラメータ条件")}</th>
  <th>${tt("期待値", "1トレードあたりの期待収益率(%)。(勝率×平均利益)+(敗率×平均損失)")}</th>
  <th>${tt("PF", "プロフィットファクター。総利益÷総損失（1超が黒字）")}</th>
  <th>${tt("リターン", "期間中の総収益率")}</th>
  <th>${tt("RR", "リスクリワード比。平均利益÷平均損失（1.5以上が目標）")}</th>
  <th></th>
</tr>
```

- [ ] **Step 2: テーブルボディから勝率セルを削除し、期待値セルを条件の直後に移動**

L163-194 のテーブルボディを以下に変更（条件 → 期待値 → PF → リターン → RR → 詳細）:

```typescript
${sortedLatest.map(
  (r) => html`
    <tr>
      <td style="font-weight:${r.conditionKey === "baseline" ? "700" : "400"}">
        ${conditionTooltips[r.conditionKey]
          ? tt(r.conditionLabel, conditionTooltips[r.conditionKey])
          : r.conditionLabel}
      </td>
      <td>${(() => {
        const fr = r.fullResult as Record<string, unknown> | null;
        const exp = fr?.expectancy != null ? Number(fr.expectancy) : null;
        if (exp == null) return "N/A";
        const color = exp >= 1.0 ? "#22c55e" : exp >= 0.5 ? "#3b82f6" : exp >= 0 ? "#f59e0b" : "#ef4444";
        return html`<span style="color:${color}">${exp > 0 ? "+" : ""}${exp.toFixed(2)}%</span>`;
      })()}</td>
      <td>
        ${Number(r.profitFactor) >= 999
          ? "∞"
          : Number(r.profitFactor)}
      </td>
      <td>${pnlPercent(Number(r.totalReturnPct))}</td>
      <td>${(() => {
        const fr = r.fullResult as Record<string, unknown> | null;
        const rr = fr?.riskRewardRatio != null ? Number(fr.riskRewardRatio) : null;
        if (rr == null) return "N/A";
        const color = rr >= 1.5 ? "#22c55e" : rr >= 1.0 ? "#f59e0b" : "#ef4444";
        return html`<span style="color:${color}">${rr.toFixed(2)}</span>`;
      })()}</td>
      <td><span class="ticker-link" onclick="openBacktestDetail('${r.conditionKey}')">詳細</span></td>
    </tr>
  `,
)}
```

- [ ] **Step 3: 型チェック**

Run: `npx tsc --noEmit`
Expected: エラーなし

- [ ] **Step 4: コミット**

```bash
git add src/web/routes/backtest.ts
git commit -m "refactor: バックテストテーブルから勝率列を削除し期待値を先頭に移動"
```

### Task 2: 詳細モーダルの並び替え

**Files:**
- Modify: `src/web/routes/backtest.ts:381-404`

- [ ] **Step 1: モーダルの行を並び替え（勝率削除、期待値・RR比・PFを上位に）**

L381-404 の `modal.innerHTML` 部分を以下に変更:

```javascript
modal.innerHTML = '<div class="modal-overlay" onclick="if(event.target===this)closeBacktestDetail()">'
  + '<div class="modal-content">'
  + '<div class="modal-header"><div><h2>' + d.label + '</h2></div>'
  + '<button class="modal-close" onclick="closeBacktestDetail()">&times;</button></div>'
  + '<div class="modal-body">'
  + '<div class="modal-row"><span class="modal-row-label">初期資金</span><span>&yen;' + fmt(d.initialBudget) + '</span></div>'
  + '<div class="modal-row"><span class="modal-row-label">価格上限</span><span>&yen;' + fmt(d.maxPrice) + '</span></div>'
  + '<div class="modal-row"><span class="modal-row-label">期待値</span><span style="color:' + (d.expectancy == null ? 'inherit' : d.expectancy >= 1.0 ? '#22c55e' : d.expectancy >= 0.5 ? '#3b82f6' : d.expectancy >= 0 ? '#f59e0b' : '#ef4444') + '">' + (d.expectancy != null ? (d.expectancy > 0 ? '+' : '') + d.expectancy.toFixed(2) + '%' : 'N/A') + '</span></div>'
  + '<div class="modal-row"><span class="modal-row-label">RR比</span><span style="color:' + (d.riskRewardRatio >= 1.5 ? '#22c55e' : d.riskRewardRatio >= 1.0 ? '#f59e0b' : '#ef4444') + '">' + (d.riskRewardRatio != null ? d.riskRewardRatio.toFixed(2) : 'N/A') + '</span></div>'
  + '<div class="modal-row"><span class="modal-row-label">PF</span><span>' + (d.profitFactor >= 999 ? '&infin;' : d.profitFactor) + '</span></div>'
  + '<div class="modal-row"><span class="modal-row-label">勝敗</span><span>' + d.wins + '勝 ' + d.losses + '敗</span></div>'
  + '<div class="modal-row"><span class="modal-row-label">累計損益</span><span class="' + pnlCls + '">' + pnlSign + '&yen;' + fmt(Math.abs(d.totalPnl)) + '</span></div>'
  + '<div class="modal-row"><span class="modal-row-label">リターン</span><span class="' + retCls + '">' + retSign + d.totalReturnPct.toFixed(2) + '%</span></div>'
  + '<div class="modal-row"><span class="modal-row-label">平均利益</span><span style="color:#22c55e">' + (d.avgWinPct != null ? '+' + d.avgWinPct.toFixed(2) + '%' : 'N/A') + '</span></div>'
  + '<div class="modal-row"><span class="modal-row-label">平均損失</span><span style="color:#ef4444">' + (d.avgLossPct != null ? d.avgLossPct.toFixed(2) + '%' : 'N/A') + '</span></div>'
  + '<div class="modal-row"><span class="modal-row-label">最大DD</span><span style="color:#ef4444">-' + d.maxDrawdown + '%</span></div>'
  + '<div class="modal-row"><span class="modal-row-label">取引数</span><span>' + d.totalTrades + '</span></div>'
  + '<div class="modal-row"><span class="modal-row-label">シャープレシオ</span><span>' + (d.sharpeRatio != null ? d.sharpeRatio : 'N/A') + '</span></div>'
  + '<div class="modal-row"><span class="modal-row-label">平均保有日数</span><span>' + d.avgHoldingDays + '日</span></div>'
  + '<div class="modal-row"><span class="modal-row-label">対象銘柄数</span><span>' + d.tickerCount + '</span></div>'
  + '<div class="modal-row"><span class="modal-row-label">期間</span><span>' + d.periodStart + ' ~ ' + d.periodEnd + '</span></div>'
  + '<div class="modal-row"><span class="modal-row-label">実行時間</span><span>' + (d.executionTimeMs / 1000).toFixed(1) + '秒</span></div>'
  + '</div></div></div>';
```

変更ポイント:
- 「勝率」行を削除
- 「期待値」→「RR比」→「PF」→「勝敗」→「累計損益」→... の順

- [ ] **Step 2: 型チェック**

Run: `npx tsc --noEmit`
Expected: エラーなし

- [ ] **Step 3: コミット**

```bash
git add src/web/routes/backtest.ts
git commit -m "refactor: バックテスト詳細モーダルから勝率を削除し期待値を上位に移動"
```

### Task 3: モンテカルロ入力データ表示の変更

**Files:**
- Modify: `src/web/routes/backtest.ts:482-484`

- [ ] **Step 1: モンテカルロ入力データ表示を変更**

L483-484 を以下に変更:

```javascript
document.getElementById('mc-input-stats').textContent =
  '入力: 期待値' + s.expectancy.toFixed(2) + '% / 平均利益+' + s.avgWinPct.toFixed(2) + '% / 平均損失' + s.avgLossPct.toFixed(2) + '% / サンプル' + s.totalTrades + 'トレード';
```

- [ ] **Step 2: コミット**

```bash
git add src/web/routes/backtest.ts
git commit -m "refactor: モンテカルロ入力表示から勝率を削除し期待値を先頭に"
```

---

## Chunk 2: Slack通知

### Task 4: 日次レポートのSlack通知を変更

**Files:**
- Modify: `src/lib/slack.ts:198-242`

- [ ] **Step 1: 日次レポートのフィールドを「勝率」→「勝敗」に変更**

L208-212 の `winRate` 計算をまるごと削除し、L225-228 のフィールドを変更:

```typescript
export async function notifyDailyReport(data: {
  date: string;
  totalTrades: number;
  wins: number;
  losses: number;
  totalPnl: number;
  portfolioValue: number;
  cashBalance: number;
  aiReview?: string;
}): Promise<void> {
  const pnlEmoji = data.totalPnl >= 0 ? "📈" : "📉";

  await notifySlack({
    title: `📋 日次レポート: ${data.date}`,
    message: data.aiReview || "",
    color: data.totalPnl >= 0 ? "good" : "danger",
    fields: [
      {
        title: "損益",
        value: `${pnlEmoji} ¥${data.totalPnl.toLocaleString()}`,
        short: true,
      },
      {
        title: "勝敗",
        value: `${data.wins}勝${data.losses}敗`,
        short: true,
      },
      {
        title: "ポートフォリオ",
        value: `¥${data.portfolioValue.toLocaleString()}`,
        short: true,
      },
      {
        title: "現金残高",
        value: `¥${data.cashBalance.toLocaleString()}`,
        short: true,
      },
    ],
  });
}
```

- [ ] **Step 2: 型チェック**

Run: `npx tsc --noEmit`
Expected: エラーなし

- [ ] **Step 3: コミット**

```bash
git add src/lib/slack.ts
git commit -m "refactor: 日次レポートSlack通知のフィールドを勝率→勝敗に変更"
```

### Task 5: バックテスト結果通知のインターフェース拡張と表示変更

**Files:**
- Modify: `src/lib/slack.ts:256-369`
- Modify: `src/jobs/daily-backtest.ts:169-204`

- [ ] **Step 1: `notifyBacktestResult` のインターフェースに `expectancy` を追加**

L262-271 の `conditionResults` 配列に `expectancy` を追加:

```typescript
conditionResults: Array<{
  key: string;
  label: string;
  winRate: number;
  expectancy: number;
  profitFactor: number;
  totalReturnPct: number;
  totalPnl: number;
  totalTrades: number;
  maxDrawdown: number;
}>;
```

L272-289 の `paperTradeResult` に `newExpectancy` / `oldExpectancy` を追加:

```typescript
paperTradeResult?: {
  newLabel: string;
  oldLabel: string;
  newPf: number;
  newWinRate: number;
  newExpectancy: number;
  newReturnPct: number;
  newMaxDd: number;
  newTrades: number;
  oldPf: number;
  oldWinRate: number;
  oldExpectancy: number;
  oldReturnPct: number;
  oldMaxDd: number;
  oldTrades: number;
  elapsedDays: number;
  targetDays: number;
  judgment: "go" | "tracking" | "no_go";
  judgmentReasons: string[];
};
```

- [ ] **Step 2: ベースライン行の表示を `勝率XX%` → `期待値+XX%` に変更**

L296-298 を変更:

```typescript
const sign = baseline.totalReturnPct >= 0 ? "+" : "";
const expSign = baseline.expectancy >= 0 ? "+" : "";
lines.push(`*${baseline.label}*: 期待値${expSign}${baseline.expectancy.toFixed(2)}% | PF ${pf} | ${sign}${baseline.totalReturnPct}% | DD -${baseline.maxDrawdown}% | ${baseline.totalTrades}件`);
```

- [ ] **Step 3: ペーパートレード行の表示を変更**

L331-335 を変更:

```typescript
const fmtExp = (v: number) => (v >= 0 ? "+" : "") + v.toFixed(2);

lines.push(
  `${pt.newLabel}: PF ${fmtPf(pt.newPf)} | 期待値${fmtExp(pt.newExpectancy)}% | ${fmtSign(pt.newReturnPct)}${pt.newReturnPct}% | DD -${pt.newMaxDd}% | ${pt.newTrades}件`,
);
lines.push(
  `${pt.oldLabel}: PF ${fmtPf(pt.oldPf)} | 期待値${fmtExp(pt.oldExpectancy)}% | ${fmtSign(pt.oldReturnPct)}${pt.oldReturnPct}% | DD -${pt.oldMaxDd}% | ${pt.oldTrades}件`,
);
```

- [ ] **Step 4: `daily-backtest.ts` の呼び出し元に `expectancy` を追加**

`src/jobs/daily-backtest.ts` L174-182 の `conditionResults` マッピングに追加:

```typescript
conditionResults: result.conditionResults.map((cr) => ({
  key: cr.condition.key,
  label: cr.condition.label,
  winRate: cr.metrics.winRate,
  expectancy: cr.metrics.expectancy,
  profitFactor: cr.metrics.profitFactor,
  totalReturnPct: cr.metrics.totalReturnPct,
  totalPnl: cr.metrics.totalPnl,
  totalTrades: cr.metrics.totalTrades,
  maxDrawdown: cr.metrics.maxDrawdown,
})),
```

L184-202 の `paperTradeResult` にも追加:

```typescript
paperTradeResult: result.paperTradeResult
  ? {
      newLabel: "新(ATR1.0+トレール1.0)",
      oldLabel: "旧(固定SL+トレール2.0)",
      newPf: result.paperTradeResult.newBaseline.metrics.profitFactor,
      newWinRate: result.paperTradeResult.newBaseline.metrics.winRate,
      newExpectancy: result.paperTradeResult.newBaseline.metrics.expectancy,
      newReturnPct: result.paperTradeResult.newBaseline.metrics.totalReturnPct,
      newMaxDd: result.paperTradeResult.newBaseline.metrics.maxDrawdown,
      newTrades: result.paperTradeResult.newBaseline.metrics.totalTrades,
      oldPf: result.paperTradeResult.oldBaseline.metrics.profitFactor,
      oldWinRate: result.paperTradeResult.oldBaseline.metrics.winRate,
      oldExpectancy: result.paperTradeResult.oldBaseline.metrics.expectancy,
      oldReturnPct: result.paperTradeResult.oldBaseline.metrics.totalReturnPct,
      oldMaxDd: result.paperTradeResult.oldBaseline.metrics.maxDrawdown,
      oldTrades: result.paperTradeResult.oldBaseline.metrics.totalTrades,
      elapsedDays: result.paperTradeResult.elapsedTradingDays,
      targetDays: DAILY_BACKTEST.PAPER_TRADE.DURATION_TRADING_DAYS,
      judgment: result.paperTradeResult.judgment,
      judgmentReasons: result.paperTradeResult.judgmentReasons,
    }
  : undefined,
```

- [ ] **Step 5: 型チェック**

Run: `npx tsc --noEmit`
Expected: エラーなし

- [ ] **Step 6: コミット**

```bash
git add src/lib/slack.ts src/jobs/daily-backtest.ts
git commit -m "refactor: バックテストSlack通知を勝率→期待値に変更"
```

### Task 6: 週次レビューのSlack通知とAIプロンプトを変更

**Files:**
- Modify: `src/jobs/weekly-review.ts:89-90,139-152,217-219`

- [ ] **Step 1: AIプロンプトから「勝率」行を削除**

L139-152 のAIプロンプトを変更。L144 の `- 勝率: ${winRate}%` 行を削除:

```typescript
content: `週次の自動売買シミュレーション結果をレビューしてください。

【週間サマリー】
- 取引日数: ${tradingDays}日
- 取引数: ${totalTrades}件（${totalWins}勝 ${totalLosses}敗）
- 確定損益: ¥${totalPnl.toLocaleString()}
- ポートフォリオ時価: ¥${portfolioValue.toLocaleString()}
- 現金残高: ¥${cashBalance.toLocaleString()}

【クローズポジション詳細】
${positionSummary || "なし"}

各項目を50文字以内で簡潔に述べてください。`,
```

- [ ] **Step 2: Slackフィールドを「勝率」→「勝敗」に変更**

L217-219 を変更:

```typescript
{
  title: "勝敗",
  value: `${totalWins}勝${totalLosses}敗`,
  short: true,
},
```

- [ ] **Step 3: `winRate` 変数の削除**

Step 1-2 の変更後、`winRate` は AIプロンプトでもSlackフィールドでも参照されなくなる。
L89-90 の `winRate` 変数計算を削除:

```typescript
// 削除: const winRate = totalTrades > 0 ? Math.round((totalWins / totalTrades) * 100) : 0;
```

- [ ] **Step 4: 型チェック**

Run: `npx tsc --noEmit`
Expected: エラーなし

- [ ] **Step 5: コミット**

```bash
git add src/jobs/weekly-review.ts
git commit -m "refactor: 週次レビューから勝率を削除し勝敗表示に変更"
```

---

## Chunk 3: AI精度レポート

### Task 7: ランク別精度テーブルの勝率→期待値変更

**Files:**
- Modify: `src/web/routes/accuracy.ts:272-281,396-439`

- [ ] **Step 1: `rankDist` の型と集計ロジックに `pnlSum` を追加**

L273 を変更:

```typescript
const rankDist = { S: { wins: 0, total: 0, pnlSum: 0 }, A: { wins: 0, total: 0, pnlSum: 0 }, B: { wins: 0, total: 0, pnlSum: 0 } } as Record<string, { wins: number; total: number; pnlSum: number }>;
```

L274-281 のループを変更（全トレードの `ghostProfitPct` を `pnlSum` に加算）:

```typescript
for (const r of analyzedRecords) {
  const rank = r.rank as string;
  if (!rankDist[rank]) rankDist[rank] = { wins: 0, total: 0, pnlSum: 0 };
  rankDist[rank].total++;
  const pnl = r.ghostProfitPct != null ? Number(r.ghostProfitPct) : 0;
  rankDist[rank].pnlSum += pnl;
  if (pnl > 0) {
    rankDist[rank].wins++;
  }
}
```

- [ ] **Step 2: テーブルヘッダーを「勝率」→「期待値」に変更**

L409 を変更:

```html
<th>${tt("期待値", "1トレードあたりの平均損益率(%)")}</th>
```

- [ ] **Step 3: テーブルボディのセルを期待値表示に変更**

L417-431 を変更:

```typescript
([rank, v]) => {
  const rd = rankDist[rank];
  const exp = rd && rd.total > 0 ? rd.pnlSum / rd.total : null;
  return html`
    <tr>
      <td>${rankBadge(rank)}</td>
      <td style="color:#22c55e">${v.tp}</td>
      <td style="color:#ef4444">${v.fp}</td>
      <td style="color:#f59e0b">${v.fn}</td>
      <td style="color:#64748b">${v.tn}</td>
      <td style="font-weight:600;color:${v.precision != null && v.precision >= 60 ? "#22c55e" : v.precision != null ? "#ef4444" : "#64748b"}">
        ${v.precision != null ? `${v.precision.toFixed(0)}%` : "-"}
      </td>
      <td>${rd ? `${rd.total}回` : "-"}</td>
      <td style="font-weight:600;color:${exp != null ? (exp >= 1.0 ? "#22c55e" : exp >= 0 ? "#3b82f6" : "#ef4444") : "#64748b"}">
        ${exp != null ? `${exp > 0 ? "+" : ""}${exp.toFixed(2)}%` : "-"}
      </td>
    </tr>
  `;
},
```

- [ ] **Step 4: 型チェック**

Run: `npx tsc --noEmit`
Expected: エラーなし

- [ ] **Step 5: コミット**

```bash
git add src/web/routes/accuracy.ts
git commit -m "refactor: AI精度レポートのランク別テーブルを勝率→期待値に変更"
```

### Task 8: セクター別成績テーブルの勝率→期待値変更

**Files:**
- Modify: `src/web/routes/accuracy.ts:238-270,690-733`

- [ ] **Step 1: `SectorBucket` に `totalPnlSum` を追加**

L238-242 を変更:

```typescript
interface SectorBucket {
  wins: number;
  losses: number;
  profitSum: number;
  totalPnlSum: number;
}
```

L247-257 のループを変更（全トレードの `ghostProfitPct` を `totalPnlSum` に加算）:

```typescript
let b = sectorBuckets.get(sector);
if (!b) {
  b = { wins: 0, losses: 0, profitSum: 0, totalPnlSum: 0 };
  sectorBuckets.set(sector, b);
}
const pnl = r.ghostProfitPct != null ? Number(r.ghostProfitPct) : 0;
b.totalPnlSum += pnl;
if (pnl > 0) {
  b.wins++;
  b.profitSum += pnl;
} else {
  b.losses++;
}
```

- [ ] **Step 2: `sectorStats` のマッピングで `winRate` → `expectancy` に変更**

L259-270 を変更:

```typescript
const sectorStats = [...sectorBuckets.entries()]
  .map(([sector, b]) => ({
    sector,
    total: b.wins + b.losses,
    wins: b.wins,
    expectancy: b.wins + b.losses > 0
      ? b.totalPnlSum / (b.wins + b.losses)
      : null,
    avgProfitPct: b.wins > 0 ? b.profitSum / b.wins : null,
  }))
  .sort((a, b) => b.total - a.total)
  .slice(0, 10);
```

- [ ] **Step 3: セクターテーブルのヘッダーを変更**

L701 を変更:

```html
<th>期待値</th>
```

- [ ] **Step 4: セクターテーブルのボディを期待値表示に変更**

L706-730 を変更:

```typescript
${sectorStats.map((s) => {
  const lowSample = s.total < 10;
  const rowStyle = lowSample ? "color:#64748b" : "";
  return html`
    <tr style="${rowStyle}">
      <td style="font-weight:600">
        ${s.sector}${lowSample
          ? html`<span style="margin-left:4px;font-size:0.7rem;color:#94a3b8">(n=${s.total})</span>`
          : ""}
      </td>
      <td>${s.total}回</td>
      <td>${s.wins}回</td>
      <td
        style="font-weight:600;color:${lowSample ? "#64748b" : s.expectancy != null ? (s.expectancy >= 1.0 ? "#22c55e" : s.expectancy >= 0 ? "#3b82f6" : "#ef4444") : "#64748b"}"
      >
        ${s.expectancy != null ? `${s.expectancy > 0 ? "+" : ""}${s.expectancy.toFixed(2)}%` : "-"}${lowSample ? html`<span style="font-size:0.7rem"> ※</span>` : ""}
      </td>
      <td>
        ${s.avgProfitPct != null
          ? pnlPercent(s.avgProfitPct)
          : html`<span style="color:#64748b">-</span>`}
      </td>
    </tr>
  `;
})}
```

- [ ] **Step 5: 型チェック**

Run: `npx tsc --noEmit`
Expected: エラーなし

- [ ] **Step 6: コミット**

```bash
git add src/web/routes/accuracy.ts
git commit -m "refactor: AI精度レポートのセクター別テーブルを勝率→期待値に変更"
```

---

## Chunk 4: 検証

### Task 9: 全体型チェックとテスト

**Files:**
- None (verification only)

- [ ] **Step 1: TypeScript型チェック**

Run: `npx tsc --noEmit`
Expected: エラーなし

- [ ] **Step 2: 既存テストの実行**

Run: `npx vitest run`
Expected: 全テストパス（monte-carlo.test.ts 含む）

- [ ] **Step 3: 仕様書を更新**

`docs/specs/backtest.md` の以下の記載を更新:
- L116 `| 勝率 | wins / (wins + losses) |` → 削除（期待値は既にメトリクスに記載あり）
- L154 `勝率: 47.83%` → 削除
- L162 `ランク  取引数  勝率     平均損益` → 削除
- L349 `| winRate | Decimal(5,2) | 勝率 |` → そのまま（DBカラムは維持）
- L363 `1. **最新結果テーブル** — 4ティア横並び（勝率/PF/リターン/DD/取引数）` → `4ティア横並び（期待値/PF/リターン/RR）` に更新
- L365 `3. **勝率トレンド** — ティアごとの30日sparklineチャート` → 削除

- [ ] **Step 4: コミット**

```bash
git add docs/specs/backtest.md
git commit -m "docs: バックテスト仕様書を期待値ファーストに更新"
```
