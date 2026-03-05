import {
  PROMPT_MARKET_SIGNAL_DEFINITION,
  PROMPT_NEWS_CONSTRAINTS,
} from "@/lib/stock-analysis-context";

const SESSION_CONTEXT: Record<string, string> = {
  morning: "【分析タイミング: 前場（開場後）】\n寄り付きの動きを踏まえ、短期シグナルを重視して分析してください。",
  "mid-morning": "【分析タイミング: 前場中盤（10:30頃）】\n前場が中盤に差し掛かっています。寄り付きのトレンド継続を確認してください。",
  "pre-afternoon": "【分析タイミング: 後場前（昼休み）】\n前場の値動きが本物かだましかを判断してください。",
  afternoon: "【分析タイミング: 後場（12:30〜14:00頃）】\n前場の流れが続いているか反転しているかを分析してください。",
  "mid-afternoon": "【分析タイミング: 後場中盤（14:00頃）】\n大引けまで1時間余り。今日の結果を踏まえた評価をしてください。",
  close: "【分析タイミング: 大引け前後（15:30〜16:00）】\n今日の結果を踏まえ、明日以降の見通しを評価してください。",
  "post-close": "【分析タイミング: 引け後（17:00頃）】\n今日の動きを振り返り、中長期の視点で評価してください。",
  evening: "【分析タイミング: 夜間】\n今日の動きを振り返り、中長期の視点で評価してください。",
  "pre-morning": "【分析タイミング: 開場前（8:00頃）】\nデータは前日終値ベースです。今日の見通しを評価してください。",
};

