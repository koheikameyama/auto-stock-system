/**
 * 注文ページ（GET /orders）
 */

import { Hono } from "hono";
import { html } from "hono/html";
import dayjs from "dayjs";
import { prisma } from "../../lib/prisma";
import { getStartOfDayJST } from "../../lib/date-utils";
import { QUERY_LIMITS } from "../../lib/constants";
import { layout } from "../views/layout";
import {
  formatYen,
  pnlText,
  strategyBadge,
  orderStatusBadge,
  tickerLink,
  emptyState,
} from "../views/components";

const app = new Hono();

app.get("/", async (c) => {


  const todayStart = getStartOfDayJST();

  const [pendingOrders, todayOrders] = await Promise.all([
    prisma.tradingOrder.findMany({
      where: { status: "pending" },
      include: { stock: true },
      orderBy: { createdAt: "desc" },
    }),
    prisma.tradingOrder.findMany({
      where: {
        status: { not: "pending" },
        updatedAt: { gte: todayStart },
      },
      include: { stock: true },
      orderBy: { updatedAt: "desc" },
      take: QUERY_LIMITS.ORDERS_TODAY,
    }),
  ]);

  const content = html`
    <p class="section-title">待機中の注文 (${pendingOrders.length})</p>
    ${pendingOrders.length > 0
      ? html`
          <div class="card table-wrap">
            <table>
              <thead>
                <tr>
                  <th>銘柄</th>
                  <th>売買</th>
                  <th>戦略</th>
                  <th>指値</th>
                  <th>数量</th>
                  <th>期限</th>
                </tr>
              </thead>
              <tbody>
                ${pendingOrders.map(
                  (o) => html`
                    <tr>
                      <td>${tickerLink(o.stock?.tickerCode ?? o.stockId, o.stock?.name ?? o.stockId)}</td>
                      <td>${o.side === "buy" ? "買" : "売"}</td>
                      <td>${strategyBadge(o.strategy)}</td>
                      <td>
                        ${o.limitPrice
                          ? `¥${formatYen(Number(o.limitPrice))}`
                          : o.stopPrice
                            ? `¥${formatYen(Number(o.stopPrice))}(逆)`
                            : "-"}
                      </td>
                      <td>${o.quantity}</td>
                      <td>
                        ${o.expiresAt
                          ? dayjs(o.expiresAt).format("M/D H:mm")
                          : "-"}
                      </td>
                    </tr>
                  `,
                )}
              </tbody>
            </table>
          </div>
        `
      : html`<div class="card">${emptyState("待機中の注文なし")}</div>`}

    <p class="section-title">本日の注文履歴</p>
    ${todayOrders.length > 0
      ? html`
          <div class="card table-wrap">
            <table>
              <thead>
                <tr>
                  <th>銘柄</th>
                  <th>売買</th>
                  <th>状態</th>
                  <th>約定</th>
                  <th>数量</th>
                </tr>
              </thead>
              <tbody>
                ${todayOrders.map(
                  (o) => html`
                    <tr>
                      <td>${tickerLink(o.stock?.tickerCode ?? o.stockId, o.stock?.name ?? o.stockId)}</td>
                      <td>${o.side === "buy" ? "買" : "売"}</td>
                      <td>${orderStatusBadge(o.status)}</td>
                      <td>
                        ${o.filledPrice
                          ? `¥${formatYen(Number(o.filledPrice))}`
                          : "-"}
                      </td>
                      <td>${o.quantity}</td>
                    </tr>
                  `,
                )}
              </tbody>
            </table>
          </div>
        `
      : html`<div class="card">${emptyState("本日の注文履歴なし")}</div>`}
  `;

  return c.html(layout("注文", "/orders", content));
});

export default app;
