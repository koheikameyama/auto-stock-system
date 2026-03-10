/**
 * スコアリング結果ページ（GET /scoring）
 *
 * 1. 日付別一覧: その日のScoringRecord一覧（スコア降順）
 * 2. 銘柄別履歴: 指定銘柄の直近30日間のスコアリング推移
 */

import { Hono } from "hono";
import { html, raw } from "hono/html";
import dayjs from "dayjs";
import { prisma } from "../../lib/prisma";
import { QUERY_LIMITS, ROUTE_LOOKBACK_DAYS } from "../../lib/constants";
import { getDaysAgoForDB } from "../../lib/date-utils";
import { layout } from "../views/layout";
import {
  rankBadge,
  formatYen,
  pnlPercent,
  emptyState,
  tt,
} from "../views/components";

const app = new Hono();

/** AI判定バッジ */
function aiDecisionBadge(decision: string | null) {
  if (decision === "go")
    return html`<span class="badge" style="background:#22c55e20;color:#22c55e">Go</span>`;
  if (decision === "no_go")
    return html`<span class="badge" style="background:#ef444420;color:#ef4444">No Go</span>`;
  return html`<span class="badge" style="background:#64748b20;color:#64748b">-</span>`;
}

/** 理由バッジ */
function reasonBadge(reason: string | null) {
  if (!reason) return html`<span style="color:#64748b">-</span>`;
  const map: Record<string, { label: string; color: string }> = {
    market_halted: { label: "市場停止", color: "#f59e0b" },
    ai_no_go: { label: "AI却下", color: "#ef4444" },
    below_threshold: { label: "閾値未達", color: "#94a3b8" },
    disqualified: { label: "即死", color: "#dc2626" },
  };
  const info = map[reason] ?? { label: reason, color: "#94a3b8" };
  return html`<span class="badge" style="background:${info.color}20;color:${info.color}">${info.label}</span>`;
}

/** 内訳行を生成 */
function breakdownDetail(
  technical: Record<string, number> | null,
  pattern: Record<string, number> | null,
  liquidity: Record<string, number> | null,
  fundamental: Record<string, number> | null,
) {
  const items: string[] = [];

  if (technical) {
    const parts = [];
    if (technical.rsi != null) parts.push(`RSI:${technical.rsi}`);
    if (technical.ma != null) parts.push(`MA:${technical.ma}`);
    if (technical.volume != null) parts.push(`出来高:${technical.volume}`);
    if (technical.volumeDirection != null) parts.push(`方向:${technical.volumeDirection}`);
    if (technical.weeklyTrendPenalty) parts.push(`週足減点:${technical.weeklyTrendPenalty}`);
    if (parts.length > 0) items.push(`技術: ${parts.join(" / ")}`);
  }
  if (pattern) {
    const parts = [];
    if (pattern.chart != null) parts.push(`チャート:${pattern.chart}`);
    if (pattern.candlestick != null) parts.push(`ローソク:${pattern.candlestick}`);
    if (parts.length > 0) items.push(`パターン: ${parts.join(" / ")}`);
  }
  if (liquidity) {
    const parts = [];
    if (liquidity.tradingValue != null) parts.push(`売買代金:${liquidity.tradingValue}`);
    if (liquidity.spreadProxy != null) parts.push(`スプレッド:${liquidity.spreadProxy}`);
    if (liquidity.stability != null) parts.push(`安定性:${liquidity.stability}`);
    if (parts.length > 0) items.push(`流動性: ${parts.join(" / ")}`);
  }
  if (fundamental) {
    const parts = [];
    if (fundamental.per != null) parts.push(`PER:${fundamental.per}`);
    if (fundamental.pbr != null) parts.push(`PBR:${fundamental.pbr}`);
    if (fundamental.profitability != null) parts.push(`収益性:${fundamental.profitability}`);
    if (fundamental.marketCap != null) parts.push(`時価総額:${fundamental.marketCap}`);
    if (parts.length > 0) items.push(`ファンダ: ${parts.join(" / ")}`);
  }

  return items.join("　|　");
}

