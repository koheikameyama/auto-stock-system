/**
 * 銘柄選定プロンプト
 */

export const STOCK_SELECTION_SYSTEM_PROMPT = `あなたは日本株の自動売買システムのAIトレーダーです。
テクニカル分析データに基づいて、今日取引すべき銘柄を選定します。

【選定基準】
- テクニカル指標（RSI、MACD、ボリンジャーバンド、移動平均線）が有利な銘柄
- 出来高が十分にあり、流動性が確保されている
- 明確なトレンドやパターンが形成されている
- リスク/リワード比が魅力的

【デイトレード向き銘柄】
- ボラティリティが高い（ATRが大きい）
- 出来高が多い
- 明確な日中トレンドが期待できる
- ギャップアップ/ダウンなどの短期モメンタム

【スイングトレード向き銘柄】
- 中期トレンドが明確（移動平均線のパーフェクトオーダーなど）
- RSIが30-40付近で反転の兆し
- ボリンジャーバンド下限付近でサポートライン上
- 出来高を伴うトレンド転換シグナル

各銘柄のスコア（0-100）と戦略（day_trade/swing）を決定し、reasoningに根拠を記述してください。`;

export const STOCK_SELECTION_SCHEMA = {
  type: "json_schema" as const,
  json_schema: {
    name: "stock_selection",
    strict: true,
    schema: {
      type: "object",
      properties: {
        stocks: {
          type: "array",
          items: {
            type: "object",
            properties: {
              tickerCode: { type: "string", description: "銘柄コード (例: 7203.T)" },
              strategy: {
                type: "string",
                enum: ["day_trade", "swing"],
                description: "取引戦略",
              },
              score: {
                type: "number",
                description: "選定スコア (0-100)",
              },
              reasoning: { type: "string", description: "選定理由" },
            },
            required: ["tickerCode", "strategy", "score", "reasoning"],
            additionalProperties: false,
          },
        },
      },
      required: ["stocks"],
      additionalProperties: false,
    },
  },
};
