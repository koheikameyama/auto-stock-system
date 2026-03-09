/**
 * 逆行ウィナーページ（GET /contrarian）
 *
 * 市場停止日に上昇した銘柄の追跡・ランキング・スコアリング詳細を表示
 */

import { Hono } from "hono";
import { html } from "hono/html";
import dayjs from "dayjs";
import { prisma } from "../../lib/prisma";
import { getTodayForDB, getDaysAgoForDB } from "../../lib/date-utils";
import { CONTRARIAN } from "../../lib/constants";
import { calculateContrarianBonus } from "../../core/contrarian-analyzer";
import { layout } from "../views/layout";
import {
  formatYen,
  pnlPercent,
  emptyState,
  rankBadge,
} from "../views/components";

const app = new Hono();

app.get("/", async (c) => {
  const today = getTodayForDB();
  const since90 = getDaysAgoForDB(CONTRARIAN.LOOKBACK_DAYS);

  const [todayAssessment, todayWinners, recentBonusRecords, allHaltedRecords] =
    await Promise.all([
      prisma.marketAssessment.findUnique({ where: { date: today } }),
      prisma.scoringRecord.findMany({
        where: {
          date: today,
          rejectionReason: "market_halted",
          ghostProfitPct: { gt: 0 },
          closingPrice: { not: null },
          entryPrice: { not: null },
        },
        orderBy: { ghostProfitPct: "desc" },
      }),
      prisma.scoringRecord.findMany({
        where: { contrarianBonus: { gt: 0 } },
        orderBy: { date: "desc" },
        take: 50,
      }),
      prisma.scoringRecord.findMany({
        where: {
          rejectionReason: "market_halted",
          date: { gte: since90 },
          ghostProfitPct: { not: null },
          closingPrice: { not: null },
        },
        select: { tickerCode: true, ghostProfitPct: true },
      }),
    ]);

  const isNoTradeDay = todayAssessment?.shouldTrade === false;

  // --- セクション2: 逆行実績ランキング集計 ---
  const buckets = new Map<
    string,
    { wins: number; totalDays: number; profitSum: number }
  >();

  for (const r of allHaltedRecords) {
    const pct = Number(r.ghostProfitPct);
    let bucket = buckets.get(r.tickerCode);
    if (!bucket) {
      bucket = { wins: 0, totalDays: 0, profitSum: 0 };
      buckets.set(r.tickerCode, bucket);
    }
    bucket.totalDays++;
    if (pct >= CONTRARIAN.MIN_PROFIT_PCT) {
      bucket.wins++;
      bucket.profitSum += pct;
    }
  }

  const ranking = [...buckets.entries()]
    .filter(([, b]) => b.wins > 0)
    .map(([ticker, b]) => ({
      tickerCode: ticker,
      wins: b.wins,
      totalDays: b.totalDays,
      winRate: Math.round((b.wins / b.totalDays) * 100),
      avgProfitPct: b.profitSum / b.wins,
      bonus: calculateContrarianBonus(b.wins),
    }))
    .sort((a, b) => b.wins - a.wins || b.avgProfitPct - a.avgProfitPct)
    .slice(0, 30);

  const content = html`
    <!-- セクション1: 今日の逆行ウィナー -->
    <p class="section-title">
      今日の逆行ウィナー${isNoTradeDay ? "" : "（取引実行日）"}
    </p>
    ${isNoTradeDay
      ? todayWinners.length > 0
        ? html`
            <div class="card table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>銘柄</th>
                    <th>スコア</th>
                    <th>ランク</th>
                    <th>騰落率</th>
                    <th>エントリー</th>
                    <th>終値</th>
                  </tr>
                </thead>
                <tbody>
                  ${todayWinners.map(
                    (r) => html`
                      <tr>
                        <td style="font-weight:600">${r.tickerCode}</td>
                        <td>${r.totalScore}</td>
                        <td>${rankBadge(r.rank)}</td>
                        <td>${pnlPercent(Number(r.ghostProfitPct))}</td>
                        <td>
                          ¥${formatYen(Number(r.entryPrice))}
                        </td>
                        <td>
                          ¥${formatYen(Number(r.closingPrice))}
                        </td>
                      </tr>
                    `,
                  )}
                </tbody>
              </table>
            </div>
          `
        : html`<div class="card">
            ${emptyState("市場停止日ですが、上昇銘柄はありませんでした")}
          </div>`
      : html`<div class="card">
          ${emptyState(
            todayAssessment
              ? "本日は取引実行日です（逆行ウィナーは市場停止日のみ）"
              : "本日の市場評価はまだ実行されていません",
          )}
        </div>`}

    <!-- セクション2: 逆行実績ランキング -->
    <p class="section-title">
      逆行実績ランキング（過去${CONTRARIAN.LOOKBACK_DAYS}日）
    </p>
    ${ranking.length > 0
      ? html`
          <div class="card table-wrap">
            <table>
              <thead>
                <tr>
                  <th>銘柄</th>
                  <th>逆行勝ち</th>
                  <th>停止日数</th>
                  <th>勝率</th>
                  <th>平均利益率</th>
                  <th>ボーナス</th>
                </tr>
              </thead>
              <tbody>
                ${ranking.map(
                  (r) => html`
                    <tr>
                      <td style="font-weight:600">${r.tickerCode}</td>
                      <td>${r.wins}回</td>
                      <td>${r.totalDays}日</td>
                      <td>${r.winRate}%</td>
                      <td>${pnlPercent(r.avgProfitPct)}</td>
                      <td>
                        ${r.bonus > 0
                          ? html`<span class="pnl-positive"
                              >+${r.bonus}点</span
                            >`
                          : "-"}
                      </td>
                    </tr>
                  `,
                )}
              </tbody>
            </table>
          </div>
        `
      : html`<div class="card">
          ${emptyState("逆行実績のある銘柄はまだありません")}
        </div>`}

    <!-- セクション3: 逆行ボーナス適用銘柄 -->
    <p class="section-title">直近の逆行ボーナス適用銘柄</p>
    ${recentBonusRecords.length > 0
      ? html`
          <div class="card table-wrap">
            <table>
              <thead>
                <tr>
                  <th>日付</th>
                  <th>銘柄</th>
                  <th>ベース</th>
                  <th>ボーナス</th>
                  <th>合計</th>
                  <th>ランク</th>
                  <th>勝ち数</th>
                </tr>
              </thead>
              <tbody>
                ${recentBonusRecords.map(
                  (r) => html`
                    <tr>
                      <td>${dayjs(r.date).format("M/D")}</td>
                      <td style="font-weight:600">${r.tickerCode}</td>
                      <td>${r.totalScore - r.contrarianBonus}</td>
                      <td>
                        <span class="pnl-positive"
                          >+${r.contrarianBonus}</span
                        >
                      </td>
                      <td style="font-weight:600">${r.totalScore}</td>
                      <td>${rankBadge(r.rank)}</td>
                      <td>${r.contrarianWins}回</td>
                    </tr>
                  `,
                )}
              </tbody>
            </table>
          </div>
        `
      : html`<div class="card">
          ${emptyState("逆行ボーナスが適用された銘柄はまだありません")}
        </div>`}
  `;

  return c.html(layout("逆行ウィナー", "/contrarian", content));
});

export default app;
