/**
 * ニュースページ（GET /news）
 *
 * DBに保存されたニュース記事を表示。
 */

import { Hono } from "hono";
import { html } from "hono/html";
import dayjs from "dayjs";
import { layout } from "../views/layout";
import { emptyState } from "../views/components";
import { COLORS } from "../views/styles";
import { getNewsFromDb } from "../../core/news-fetcher";

const app = new Hono();

function categoryLabel(category: string): string {
  if (category === "geopolitical") return "地政学";
  if (category === "sector") return "セクター";
  return "市場";
}

function categoryColor(category: string): string {
  if (category === "geopolitical") return COLORS.loss;
  if (category === "sector") return COLORS.accent;
  return COLORS.profit;
}

app.get("/", async (c) => {
  const headlines = await getNewsFromDb(48);

  const content = html`
    <p class="section-title">最新ニュース（${headlines.length}件）</p>
    ${headlines.length > 0
      ? html`
          <div class="card" style="padding:0">
            ${headlines.map(
              (a, i) => html`
                <div
                  style="padding:12px 16px;${i > 0 ? `border-top:1px solid ${COLORS.border};` : ""}"
                >
                  <div style="display:flex;align-items:flex-start;gap:8px">
                    <span
                      class="badge"
                      style="background:${categoryColor(a.category)}20;color:${categoryColor(a.category)};white-space:nowrap;flex-shrink:0;margin-top:2px"
                    >
                      ${categoryLabel(a.category)}
                    </span>
                    <a
                      href="${a.url}"
                      target="_blank"
                      rel="noopener"
                      style="font-size:13px;line-height:1.4;color:${COLORS.text}"
                    >
                      ${a.title}
                    </a>
                  </div>
                  <div style="margin-top:4px;font-size:11px;color:${COLORS.textDim};padding-left:0">
                    ${a.pubDate ? dayjs(a.pubDate).format("M/D HH:mm") : ""}
                    ${a.source ? html` &middot; ${a.source}` : ""}
                  </div>
                </div>
              `,
            )}
          </div>
        `
      : html`<div class="card">${emptyState("ニュースを取得できませんでした")}</div>`}

    <div style="margin-top:12px;font-size:11px;color:${COLORS.textDim};text-align:center">
      直近48時間のニュース（DBから取得）
    </div>
  `;

  return c.html(layout("ニュース", "/news", content));
});

export default app;
