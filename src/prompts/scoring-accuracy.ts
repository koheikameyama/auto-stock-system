/**
 * スコアリング精度分析プロンプト
 *
 * FN分析: 見送った銘柄のうち実際に上昇したケースの偽陰性分析
 * FP分析: 買った銘柄のうち実際に下落したケースの偽陽性分析
 */

// ===== FN分析（偽陰性 — 見送ったが上昇） =====

export const FN_ANALYSIS_SYSTEM_PROMPT = `あなたは投資判断の品質管理アナリストです。
自動売買システムが「見送った」銘柄のうち、実際には利益が出ていたケースについて分析してください。

あなたの役割:
1. なぜシステムの判断が外れたのか（偽陰性の原因）を特定する
2. 同じパターンが出た場合、次回はGoサインを出すべきか判断する
3. スコアリング閾値やAI判断基準の改善提案を述べる

重要: 結果論（後知恵バイアス）ではなく、事前に判断可能だった要素に焦点を当ててください。`;

export const FN_ANALYSIS_SCHEMA = {
  type: "json_schema" as const,
  json_schema: {
    name: "fn_analysis",
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
      required: ["misjudgmentType", "analysis", "recommendation", "reasoning"],
      additionalProperties: false,
    },
  },
};

// ===== FP分析（偽陽性 — 買ったが下落） =====

export const FP_ANALYSIS_SYSTEM_PROMPT = `あなたは投資判断の品質管理アナリストです。
自動売買システムが「買い」と判断した銘柄のうち、実際には下落したケースについて分析してください。

あなたの役割:
1. なぜシステムが誤って買いシグナルを出したのか（偽陽性の原因）を特定する
2. スコアリングのどの要素が過大評価されていたか分析する
3. AI審査で見抜けなかったリスク要因を特定する

重要: 結果論（後知恵バイアス）ではなく、事前に判断可能だった要素に焦点を当ててください。`;

export const FP_ANALYSIS_SCHEMA = {
  type: "json_schema" as const,
  json_schema: {
    name: "fp_analysis",
    strict: true,
    schema: {
      type: "object",
      properties: {
        misjudgmentType: {
          type: "string",
          enum: [
            "score_inflated",
            "ai_overconfident",
            "market_shift",
            "acceptable_loss",
          ],
          description:
            "偽陽性の分類: score_inflated=スコアが過大評価, ai_overconfident=AIが楽観的すぎた, market_shift=市場環境が変化した, acceptable_loss=損失は許容範囲（想定内）",
        },
        analysis: {
          type: "string",
          description: "なぜ誤った買い判断をしたかの分析（100文字以内）",
        },
        recommendation: {
          type: "string",
          enum: [
            "tighten_threshold",
            "adjust_ai_criteria",
            "add_risk_filter",
            "no_change_needed",
          ],
          description:
            "改善提案: tighten_threshold=閾値を厳しくすべき, adjust_ai_criteria=AI判断基準を調整すべき, add_risk_filter=リスクフィルターを追加すべき, no_change_needed=変更不要",
        },
        reasoning: {
          type: "string",
          description: "改善提案の理由（150文字以内）",
        },
      },
      required: ["misjudgmentType", "analysis", "recommendation", "reasoning"],
      additionalProperties: false,
    },
  },
};
