export interface WatchlistStockForSimulation {
  stockId: string;
  name: string;
  tickerCode: string;
  sector: string | null;
}

export function buildPortfolioOverallAnalysisPrompt(params: {
  portfolioCount: number;
  watchlistCount: number;
  totalValue: number;
  totalCost: number;
  unrealizedGain: number;
  unrealizedGainPercent: number;
  portfolioVolatility: number | null;
  sectorBreakdownText: string;
  portfolioStocksText: string;
  watchlistStocksText: string;
  hasEarningsData: boolean;
  profitableCount: number;
  increasingCount: number;
  decreasingCount: number;
  unprofitablePortfolioNames: string[];
  unprofitableWatchlistNames: string[];
  watchlistForSimulation: WatchlistStockForSimulation[];
  stockDailyMovementsText: string;
  soldStocksText: string;
  sectorTrendsText: string;
  upcomingEarningsText: string;
}): string {
  const {
    portfolioCount,
    watchlistCount,
    totalValue,
    totalCost,
    unrealizedGain,
    unrealizedGainPercent,
    portfolioVolatility,
    sectorBreakdownText,
    portfolioStocksText,
    watchlistStocksText,
    hasEarningsData,
    profitableCount,
    increasingCount,
    decreasingCount,
    unprofitablePortfolioNames,
    unprofitableWatchlistNames,
    watchlistForSimulation,
    stockDailyMovementsText,
    soldStocksText,
    sectorTrendsText,
    upcomingEarningsText,
  } = params;

  return `あなたは投資初心者向けのAIコーチです。
以下のポートフォリオ情報を分析し、総評と指標別の解説、そして今日の日次コメンタリーを提供してください。

【ポートフォリオ情報】
- 保有銘柄数: ${portfolioCount}銘柄
- ウォッチリスト銘柄数: ${watchlistCount}銘柄
- 総資産額: ¥${Math.round(totalValue).toLocaleString()}
- 総投資額: ¥${Math.round(totalCost).toLocaleString()}
- 含み損益: ¥${Math.round(unrealizedGain).toLocaleString()}（${unrealizedGainPercent >= 0 ? "+" : ""}${unrealizedGainPercent.toFixed(1)}%）

【保有銘柄】
${portfolioStocksText}

【セクター構成】
${sectorBreakdownText}

【ボラティリティ】
- ポートフォリオ全体: ${portfolioVolatility != null ? portfolioVolatility.toFixed(1) + "%" : "データなし"}

【業績状況】
${hasEarningsData ? `- 黒字銘柄: ${profitableCount}/${portfolioCount}銘柄
- 増益傾向: ${increasingCount}銘柄
- 減益傾向: ${decreasingCount}銘柄` : "業績データなし"}

【⚠️ リスク警告: 赤字銘柄】
${unprofitablePortfolioNames.length > 0
  ? `ポートフォリオ: ${unprofitablePortfolioNames.join("、")}（${unprofitablePortfolioNames.length}銘柄が赤字）`
  : "ポートフォリオ: 赤字銘柄なし"}
${unprofitableWatchlistNames.length > 0
  ? `ウォッチリスト: ${unprofitableWatchlistNames.join("、")}（${unprofitableWatchlistNames.length}銘柄が赤字）`
  : "ウォッチリスト: 赤字銘柄なし"}

【ウォッチリスト銘柄】
${watchlistStocksText}

【今日の値動きデータ】
${stockDailyMovementsText}

【本日の売却取引】
${soldStocksText}

【セクタートレンド】
${sectorTrendsText}

【今後7日間の決算予定】
${upcomingEarningsText}

【回答形式】
以下のJSON形式で回答してください。

{
  "overallSummary": "全体の総評を初心者向けに2-3文で。専門用語を使う場合は括弧で解説を添える",
  "overallStatus": "好調/順調/やや低調/注意/要確認のいずれか",
  "overallStatusType": "excellent/good/neutral/caution/warningのいずれか",
  "metricsAnalysis": {
    "sectorDiversification": {
      "value": "最も比率の高いセクターと比率（例: 67%（テクノロジー））",
      "explanation": "セクター分散の意味と重要性を中学生でも分かる言葉で1-2文",
      "evaluation": "評価（優秀/適正/注意など）",
      "evaluationType": "good/neutral/warning",
      "action": "具体的な改善アクション（なければ「現状維持で問題ありません」）"
    },
    "profitLoss": {
      "value": "含み損益額と率（例: +12,500円（+8.5%））",
      "explanation": "損益状況の解説を1-2文",
      "evaluation": "評価（好調/順調/やや低調/注意など）",
      "evaluationType": "good/neutral/warning",
      "action": "アドバイス"
    },
    "volatility": {
      "value": "ボラティリティ値（例: 18.5%）",
      "explanation": "ボラティリティの意味と現在の評価を1-2文",
      "evaluation": "評価（安定/普通/やや高め/高めなど）",
      "evaluationType": "good/neutral/warning",
      "action": "アドバイス"
    }
  },
  "actionSuggestions": [
    {
      "priority": 1,
      "title": "最も重要なアクションのタイトル",
      "description": "具体的な説明",
      "type": "diversify/rebalance/hold/take_profit/cut_loss"
    }
  ],
  "watchlistSimulation": ${watchlistForSimulation.length > 0 ? `{
    "stocks": [
      ${watchlistForSimulation.map(ws => `{
        "stockId": "${ws.stockId}",
        "stockName": "${ws.name}",
        "tickerCode": "${ws.tickerCode}",
        "sector": "${ws.sector || "その他"}",
        "predictedImpact": {
          "sectorConcentrationChange": -5.0,
          "diversificationScore": "改善/悪化/変化なし",
          "recommendation": "この銘柄を追加した場合の具体的なアドバイス"
        }
      }`).join(",")}
    ]
  }` : "null"},
  "dailyCommentary": {
    "marketSummary": "今日の市場全体の動向と、あなたのポートフォリオへの影響を2-3文で。初心者向けに分かりやすく",
    "portfolioDailyReturn": "ポートフォリオ全体の日次リターン（例: +1.2%）。値動きデータから加重平均で算出",
    "stockHighlights": [
      {
        "stockName": "銘柄名",
        "tickerCode": "コード",
        "sector": "セクター名",
        "dailyChangeRate": 2.5,
        "weekChangeRate": 5.0,
        "analysis": "なぜこの銘柄が今日上昇/下落したか、セクター動向やテクニカル指標を踏まえて1-2文で説明",
        "technicalContext": "MA乖離率や出来高比など、テクニカル指標から読み取れるポイントを1文で"
      }
    ],
    "soldStocksAnalysis": [
      {
        "stockName": "銘柄名",
        "tickerCode": "コード",
        "sellPrice": 2500,
        "averagePurchasePrice": 2000,
        "profitLossPercent": 25.0,
        "holdingDays": 45,
        "timingEvaluation": "売却タイミングの評価（良いタイミング/やや早い/もう少し待てた等）と理由を1-2文で"
      }
    ],
    "sectorHighlights": [
      {
        "sector": "セクター名",
        "avgDailyChange": 1.2,
        "trendDirection": "up/down/neutral",
        "compositeScore": 35,
        "commentary": "セクターの動向とポートフォリオへの影響を1文で"
      }
    ],
    "tomorrowWatchpoints": [
      "明日以降に注意すべきポイントを箇条書きで（決算発表、テクニカル水準、セクター動向など）"
    ]
  }
}

【日次コメンタリーの指針】
- stockHighlightsは保有銘柄すべてと本日全売却した銘柄（【本日全売却】マーク付き）について記載する（値動きが大きい順に並べる）
- soldStocksAnalysisは本日の売却取引がある場合のみ記載（なければ空配列）
- sectorHighlightsはポートフォリオに関連するセクターのみ記載
- tomorrowWatchpointsは決算予定、テクニカル指標のシグナル、セクター動向から注目ポイントを2-4個程度
- 「なぜ下がったか」「なぜ上がったか」の理由をセクター動向やテクニカル指標と関連付けて説明する

【表現の指針】
- 専門用語には必ず解説を添える（例：「ボラティリティ（値動きの激しさ）」）
- 数値の基準を具体的に説明する（例：「20%以下は比較的安定」）
- 行動につながる具体的なアドバイスを含める
- ネガティブな内容も前向きな表現で伝える

【重要: ハルシネーション防止】
- 提供されたデータのみを使用してください
- 決算発表、業績予想、ニュースなど、提供されていない情報を創作しないでください
- 銘柄の将来性について断定的な予測をしないでください
- 不明なデータは「データがないため判断できません」と明示してください`;
}
