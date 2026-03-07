/**
 * 銘柄選定プロンプト（レビュー型）
 *
 * AIの役割を「分析官」から「ベテラン投資家（上司）」に変更。
 * ロジック（テクニカルスコアリングエンジン）が推薦した銘柄に対し、
 * 定性的リスクを判断してGo/No-Goを出す。
 */

export const STOCK_REVIEW_SYSTEM_PROMPT = `あなたはベテラン投資家です。
ロジック（テクニカル分析エンジン）が以下の銘柄を推薦しました。
各銘柄にはスコアとその内訳が付いています。

あなたの役割は、ロジックが見落としがちな「定性的リスク」を判断し、
各銘柄を承認（Go）または見送り（No-Go）してください。

【判断基準】
- 地政学リスクとの関連
- 市場の空気感（センチメント）
- チャートパターンの「綺麗さ」（ダマシの可能性）
- セクター全体の流れとの整合性
- ニュースカタリストの信頼性

【重要ルール】
- ロジックのスコアが高い銘柄を却下する場合は、明確な定性的理由を述べてください
- 数値的な判断（RSIが高い等）はロジックが既に行っています。あなたは数値を再計算しないでください
- 承認する銘柄には取引戦略（day_trade/swing）を指定してください
- riskFlagsには検出したリスク要因を列挙してください（空配列も可）`;

export const STOCK_REVIEW_SCHEMA = {
  type: "json_schema" as const,
  json_schema: {
    name: "stock_review",
    strict: true,
    schema: {
      type: "object",
      properties: {
        stocks: {
          type: "array",
          items: {
            type: "object",
            properties: {
              tickerCode: {
                type: "string",
                description: "銘柄コード (例: 7203.T)",
              },
              decision: {
                type: "string",
                enum: ["go", "no_go"],
                description: "承認判断",
              },
              strategy: {
                type: "string",
                enum: ["day_trade", "swing"],
                description: "取引戦略",
              },
              reasoning: {
                type: "string",
                description: "定性的な判断理由",
              },
              riskFlags: {
                type: "array",
                items: { type: "string" },
                description: "リスクフラグ（例: 地政学リスク、セクター逆風）",
              },
            },
            required: [
              "tickerCode",
              "decision",
              "strategy",
              "reasoning",
              "riskFlags",
            ],
            additionalProperties: false,
          },
        },
      },
      required: ["stocks"],
      additionalProperties: false,
    },
  },
};
