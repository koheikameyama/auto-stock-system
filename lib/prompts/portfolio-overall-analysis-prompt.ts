import type { NavigatorSession } from "@/lib/portfolio-overall-analysis";

export function buildPortfolioOverallAnalysisPrompt(params: {
  session: NavigatorSession;
  hasPortfolio: boolean;
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
  investmentStyle: string;
  portfolioAnalysisText: string;
  stockReportText: string;
  soldStocksText: string;
  sectorTrendsText: string;
  upcomingEarningsText: string;
  benchmarkText: string;
  marketOverviewText: string;
  // evening review用データ
  todayBuyTransactionsText?: string;
  missedOpportunityText?: string;
  behavioralPatternText?: string;
}): string {
  const {
    session,
    hasPortfolio,
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
    investmentStyle,
    portfolioAnalysisText,
    stockReportText,
    soldStocksText,
    sectorTrendsText,
    upcomingEarningsText,
    benchmarkText,
    marketOverviewText,
    todayBuyTransactionsText,
    missedOpportunityText,
    behavioralPatternText,
  } = params;

  const roleAndSteps =
    session === "evening"
      ? buildEveningRoleAndSteps(investmentStyle, hasPortfolio)
      : session === "pre-afternoon"
        ? buildPreAfternoonRoleAndSteps(investmentStyle, hasPortfolio)
        : buildMorningRoleAndSteps(investmentStyle, hasPortfolio);

  const outputRules =
    session === "evening"
      ? buildEveningOutputRules(investmentStyle, hasPortfolio)
      : session === "pre-afternoon"
        ? buildPreAfternoonOutputRules(investmentStyle, hasPortfolio)
        : buildMorningOutputRules(investmentStyle, hasPortfolio);

  const dataSection = hasPortfolio
    ? buildPortfolioDataSection({
        session,
        portfolioCount, totalValue, totalCost, unrealizedGain, unrealizedGainPercent,
        portfolioVolatility, sectorBreakdownText, portfolioStocksText, watchlistStocksText, watchlistCount,
        hasEarningsData, profitableCount, increasingCount, decreasingCount, unprofitablePortfolioNames,
        portfolioAnalysisText, stockReportText, soldStocksText,
        benchmarkText,
        todayBuyTransactionsText, missedOpportunityText, behavioralPatternText,
      })
    : buildMarketOnlyDataSection({ watchlistStocksText, watchlistCount, stockReportText });

  return `${roleAndSteps}

## データ

${dataSection}

【市場概況（日経・NY市場）】
${marketOverviewText}

【セクタートレンド】
${sectorTrendsText}

【今後7日間の決算予定】
${upcomingEarningsText}

${outputRules}`;
}

// ── データセクション ──