// ---- 日付別一覧 ----
app.get("/", async (c) => {
  const dateParam = c.req.query("date");
  const targetDate = dateParam
    ? new Date(`${dateParam}T00:00:00Z`)
    : (() => {
        const now = new Date();
        const jstDate = new Date(now.getTime() + 9 * 60 * 60 * 1000);
        const y = jstDate.getUTCFullYear();
        const m = jstDate.getUTCMonth();
        const d = jstDate.getUTCDate();
        return new Date(Date.UTC(y, m, d));
      })();

  const dateStr = dayjs(targetDate).format("YYYY-MM-DD");
  const prevDate = dayjs(targetDate).subtract(1, "day").format("YYYY-MM-DD");
  const nextDate = dayjs(targetDate).add(1, "day").format("YYYY-MM-DD");

  const records = await prisma.scoringRecord.findMany({
    where: { date: targetDate },
    orderBy: { totalScore: "desc" },
  });

  // 銘柄名を一括取得（N+1回避）
  const tickerCodes = [...new Set(records.map((r) => r.tickerCode))];
  const stocks = await prisma.stock.findMany({
    where: { tickerCode: { in: tickerCodes } },
    select: { tickerCode: true, name: true },
  });
  const nameMap = new Map(stocks.map((s) => [s.tickerCode, s.name]));

  // サマリー集計
  const rankCounts: Record<string, number> = { S: 0, A: 0, B: 0, C: 0 };
  let disqualifiedCount = 0;
  for (const r of records) {
    rankCounts[r.rank] = (rankCounts[r.rank] ?? 0) + 1;
    if (r.isDisqualified) disqualifiedCount++;
  }

  const content = html`
    <!-- 日付ナビ -->
    <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:1rem">
      <a href="/scoring?date=${prevDate}" style="color:#3b82f6;text-decoration:none;font-size:1.2rem">&larr;</a>
      <span style="font-size:1rem;font-weight:600">${dateStr}</span>
      <a href="/scoring?date=${nextDate}" style="color:#3b82f6;text-decoration:none;font-size:1.2rem">&rarr;</a>
    </div>

    <!-- サマリー -->
    <div class="card" style="display:grid;grid-template-columns:repeat(3,1fr);gap:0.75rem;text-align:center;margin-bottom:1rem">
      <div>
        <div style="color:#94a3b8;font-size:0.75rem">スコアリング件数</div>
        <div style="font-size:1.2rem;font-weight:700">${records.length}</div>
      </div>
      <div>
        <div style="color:#94a3b8;font-size:0.75rem">ランク分布</div>
        <div style="font-size:0.85rem;font-weight:600">
          <span style="color:#f59e0b">S:${rankCounts.S ?? 0}</span>
          <span style="color:#3b82f6;margin-left:4px">A:${rankCounts.A ?? 0}</span>
          <span style="color:#22c55e;margin-left:4px">B:${rankCounts.B ?? 0}</span>
          <span style="color:#94a3b8;margin-left:4px">C:${rankCounts.C ?? 0}</span>
        </div>
      </div>
      <div>
        <div style="color:#94a3b8;font-size:0.75rem">即死棄却</div>
        <div style="font-size:1.2rem;font-weight:700;color:${disqualifiedCount > 0 ? "#ef4444" : "#64748b"}">${disqualifiedCount}</div>
      </div>
    </div>

    <!-- テーブル -->
    ${records.length > 0
      ? html`
          <div class="card table-wrap responsive-table">
            <table>
              <thead>
                <tr>
                  <th>銘柄</th>
                  <th>${tt("合計", "100点満点")}</th>
                  <th>ランク</th>
                  <th>${tt("技", "テクニカル(35)")}</th>
                  <th>${tt("パ", "パターン(25)")}</th>
                  <th>${tt("流", "流動性(25)")}</th>
                  <th>${tt("フ", "ファンダ(15)")}</th>
                  <th>AI</th>
                  <th>理由</th>
                </tr>
              </thead>
              <tbody>
                ${records.map((r) => {
                  const name = nameMap.get(r.tickerCode) ?? "";
                  const detail = breakdownDetail(
                    r.technicalBreakdown as Record<string, number> | null,
                    r.patternBreakdown as Record<string, number> | null,
                    r.liquidityBreakdown as Record<string, number> | null,
                    r.fundamentalBreakdown as Record<string, number> | null,
                  );
                  const rowStyle = r.isDisqualified ? "opacity:0.5" : "";
                  return html`
                    <tr class="expandable-row" style="${rowStyle};cursor:pointer" onclick="toggleDetail(this)">
                      <td>
                        <a href="/scoring/${r.tickerCode}" style="color:#3b82f6;text-decoration:none;font-weight:600">${r.tickerCode}</a>
                        <div style="font-size:0.7rem;color:#94a3b8">${name}</div>
                      </td>
                      <td style="font-weight:700">${r.totalScore}</td>
                      <td>${rankBadge(r.rank)}</td>
                      <td>${r.technicalScore}</td>
                      <td>${r.patternScore}</td>
                      <td>${r.liquidityScore}</td>
                      <td>${r.fundamentalScore}</td>
                      <td>${aiDecisionBadge(r.aiDecision)}</td>
                      <td>${reasonBadge(r.rejectionReason)}</td>
                    </tr>
                    <tr class="detail-row" style="display:none">
                      <td colspan="9" style="font-size:0.78rem;color:#94a3b8;padding:0.5rem 0.75rem;background:#0f172a">
                        ${detail || "内訳データなし"}
                        ${r.aiReasoning
                          ? html`<div style="margin-top:0.25rem;color:#cbd5e1">AI: ${r.aiReasoning}</div>`
                          : ""}
                        ${r.entryPrice
                          ? html`<div style="margin-top:0.25rem">エントリー: ¥${formatYen(Number(r.entryPrice))}${r.ghostProfitPct != null ? html` → ${pnlPercent(Number(r.ghostProfitPct))}` : ""}</div>`
                          : ""}
                      </td>
                    </tr>
                  `;
                })}
              </tbody>
            </table>
          </div>
        `
      : html`<div class="card">${emptyState("この日のスコアリングデータはありません")}</div>`}

    <script>
      function toggleDetail(row) {
        var detail = row.nextElementSibling;
        if (detail && detail.classList.contains('detail-row')) {
          detail.style.display = detail.style.display === 'none' ? '' : 'none';
        }
      }
    </script>
  `;

  return c.html(layout("スコアリング", "/scoring", content));
});