export function buildStockReportPrompt(params: {
  stockName: string;
  tickerCode: string;
  sector: string | null;
  currentPrice: number;
  financialMetrics: string;
  userContext: string;
  previousAnalysisContext: string;
  pricesCount: number;
  delistingContext: string;
  weekChangeContext: string;
  marketContext: string;
  sectorTrendContext: string;
  patternContext: string;
  technicalContext: string;
  chartPatternContext: string;
  deviationRateContext: string;
  volumeAnalysisContext: string;
  relativeStrengthContext: string;
  trendlineContext: string;
  timingIndicatorsContext: string;
  newsContext: string;
  hasPreviousAnalysis: boolean;
  session?: string;
}): string {
  const {
    stockName,
    tickerCode,
    sector,
    currentPrice,
    financialMetrics,
    userContext,
    previousAnalysisContext,
    pricesCount,
    delistingContext,
    weekChangeContext,
    marketContext,
    sectorTrendContext,
    patternContext,
    technicalContext,
    chartPatternContext,
    deviationRateContext,
    volumeAnalysisContext,
    relativeStrengthContext,
    trendlineContext,
    timingIndicatorsContext,
    newsContext,
    hasPreviousAnalysis,
    session,
  } = params;

  const sessionContext = session ? (SESSION_CONTEXT[session] ?? "") : "";

  return `あなたは株式データの分析レポートを作成するアナリストです。
以下の銘柄について、客観的なデータ分析レポートを作成してください。
専門用語は解説を添えて使ってください。

【重要な制約】
- 「買い推奨」「売り推奨」「買うべき」「売るべき」などの投資判断・行動指示は一切出さないでください
- 事実の整理・分析結果の提示に徹してください
- 「検討できる」「注目に値する」など客観的な表現を使ってください
${sessionContext ? `\n${sessionContext}\n` : ""}

【銘柄情報】
- 名前: ${stockName}
- ティッカーコード: ${tickerCode}
- セクター: ${sector || "不明"}
- 現在価格: ${currentPrice}円

【財務指標】
${financialMetrics}
${userContext}${previousAnalysisContext}
【株価データ】
直近の終値: ${pricesCount}件のデータあり
${delistingContext}${weekChangeContext}${marketContext}${sectorTrendContext}${patternContext}${technicalContext}${chartPatternContext}${deviationRateContext}${volumeAnalysisContext}${timingIndicatorsContext}${relativeStrengthContext}${trendlineContext}${newsContext}

【投資スタイル別の分析視点】
3つの投資スタイルそれぞれの視点で、この銘柄のスコア（0-100）と分析コメントを出してください。
各スタイルは同じデータを見ていますが、重視する観点が異なります。

■ 安定配当型（CONSERVATIVE）: 配当利回り・PBR・財務安全性を重視
- 配当の持続性、割安度、業績の安定性を評価
- 高配当・低PBR・黒字継続の銘柄が高スコア

■ 成長投資型（BALANCED）: 売上高成長率・ROE・バリュエーションのバランスを重視
- 成長性とバリュエーションの妥当性を評価
- 成長率鈍化・割高は減点

■ アクティブ型（AGGRESSIVE）: テクニカルシグナル・出来高・モメンタムを重視
- 短期的な値動きの勢いとトレンドを評価
- モメンタムが強い銘柄が高スコア

【回答形式】
以下のJSON形式で回答してください。JSON以外のテキストは含めないでください。

{
  "technicalScore": テクニカル指標の総合評価（0-100の整数。RSI・MACD・チャートパターン・出来高・トレンドラインを総合して算出）,
  "fundamentalScore": ファンダメンタルの総合評価（0-100の整数。PER・PBR・ROE・配当利回り・成長率・財務健全性を総合して算出）,
  "healthRank": "A" | "B" | "C" | "D" | "E",

  "marketSignal": "bullish" | "neutral" | "bearish",

  "shortTermTrend": "up" | "neutral" | "down",
  "shortTermText": "短期（今週）の見通し根拠（テクニカル指標名と数値を含む具体的な根拠を2-3文で。200文字以内）",
  "midTermTrend": "up" | "neutral" | "down",
  "midTermText": "中期（今月）の見通し根拠（ファンダメンタル・中期トレンドの根拠を2-3文で。200文字以内）",
  "longTermTrend": "up" | "neutral" | "down",
  "longTermText": "長期（3ヶ月）の見通し根拠（事業展望・財務状況の根拠を2-3文で。200文字以内）",

  "trendConvergence": {
    "divergenceType": "short_down_long_up" | "short_up_long_down" | "aligned",
    "estimatedConvergenceDays": 収束までの推定営業日数（alignedの場合はnull）,
    "confidence": "high" | "medium" | "low",
    "waitSuggestion": "トレンド収束の見通し（1-2文。行動指示ではなく状況の説明）",
    "keyLevelToWatch": 注目すべき価格水準（円。alignedの場合はnull）,
    "triggerCondition": "トレンド変化を確認するための条件（例: 5日移動平均線が25日線を上抜け）"
  },

  "reason": "総合的な分析結果の要約（2-3文。事実ベース）",
  "caution": "リスク要因・注意点（2-3文。事実ベース）",
  "advice": "この銘柄の注目ポイントのまとめ（100文字以内。行動指示を含めないこと）",
  "positives": "・ポジティブ要因1\\n・ポジティブ要因2\\n・ポジティブ要因3",
  "concerns": "・懸念事項1\\n・懸念事項2\\n・懸念事項3",
  "suitableFor": "この銘柄が合う投資スタイル（1-2文で客観的に）",
  "keyCondition": "今後の注目条件（例: RSIが30を下回ったら反発の兆候、決算発表後の業績確認）",

  "styleAnalyses": {
    "CONSERVATIVE": {
      "score": 0-100の整数,
      "outlook": "安定配当型の視点からの分析（2-3文）",
      "caution": "安定配当型の視点からの注意点（1-2文）",
      "keyCondition": "安定配当型の視点で注目すべき条件"
    },
    "BALANCED": {
      "score": 0-100の整数,
      "outlook": "成長投資型の視点からの分析（2-3文）",
      "caution": "成長投資型の視点からの注意点（1-2文）",
      "keyCondition": "成長投資型の視点で注目すべき条件"
    },
    "AGGRESSIVE": {
      "score": 0-100の整数,
      "outlook": "アクティブ型の視点からの分析（2-3文）",
      "caution": "アクティブ型の視点からの注意点（1-2文）",
      "keyCondition": "アクティブ型の視点で注目すべき条件"
    }
  }
}

${PROMPT_MARKET_SIGNAL_DEFINITION}

【スコアの算出基準】
■ technicalScore（テクニカルスコア 0-100）:
- 80-100: 強い上昇シグナル（RSI好転 + MACD好転 + チャートパターン好転 + 出来高増加）
- 60-79: やや上昇優勢（複数のテクニカル指標がポジティブ）
- 40-59: 中立（シグナルが混在）
- 20-39: やや下落優勢（複数のテクニカル指標がネガティブ）
- 0-19: 強い下落シグナル

■ fundamentalScore（ファンダメンタルスコア 0-100）:
- 80-100: 優良（高ROE + 成長 + 割安 + 黒字 + 財務健全）
- 60-79: 良好（大半の指標がポジティブ）
- 40-59: 普通（良い面と課題が混在）
- 20-39: やや課題あり（赤字、成長鈍化、割高のいずれか）
- 0-19: 課題多い（複数の指標がネガティブ）

■ healthRank（総合健全性ランク A-E）:
- A: 両スコアとも高く、懸念材料が少ない
- B: 全体的にポジティブだが一部課題あり
- C: ポジティブ・ネガティブが混在
- D: 課題が多く改善が必要
- E: 深刻な懸念あり（赤字+高ボラ+下落トレンド等）

【トレンド収束分析】
短期・中期・長期のトレンドが異なる方向を示している場合:
1. 乖離のタイプを判定
2. 過去の類似パターンから収束までの日数を推定
3. 変化を確認するための条件を提示
トレンドがすべて同じ方向の場合は divergenceType: "aligned" とし、null フィールドは null に

【トレンドの見通し】
${
  hasPreviousAnalysis
    ? `- 前回の分析データは参考情報として扱い、最新データを最優先で判断してください`
    : `- テクニカル指標・チャートパターン・ファンダメンタルを根拠として見通しを記述してください`
}
- 価格予測は出さないこと（支持線・抵抗線の情報はシステム側で付与します）
- 好調を過信せず、反落・天井圏・材料出尽くしの可能性を常に考慮してください

【制約】
${PROMPT_NEWS_CONSTRAINTS}
- 「買い時」「売り時」「今すぐ買うべき」「売却を検討」等の行動指示は絶対に使わないこと
- 「注目に値する」「ポジティブなシグナルが出ている」「リスクが高まっている」等の客観表現を使う
- 赤字企業はconcernsで必ず言及
- 専門用語は必ず簡単な解説を添える
- positives、concernsは「・項目1\\n・項目2」形式の文字列で返す
- チャートパターンが検出された場合は、reasonで言及する
`;
}