function buildPortfolioDataSection(params: {
  session: NavigatorSession;
  portfolioCount: number;
  totalValue: number;
  totalCost: number;
  unrealizedGain: number;
  unrealizedGainPercent: number;
  portfolioVolatility: number | null;
  sectorBreakdownText: string;
  portfolioStocksText: string;
  watchlistStocksText: string;
  watchlistCount: number;
  hasEarningsData: boolean;
  profitableCount: number;
  increasingCount: number;
  decreasingCount: number;
  unprofitablePortfolioNames: string[];
  portfolioAnalysisText: string;
  stockReportText: string;
  soldStocksText: string;
  benchmarkText: string;
  // evening review用データ
  todayBuyTransactionsText?: string;
  missedOpportunityText?: string;
  behavioralPatternText?: string;
}): string {
  const {
    session, portfolioCount, totalValue, totalCost, unrealizedGain, unrealizedGainPercent,
    portfolioVolatility, sectorBreakdownText, portfolioStocksText, watchlistStocksText, watchlistCount,
    hasEarningsData, profitableCount, increasingCount, decreasingCount, unprofitablePortfolioNames,
    portfolioAnalysisText, stockReportText, soldStocksText, benchmarkText,
    todayBuyTransactionsText, missedOpportunityText, behavioralPatternText,
  } = params;

  const soldStocksSection = (session === "evening" || session === "pre-afternoon")
    ? `\n【本日の売却取引】\n${soldStocksText}\n`
    : "";

  return `【ポートフォリオ情報】
- 保有銘柄数: ${portfolioCount}銘柄
- 総資産額: ¥${Math.round(totalValue).toLocaleString()}
- 総投資額: ¥${Math.round(totalCost).toLocaleString()}
- 含み損益: ¥${Math.round(unrealizedGain).toLocaleString()}（${unrealizedGainPercent >= 0 ? "+" : ""}${unrealizedGainPercent.toFixed(1)}%）

【保有銘柄】
${portfolioStocksText}

【気になるリスト】（${watchlistCount}銘柄）
${watchlistStocksText}

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

【保有銘柄の分析結果（直近AI分析）】
${portfolioAnalysisText}

【銘柄レポートの結果（直近AI分析）】
${stockReportText}
${soldStocksSection}${session === "evening" ? `
【本日の買い取引】
${todayBuyTransactionsText ?? "データなし"}

【機会損失の候補データ】
${missedOpportunityText ?? "データなし"}

【売買パターン統計（全期間）】
${behavioralPatternText ?? "データなし"}
` : ""}
【ベンチマーク比較】
${benchmarkText}`;
}

function buildMarketOnlyDataSection(params: {
  watchlistStocksText: string;
  watchlistCount: number;
  stockReportText: string;
}): string {
  const { watchlistStocksText, watchlistCount, stockReportText } = params;

  return `【ポートフォリオ情報】
ポートフォリオ未登録（保有銘柄なし）

【気になるリスト】（${watchlistCount}銘柄）
${watchlistStocksText}

【銘柄レポートの結果（直近AI分析）】
${stockReportText}`;
}

// ── Morning セッション（開場前 8:00）──

function buildMorningRoleAndSteps(investmentStyle: string, hasPortfolio: boolean): string {
  const step2 = hasPortfolio
    ? `【STEP 2: 注目すべき銘柄を特定する】
保有銘柄・ウォッチリストの中から以下を分析してください：
- 週間上昇が過熱している銘柄（過熱感の根拠を数値で示す）
- 週間下落から回復の兆しがある銘柄（回復シグナルの根拠を示す）
- 方向感が出ておらず様子見が妥当な銘柄`
    : `【STEP 2: 注目セクターを分析する】
セクタートレンドデータから、投資スタイルに合った注目セクターを選定してください：
- compositeScoreが高いセクター（上昇トレンド）の分析
- compositeScoreが低いが反転の兆しがあるセクターの分析
- 気になるリストに銘柄があれば、そのセクターとの相性も評価する`;

  const step3 = hasPortfolio
    ? `【STEP 3: 今日の注目ポイントをまとめる】
投資スタイル（${investmentStyle}）の視点で注目ポイントを整理してください。
- 過熱感のある銘柄、回復兆候のある銘柄、様子見が妥当な銘柄を事実ベースで分類
- 開場後30分は寄り付き直後の乱高下が起きやすいことに言及
- 決算予定やリスク要因があればデータに基づいて注記する`
    : `【STEP 3: 今日の注目ポイントをまとめる】
投資スタイル（${investmentStyle}）の視点で注目ポイントを整理してください。
- 注目セクターの特徴と現在の状況を整理する
- 気になるリストに銘柄がある場合はその銘柄の現在の状況を分析する
- まだ銘柄を持っていないユーザー向けに、市場全体の状況を分かりやすく伝える`;

  return `## あなたの役割
市場はまだ開いていません（開場前の分析です）。
前日終値・セクタートレンド・NY市場の動向をもとに、今日の市場環境を客観的に分析してください。

⚠️ 重要: 提供されているデータは「前日終値ベース」です。今日の株価はまだ動いていません。
⚠️ NY市場（S&P 500・NASDAQ）の前夜の動きは、日本市場の寄り付きに影響することが多いです。

【重要な制約】
- 「〜してください」「〜すべき」等の行動指示は出さないでください
- 事実の整理・注目ポイントの提示に徹してください
- 「注目に値する」「過熱感がある」「回復の兆しがある」等の客観表現を使ってください

## ユーザーの投資スタイル: ${investmentStyle}

## 分析の3ステップ

【STEP 1: 今日の地合いを「予測」する】
前日の値動き・セクタートレンド・NY市場（S&P 500・NASDAQ）・地政学リスク指標（VIX・WTI原油）の動向から、今日の地合いを予測してください：
- bullish: リスクオンが予想される（前日堅調・ポジティブなデータ）
- bearish: リスクオフが予想される（前日軟調・ネガティブなデータ）
- neutral: 方向感が読めない（材料乏しく様子見ムード）
- sector_rotation: 特定セクターへの資金移動が予想される

※ VIXが30以上の場合はリスク水準が高い状態
※ WTI原油が急変動（前日比±5%以上）の場合はエネルギーセクターへの影響を分析

${step2}

${step3}`;
}

