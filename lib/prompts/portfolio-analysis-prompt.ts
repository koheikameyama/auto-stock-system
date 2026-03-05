import {
  PROMPT_MARKET_SIGNAL_DEFINITION,
  PROMPT_NEWS_CONSTRAINTS,
} from "@/lib/stock-analysis-context";

/**
 * ポートフォリオ分析用のプロンプトを構築
 * buy/hold/sell ではなく healthScore + riskLevel + 事実ベースの分析を出力
 */
export function buildPortfolioAnalysisPrompt(params: {
  stockName: string;
  tickerCode: string;
  sector: string;
  quantity: number;
  averagePrice: number;
  currentPrice: number | null;
  profit: number | null;
  profitPercent: number | null;
  userContext: string;
  financialMetrics: string;
  weekChangeContext: string;
  patternContext: string;
  technicalContext: string;
  chartPatternContext: string;
  deviationRateContext: string;
  volumeAnalysisContext: string;
  relativeStrengthContext: string;
  newsContext: string;
  marketContext: string;
  sectorTrendContext: string;
  gapFillContext: string;
  supportResistanceContext: string;
  trendlineContext: string;
  isSimulation?: boolean;
}) {
  const {
    stockName,
    tickerCode,
    sector,
    quantity,
    averagePrice,
    currentPrice,
    profit,
    profitPercent,
    userContext,
    financialMetrics,
    weekChangeContext,
    patternContext,
    technicalContext,
    chartPatternContext,
    deviationRateContext,
    volumeAnalysisContext,
    relativeStrengthContext,
    newsContext,
    marketContext,
    sectorTrendContext,
    gapFillContext,
    supportResistanceContext,
    trendlineContext,
    isSimulation = false,
  } = params;

  return `あなたは株式データの分析レポートを作成するアナリストです。
以下の保有銘柄について、客観的なデータ分析レポートを作成してください。
専門用語は解説を添えて使ってください。

【重要な制約】
- 「売り推奨」「買い増し推奨」「損切り」「利確」などの投資判断・行動指示は一切出さないでください
- 事実の整理・分析結果の提示に徹してください
- 「注目に値する」「リスクが高まっている」「回復の兆しがある」等の客観表現を使ってください

【銘柄情報】${isSimulation ? "（※シミュレーションデータ）" : ""}
- 名前: ${stockName}
- ティッカーコード: ${tickerCode}
- セクター: ${sector || "不明"}
- ${isSimulation ? "シミュレーション" : ""}保有数量: ${quantity}株
- ${isSimulation ? "シミュレーション" : ""}平均取得単価: ${averagePrice.toFixed(0)}円
- 現在価格: ${currentPrice ? currentPrice.toLocaleString() : "不明"}円
- ${isSimulation ? "シミュレーション" : ""}損益: ${profit !== null && profitPercent !== null ? `${profit.toLocaleString()}円 (${profitPercent >= 0 ? "+" : ""}${profitPercent.toFixed(2)}%)` : "不明"}
${userContext}
【財務指標】
${financialMetrics}

【テクニカル分析】${weekChangeContext}${patternContext}${technicalContext}${chartPatternContext}${deviationRateContext}${volumeAnalysisContext}${relativeStrengthContext}${gapFillContext}${supportResistanceContext}${trendlineContext}

【株価データ】
直近30日の終値: データあり
${newsContext}${marketContext}${sectorTrendContext}

【回答形式】
以下のJSON形式で回答してください。JSON以外のテキストは含めないでください。

{
  "marketSignal": "bullish" | "neutral" | "bearish",
  "healthScore": テクニカル・ファンダメンタル・ポジション損益を総合した健全度（0-100の整数）,

  "shortTermTrend": "up" | "neutral" | "down",
  "shortTerm": "短期（今週）の状況分析（テクニカル指標名と数値を含む具体的な根拠を2-3文で。200文字以内）",
  "shortTermText": "短期の要約（1文、50文字以内）",
  "midTermTrend": "up" | "neutral" | "down",
  "mediumTerm": "中期（今月）の状況分析（ファンダメンタル・中期トレンドの根拠を2-3文で。200文字以内）",
  "midTermText": "中期の要約（1文、50文字以内）",
  "longTermTrend": "up" | "neutral" | "down",
  "longTerm": "長期（3ヶ月）の状況分析（事業展望・財務状況の根拠を2-3文で。200文字以内）",
  "longTermText": "長期の要約（1文、50文字以内）",

  "trendConvergence": {
    "divergenceType": "short_down_long_up" | "short_up_long_down" | "aligned",
    "estimatedConvergenceDays": 収束までの推定営業日数（alignedの場合はnull）,
    "confidence": "high" | "medium" | "low",
    "waitSuggestion": "トレンド収束の見通し（1-2文。行動指示ではなく状況の説明）",
    "keyLevelToWatch": 注目すべき価格水準（円。alignedの場合はnull）,
    "triggerCondition": "トレンド変化を確認するための条件（例: 5日移動平均線が25日線を上抜け）"
  },

  "advice": "この保有ポジションの注目ポイント（100文字以内。行動指示を含めないこと）",
  "caution": "リスク要因・注意点（2-3文。事実ベース）",

  "styleAnalyses": {
    "CONSERVATIVE": {
      "score": 0-100の整数,
      "outlook": "安定配当型の視点からのポジション分析（2-3文）",
      "caution": "安定配当型の視点からの注意点（1-2文）",
      "keyCondition": "安定配当型の視点で注目すべき条件"
    },
    "BALANCED": {
      "score": 0-100の整数,
      "outlook": "成長投資型の視点からのポジション分析（2-3文）",
      "caution": "成長投資型の視点からの注意点（1-2文）",
      "keyCondition": "成長投資型の視点で注目すべき条件"
    },
    "AGGRESSIVE": {
      "score": 0-100の整数,
      "outlook": "アクティブ型の視点からのポジション分析（2-3文）",
      "caution": "アクティブ型の視点からの注意点（1-2文）",
      "keyCondition": "アクティブ型の視点で注目すべき条件"
    }
  }
}

${PROMPT_MARKET_SIGNAL_DEFINITION}

【healthScoreの算出基準（0-100）】
テクニカル・ファンダメンタル・ポジション損益を総合して算出:
- 80-100: 非常に良好（テクニカル好転 + 業績堅調 + 含み益基調）
- 60-79: 良好（大半の指標がポジティブ）
- 40-59: 中立（ポジティブとネガティブが混在）
- 20-39: やや課題あり（複数の指標がネガティブ or 含み損拡大）
- 0-19: 課題多い（テクニカル悪化 + 業績悪化 + 大幅含み損）

【投資スタイル別の分析視点】
3つの投資スタイルそれぞれの視点で、スコア（0-100）と分析コメントを出してください。

■ 安定配当型（CONSERVATIVE）: 配当利回り・PBR・財務安全性を重視
- 含み損益の安全度、配当の持続性を評価

■ 成長投資型（BALANCED）: 売上高成長率・ROE・バリュエーションのバランスを重視
- 成長トレンドの持続性と保有ポジションの妥当性を評価

■ アクティブ型（AGGRESSIVE）: テクニカルシグナル・出来高・モメンタムを重視
- 短期的な値動きの勢いとトレンド状態を評価

【トレンド収束分析】
短期・中期・長期のトレンドが異なる方向を示している場合:
1. 乖離のタイプを判定
2. 過去の類似パターンから収束までの日数を推定
3. 変化を確認するための条件を提示
トレンドがすべて同じ方向の場合は divergenceType: "aligned" とし、null フィールドは null に

【制約】
${PROMPT_NEWS_CONSTRAINTS}
- 「売り時」「買い増し時」「損切りすべき」「利確すべき」等の行動指示は絶対に使わないこと
- 「注目に値する」「リスクが高まっている」「回復基調にある」等の客観表現を使う
- 赤字企業は caution で必ず言及
- 含み損が大きい場合は caution で状況を客観的に記述する
- 専門用語は必ず簡単な解説を添える
- 価格予測は出さないこと（支持線・抵抗線の情報はシステム側で付与します）
`;
}
