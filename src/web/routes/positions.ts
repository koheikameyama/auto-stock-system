/**
 * ポジションページ（GET /positions）
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
  strategyBadge,
  emptyState,
  tt,
} from "../views/components";

const app = new Hono();

app.get("/", async (c) => {


  const [openPositions, closedPositions] = await Promise.all([
    prisma.tradingPosition.findMany({
      where: { status: "open" },
      include: { stock: true },
      orderBy: { createdAt: "desc" },
    }),
    prisma.tradingPosition.findMany({
      where: {
        status: "closed",
        exitedAt: { gte: dayjs().subtract(ROUTE_LOOKBACK_DAYS.POSITIONS_CLOSED, "day").toDate() },
      },
      include: { stock: true },
      orderBy: { exitedAt: "desc" },
      take: QUERY_LIMITS.POSITIONS_CLOSED,
    }),
  ]);

  const content = html`
    <p class="section-title">オープンポジション (${openPositions.length})</p>
    ${openPositions.length > 0
      ? html`
          <div class="card table-wrap">
            <table>
              <thead>
                <tr>
                  <th>銘柄</th>
                  <th>戦略</th>
                  <th>${tt("建値", "エントリー時の購入価格")}</th>
                  <th>数量</th>
                  <th>${tt("利確", "利益確定の目標価格（TP）")}</th>
                  <th>${tt("損切", "損失を限定する売却価格（SL）")}</th>
                </tr>
              </thead>
              <tbody>
                ${openPositions.map(
                  (p) => html`
                    <tr>
                      <td>${p.stock?.name ?? p.stockId}</td>
                      <td>${strategyBadge(p.strategy)}</td>
                      <td>¥${formatYen(Number(p.entryPrice))}</td>
                      <td>${p.quantity}</td>
                      <td>
                        ${p.takeProfitPrice
                          ? `¥${formatYen(Number(p.takeProfitPrice))}`
                          : "-"}
                      </td>
                      <td>
                        ${p.stopLossPrice
                          ? `¥${formatYen(Number(p.stopLossPrice))}`
                          : "-"}
                      </td>
                    </tr>
                  `,
                )}
              </tbody>
            </table>
          </div>
        `
      : html`<div class="card">${emptyState("オープンポジションなし")}</div>`}

    <p class="section-title">クローズ済み (直近7日)</p>
    ${closedPositions.length > 0
      ? html`
          <div class="card table-wrap">
            <table>
              <thead>
                <tr>
                  <th>銘柄</th>
                  <th>戦略</th>
                  <th>${tt("建値", "エントリー時の購入価格")}</th>
                  <th>${tt("決済", "ポジションを閉じた時の価格")}</th>
                  <th>${tt("損益", "実現損益（税引前）")}</th>
                </tr>
              </thead>
              <tbody>
                ${closedPositions.map(
                  (p) => html`
                    <tr>
                      <td>${p.stock?.name ?? p.stockId}</td>
                      <td>${strategyBadge(p.strategy)}</td>
                      <td>¥${formatYen(Number(p.entryPrice))}</td>
                      <td>
                        ${p.exitPrice
                          ? `¥${formatYen(Number(p.exitPrice))}`
                          : "-"}
                      </td>
                      <td>
                        ${p.realizedPnl
                          ? pnlText(Number(p.realizedPnl))
                          : "-"}
                      </td>
                    </tr>
                  `,
                )}
              </tbody>
            </table>
          </div>
        `
      : html`<div class="card">${emptyState("直近7日のクローズポジションなし")}</div>`}
  `;

  return c.html(layout("ポジション", "/positions", content));
});

export default app;
