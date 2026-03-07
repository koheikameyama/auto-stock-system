/**
 * 売買判断プロンプト（レビュー型）
 *
 * AIの役割を「エントリー条件を決定する」から
 * 「ロジックが算出したエントリー条件をレビューする」に変更。
 */

export const TRADE_REVIEW_SYSTEM_PROMPT = `あなたはベテラン投資家です。
ロジック（テクニカル分析エンジン）が銘柄のエントリー条件を算出しました。

あなたの役割は、ロジックが算出した条件を確認し、
承認（approve）、条件付き承認（approve_with_modification）、
または見送り（reject）を判断してください。

【判断基準】
- ロジックの指値は妥当か（現在価格との乖離は適切か）
- リスクリワード比は十分か（最低1:1.5以上）
- 市場センチメントとの整合性
- ニュースカタリストとの整合性
- セクター全体の流れとの整合性

【重要ルール】
- ロジックの数値計算（RSI、MACD等）は正しいものとして扱ってください
- 数値的な再計算はしないでください
- 条件を修正する場合は、修正理由を明確に述べてください
- 修正しない項目はnullを返してください
- riskFlagsには検出したリスク要因を列挙してください（空配列も可）
- rejectする場合は、明確な定性的理由を述べてください`;

export const TRADE_REVIEW_SCHEMA = {
  type: "json_schema" as const,
  json_schema: {
    name: "trade_review",
    strict: true,
    schema: {
      type: "object",
      properties: {
        decision: {
          type: "string",
          enum: ["approve", "approve_with_modification", "reject"],
          description: "承認判断",
        },
        reasoning: {
          type: "string",
          description: "判断理由",
        },
        modification: {
          type: ["object", "null"],
          description:
            "条件修正（approve_with_modificationの場合のみ。変更しない項目はnull）",
          properties: {
            adjustLimitPrice: {
              type: ["number", "null"],
              description: "修正後の指値（円）。変更なしはnull",
            },
            adjustTakeProfitPrice: {
              type: ["number", "null"],
              description: "修正後の利確価格（円）。変更なしはnull",
            },
            adjustStopLossPrice: {
              type: ["number", "null"],
              description: "修正後の損切り価格（円）。変更なしはnull",
            },
            adjustQuantity: {
              type: ["number", "null"],
              description: "修正後の株数。変更なしはnull",
            },
          },
          required: [
            "adjustLimitPrice",
            "adjustTakeProfitPrice",
            "adjustStopLossPrice",
            "adjustQuantity",
          ],
          additionalProperties: false,
        },
        riskFlags: {
          type: "array",
          items: { type: "string" },
          description: "リスクフラグ（例: 決算直前、地政学リスク）",
        },
      },
      required: ["decision", "reasoning", "modification", "riskFlags"],
      additionalProperties: false,
    },
  },
};
