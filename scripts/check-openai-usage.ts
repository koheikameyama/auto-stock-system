/**
 * OpenAI API使用量チェックスクリプト
 *
 * トークン使用量を取得し、モデルごとの料金テーブルからコストを試算する。
 */

const USD_TO_JPY = 150;
const GPT4O_MINI_PRICING = { input: 0.15, output: 0.6 }; // per 1M tokens

const OPENAI_ADMIN_KEY = process.env.OPENAI_ADMIN_KEY;
const OPENAI_PROJECT_ID = process.env.OPENAI_PROJECT_ID;
const SLACK_WEBHOOK_URL = process.env.OPENAI_SLACK_WEBHOOK_URL;
const MONTHLY_BUDGET_USD = parseFloat(
  process.env.MONTHLY_BUDGET_USD || "50"
);

interface UsageBucket {
  results: {
    input_tokens?: number;
    output_tokens?: number;
  }[];
}

interface UsageData {
  data: UsageBucket[];
}

async function getUsageData(
  startTimestamp: number,
  endTimestamp: number
): Promise<UsageData> {
  const params = new URLSearchParams({
    start_time: String(startTimestamp),
    end_time: String(endTimestamp),
    bucket_width: "1d",
    "group_by[]": "model",
  });
  const url = `https://api.openai.com/v1/organization/usage/completions?${params}`;
  const headers: Record<string, string> = {
    Authorization: `Bearer ${OPENAI_ADMIN_KEY}`,
    "Content-Type": "application/json",
  };
  if (OPENAI_PROJECT_ID) {
    headers["OpenAI-Project"] = OPENAI_PROJECT_ID;
  }

  const response = await fetch(url, { headers, signal: AbortSignal.timeout(30_000) });
  if (!response.ok) {
    const text = await response.text();
    console.error(`❌ Error fetching usage data: ${response.status}`);
    console.error(`Response: ${text}`);
    process.exit(1);
  }
  return response.json() as Promise<UsageData>;
}

function calculateCostFromTokens(
  usageData: UsageData
): { totalCostUsd: number; inputTokens: number; outputTokens: number } {
  let inputTokens = 0;
  let outputTokens = 0;

  for (const bucket of usageData.data ?? []) {
    for (const result of bucket.results ?? []) {
      inputTokens += result.input_tokens ?? 0;
      outputTokens += result.output_tokens ?? 0;
    }
  }

  const inputCost = (inputTokens / 1_000_000) * GPT4O_MINI_PRICING.input;
  const outputCost = (outputTokens / 1_000_000) * GPT4O_MINI_PRICING.output;
  const totalCostUsd = inputCost + outputCost;

  return { totalCostUsd, inputTokens, outputTokens };
}

function formatTokens(tokens: number): string {
  if (tokens >= 1_000_000) return `${(tokens / 1_000_000).toFixed(2)}M`;
  if (tokens >= 1_000) return `${(tokens / 1_000).toFixed(1)}K`;
  return String(tokens);
}

async function sendSlackNotification(
  message: string,
  isAlert = false
): Promise<void> {
  if (!SLACK_WEBHOOK_URL) {
    console.log("⚠️  Slack webhook URL not configured");
    return;
  }

  const color = isAlert ? "#ff0000" : "#36a64f";
  const title = isAlert
    ? "🚨 OpenAI APIコストアラート"
    : "📊 OpenAI API使用量レポート";

  const payload = {
    attachments: [
      {
        color,
        title,
        text: message,
        footer: "Stock Buddy Monitoring",
        ts: Math.floor(Date.now() / 1000),
      },
    ],
  };

  try {
    await fetch(SLACK_WEBHOOK_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(10_000),
    });
    console.log("✅ Slack notification sent");
  } catch (e) {
    console.log(`⚠️  Failed to send Slack notification: ${e}`);
  }
}

