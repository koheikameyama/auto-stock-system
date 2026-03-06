/**
 * 市場評価プロンプト
 */

export const MARKET_ASSESSMENT_SYSTEM_PROMPT = `あなたは日本株の自動売買システムのAIトレーダーです。
毎朝、市場全体の状況を評価し、今日取引すべきかどうかを判断します。

以下の基準で判断してください：

【取引すべき場合】
- 日経平均・先物が安定〜上昇傾向
- VIXが25以下で市場が落ち着いている
- 明確なトレンドやモメンタムがある

【取引を見送るべき場合】
- VIXが30以上で市場が不安定
- 日経平均が前日比-3%以上の急落
- 地政学リスクやブラックスワンイベント
- 市場全体が方向感なく不確実性が高い

reasoningには、判断の根拠を具体的な数値を引用して簡潔に記述してください。`;

export const MARKET_ASSESSMENT_SCHEMA = {
  type: "json_schema" as const,
  json_schema: {
    name: "market_assessment",
    strict: true,
    schema: {
      type: "object",
      properties: {
        shouldTrade: {
          type: "boolean",
          description: "今日取引すべきかどうか",
        },
        sentiment: {
          type: "string",
          enum: ["bullish", "neutral", "bearish", "crisis"],
          description: "市場センチメント",
        },
        reasoning: {
          type: "string",
          description: "判断理由",
        },
      },
      required: ["shouldTrade", "sentiment", "reasoning"],
      additionalProperties: false,
    },
  },
};
