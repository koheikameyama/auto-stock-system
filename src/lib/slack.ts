/**
 * Slack通知ユーティリティ（自動売買システム用）
 */

const SLACK_WEBHOOK_URL = process.env.SLACK_WEBHOOK_URL;

type SlackColor = "good" | "warning" | "danger" | string;

interface SlackField {
  title: string;
  value: string;
  short?: boolean;
}

interface SlackNotifyOptions {
  title: string;
  message: string;
  color?: SlackColor;
  fields?: SlackField[];
}

/**
 * Slackにメッセージを送信
 */
export async function notifySlack(options: SlackNotifyOptions): Promise<void> {
  if (!SLACK_WEBHOOK_URL) {
    console.log(
      "⚠️  SLACK_WEBHOOK_URL not configured, skipping notification",
    );
    return;
  }

  const payload = {
    attachments: [
      {
        color: options.color || "good",
        title: options.title,
        text: options.message,
        fields: options.fields,
        footer: "Auto Stock Trader",
        ts: Math.floor(Date.now() / 1000),
      },
    ],
  };

  try {
    const response = await fetch(SLACK_WEBHOOK_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      console.error(`Slack notification failed: ${response.status}`);
    }
  } catch (error) {
    console.error("Failed to send Slack notification:", error);
  }
}

// ========================================
// 取引専用通知
// ========================================

/** 市場評価通知 */
export async function notifyMarketAssessment(data: {
  shouldTrade: boolean;
  sentiment: string;
  reasoning: string;
  nikkeiChange?: number;
  vix?: number;
}): Promise<void> {
  const emoji = data.shouldTrade ? "🟢" : "🔴";
  const action = data.shouldTrade ? "取引実行" : "取引見送り";

  await notifySlack({
    title: `${emoji} 市場評価: ${action}`,
    message: data.reasoning,
    color: data.shouldTrade ? "good" : "warning",
    fields: [
      { title: "センチメント", value: data.sentiment, short: true },
      {
        title: "日経変化率",
        value: data.nikkeiChange != null ? `${data.nikkeiChange}%` : "N/A",
        short: true,
      },
      {
        title: "VIX",
        value: data.vix != null ? `${data.vix}` : "N/A",
        short: true,
      },
    ],
  });
}

/** 銘柄候補通知 */
export async function notifyStockCandidates(
  candidates: Array<{
    tickerCode: string;
    name?: string;
    strategy: string;
    score: number;
    reasoning: string;
  }>,
): Promise<void> {
  const list = candidates
    .map(
      (c, i) =>
        `${i + 1}. ${c.tickerCode}${c.name ? ` ${c.name}` : ""} [${c.strategy}] スコア:${c.score}\n   ${c.reasoning}`,
    )
    .join("\n");

  await notifySlack({
    title: `📊 AI選定銘柄: ${candidates.length}件`,
    message: list,
    color: "#439FE0",
  });
}

/** 注文発行通知 */
export async function notifyOrderPlaced(data: {
  tickerCode: string;
  name?: string;
  side: string;
  strategy: string;
  limitPrice: number;
  takeProfitPrice?: number;
  stopLossPrice?: number;
  quantity: number;
  reasoning: string;
}): Promise<void> {
  const emoji = data.side === "buy" ? "📥" : "📤";
  const fields: SlackField[] = [
    { title: "指値", value: `¥${data.limitPrice.toLocaleString()}`, short: true },
    { title: "数量", value: `${data.quantity}株`, short: true },
    { title: "戦略", value: data.strategy, short: true },
  ];

  if (data.takeProfitPrice) {
    fields.push({
      title: "利確",
      value: `¥${data.takeProfitPrice.toLocaleString()}`,
      short: true,
    });
  }
  if (data.stopLossPrice) {
    fields.push({
      title: "損切り",
      value: `¥${data.stopLossPrice.toLocaleString()}`,
      short: true,
    });
  }

  await notifySlack({
    title: `${emoji} 注文発行: ${data.tickerCode}${data.name ? ` ${data.name}` : ""} [${data.side.toUpperCase()}]`,
    message: data.reasoning,
    color: data.side === "buy" ? "#2196F3" : "#FF9800",
    fields,
  });
}

/** 約定通知 */
export async function notifyOrderFilled(data: {
  tickerCode: string;
  name?: string;
  side: string;
  filledPrice: number;
  quantity: number;
  pnl?: number;
}): Promise<void> {
  const emoji = data.side === "buy" ? "✅" : "💰";
  const fields: SlackField[] = [
    {
      title: "約定価格",
      value: `¥${data.filledPrice.toLocaleString()}`,
      short: true,
    },
    { title: "数量", value: `${data.quantity}株`, short: true },
  ];

  if (data.pnl != null) {
    const pnlEmoji = data.pnl >= 0 ? "📈" : "📉";
    fields.push({
      title: "損益",
      value: `${pnlEmoji} ¥${data.pnl.toLocaleString()}`,
      short: true,
    });
  }

  await notifySlack({
    title: `${emoji} 約定: ${data.tickerCode}${data.name ? ` ${data.name}` : ""} [${data.side.toUpperCase()}]`,
    message: `約定価格 ¥${data.filledPrice.toLocaleString()} × ${data.quantity}株`,
    color: data.pnl != null ? (data.pnl >= 0 ? "good" : "danger") : "#439FE0",
    fields,
  });
}

/** 日次レポート通知 */
export async function notifyDailyReport(data: {
  date: string;
  totalTrades: number;
  wins: number;
  losses: number;
  totalPnl: number;
  portfolioValue: number;
  cashBalance: number;
  aiReview?: string;
}): Promise<void> {
  const winRate =
    data.totalTrades > 0
      ? Math.round((data.wins / data.totalTrades) * 100)
      : 0;
  const pnlEmoji = data.totalPnl >= 0 ? "📈" : "📉";

  await notifySlack({
    title: `📋 日次レポート: ${data.date}`,
    message: data.aiReview || "",
    color: data.totalPnl >= 0 ? "good" : "danger",
    fields: [
      {
        title: "損益",
        value: `${pnlEmoji} ¥${data.totalPnl.toLocaleString()}`,
        short: true,
      },
      {
        title: "勝率",
        value: `${data.wins}勝${data.losses}敗 (${winRate}%)`,
        short: true,
      },
      {
        title: "ポートフォリオ",
        value: `¥${data.portfolioValue.toLocaleString()}`,
        short: true,
      },
      {
        title: "現金残高",
        value: `¥${data.cashBalance.toLocaleString()}`,
        short: true,
      },
    ],
  });
}

/** リスクアラート */
export async function notifyRiskAlert(data: {
  type: string;
  message: string;
}): Promise<void> {
  await notifySlack({
    title: `🚨 リスクアラート: ${data.type}`,
    message: data.message,
    color: "danger",
  });
}
