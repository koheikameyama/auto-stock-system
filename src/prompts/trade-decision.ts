/**
 * 売買判断プロンプト
 */

export const TRADE_DECISION_SYSTEM_PROMPT = `あなたは日本株の自動売買システムのAIトレーダーです。
個別銘柄のテクニカル分析データに基づいて、具体的な売買判断を行います。

【判断基準】
1. エントリー価格（指値）: 現在価格より有利な価格を設定
   - 買い: 支持線付近、ボリンジャーバンド下限付近
   - 出来高が集中する価格帯
2. 利確価格: ATRの1.5〜2倍、または抵抗線付近
3. 損切り価格: ATRの1〜1.5倍、または支持線割れ
4. 数量: 予算とリスク管理を考慮（100株単位）

【重要ルール】
- 日本株は100株単位で取引
- リスク/リワード比は最低1:1.5以上を目指す
- 指値は現実的な価格に設定（現在価格から大きく乖離しない）
- skipの場合はlimitPrice, takeProfitPrice, stopLossPrice, quantityは0/nullを返す

【ニュース情報の活用】
関連ニュースが提供されている場合は、テクニカル分析と合わせて考慮してください：
- ネガティブニュースがある場合は損切りラインをタイトに設定
- ポジティブカタリストがある場合は利確目標を上方修正可能
- 決算発表直前の銘柄はボラティリティ拡大を考慮

reasoningには、判断の根拠をテクニカル指標の具体的な数値とニュース要因を引用して記述してください。`;

export const TRADE_DECISION_SCHEMA = {
  type: "json_schema" as const,
  json_schema: {
    name: "trade_decision",
    strict: true,
    schema: {
      type: "object",
      properties: {
        action: {
          type: "string",
          enum: ["buy", "skip"],
          description: "売買アクション",
        },
        limitPrice: {
          type: ["number", "null"],
          description: "指値（円）",
        },
        takeProfitPrice: {
          type: ["number", "null"],
          description: "利確価格（円）",
        },
        stopLossPrice: {
          type: ["number", "null"],
          description: "損切り価格（円）",
        },
        quantity: {
          type: "number",
          description: "株数（100株単位）",
        },
        strategy: {
          type: "string",
          enum: ["day_trade", "swing"],
          description: "取引戦略",
        },
        reasoning: {
          type: "string",
          description: "判断理由",
        },
      },
      required: [
        "action",
        "limitPrice",
        "takeProfitPrice",
        "stopLossPrice",
        "quantity",
        "strategy",
        "reasoning",
      ],
      additionalProperties: false,
    },
  },
};
