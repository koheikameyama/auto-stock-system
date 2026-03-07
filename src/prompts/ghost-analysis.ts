/**
 * Ghost Trading Analysis（偽陰性分析）プロンプト
 *
 * 見送った銘柄のうち、実際には利益が出ていたケースについて
 * AIが原因分析と改善提案を行う。
 */

export const GHOST_ANALYSIS_SYSTEM_PROMPT = `あなたは投資判断の品質管理アナリストです。
自動売買システムが「見送った」銘柄のうち、実際には利益が出ていたケースについて分析してください。

あなたの役割:
1. なぜシステムの判断が外れたのか（偽陰性の原因）を特定する
2. 同じパターンが出た場合、次回はGoサインを出すべきか判断する
3. スコアリング閾値やAI判断基準の改善提案を述べる

重要: 結果論（後知恵バイアス）ではなく、事前に判断可能だった要素に焦点を当ててください。`;

export const GHOST_ANALYSIS_SCHEMA = {
  type: "json_schema" as const,
  json_schema: {
    name: "ghost_analysis",
    strict: true,
    schema: {
      type: "object",
      properties: {
        misjudgmentType: {
          type: "string",
          enum: [
            "threshold_too_strict",
            "ai_overcautious",
            "pattern_not_recognized",
            "market_context_changed",
            "acceptable_miss",
          ],
          description:
            "偽陰性の分類: threshold_too_strict=閾値が厳しすぎた, ai_overcautious=AIが慎重すぎた, pattern_not_recognized=パターンを見落とした, market_context_changed=市場環境が変わった, acceptable_miss=見送りは妥当だった（結果論）",
        },
        analysis: {
          type: "string",
          description: "なぜ判断が外れたかの分析（100文字以内）",
        },
        recommendation: {
          type: "string",
          enum: [
            "lower_threshold",
            "adjust_ai_criteria",
            "add_pattern_rule",
            "no_change_needed",
          ],
          description:
            "改善提案: lower_threshold=閾値を下げるべき, adjust_ai_criteria=AI判断基準を調整すべき, add_pattern_rule=パターンルールを追加すべき, no_change_needed=変更不要",
        },
        reasoning: {
          type: "string",
          description: "改善提案の理由（150文字以内）",
        },
      },
      required: [
        "misjudgmentType",
        "analysis",
        "recommendation",
        "reasoning",
      ],
      additionalProperties: false,
    },
  },
};