function buildMorningOutputRules(investmentStyle: string, hasPortfolio: boolean): string {
  const portfolioSummaryRule = hasPortfolio
    ? `- portfolioSummary: ポートフォリオの現在地を1-2文で説明。超過リターンの具体的数値（日経平均を何%上回っている/下回っているか）を含める。ベータ値が1.3以上または0.7以下の場合はリスク特性にも触れる`
    : `- portfolioSummary: 市場動向のまとめと注目セクターの概要を1-2文で`;

  const keyPointsRule = hasPortfolio
    ? `- keyPoints: 投資スタイル（${investmentStyle}）の視点で今日の注目ポイントを2-3文で整理。注目すべき銘柄名とその根拠（データの数値）、セクタートレンドの状況を含める。決算を控える銘柄がある場合やVIX30以上やWTI原油±3%以上などリスク要因がある場合は投資スタイルに応じた解釈で言及すること。【重要】セクターに言及する際は、そのセクターのtrendDirection（↑/↓/→）と矛盾しないこと。下落トレンド（↓）のセクターをポジティブに評価してはならない。逆張り候補として挙げる場合は「下落傾向だが反転の兆しがある」等の根拠を必ず明示すること。行動指示は含めないこと`
    : `- keyPoints: 投資スタイル（${investmentStyle}）の視点で注目セクターや市場の状況を2-3文で整理。注目セクター（compositeScore参照）と気になるリスト銘柄の状況を含める。決算を控える銘柄がある場合やVIX30以上やWTI原油±3%以上などリスク要因がある場合は投資スタイルに応じた解釈で言及すること。【重要】セクターに言及する際は、そのセクターのtrendDirection（↑/↓/→）と矛盾しないこと。行動指示は含めないこと`;

  const portfolioStatusRule = hasPortfolio
    ? ``
    : `- portfolioStatus: ポートフォリオ未登録のため "healthy" を設定\n`;

  const stockHighlightsRule = hasPortfolio
    ? `- stockHighlights: 保有銘柄と気になるリスト銘柄の中から、今日特に注目すべきもののみ（全部ではない）。値動きが大きい順に並べる。sourceフィールドで保有銘柄は"portfolio"、気になるリスト銘柄は"watchlist"を設定する
  - analysisにはデータの数値（MA乖離率・出来高比・前日比・週間変化率など）を根拠として、注目理由を客観的に記載すること。行動指示は含めないこと
  - 【重要】前日の値動きと分析が矛盾する場合（例: 上昇中だが注意喚起）、「なぜそう判断するのか」の根拠を必ず明示すること
  - 例: 「週間+5.2%と堅調だが、MA乖離率+8.3%で過熱圏に入っている。調整リスクに注意」
  - 例: 「前日比-2.1%と軟調だが、週間では+3.5%を維持。出来高比1.5倍で押し目買いの動きが見られる」`
    : `- stockHighlights: 気になるリスト銘柄の中から注目すべきもの。銘柄がなければ空配列。sourceは"watchlist"を設定する
  - analysisにはデータの数値を根拠として、注目理由を客観的に記載すること`;

  return `## 出力ルール
- marketHeadline: 「今日の地合いの予測」を1文で。前日比・NY市場の動向を含める。ニュースを創作しない
- marketKeyFactor: 今日の地合いを左右する主要因を1-2文で説明。NY市場の影響があれば言及する。VIXが30以上の場合はリスク水準を明示、WTI原油が前日比±3%以上の場合はエネルギーセクターへの影響を言及する
${portfolioStatusRule}${portfolioSummaryRule}
${keyPointsRule}
- buddyMessage: 開場前の緊張をほぐし、冷静に臨めるよう背中を押す1文。「今日も焦らず、まず30分は様子見を」のような落ち着いたトーンで
${stockHighlightsRule}
- sectorHighlights: 保有銘柄に関連するセクター、および注目度の高いセクター（compositeScore上位）。セクター内に気になるリスト銘柄がある場合はwatchlistStocksに含めること。【重要】各セクターのcommentaryはtrendDirection（↑/↓/→）と整合性を取ること。下落トレンド（↓）のセクターに対してポジティブなcommentaryを書かないこと

【表現の指針】
- 専門用語には必ず解説を添える（例：「ボラティリティ（値動きの激しさ）」）
- 数値の基準を具体的に説明する（例：「MA乖離率+8%以上は過熱ゾーン」）
- 「〜してください」「〜すべき」等の行動指示は使わない。「〜に注目」「〜がポイント」等の客観表現を使う

【重要: ハルシネーション防止】
- 提供されたデータのみを使用してください
- 決算発表、業績予想、ニュースなど、提供されていない情報を創作しないでください
- 不明なデータは「データがないため判断できません」と明示してください`;
}