// ---- 銘柄別履歴 ----
app.get("/:tickerCode", async (c) => {
  const tickerCode = c.req.param("tickerCode");
  const since = getDaysAgoForDB(ROUTE_LOOKBACK_DAYS.SCORING_HISTORY);

  const [records, stock] = await Promise.all([
    prisma.scoringRecord.findMany({
      where: {
        tickerCode,
        date: { gte: since },
      },
      orderBy: { date: "desc" },
      take: QUERY_LIMITS.SCORING_RECORDS,
    }),
    prisma.stock.findFirst({
      where: { tickerCode },
      select: { tickerCode: true, name: true },
    }),
  ]);

  const stockName = stock?.name ?? tickerCode;

  const content = html`
    <div style="margin-bottom:1rem">
      <a href="/scoring" style="color:#3b82f6;text-decoration:none;font-size:0.85rem">&larr; 一覧に戻る</a>
    </div>

    <p class="section-title">${tickerCode} ${stockName}（直近${ROUTE_LOOKBACK_DAYS.SCORING_HISTORY}日）</p>

    ${records.length > 0
      ? html`
          <div class="card table-wrap responsive-table">
            <table>
              <thead>
                <tr>
                  <th>日付</th>
                  <th>合計</th>
                  <th>ランク</th>
                  <th>技</th>
                  <th>パ</th>
                  <th>流</th>
                  <th>フ</th>
                  <th>AI</th>
                  <th>騰落率</th>
                </tr>
              </thead>
              <tbody>
                ${records.map((r) => {
                  const rowStyle = r.isDisqualified ? "opacity:0.5" : "";
                  return html`
                    <tr style="${rowStyle}">
                      <td><a href="/scoring?date=${dayjs(r.date).format("YYYY-MM-DD")}" style="color:#3b82f6;text-decoration:none">${dayjs(r.date).format("M/D")}</a></td>
                      <td style="font-weight:700">${r.totalScore}</td>
                      <td>${rankBadge(r.rank)}</td>
                      <td>${r.technicalScore}</td>
                      <td>${r.patternScore}</td>
                      <td>${r.liquidityScore}</td>
                      <td>${r.fundamentalScore}</td>
                      <td>${aiDecisionBadge(r.aiDecision)}</td>
                      <td>${r.ghostProfitPct != null ? pnlPercent(Number(r.ghostProfitPct)) : html`<span style="color:#64748b">-</span>`}</td>
                    </tr>
                  `;
                })}
              </tbody>
            </table>
          </div>
        `
      : html`<div class="card">${emptyState("この銘柄のスコアリングデータはありません")}</div>`}
  `;

  return c.html(layout(`${tickerCode} スコア履歴`, "/scoring", content));
});

export default app;
