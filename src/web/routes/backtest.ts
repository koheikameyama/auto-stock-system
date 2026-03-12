/**
 * バックテスト結果ページ（GET /backtest）
 */

import { Hono } from "hono";
import { html } from "hono/html";
import dayjs from "dayjs";
import { prisma } from "../../lib/prisma";
import { DAILY_BACKTEST } from "../../lib/constants";
import { layout } from "../views/layout";
import {
  formatYen,
  pnlText,
  pnlPercent,
  emptyState,
  detailRow,
  sparklineChart,
  tt,
} from "../views/components";

const app = new Hono();

app.get("/", async (c) => {
  const trendDays = DAILY_BACKTEST.TREND_DAYS;
  const sinceDate = dayjs().subtract(trendDays, "day").toDate();

  const conditionCount = DAILY_BACKTEST.PARAMETER_CONDITIONS.length;

  const [latestResults, trendData] = await Promise.all([
    // 最新日の結果（全条件）
    prisma.backtestDailyResult.findMany({
      orderBy: { date: "desc" },
      take: conditionCount,
      distinct: ["conditionKey"],
    }),
    // トレンドデータ（過去30日、ベースラインのみ）
    prisma.backtestDailyResult.findMany({
      where: { date: { gte: sinceDate }, conditionKey: "baseline" },
      orderBy: { date: "asc" },
      select: {
        date: true,
        conditionKey: true,
        conditionLabel: true,
        winRate: true,
        totalReturnPct: true,
        profitFactor: true,
        totalPnl: true,
        totalTrades: true,
        maxDrawdown: true,
      },
    }),
  ]);

  const latestDate =
    latestResults.length > 0
      ? dayjs(latestResults[0].date).format("YYYY/M/D")
      : null;

  // 条件定義順にソート
  const conditionOrder = DAILY_BACKTEST.PARAMETER_CONDITIONS.map((c) => c.key);
  const sortedLatest = [...latestResults].sort(
    (a, b) =>
      conditionOrder.indexOf(a.conditionKey) -
      conditionOrder.indexOf(b.conditionKey),
  );

  const content = html`
    <!-- 最新結果 -->
    <p class="section-title">
      最新バックテスト結果${latestDate ? html` (${latestDate})` : ""}
    </p>
    ${sortedLatest.length > 0
      ? html`
          <div class="card table-wrap">
            <table>
              <thead>
                <tr>
                  <th>${tt("条件", "パラメータ条件")}</th>
                  <th>${tt("勝率", "取引のうち利益が出た割合")}</th>
                  <th>${tt("PF", "プロフィットファクター。総利益÷総損失（1超が黒字）")}</th>
                  <th>${tt("リターン", "期間中の総収益率")}</th>
                  <th>${tt("DD", "最大ドローダウン。期間中の最大下落率")}</th>
                  <th>取引</th>
                </tr>
              </thead>
              <tbody>
                ${sortedLatest.map(
                  (r) => html`
                    <tr>
                      <td style="font-weight:${r.conditionKey === "baseline" ? "700" : "400"}">
                        ${r.conditionLabel}
                      </td>
                      <td>${Number(r.winRate)}%</td>
                      <td>
                        ${Number(r.profitFactor) >= 999
                          ? "∞"
                          : Number(r.profitFactor)}
                      </td>
                      <td>${pnlPercent(Number(r.totalReturnPct))}</td>
                      <td style="color:#ef4444">
                        -${Number(r.maxDrawdown)}%
                      </td>
                      <td>${r.totalTrades}</td>
                    </tr>
                  `,
                )}
              </tbody>
            </table>
          </div>

          ${sortedLatest.map(
            (r) => html`
              <details style="margin:0 16px 8px">
                <summary>${r.conditionLabel} 詳細</summary>
                <div class="card" style="margin:8px 0">
                  ${detailRow("初期資金", `¥${formatYen(r.initialBudget)}`)}
                  ${detailRow("価格上限", `¥${formatYen(r.maxPrice)}`)}
                  ${detailRow("勝率", `${Number(r.winRate)}%`)}
                  ${detailRow("勝敗", `${r.wins}勝 ${r.losses}敗`)}
                  ${detailRow("累計損益", pnlText(r.totalPnl))}
                  ${detailRow(
                    "リターン",
                    pnlPercent(Number(r.totalReturnPct)),
                  )}
                  ${detailRow(
                    tt("PF", "プロフィットファクター。総利益÷総損失（1超が黒字）"),
                    `${Number(r.profitFactor) >= 999 ? "∞" : Number(r.profitFactor)}`,
                  )}
                  ${detailRow(tt("最大DD", "期間中の資産ピークからの最大下落率"), `-${Number(r.maxDrawdown)}%`)}
                  ${detailRow(
                    tt("シャープレシオ", "リスク調整後リターン。高いほど効率的な運用"),
                    r.sharpeRatio != null ? `${Number(r.sharpeRatio)}` : "N/A",
                  )}
                  ${detailRow(
                    "平均保有日数",
                    `${Number(r.avgHoldingDays)}日`,
                  )}
                  ${detailRow("対象銘柄数", `${r.tickerCount}`)}
                  ${detailRow("期間", `${r.periodStart} ~ ${r.periodEnd}`)}
                  ${detailRow(
                    "実行時間",
                    `${(r.executionTimeMs / 1000).toFixed(1)}秒`,
                  )}
                </div>
              </details>
            `,
          )}
        `
      : html`<div class="card">${emptyState("バックテスト結果なし")}</div>`}

    <!-- 勝率トレンド（ベースラインのみ） -->
    <p class="section-title">勝率トレンド（過去${trendDays}日・ベースライン）</p>
    ${trendData.length > 0
      ? html`
          ${(() => {
            const chartData = trendData.map((d) => ({
              label: dayjs(d.date).format("M/D"),
              value: Number(d.winRate),
            }));
            return html`
              <div class="chart-container">
                ${chartData.length >= 2
                  ? sparklineChart(chartData, 340, 80)
                  : emptyState("データ不足")}
              </div>
            `;
          })()}
        `
      : html`<div class="card">${emptyState("トレンドデータなし")}</div>`}

    <!-- 履歴テーブル（ベースラインのみ） -->
    <p class="section-title">バックテスト履歴（ベースライン）</p>
    ${trendData.length > 0
      ? html`
          <div class="card table-wrap">
            <table>
              <thead>
                <tr>
                  <th>日付</th>
                  <th>勝率</th>
                  <th>リターン</th>
                  <th>PF</th>
                  <th>取引</th>
                </tr>
              </thead>
              <tbody>
                ${[...trendData].reverse().map(
                  (r) => html`
                    <tr>
                      <td>${dayjs(r.date).format("M/D")}</td>
                      <td>${Number(r.winRate)}%</td>
                      <td>${pnlPercent(Number(r.totalReturnPct))}</td>
                      <td>
                        ${Number(r.profitFactor) >= 999
                          ? "∞"
                          : Number(r.profitFactor)}
                      </td>
                      <td>${r.totalTrades}</td>
                    </tr>
                  `,
                )}
              </tbody>
            </table>
          </div>
        `
      : html`<div class="card">${emptyState("履歴なし")}</div>`}
  `;

  return c.html(layout("バックテスト", "/backtest", content));
});

export default app;