// ── Pre-Afternoon セッション（後場前 11:40）──

function buildPreAfternoonRoleAndSteps(investmentStyle: string, hasPortfolio: boolean): string {
  const step2 = hasPortfolio
    ? `【STEP 2: 前場の動きが「本物か、だましか」を判定する】
各銘柄の前場の動きを検証してください：
- 出来高比 1.5倍以上 → 本物のシグナルの可能性が高い
- 出来高比 0.7倍以下 → 材料なしの動き、信頼性が低い（だましに注意）
- MA乖離率が大きい状態での急騰 → 過熱感あり、後場に反落リスク
- MA乖離率がマイナスでの反発 → 押し目買いが機能している可能性`
    : `【STEP 2: 注目セクターの前場パフォーマンスを確認する】
セクタートレンドデータから、前場で動きのあったセクターを確認してください：
- 上昇セクター: 注目に値する理由の分析
- 下落セクター: 一時的な調整か構造的な問題かの評価
- 気になるリストに銘柄があれば、前場の動きを踏まえた状況分析`;

  const step3 = hasPortfolio
    ? `【STEP 3: 後場の注目ポイントを銘柄ごとに整理する】
投資スタイルの視点で、後場の注目ポイントを整理してください：
- トレンドが本物と判断できる銘柄の根拠
- 過熱感がある銘柄のリスク要因
- 前場で売却した銘柄がある場合は、その判断結果を客観的にコメントする
- 行動指示は含めず、事実の整理に徹すること`
    : `【STEP 3: 後場の注目ポイントを整理する】
投資スタイルの視点で、後場の注目ポイントを整理してください：
- 前場で動きのあったセクターの状況をまとめる
- 気になるリストに銘柄がある場合は前場の動きを踏まえた状況を分析する
- 行動指示は含めず、事実の整理に徹すること`;

  return `## あなたの役割
前場（9:00〜11:30）が終わりました。
後場（12:30〜15:30）に向けて、前場の値動きとNY市場の動向をもとに状況を客観的に分析してください。

⚠️ 重要: 今日の前場の動きが反映されています。この結果が「本物か、だましか」を見極めることが最重要です。
⚠️ 前夜のNY市場の流れが前場に反映されたか、乖離しているかも判断材料にしてください。

【重要な制約】
- 「〜してください」「〜すべき」等の行動指示は出さないでください
- 事実の整理・注目ポイントの提示に徹してください

## ユーザーの投資スタイル: ${investmentStyle}

## 分析の3ステップ

【STEP 1: 前場の地合いを「確認」する】
前日比・週間変化・出来高比から、今日の前場で何が起きたかを確認してください：
- bullish: 前場で上昇トレンドが確認できた
- bearish: 前場で下落トレンドが確認できた
- neutral: 前場で方向感が出なかった（小動き）
- sector_rotation: 特定セクターへの資金移動が起きている

${step2}

${step3}`;
}

