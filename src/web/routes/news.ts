/**
 * ニュース＆セクタートレンドページ（GET /news）
 */

import { Hono } from "hono";
import { html } from "hono/html";
import dayjs from "dayjs";
import { prisma } from "../../lib/prisma";
import { layout } from "../views/layout";
import { emptyState, detailRow } from "../views/components";
import { COLORS } from "../views/styles";

type SectorImpact = {
  sector: string;
  impact: "positive" | "negative" | "neutral";
  summary: string;
};

const app = new Hono();

app.get("/", async (c) => {
  const [analysis, articles] = await Promise.all([
    prisma.newsAnalysis.findFirst({ orderBy: { date: "desc" } }),
    prisma.newsArticle.findMany({
      orderBy: { publishedAt: "desc" },
      take: 30,
    }),
  ]);

  const sectorImpacts = (analysis?.sectorImpacts ?? []) as SectorImpact[];

  function impactColor(impact: string): string {
    if (impact === "positive") return COLORS.profit;
    if (impact === "negative") return COLORS.loss;
    return COLORS.neutral;
  }

  function impactLabel(impact: string): string {
    if (impact === "positive") return "ポジ";
    if (impact === "negative") return "ネガ";
    return "中立";
  }

  function categoryLabel(category: string): string {
    if (category === "geopolitical") return "地政学";
    if (category === "sector") return "セクター";
    if (category === "stock") return "個別株";
    return category;
  }

  function categoryColor(category: string): string {
    if (category === "geopolitical") return COLORS.loss;
    if (category === "sector") return COLORS.accent;
    return COLORS.profit;
  }

  function marketImpactLabel(impact: string): string {
    if (impact === "positive") return "ポジティブ";
    if (impact === "negative") return "ネガティブ";
    return "中立";
  }

  const content = html`
    <!-- セクタートレンド -->
    <p class="section-title">セクタートレンド</p>
    ${analysis
      ? html`
          <div class="card">
            ${detailRow(
              "分析日",
              dayjs(analysis.date).format("YYYY/M/D"),
            )}
            ${detailRow(
              "地政学リスク",
              html`<span style="color:${analysis.geopoliticalRiskLevel >= 4 ? COLORS.loss : analysis.geopoliticalRiskLevel >= 3 ? COLORS.warning : COLORS.profit}">
                Lv.${analysis.geopoliticalRiskLevel} / 5
              </span>`,
            )}
            ${detailRow(
              "市場影響",
              html`<span style="color:${impactColor(analysis.marketImpact ?? "")}">
                ${marketImpactLabel(analysis.marketImpact ?? "")}
              </span>`,
            )}
          </div>

          ${sectorImpacts.length > 0
            ? html`
                <div class="card table-wrap">
                  <table>
                    <thead>
                      <tr>
                        <th>セクター</th>
                        <th>評価</th>
                        <th>概要</th>
                      </tr>
                    </thead>
                    <tbody>
                      ${sectorImpacts.map(
                        (s) => html`
                          <tr>
                            <td style="white-space:nowrap;font-weight:500">${s.sector}</td>
                            <td>
                              <span
                                class="badge"
                                style="background:${impactColor(s.impact)}20;color:${impactColor(s.impact)};white-space:nowrap"
                              >
                                ${impactLabel(s.impact)}
                              </span>
                            </td>
                            <td style="font-size:12px;color:#94a3b8">${s.summary}</td>
                          </tr>
                        `,
                      )}
                    </tbody>
                  </table>
                </div>
              `
            : html`<div class="card">${emptyState("セクター情報なし")}</div>`}

          ${analysis.keyEvents
            ? html`
                <div class="card">
                  <div class="card-title">キーイベント</div>
                  <div class="review-text">${analysis.keyEvents}</div>
                </div>
              `
            : ""}
        `
      : html`<div class="card">${emptyState("セクタートレンドデータなし")}</div>`}

    <!-- ニュース一覧 -->
    <p class="section-title">最新ニュース（${articles.length}件）</p>
    ${articles.length > 0
      ? html`
          <div class="card" style="padding:0">
            ${articles.map(
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
                    ${dayjs(a.publishedAt).format("M/D HH:mm")}
                    ${a.sector ? html` &middot; ${a.sector}` : ""}
                  </div>
                </div>
              `,
            )}
          </div>
        `
      : html`<div class="card">${emptyState("ニュースデータなし")}</div>`}
  `;

  return c.html(layout("ニュース", "/news", content));
});

export default app;
