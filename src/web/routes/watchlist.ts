/**
 * ウォッチリストページ（GET /watchlist）
 */

import { Hono } from "hono";
import { html } from "hono/html";
import { prisma } from "../../lib/prisma";
import { QUERY_LIMITS } from "../../lib/constants";
import { layout } from "../views/layout";
import { formatYen, tickerLink, emptyState, tt } from "../views/components";
import { getWatchlist } from "../../jobs/watchlist-builder";

const app = new Hono();

app.get("/", async (c) => {
  const watchlist = await getWatchlist();

  // ページネーション
  const perPage = QUERY_LIMITS.WATCHLIST_PER_PAGE;
  const totalPages = Math.max(1, Math.ceil(watchlist.length / perPage));
  const page = Math.min(Math.max(1, Number(c.req.query("page")) || 1), totalPages);
  const start = (page - 1) * perPage;
  const pagedWatchlist = watchlist.slice(start, start + perPage);

  const tickers = watchlist.map((w) => w.ticker);
  const stocks = tickers.length
    ? await prisma.stock.findMany({
        where: { tickerCode: { in: tickers } },
        select: { tickerCode: true, name: true },
      })
    : [];
  const nameMap = new Map(stocks.map((s) => [s.tickerCode, s.name]));

  const content = html`
    <p class="section-title">${tt("監視中のウォッチリスト", "毎朝8:00に構築。ブレイクアウト候補銘柄")} (${watchlist.length})</p>
    ${watchlist.length
      ? html`
          <div class="card table-wrap">
            <table>
              <thead>
                <tr>
                  <th>銘柄</th>
                  <th>${tt("現在価格", "リアルタイム価格")}</th>
                  <th>${tt("20日高値", "ブレイクアウト基準価格")}</th>
                  <th>${tt("乖離", "現在価格と20日高値の差（%）")}</th>
                </tr>
              </thead>
              <tbody>
                ${pagedWatchlist.map(
                  (w) => html`
                    <tr data-quote-row data-ticker="${w.ticker}" data-order-price="${w.high20}">
                      <td>${tickerLink(w.ticker, nameMap.get(w.ticker) ?? w.ticker)}</td>
                      <td data-quote-price><span class="quote-loading">...</span></td>
                      <td>¥${formatYen(w.high20)}</td>
                      <td data-quote-deviation><span class="quote-loading">...</span></td>
                    </tr>
                  `,
                )}
              </tbody>
            </table>
          </div>
          ${totalPages > 1
            ? html`
                <div class="pagination">
                  ${page > 1
                    ? html`<a href="/watchlist?page=${page - 1}" class="pagination-link">← 前へ</a>`
                    : html`<span class="pagination-link disabled">← 前へ</span>`}
                  <span class="pagination-info">${page} / ${totalPages}</span>
                  ${page < totalPages
                    ? html`<a href="/watchlist?page=${page + 1}" class="pagination-link">次へ →</a>`
                    : html`<span class="pagination-link disabled">次へ →</span>`}
                </div>
              `
            : ""}
        `
      : html`<div class="card">${emptyState("監視銘柄なし（8:00に構築）")}</div>`}
  `;

  return c.html(layout("ウォッチリスト", "/watchlist", content));
});

export default app;