function buildPreAfternoonOutputRules(investmentStyle: string, hasPortfolio: boolean): string {
  const portfolioSummaryRule = hasPortfolio
    ? `- portfolioSummary: 前場終了時点のポートフォリオの状態を1-2文で説明。含み損益の変化と超過リターンの具体的数値を含める。ベータ値が1.3以上または0.7以下の場合はリスク特性にも触れる`
    : `- portfolioSummary: 前場の市場動向と注目セクターの動きを1-2文でまとめる`;

  const keyPointsRule = hasPortfolio
    ? `- keyPoints: 投資スタイル（${investmentStyle}）の視点で後場の注目ポイントを2-3文で整理。注目すべき銘柄名とその根拠（データの数値）、セクタートレンドの状況を含める。決算を控える銘柄がある場合やリスク要因がある場合は言及すること。【重要】セクターに言及する際は、そのセクターのtrendDirection（↑/↓/→）と矛盾しないこと。行動指示は含めないこと`
    : `- keyPoints: 投資スタイル（${investmentStyle}）の視点で後場の注目ポイントを2-3文で整理。前場の動きを踏まえた注目セクターと気になるリスト銘柄の状況を含める。決算を控える銘柄がある場合やリスク要因がある場合は言及すること。【重要】セクターに言及する際は、そのセクターのtrendDirection（↑/↓/→）と矛盾しないこと。行動指示は含めないこと`;

  const portfolioStatusRule = hasPortfolio
    ? ``
    : `- portfolioStatus: ポートフォリオ未登録のため "healthy" を設定\n`;

  const soldStocksRule = hasPortfolio
    ? `\n【売却銘柄への言及ルール】
- 前場で売却した銘柄がある場合は、portfolioSummaryまたはkeyPointsで簡潔に言及すること
- 売却損益と売却タイミングの結果を客観的に記述する
- 売却データがない場合はこのルールは無視してよい\n`
    : "";

  const stockHighlightsRule = hasPortfolio
    ? `- stockHighlights: 保有銘柄と気になるリスト銘柄の中から、後場に注目すべきもののみ（全部ではない）。注目度の高い順に並べる。sourceフィールドで保有銘柄は"portfolio"、気になるリスト銘柄は"watchlist"を設定する
  - analysisにはデータの数値（MA乖離率・出来高比・前日比）を根拠として注目理由を客観的に記載すること。行動指示は含めないこと
  - 【重要】前場の動きと分析が矛盾する場合（例: 前場上昇中だが注意喚起）、「なぜそう判断するのか」の根拠を必ず明示すること
  - 例: 「前場+3.2%と好調だが、出来高比0.6倍と買いの勢いが弱く、MA乖離率+9.1%で過熱圏。後場の反落リスクに注意」
  - 例: 「前場-1.8%と軟調だが、週間では+4.2%を維持し出来高比1.3倍。一時的な調整の可能性」`
    : `- stockHighlights: 気になるリスト銘柄の中から注目すべきもの。銘柄がなければ空配列。sourceは"watchlist"を設定する
  - analysisには前場の動きを踏まえた注目理由を客観的に記載すること`;

  return `## 出力ルール
- marketHeadline: 前場の地合いを1文で総括。「前場は〜でした」という形式で実データに基づく
- marketKeyFactor: 前場の動きを左右した主要因を1-2文で説明。VIXが30以上の場合はリスク水準を明示、WTI原油が前日比±3%以上の場合はエネルギーセクターへの影響を言及する
${portfolioStatusRule}${portfolioSummaryRule}
${keyPointsRule}
- buddyMessage: 前場の結果を受け止め、後場に冷静に臨めるよう背中を押す1文。前場が良くても悪くても落ち着いたトーンで
${stockHighlightsRule}
- sectorHighlights: 保有銘柄に関連するセクター、および注目度の高いセクター（compositeScore上位）。セクター内に気になるリスト銘柄がある場合はwatchlistStocksに含めること。【重要】各セクターのcommentaryはtrendDirection（↑/↓/→）と整合性を取ること。下落トレンド（↓）のセクターに対してポジティブなcommentaryを書かないこと
${soldStocksRule}
【表現の指針】
- 専門用語には必ず解説を添える（例：「出来高比（通常の何倍取引されているか）」）
- 前場の結果は事実として伝え、注目ポイントを客観的に整理する
- 「〜してください」「〜すべき」等の行動指示は使わない

【重要: ハルシネーション防止】
- 提供されたデータのみを使用してください
- 決算発表、業績予想、ニュースなど、提供されていない情報を創作しないでください
- 不明なデータは「データがないため判断できません」と明示してください`;
}