async function main() {
  if (!OPENAI_ADMIN_KEY) {
    console.error("❌ Error: OPENAI_ADMIN_KEY environment variable is not set");
    process.exit(1);
  }

  const today = new Date();
  let startOfMonth: Date;
  let endOfDay: Date;
  let periodLabel: string;

  // 月初の場合は先月分をレポート
  if (today.getDate() === 1) {
    const lastMonthEnd = new Date(today.getFullYear(), today.getMonth(), 0);
    startOfMonth = new Date(
      lastMonthEnd.getFullYear(),
      lastMonthEnd.getMonth(),
      1
    );
    endOfDay = new Date(
      lastMonthEnd.getFullYear(),
      lastMonthEnd.getMonth(),
      lastMonthEnd.getDate(),
      23, 59, 59
    );
    const y = lastMonthEnd.getFullYear();
    const m = String(lastMonthEnd.getMonth() + 1).padStart(2, "0");
    periodLabel = `${y}-${m} (先月分)`;
  } else {
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);
    startOfMonth = new Date(today.getFullYear(), today.getMonth(), 1);
    endOfDay = new Date(
      yesterday.getFullYear(),
      yesterday.getMonth(),
      yesterday.getDate(),
      23, 59, 59
    );
    const y = today.getFullYear();
    const m = String(today.getMonth() + 1).padStart(2, "0");
    periodLabel = `${y}-${m} (今月)`;
  }

  const budgetJpy = MONTHLY_BUDGET_USD * USD_TO_JPY;
  const startDate = startOfMonth.toISOString().split("T")[0];
  const endDate = endOfDay.toISOString().split("T")[0];

  console.log(`📊 Checking OpenAI API usage: ${periodLabel}`);
  console.log(`📅 Period: ${startDate} to ${endDate}`);
  console.log(
    `💰 Monthly budget: ¥${budgetJpy.toLocaleString()} ($${MONTHLY_BUDGET_USD})\n`
  );

  // トークン使用量を取得
  const usageData = await getUsageData(
    Math.floor(startOfMonth.getTime() / 1000),
    Math.floor(endOfDay.getTime() / 1000)
  );

  // コストを計算（gpt-4o-mini料金で統一）
  const { totalCostUsd, inputTokens, outputTokens } =
    calculateCostFromTokens(usageData);
  const totalCostJpy = totalCostUsd * USD_TO_JPY;
  const usagePercentage = (totalCostUsd / MONTHLY_BUDGET_USD) * 100;

  // コンソール出力
  console.log(
    `✅ Estimated cost: ¥${Math.round(totalCostJpy).toLocaleString()} ($${totalCostUsd.toFixed(4)})`
  );
  console.log(`📈 Budget usage: ${usagePercentage.toFixed(1)}%`);
  console.log(
    `💵 Remaining: ¥${Math.round(budgetJpy - totalCostJpy).toLocaleString()}`
  );
  console.log(
    `📊 Tokens: in=${formatTokens(inputTokens)}, out=${formatTokens(outputTokens)}`
  );
  console.log("ℹ️  ※gpt-4o-mini料金で試算\n");

  // Slack通知メッセージ作成
  const slackMessage = [
    `*期間*: ${startDate} 〜 ${endDate} (${periodLabel})`,
    `*推定コスト*: ¥${Math.round(totalCostJpy).toLocaleString()}`,
    `*予算*: ¥${budgetJpy.toLocaleString()}`,
    `*使用率*: ${usagePercentage.toFixed(1)}%`,
    `*トークン*: in=${formatTokens(inputTokens)}, out=${formatTokens(outputTokens)}`,
    "",
    `_※gpt-4o-mini料金で試算（$1=¥${USD_TO_JPY}）_`,
  ].join("\n");

  // アラート判定
  if (usagePercentage >= 100) {
    console.log("🚨 CRITICAL: Budget exceeded!");
    await sendSlackNotification(
      slackMessage + "\n\n⚠️ *予算を超過しました！*",
      true
    );
    process.exit(1);
  } else if (usagePercentage >= 80) {
    console.log("⚠️  WARNING: 80% of budget used");
    await sendSlackNotification(
      slackMessage + "\n\n⚠️ 予算の80%に達しました",
      true
    );
  } else {
    console.log("✅ Usage is within normal range");
    await sendSlackNotification(slackMessage, false);
  }
}

main();
