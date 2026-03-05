import { prisma } from "@/lib/prisma";
import { getOpenAIClient } from "@/lib/openai";
import { getRelatedNews, formatNewsForPrompt } from "@/lib/news-rag";
import {
  fetchHistoricalPrices,
  fetchStockPrices,
} from "@/lib/stock-price-fetcher";
import {
  buildFinancialMetrics,
  buildCandlestickContext,
  buildTechnicalContext,
  buildChartPatternContext,
  buildWeekChangeContext,
  buildMarketContext,
  buildDefensiveModeContext,
  buildDeviationRateContext,
  buildDelistingContext,
  buildVolumeAnalysisContext,
  buildRelativeStrengthContext,
  buildTrendlineContext,
  buildTimingIndicatorsContext,
  buildEarningsContext,
  buildExDividendContext,
  buildGeopoliticalRiskContext,
  buildFuturesContext,
  buildSectorComparisonContext,
  type GeopoliticalRiskData,
  type FuturesContextData,
} from "@/lib/stock-analysis-context";
import { buildStockReportPrompt } from "@/lib/prompts/stock-report-prompt";
import { MA_DEVIATION, getSectorGroup } from "@/lib/constants";
import {
  calculateDeviationRate,
  calculateRSI,
  calculateMACD,
  findSupportResistance,
} from "@/lib/technical-indicators";
import { getTodayForDB } from "@/lib/date-utils";
import { getNikkei225Data, MarketIndexData } from "@/lib/market-index";
import type { ReportStyleAnalysis, StyleAnalysesMap } from "@/lib/style-analysis";
import {
  generateStockAlerts,
  assessGeopoliticalRisk,
  type StockAlert,
} from "@/lib/stock-safety-rules";
import { AnalysisError } from "@/lib/portfolio-analysis-core";
import {
  getCombinedSignal,
  analyzeSingleCandle,
} from "@/lib/candlestick-patterns";
import { detectChartPatterns } from "@/lib/chart-patterns";
import { getSectorTrend, formatSectorTrendForPrompt } from "@/lib/sector-trend";

export interface StockReportResult {
  stockId: string;
  stockName: string;
  tickerCode: string;
  currentPrice: number;
  technicalScore: number;
  fundamentalScore: number;
  healthRank: string;
  alerts: StockAlert[];
  marketSignal: string | null;
  supportLevel: number | null;
  resistanceLevel: number | null;
  shortTermTrend: string | null;
  shortTermText: string | null;
  midTermTrend: string | null;
  midTermText: string | null;
  longTermTrend: string | null;
  longTermText: string | null;
  trendConvergence: object | null;
  reason: string;
  caution: string;
  advice: string | null;
  positives: string | null;
  concerns: string | null;
  suitableFor: string | null;
  keyCondition: string | null;
  analyzedAt: string;
  styleAnalyses: StyleAnalysesMap<ReportStyleAnalysis> | null;
}

/**
 * 銘柄レポートのコアロジック
 * APIルート・バッチ処理から呼ばれる単一ソースオブトゥルース
 */