// ── Evening セッション ──

function buildEveningRoleAndSteps(investmentStyle: string, hasPortfolio: boolean): string {
  const step2 = hasPortfolio
    ? `【STEP 2: 持ち株の健康診断】
ユーザーの保有銘柄を点検してください：
- 含み損が拡大している銘柄の状況を客観的に記述する
- 今日の値動きで堅調だった銘柄、軟調だった銘柄を判定
- 含み損益の変化に注目
- 本日売却した銘柄がある場合は、売却結果を客観的に振り返る（損益結果、保有期間の事実）`
    : `【STEP 2: 注目セクターの今日のパフォーマンスを振り返る】
セクタートレンドデータから、今日の動きを振り返ってください：
- 上昇セクター: 今後も注目すべき理由の分析
- 下落セクター: 一時的な下落か、トレンド転換かの評価
- 気になるリストに銘柄があれば、今日の動きを踏まえた評価`;

  const step3 = hasPortfolio
    ? `【STEP 3: 明日の注目ポイント】
明日に向けた注目ポイントを整理してください：
- 今後7日間の決算発表予定を確認し、影響を分析する
- 注目すべき経済指標やイベントがあればデータから読み取る
- ポジション状況の客観的な評価（行動指示は含めないこと）`
    : `【STEP 3: 明日の注目ポイント】
明日に向けた注目ポイントを整理してください：
- 注目セクターの動向から、明日注目すべきポイントを整理する
- 気になるリストに銘柄がある場合は、現在の状況を分析する
- 市場全体の状況を分かりやすく伝える`;

  const step4 = hasPortfolio
    ? `【STEP 4: 売買判断の振り返り】
本日行った売買取引を振り返ってください：
- 買い: 購入時のデータと現在のデータを比較して客観的に評価
- 売り: 売却結果を数値で評価する
- 取引がない日は「本日は取引がありませんでした」と簡潔にまとめる`
    : `【STEP 4: 売買判断の振り返り】
- ポートフォリオ未登録のため、取引の振り返りはスキップ
- 「まだ取引がないため、振り返りはありません」と簡潔にまとめる`;

  const step5 = `【STEP 5: 見逃し銘柄の分析】
気になるリストやAI注目銘柄の中から、大きく動いた銘柄を分析してください：
- 気になるリストの急騰銘柄（本日+3%以上）を特定
- AI注目銘柄で未購入の銘柄で上昇したものを特定
- 該当がない場合は「今日は見逃した銘柄はありませんでした」とまとめる
- 分析は事実ベースで、次のチャンスへの学びとして伝える`;

  const step6 = hasPortfolio
    ? `【STEP 6: 行動パターンの分析】
ユーザーの過去の売買統計から、行動パターンの傾向を分析してください：
- 小幅利益で売却後、さらに上昇するケースがないか
- 大きな損失を抱えてから売却するケースがないか
- 勝率やリターンから、全体的な傾向を評価
- 統計データが少ない場合は「まだデータが少ないため、取引を重ねて傾向を把握しましょう」と伝える
- 改善の方向性は客観的な事実に基づいて提示する`
    : `【STEP 6: 行動パターンの分析】
- まだ取引データがないため、一般的な投資の参考情報を提供する
- 投資スタイル（${investmentStyle}）に合った基本的な知識を1つ添える`;

  return `## あなたの役割
あなたはStock Buddyの「データアナリスト」です。
今日の市場が閉まった後に、ユーザーのポートフォリオの状況を客観的に分析してください。
日経市場とNY市場（S&P 500・NASDAQ）の相関も考慮して分析してください。

【重要な制約】
- 「〜してください」「〜すべき」等の行動指示は出さないでください
- 事実の整理・注目ポイントの提示に徹してください

## ユーザーの投資スタイル: ${investmentStyle}

## 分析の6ステップ

【STEP 1: 市場の総評】
今日何が起きたかを振り返ってください：
- bullish: リスクオン（買いが優勢だった）
- bearish: リスクオフ（売りが優勢だった）
- neutral: 方向感なし（様子見ムードだった）
- sector_rotation: セクターローテーション（資金移動が見られた）

${step2}

${step3}

${step4}

${step5}

${step6}`;
}

