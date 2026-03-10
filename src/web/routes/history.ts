/**
 * 履歴ページ（GET /history）
 */

import { Hono } from "hono";
import { html } from "hono/html";
import dayjs from "dayjs";
import { prisma } from "../../lib/prisma";
import { QUERY_LIMITS, ROUTE_LOOKBACK_DAYS } from "../../lib/constants";
import { layout } from "../views/layout";
import {
  formatYen,
  pnlText,
  emptyState,
  sparklineChart,
  tt,
} from "../views/components";

const app = new Hono();

app.get("/", async (c) => {


  const thirtyDaysAgo = dayjs().subtract(ROUTE_LOOKBACK_DAYS.HISTORY, "day").toDate();

  const summaries = await prisma.tradingDailySummary.findMany({
    where: { date: { gte: thirtyDaysAgo } },
    orderBy: { date: "desc" },
    take: QUERY_LIMITS.HISTORY_SUMMARIES,
  });

  // Cumulative PnL chart data (oldest first)
  const chartData = [...summaries].reverse().reduce<
    { label: string; value: number }[]
  >((acc, s) => {
    const prev = acc.length > 0 ? acc[acc.length - 1].value : 0;
    acc.push({
      label: dayjs(s.date).format("M/D"),
      value: prev + Number(s.totalPnl),
    });
    return acc;
  }, []);

  const content = html`
    <!-- PnL Chart -->
    <p class="section-title">累積損益（過去30日）</p>
    <div class="chart-container">
      ${chartData.length >= 2
        ? sparklineChart(chartData, 340, 140)
        : emptyState("データ不足")}
    </div>

    <!-- Daily Summary Table -->
    <p class="section-title">日次サマリー</p>
    ${summaries.length > 0
      ? html`
          <div class="card table-wrap responsive-table">
            <table>
              <thead>
                <tr>
                  <th>日付</th>
                  <th>取引</th>
                  <th>${tt("勝敗", "W=勝ち（利確）/ L=負け（損切）")}</th>
                  <th>${tt("損益", "当日の実現損益合計")}</th>
                  <th>${tt("PF値", "プロフィットファクター。総利益÷総損失")}</th>
                </tr>
              </thead>
              <tbody>
                ${summaries.map(
                  (s) => html`
                    <tr>
                      <td data-label="日付">
                        ${new Date(s.date).toLocaleDateString("ja-JP", {
                          month: "numeric",
                          day: "numeric",
                        })}
                      </td>
                      <td data-label="取引">${s.totalTrades}</td>
                      <td data-label="勝敗">
                        ${s.totalTrades > 0
                          ? `${s.wins}W ${s.losses}L`
                          : "-"}
                      </td>
                      <td data-label="損益">${pnlText(Number(s.totalPnl))}</td>
                      <td data-label="PF値">¥${formatYen(Number(s.portfolioValue))}</td>
                    </tr>
                    ${s.aiReview
                      ? html`
                          <tr class="review-row">
                            <td
                              colspan="5"
                              style="font-size:11px;color:#64748b;padding:4px 8px 12px"
                            >
                              ${s.aiReview}
                            </td>
                          </tr>
                        `
                      : ""}
                  `,
                )}
              </tbody>
            </table>
          </div>
        `
      : html`<div class="card">${emptyState("日次サマリーなし")}</div>`}
  `;

  return c.html(layout("履歴", "/history", content));
});

export default app;
