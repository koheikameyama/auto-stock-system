/**
 * 市場予想ページ（GET /forecast）
 *
 * 最新のAI市場予想をカード表示 + 過去の予想一覧。
 */

import { Hono } from "hono";
import { html } from "hono/html";
import dayjs from "dayjs";
import { prisma } from "../../lib/prisma";
import { layout } from "../views/layout";
import { emptyState } from "../views/components";
import { COLORS } from "../views/styles";

type KeyFactor = { factor: string; impact: string };
type Risk = { risk: string; severity: string };
type NewsItem = { title: string; pubDate: string; source: string; url: string; category?: string };

const app = new Hono();

function outlookBadge(outlook: string) {
  const colors: Record<string, string> = {
    bullish: COLORS.profit,
    neutral: COLORS.warning,
    bearish: COLORS.loss,
  };
  const labels: Record<string, string> = {
    bullish: "強気",
    neutral: "中立",
    bearish: "弱気",
  };
  const color = colors[outlook] ?? COLORS.neutral;
  const label = labels[outlook] ?? outlook;
  return html`<span class="badge" style="background:${color}20;color:${color};font-size:14px;padding:4px 12px">${label}</span>`;
}

function confidenceStars(confidence: number) {
  return "★".repeat(confidence) + "☆".repeat(5 - confidence);
}

function impactColor(impact: string): string {
  if (impact === "positive") return COLORS.profit;
  if (impact === "negative") return COLORS.loss;
  return COLORS.textMuted;
}

function severityColor(severity: string): string {
  if (severity === "high") return COLORS.loss;
  if (severity === "medium") return COLORS.warning;
  return COLORS.textMuted;
}

app.get("/", async (c) => {
  const forecasts = await prisma.marketForecast.findMany({
    orderBy: { date: "desc" },
    take: 20,
  });

  const latest = forecasts[0];
  const history = forecasts.slice(1);

  const content = html`
    <p class="section-title">最新の市場予想</p>
    ${latest
      ? html`
          <div class="card">
            <div style="display:flex;align-items:center;gap:12px;margin-bottom:12px">
              ${outlookBadge(latest.outlook)}
              <span style="color:${COLORS.warning};font-size:16px">${confidenceStars(latest.confidence)}</span>
              <span style="color:${COLORS.textDim};font-size:12px">
                ${dayjs(latest.date).format("YYYY/M/D")} 予想
              </span>
            </div>

            <div style="font-size:14px;line-height:1.7;margin-bottom:16px">
              ${latest.summary}
            </div>

            ${(() => {
              const factors = (latest.keyFactors ?? []) as KeyFactor[];
              return factors.length > 0
                ? html`
                    <div style="margin-bottom:12px">
                      <div style="font-weight:600;font-size:13px;color:${COLORS.textMuted};margin-bottom:6px">注目ポイント</div>
                      ${factors.map(
                        (f) => html`
                          <div style="font-size:13px;margin-bottom:4px">
                            <span style="color:${impactColor(f.impact)}">●</span> ${f.factor}
                          </div>
                        `,
                      )}
                    </div>
                  `
                : "";
            })()}

            ${(() => {
              const risks = (latest.risks ?? []) as Risk[];
              return risks.length > 0
                ? html`
                    <div style="margin-bottom:12px">
                      <div style="font-weight:600;font-size:13px;color:${COLORS.textMuted};margin-bottom:6px">リスク要因</div>
                      ${risks.map(
                        (r) => html`
                          <div style="font-size:13px;margin-bottom:4px">
                            <span style="color:${severityColor(r.severity)}">▲</span> ${r.risk}
                            <span style="color:${COLORS.textDim};font-size:11px">(${r.severity})</span>
                          </div>
                        `,
                      )}
                    </div>
                  `
                : "";
            })()}

            ${latest.tradingHints
              ? html`
                  <div style="margin-bottom:12px">
                    <div style="font-weight:600;font-size:13px;color:${COLORS.textMuted};margin-bottom:6px">取引ヒント</div>
                    <div style="font-size:13px;color:${COLORS.text}">${latest.tradingHints}</div>
                  </div>
                `
              : ""}

            ${(() => {
              const news = (latest.newsHeadlines ?? []) as NewsItem[];
              return news.length > 0
                ? html`
                    <details style="margin-top:8px">
                      <summary style="font-size:13px;color:${COLORS.textMuted};cursor:pointer">
                        参照ニュース（${news.length}件）
                      </summary>
                      <div style="margin-top:8px">
                        ${news.map(
                          (n) => html`
                            <div style="font-size:12px;color:${COLORS.textDim};margin-bottom:4px">
                              ${n.url
                                ? html`<a href="${n.url}" target="_blank" rel="noopener" style="color:${COLORS.text}">${n.title}</a>`
                                : n.title}
                              ${n.source ? html` <span style="color:${COLORS.textDim}">(${n.source})</span>` : ""}
                            </div>
                          `,
                        )}
                      </div>
                    </details>
                  `
                : "";
            })()}

            <div style="margin-top:12px;font-size:11px;color:${COLORS.textDim}">
              生成: ${dayjs(latest.generatedAt).format("YYYY/M/D HH:mm")}
            </div>
          </div>
        `
      : html`<div class="card">${emptyState("市場予想はまだありません")}</div>`}

    <!-- 過去の予想 -->
    <p class="section-title">過去の予想</p>
    ${history.length > 0
      ? html`
          <div class="card" style="padding:0">
            ${history.map(
              (f, i) => html`
                <div style="padding:12px 16px;${i > 0 ? `border-top:1px solid ${COLORS.border};` : ""}display:flex;align-items:center;gap:12px">
                  <span style="color:${COLORS.textDim};font-size:12px;min-width:60px">
                    ${dayjs(f.date).format("M/D")}
                  </span>
                  ${outlookBadge(f.outlook)}
                  <span style="color:${COLORS.warning};font-size:12px">${confidenceStars(f.confidence)}</span>
                  <span style="font-size:12px;color:${COLORS.textMuted};flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">
                    ${f.summary.slice(0, 60)}${f.summary.length > 60 ? "..." : ""}
                  </span>
                </div>
              `,
            )}
          </div>
        `
      : html`<div class="card">${emptyState("過去の予想なし")}</div>`}
  `;

  return c.html(layout("市場予想", "/forecast", content));
});

export default app;