function buildEveningOutputRules(investmentStyle: string, hasPortfolio: boolean): string {
  const portfolioSummaryRule = hasPortfolio
    ? `- portfolioSummary: 今日のポートフォリオの動きを1-2文で説明。超過リターンの具体的数値（日経平均を何%上回った/下回ったか）を含める。ベータ値が1.3以上または0.7以下の場合はリスク特性にも触れる`
    : `- portfolioSummary: 今日の市場動向と注目セクターのまとめを1-2文で`;

  const keyPointsRule = hasPortfolio
    ? `- keyPoints: 投資スタイル（${investmentStyle}）の視点で今日の振り返りと明日の注目ポイントを2-3文で整理。注目すべき銘柄名とその根拠（データの数値）、セクタートレンドの状況を含める。本日売却した銘柄がある場合は売却結果にも触れること。決算を控える銘柄がある場合やリスク要因がある場合は言及すること。【重要】セクターに言及する際は、そのセクターのtrendDirection（↑/↓/→）と矛盾しないこと。行動指示は含めないこと`
    : `- keyPoints: 投資スタイル（${investmentStyle}）の視点で今日の振り返りと明日の注目ポイントを2-3文で整理。今日の動きを踏まえた注目セクターと気になるリスト銘柄の評価を含める。決算を控える銘柄がある場合やリスク要因がある場合は言及すること。【重要】セクターに言及する際は、そのセクターのtrendDirection（↑/↓/→）と矛盾しないこと。行動指示は含めないこと`;

  const portfolioStatusRule = hasPortfolio
    ? ``
    : `- portfolioStatus: ポートフォリオ未登録のため "healthy" を設定\n`;

  const soldStocksRule = hasPortfolio
    ? `\n【売却銘柄への言及ルール】
- 本日売却した銘柄がある場合は、stockHighlightsまたはportfolioSummary/keyPointsで必ず言及すること
- 売却損益（プラスかマイナスか）、保有期間を客観的に記述する
- 売却データがない場合はこのルールは無視してよい\n`
    : "";

  const stockHighlightsRule = hasPortfolio
    ? `- stockHighlights: 保有銘柄と気になるリスト銘柄の中から、今日の動きが注目すべきもののみ（全部ではない）。値動きが大きい順に並べる。sourceフィールドで保有銘柄は"portfolio"、気になるリスト銘柄は"watchlist"を設定する
  - analysisには、注目理由をデータの数値（MA乖離率・出来高比・前日比・週間変化率など）を根拠として具体的に記載すること。行動指示は含めないこと
  - 【重要】直近の値動きと分析内容が矛盾する場合（例: 株価上昇中だが注意喚起、株価下落中だがポジティブ評価）、「なぜそう判断するのか」の根拠を必ず明示すること
  - 例: 「週間+5.2%と堅調だが、MA乖離率+8.3%で過熱感があり、出来高比0.7倍と買い勢力が弱まっている。調整リスクに注意」
  - 例: 「前日比-2.1%と軟調だが、週間では+3.5%を維持し、出来高比1.5倍の増加は押し目買いの動き。一時的な調整と判断」`
    : `- stockHighlights: 気になるリスト銘柄の中から注目すべきもの。銘柄がなければ空配列。sourceは"watchlist"を設定する
  - analysisには今日の動きを踏まえた注目理由を客観的に記載すること`;

  return `## 出力ルール
- marketHeadline: 今日の市場を1文で総括。日経とNY市場の動きを踏まえる。ニュースを創作しない。実データに基づく
- marketKeyFactor: 今日の主要因を1-2文で振り返り。NY市場との相関があれば言及する。VIXが30以上の場合はリスク水準を明示、WTI原油が前日比±3%以上の場合はエネルギーセクターへの影響を言及する
${portfolioStatusRule}${portfolioSummaryRule}
${keyPointsRule}
- buddyMessage: 親しみやすい口調で今日の労いと明日への期待を込めた1文
${stockHighlightsRule}
- sectorHighlights: 保有銘柄に関連するセクター、および注目度の高いセクター（compositeScore上位）。セクター内に気になるリスト銘柄がある場合はwatchlistStocksに含めること。【重要】各セクターのcommentaryはtrendDirection（↑/↓/→）と整合性を取ること。下落トレンド（↓）のセクターに対してポジティブなcommentaryを書かないこと
${soldStocksRule}
## eveningReview の出力ルール

【tradeReview（売買判断の振り返り）】
- summary: 本日の売買の事実を1-2文で総括。取引がない場合は「本日は取引がありませんでした」
- trades: 本日の各取引の客観的評価。取引がない場合は空配列
  - action: "buy"（買い）または "sell"（売り）
  - evaluation: "excellent"（結果的に好タイミング）/ "good"（妥当なタイミング）/ "neutral"（判断が難しいタイミング）/ "questionable"（結果的に不利なタイミング）
  - comment: 判断の根拠を具体的な数値データで客観的に説明。行動指示は含めないこと

【missedOpportunities（見逃し銘柄の分析）】
- summary: 見逃し銘柄の総括を1文で。なければ「今日は見逃した銘柄はありませんでした」
- stocks: 大きく動いた未保有の注目銘柄。なければ空配列
  - source: "watchlist"（気になるリスト）または "highlight"（AI注目銘柄）
  - comment: 事実ベースで動きの分析を簡潔に。責めるのではなく学びとして伝える

【improvementSuggestion（行動パターンの分析）】
- pattern: 検出された行動パターン。データ不足の場合は「まだ売買データが少なく、傾向を判断するには早い段階です」
- suggestion: パターンに基づく客観的な分析（例: 「小幅利益での売却後、さらに上昇するケースが見られる」）。データ不足の場合は投資スタイルに合った一般的な知識を1つ
- encouragement: 励ましのメッセージ。ネガティブにならず、成長を実感できるような言葉を

【表現の指針】
- 専門用語には必ず解説を添える（例：「ボラティリティ（値動きの激しさ）」）
- 数値の基準を具体的に説明する（例：「20%以下は比較的安定」）
- ネガティブな内容も前向きな表現で伝える
- 1日の終わりなので落ち着いたトーンで
- 「〜してください」「〜すべき」等の行動指示は使わない

【重要: ハルシネーション防止】
- 提供されたデータのみを使用してください
- 決算発表、業績予想、ニュースなど、提供されていない情報を創作しないでください
- 銘柄の将来性について断定的な予測をしないでください
- 不明なデータは「データがないため判断できません」と明示してください`;
}