export async function executeStockReport(
  userId: string | null,
  stockId: string,
  session?: string,
): Promise<StockReportResult> {
  // 銘柄情報を取得
  const stock = await prisma.stock.findUnique({
    where: { id: stockId },
    select: {
      id: true,
      tickerCode: true,
      name: true,
      sector: true,
      marketCap: true,
      dividendYield: true,
      pbr: true,
      per: true,
      roe: true,
      isProfitable: true,
      profitTrend: true,
      revenueGrowth: true,
      netIncomeGrowth: true,
      eps: true,
      fiftyTwoWeekHigh: true,
      fiftyTwoWeekLow: true,
      volatility: true,
      maDeviationRate: true,
      volumeRatio: true,
      atr14: true,
      gapUpRate: true,
      volumeSpikeRate: true,
      turnoverValue: true,
      isDelisted: true,
      fetchFailCount: true,
      nextEarningsDate: true,
      exDividendDate: true,
    },
  });

  if (!stock) {
    throw new AnalysisError("銘柄が見つかりません", "NOT_FOUND");
  }

  // ユーザー設定を取得（スタイル別分析用）
  const userSettings = userId
    ? await prisma.userSettings.findUnique({
        where: { userId },
        select: { investmentStyle: true },
      })
    : null;

  // staleチェック兼リアルタイム株価取得
  const { prices: realtimePrices, staleTickers: staleCheck } =
    await fetchStockPrices([stock.tickerCode]);
  if (staleCheck.includes(stock.tickerCode)) {
    throw new AnalysisError(
      "最新の株価が取得できないため分析がおこなえません",
      "STALE_DATA",
    );
  }

  // 直近3ヶ月の価格データを取得
  const historicalPrices = await fetchHistoricalPrices(stock.tickerCode, MA_DEVIATION.FETCH_PERIOD);
  const prices = historicalPrices.slice(-MA_DEVIATION.FETCH_SLICE);

  if (prices.length === 0) {
    throw new AnalysisError("価格データがありません", "NO_PRICE_DATA");
  }

  const currentPrice =
    realtimePrices[0]?.currentPrice ??
    (prices[0] ? Number(prices[0].close) : 0);

  // テクニカル分析コンテキスト構築
  const patternContext = buildCandlestickContext(prices);
  const technicalContext = buildTechnicalContext(prices);
  const chartPatternContext = buildChartPatternContext(prices, userSettings?.investmentStyle);
  const deviationRateContext = buildDeviationRateContext(prices);
  const volumeAnalysisContext = buildVolumeAnalysisContext(prices);
  const trendlineContext = buildTrendlineContext(prices);
  const timingIndicatorsContext = buildTimingIndicatorsContext(
    stock.gapUpRate ? Number(stock.gapUpRate) : null,
    stock.volumeSpikeRate ? Number(stock.volumeSpikeRate) : null,
    stock.turnoverValue ? Number(stock.turnoverValue) : null,
  );

  // 関連ニュース
  const tickerCode = stock.tickerCode.replace(".T", "");
  const news = await getRelatedNews({
    tickerCodes: [tickerCode],
    sectors: getSectorGroup(stock.sector) ? [getSectorGroup(stock.sector)!] : [],
    limit: 5,
    daysAgo: 7,
  });
  const newsContext =
    news.length > 0
      ? `\n【最新のニュース情報】\n${formatNewsForPrompt(news)}`
      : "";

  // 前回の分析データ（参考情報）
  const analysis = await prisma.stockAnalysis.findFirst({
    where: { stockId },
    orderBy: { analyzedAt: "desc" },
  });

  const trendLabel = (trend: string) =>
    trend === "up" ? "上昇" : trend === "down" ? "下落" : "横ばい";

  const previousAnalysisContext = analysis
    ? `
【前回の分析データ（参考情報）】
■ 短期: ${trendLabel(analysis.shortTermTrend)} — ${analysis.shortTermText || ""}
■ 中期: ${trendLabel(analysis.midTermTrend)} — ${analysis.midTermText || ""}
■ 長期: ${trendLabel(analysis.longTermTrend)} — ${analysis.longTermText || ""}
■ アドバイス: ${analysis.advice || ""}
`
    : "";

  // 市場全体の状況
  let marketData: MarketIndexData | null = null;
  try {
    marketData = await getNikkei225Data();
  } catch (error) {
    console.error("市場データ取得失敗:", error);
  }

  // 週間変化率
  const { text: weekChangeContext, rate: weekChangeRate } =
    buildWeekChangeContext(prices);

  // 地政学リスク指標
  const todayForDB = getTodayForDB();
  const preMarketData = await prisma.preMarketData.findFirst({
    where: { date: todayForDB },
    select: {
      vixClose: true, vixChangeRate: true,
      wtiClose: true, wtiChangeRate: true,
      nikkeiFuturesChangeRate: true, sp500ChangeRate: true,
    },
  });
  const geopoliticalRiskData: GeopoliticalRiskData = {
    vixClose: preMarketData?.vixClose ? Number(preMarketData.vixClose) : null,
    vixChangeRate: preMarketData?.vixChangeRate ? Number(preMarketData.vixChangeRate) : null,
    wtiClose: preMarketData?.wtiClose ? Number(preMarketData.wtiClose) : null,
    wtiChangeRate: preMarketData?.wtiChangeRate ? Number(preMarketData.wtiChangeRate) : null,
  };
  const futuresData: FuturesContextData = {
    nikkeiFuturesChangeRate: preMarketData?.nikkeiFuturesChangeRate ? Number(preMarketData.nikkeiFuturesChangeRate) : null,
    sp500ChangeRate: preMarketData?.sp500ChangeRate ? Number(preMarketData.sp500ChangeRate) : null,
  };

  // 地政学リスクレベル算出
  const negativeGeoNewsCount = await prisma.marketNews.count({
    where: {
      category: "geopolitical",
      sentiment: "negative",
      publishedAt: { gte: todayForDB },
    },
  });
  const geoRiskAssessment = assessGeopoliticalRisk({
    vixClose: geopoliticalRiskData.vixClose,
    vixChangeRate: geopoliticalRiskData.vixChangeRate,
    wtiChangeRate: geopoliticalRiskData.wtiChangeRate,
    negativeGeoNewsCount,
  });

  // 市場コンテキスト
  const marketContext = buildMarketContext(marketData) + buildGeopoliticalRiskContext(geopoliticalRiskData, geoRiskAssessment) + buildFuturesContext(futuresData);
  const defensiveModeContext = buildDefensiveModeContext(marketData);

  // セクタートレンド
  let sectorTrendContext = "";
  let sectorAvgWeekChangeRate: number | null = null;
  let sectorAvg: { avgPER: number | null; avgPBR: number | null; avgROE: number | null } | null = null;
  const stockSectorGroup = getSectorGroup(stock.sector);
  if (stockSectorGroup) {
    const sectorTrend = await getSectorTrend(stockSectorGroup);
    if (sectorTrend) {
      sectorTrendContext = `\n【セクタートレンド】\n${formatSectorTrendForPrompt(sectorTrend)}\n`;
      sectorAvgWeekChangeRate = sectorTrend.avgWeekChangeRate ?? null;
      sectorAvg = {
        avgPER: sectorTrend.avgPER ?? null,
        avgPBR: sectorTrend.avgPBR ?? null,
        avgROE: sectorTrend.avgROE ?? null,
      };
    }
  }

  // 相対強度分析
  const relativeStrengthContext = buildRelativeStrengthContext(
    weekChangeRate,
    marketData?.weekChangeRate ?? null,
    sectorAvgWeekChangeRate,
  );

  // 財務指標
  const financialMetrics = buildFinancialMetrics(stock, currentPrice);
  const sectorComparisonContext = buildSectorComparisonContext(stock, sectorAvg, stock.sector);

  // データ取得不可コンテキスト
  const delistingContext = buildDelistingContext(stock.isDelisted, stock.fetchFailCount);

  // 決算・配当落ちコンテキスト
  const earningsContext = buildEarningsContext(stock.nextEarningsDate, {
    isProfitable: stock.isProfitable,
    profitTrend: stock.profitTrend,
    revenueGrowth: stock.revenueGrowth ? Number(stock.revenueGrowth) : null,
    netIncomeGrowth: stock.netIncomeGrowth ? Number(stock.netIncomeGrowth) : null,
    eps: stock.eps ? Number(stock.eps) : null,
    per: stock.per ? Number(stock.per) : null,
  });
  const exDividendContext = buildExDividendContext(
    stock.exDividendDate,
    stock.dividendYield ? Number(stock.dividendYield) : null,
  );

  // ユーザー設定コンテキスト
  const styleMap: Record<string, string> = {
    CONSERVATIVE: "安定配当型",
    BALANCED: "成長投資型",
    AGGRESSIVE: "アクティブ型",
  };
  const userContext = userSettings
    ? `\n【ユーザーの投資スタイル】\n- ${styleMap[userSettings.investmentStyle] || userSettings.investmentStyle}\n`
    : "";

  // プロンプト構築
  const prompt = buildStockReportPrompt({
    stockName: stock.name,
    tickerCode: stock.tickerCode,
    sector: stock.sector,
    currentPrice,
    financialMetrics: financialMetrics + sectorComparisonContext,
    userContext,
    previousAnalysisContext,
    pricesCount: prices.length,
    delistingContext,
    weekChangeContext,
    marketContext: marketContext + defensiveModeContext + earningsContext + exDividendContext,
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
    hasPreviousAnalysis: analysis !== null,
    session,
  });

  // OpenAI API呼び出し
  const openai = getOpenAIClient();
  const response = await openai.chat.completions.create({
    model: "gpt-4o-mini",
    messages: [
      {
        role: "system",
        content: "You are a stock data analyst. Provide objective analysis without investment advice.",
      },
      { role: "user", content: prompt },
    ],
    temperature: 0.4,
    max_tokens: 2000,
    response_format: {
      type: "json_schema",
      json_schema: {
        name: "stock_report",
        strict: true,
        schema: {
          type: "object",
          properties: {
            technicalScore: { type: "integer" },
            fundamentalScore: { type: "integer" },
            healthRank: { type: "string", enum: ["A", "B", "C", "D", "E"] },
            marketSignal: { type: "string", enum: ["bullish", "neutral", "bearish"] },
            shortTermTrend: { type: "string", enum: ["up", "neutral", "down"] },
            shortTermText: { type: "string" },
            midTermTrend: { type: "string", enum: ["up", "neutral", "down"] },
            midTermText: { type: "string" },
            longTermTrend: { type: "string", enum: ["up", "neutral", "down"] },
            longTermText: { type: "string" },
            trendConvergence: {
              type: "object",
              properties: {
                divergenceType: { type: "string", enum: ["short_down_long_up", "short_up_long_down", "aligned"] },
                estimatedConvergenceDays: { type: ["integer", "null"] },
                confidence: { type: "string", enum: ["high", "medium", "low"] },
                waitSuggestion: { type: "string" },
                keyLevelToWatch: { type: ["number", "null"] },
                triggerCondition: { type: "string" },
              },
              required: ["divergenceType", "estimatedConvergenceDays", "confidence", "waitSuggestion", "keyLevelToWatch", "triggerCondition"],
              additionalProperties: false,
            },
            reason: { type: "string" },
            caution: { type: "string" },
            advice: { type: "string" },
            positives: { type: ["string", "null"] },
            concerns: { type: ["string", "null"] },
            suitableFor: { type: ["string", "null"] },
            keyCondition: { type: ["string", "null"] },
            styleAnalyses: {
              type: "object",
              properties: {
                CONSERVATIVE: {
                  type: "object",
                  properties: {
                    score: { type: "integer" },
                    outlook: { type: "string" },
                    caution: { type: "string" },
                    keyCondition: { type: ["string", "null"] },
                  },
                  required: ["score", "outlook", "caution", "keyCondition"],
                  additionalProperties: false,
                },
                BALANCED: {
                  type: "object",
                  properties: {
                    score: { type: "integer" },
                    outlook: { type: "string" },
                    caution: { type: "string" },
                    keyCondition: { type: ["string", "null"] },
                  },
                  required: ["score", "outlook", "caution", "keyCondition"],
                  additionalProperties: false,
                },
                AGGRESSIVE: {
                  type: "object",
                  properties: {
                    score: { type: "integer" },
                    outlook: { type: "string" },
                    caution: { type: "string" },
                    keyCondition: { type: ["string", "null"] },
                  },
                  required: ["score", "outlook", "caution", "keyCondition"],
                  additionalProperties: false,
                },
              },
              required: ["CONSERVATIVE", "BALANCED", "AGGRESSIVE"],
              additionalProperties: false,
            },
          },
          required: [
            "technicalScore", "fundamentalScore", "healthRank",
            "marketSignal",
            "shortTermTrend", "shortTermText",
            "midTermTrend", "midTermText",
            "longTermTrend", "longTermText",
            "trendConvergence",
            "reason", "caution", "advice",
            "positives", "concerns", "suitableFor",
            "keyCondition", "styleAnalyses",
          ],
          additionalProperties: false,
        },
      },
    },
  });

  const content = response.choices[0].message.content?.trim() || "{}";
  const result = JSON.parse(content);

  // --- サポート・レジスタンスレベルの計算（過去データから） ---
  const pricesNewestFirst = [...prices].reverse().map((p) => ({
    date: p.date,
    open: p.open,
    high: p.high,
    low: p.low,
    close: p.close,
  }));

  const { supports, resistances } = findSupportResistance(pricesNewestFirst);
  const supportLevel = supports.length > 0 ? supports[0] : null;
  const resistanceLevel = resistances.length > 0 ? resistances[0] : null;

  // --- テクニカル総合シグナル（アラート生成用） ---
  const rsiValue = calculateRSI(pricesNewestFirst, 14);
  const macd = calculateMACD(pricesNewestFirst);
  const latestCandle = prices.slice(-1).map((p) => ({
    date: p.date, open: p.open, high: p.high, low: p.low, close: p.close,
  }))[0];
  const chartPatterns = detectChartPatterns(
    prices.map((p) => ({ date: p.date, open: p.open, high: p.high, low: p.low, close: p.close })),
  );
  const combinedTechnical = getCombinedSignal(
    latestCandle ? analyzeSingleCandle(latestCandle) : null,
    rsiValue,
    macd.histogram,
    chartPatterns,
  );

  // 移動平均乖離率
  const deviationRate = calculateDeviationRate(pricesNewestFirst, MA_DEVIATION.PERIOD);
  const volatility = stock.volatility ? Number(stock.volatility) : null;

  // --- アラート生成 ---
  const alerts = generateStockAlerts({
    isProfitable: stock.isProfitable,
    profitTrend: stock.profitTrend,
    volatility,
    weekChangeRate,
    deviationRate,
    nextEarningsDate: stock.nextEarningsDate,
    gapUpRate: stock.gapUpRate ? Number(stock.gapUpRate) : null,
    volumeSpikeRate: stock.volumeSpikeRate ? Number(stock.volumeSpikeRate) : null,
    isMarketCrash: marketData?.isMarketCrash === true,
    geopoliticalRiskLevel: geoRiskAssessment.level,
    technicalSignal: combinedTechnical,
  });

  // --- データベースに保存 ---
  const today = getTodayForDB();

  // StockReport (旧 PurchaseRecommendation)
  await prisma.stockReport.upsert({
    where: {
      stockId_date: { stockId, date: today },
    },
    update: {
      marketSignal: result.marketSignal || null,
      technicalScore: result.technicalScore ?? 50,
      fundamentalScore: result.fundamentalScore ?? 50,
      healthRank: result.healthRank ?? "C",
      alerts: alerts as unknown as object[],
      supportLevel: supportLevel,
      resistanceLevel: resistanceLevel,
      keyCondition: result.keyCondition || null,
      reason: result.reason,
      caution: result.caution,
      positives: result.positives || null,
      concerns: result.concerns || null,
      suitableFor: result.suitableFor || null,
      styleAnalyses: result.styleAnalyses ? JSON.parse(JSON.stringify(result.styleAnalyses)) : undefined,
      updatedAt: new Date(),
    },
    create: {
      stockId,
      date: today,
      marketSignal: result.marketSignal || null,
      technicalScore: result.technicalScore ?? 50,
      fundamentalScore: result.fundamentalScore ?? 50,
      healthRank: result.healthRank ?? "C",
      alerts: alerts as unknown as object[],
      supportLevel: supportLevel,
      resistanceLevel: resistanceLevel,
      keyCondition: result.keyCondition || null,
      reason: result.reason,
      caution: result.caution,
      positives: result.positives || null,
      concerns: result.concerns || null,
      suitableFor: result.suitableFor || null,
      styleAnalyses: result.styleAnalyses ? JSON.parse(JSON.stringify(result.styleAnalyses)) : undefined,
    },
  });

  // StockAnalysis（トレンド分析を保存）
  const now = new Date();
  const avgScore = Math.round(((result.technicalScore ?? 50) + (result.fundamentalScore ?? 50)) / 2);
  const riskLevel = alerts.some((a: StockAlert) => a.severity === "high")
    ? "high"
    : alerts.some((a: StockAlert) => a.severity === "medium")
      ? "medium"
      : "low";

  await prisma.stockAnalysis.create({
    data: {
      stockId,
      shortTermTrend: result.shortTermTrend || "neutral",
      shortTermText: result.shortTermText || "",
      midTermTrend: result.midTermTrend || "neutral",
      midTermText: result.midTermText || "",
      longTermTrend: result.longTermTrend || "neutral",
      longTermText: result.longTermText || "",
      trendConvergence: result.trendConvergence ?? undefined,
      advice: result.advice || result.reason || "",
      healthScore: avgScore,
      riskLevel,
      riskFlags: alerts.map((a: StockAlert) => a.type),
      analyzedAt: now,
    },
  });

  return {
    stockId: stock.id,
    stockName: stock.name,
    tickerCode: stock.tickerCode,
    currentPrice,
    technicalScore: result.technicalScore ?? 50,
    fundamentalScore: result.fundamentalScore ?? 50,
    healthRank: result.healthRank ?? "C",
    alerts,
    marketSignal: result.marketSignal || null,
    supportLevel,
    resistanceLevel,
    shortTermTrend: result.shortTermTrend || null,
    shortTermText: result.shortTermText || null,
    midTermTrend: result.midTermTrend || null,
    midTermText: result.midTermText || null,
    longTermTrend: result.longTermTrend || null,
    longTermText: result.longTermText || null,
    trendConvergence: result.trendConvergence ?? null,
    reason: result.reason,
    caution: result.caution,
    advice: result.advice || null,
    positives: result.positives || null,
    concerns: result.concerns || null,
    suitableFor: result.suitableFor || null,
    keyCondition: result.keyCondition || null,
    analyzedAt: today.toISOString(),
    styleAnalyses: result.styleAnalyses || null,
  };
}
