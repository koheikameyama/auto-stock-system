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
  buildGapFillContext,
  buildSupportResistanceContext,
  buildTrendlineContext,
  buildEarningsContext,
  buildExDividendContext,
  buildGeopoliticalRiskContext,
  buildSectorComparisonContext,
  type GeopoliticalRiskData,
} from "@/lib/stock-analysis-context";
import { buildPortfolioAnalysisPrompt } from "@/lib/prompts/portfolio-analysis-prompt";
import { getNikkei225Data } from "@/lib/market-index";
import { getSectorTrend, formatSectorTrendForPrompt } from "@/lib/sector-trend";
import { MA_DEVIATION, getSectorGroup } from "@/lib/constants";
import { getTodayForDB } from "@/lib/date-utils";
import {
  assessGeopoliticalRisk,
  generateStockAlerts,
  type StockAlert,
} from "@/lib/stock-safety-rules";
import { findSupportResistance } from "@/lib/technical-indicators";
import dayjs from "dayjs";
import utc from "dayjs/plugin/utc";
import timezone from "dayjs/plugin/timezone";

dayjs.extend(utc);
dayjs.extend(timezone);

export class AnalysisError extends Error {
  constructor(
    message: string,
    public readonly code:
      | "NOT_FOUND"
      | "STALE_DATA"
      | "NO_PRICE_DATA"
      | "INTERNAL",
  ) {
    super(message);
  }
}

export interface PortfolioAnalysisResult {
  healthScore: number;
  riskLevel: string;
  riskFlags: string[];
  shortTerm: string;
  shortTermText: string;
  mediumTerm: string;
  midTermText: string;
  longTerm: string;
  longTermText: string;
  shortTermTrend: string;
  midTermTrend: string;
  longTermTrend: string;
  marketSignal: string | null;
  advice: string;
  caution: string;
  trendConvergence: {
    divergenceType: string;
    estimatedConvergenceDays: number | null;
    confidence: string;
    waitSuggestion: string;
    keyLevelToWatch: number | null;
    triggerCondition: string;
  } | null;
  supportLevel: number | null;
  resistanceLevel: number | null;
  lastAnalysis: string;
  isToday: true;
}

/** AI レスポンスの JSON Schema（strict mode） */
const STYLE_SCHEMA = {
  type: "object" as const,
  properties: {
    score: { type: "integer" as const },
    outlook: { type: "string" as const },
    caution: { type: "string" as const },
    keyCondition: { type: ["string", "null"] as const },
  },
  required: ["score", "outlook", "caution", "keyCondition"] as const,
  additionalProperties: false as const,
};

const PORTFOLIO_ANALYSIS_SCHEMA = {
  type: "object" as const,
  properties: {
    marketSignal: {
      type: "string" as const,
      enum: ["bullish", "neutral", "bearish"],
    },
    healthScore: { type: "integer" as const },
    shortTerm: { type: "string" as const },
    shortTermTrend: { type: "string" as const, enum: ["up", "neutral", "down"] },
    shortTermText: { type: "string" as const },
    mediumTerm: { type: "string" as const },
    midTermTrend: { type: "string" as const, enum: ["up", "neutral", "down"] },
    midTermText: { type: "string" as const },
    longTerm: { type: "string" as const },
    longTermTrend: { type: "string" as const, enum: ["up", "neutral", "down"] },
    longTermText: { type: "string" as const },
    trendConvergence: {
      type: "object" as const,
      properties: {
        divergenceType: { type: "string" as const, enum: ["short_down_long_up", "short_up_long_down", "aligned"] },
        estimatedConvergenceDays: { type: ["integer", "null"] as const },
        confidence: { type: "string" as const, enum: ["high", "medium", "low"] },
        waitSuggestion: { type: "string" as const },
        keyLevelToWatch: { type: ["number", "null"] as const },
        triggerCondition: { type: "string" as const },
      },
      required: ["divergenceType", "estimatedConvergenceDays", "confidence", "waitSuggestion", "keyLevelToWatch", "triggerCondition"] as const,
      additionalProperties: false as const,
    },
    advice: { type: "string" as const },
    caution: { type: "string" as const },
    styleAnalyses: {
      type: "object" as const,
      properties: {
        CONSERVATIVE: STYLE_SCHEMA,
        BALANCED: STYLE_SCHEMA,
        AGGRESSIVE: STYLE_SCHEMA,
      },
      required: ["CONSERVATIVE", "BALANCED", "AGGRESSIVE"] as const,
      additionalProperties: false as const,
    },
  },
  required: [
    "marketSignal", "healthScore",
    "shortTerm", "shortTermTrend", "shortTermText",
    "mediumTerm", "midTermTrend", "midTermText",
    "longTerm", "longTermTrend", "longTermText",
    "trendConvergence", "advice", "caution", "styleAnalyses",
  ] as const,
  additionalProperties: false as const,
};

/**
 * アラートの重大度からリスクレベルを算出
 */
function computeRiskLevel(
  alerts: StockAlert[],
  healthScore: number,
): "high" | "medium" | "low" {
  const hasHigh = alerts.some((a) => a.severity === "high");
  if (hasHigh || healthScore < 30) return "high";
  const hasMedium = alerts.some((a) => a.severity === "medium");
  if (hasMedium || healthScore < 50) return "medium";
  return "low";
}

/**
 * ポートフォリオ分析のコアロジック
 * APIルート・fire-and-forget両方から呼ばれる単一ソースオブトゥルース
 */
export async function executePortfolioAnalysis(
  userId: string,
  stockId: string,
): Promise<PortfolioAnalysisResult> {
  // ポートフォリオ銘柄と株式情報を取得
  const portfolioStock = await prisma.portfolioStock.findFirst({
    where: { userId, stockId },
    include: {
      stock: true,
      transactions: { orderBy: { transactionDate: "asc" } },
    },
  });

  if (!portfolioStock) {
    throw new AnalysisError(
      "この銘柄はポートフォリオに登録されていません",
      "NOT_FOUND",
    );
  }

  // 保有数量と平均取得単価を計算
  let quantity = 0;
  let totalBuyCost = 0;
  let totalBuyQuantity = 0;
  for (const tx of portfolioStock.transactions) {
    if (tx.type === "buy") {
      quantity += tx.quantity;
      totalBuyCost += Number(tx.totalAmount);
      totalBuyQuantity += tx.quantity;
    } else {
      quantity -= tx.quantity;
    }
  }

  if (quantity <= 0) {
    throw new AnalysisError(
      "保有数がゼロの銘柄は分析できません",
      "NOT_FOUND",
    );
  }

  const averagePrice =
    totalBuyQuantity > 0 ? totalBuyCost / totalBuyQuantity : 0;

  // ユーザー設定を取得
  const userSettings = await prisma.userSettings.findUnique({
    where: { userId },
    select: { investmentStyle: true },
  });

  // staleチェック
  const { prices: realtimePrices, staleTickers: staleCheck } =
    await fetchStockPrices([portfolioStock.stock.tickerCode]);
  if (staleCheck.includes(portfolioStock.stock.tickerCode)) {
    throw new AnalysisError(
      "最新の株価が取得できないため分析がおこなえません",
      "STALE_DATA",
    );
  }

  const currentPrice = realtimePrices[0]?.currentPrice ?? null;

  // 損益計算
  let profit: number | null = null;
  let profitPercent: number | null = null;
  if (currentPrice && averagePrice > 0 && quantity > 0) {
    const totalCost = averagePrice * quantity;
    const currentValue = currentPrice * quantity;
    profit = currentValue - totalCost;
    profitPercent = (profit / totalCost) * 100;
  }

  // テクニカル分析用データ取得
  const historicalPrices = await fetchHistoricalPrices(
    portfolioStock.stock.tickerCode,
    MA_DEVIATION.FETCH_PERIOD,
  );
  const prices = historicalPrices.slice(-MA_DEVIATION.FETCH_SLICE);

  // コンテキスト構築
  const stock = portfolioStock.stock;
  const patternContext = buildCandlestickContext(prices);
  const technicalContext = buildTechnicalContext(prices);
  const chartPatternContext = buildChartPatternContext(prices, userSettings?.investmentStyle);
  const { text: weekChangeContext, rate: weekChangeRate } = buildWeekChangeContext(prices);
  const deviationRateContext = buildDeviationRateContext(prices);
  const volumeAnalysisContext = buildVolumeAnalysisContext(prices);
  const gapFillContext = buildGapFillContext(prices);
  const supportResistanceContext = buildSupportResistanceContext(prices);
  const trendlineContext = buildTrendlineContext(prices);
  const financialMetrics = buildFinancialMetrics(stock, currentPrice);

  // 関連ニュースを取得
  const tickerCodeSlug = stock.tickerCode.replace(".T", "");
  const news = await getRelatedNews({
    tickerCodes: [tickerCodeSlug],
    sectors: getSectorGroup(stock.sector) ? [getSectorGroup(stock.sector)!] : [],
    limit: 5,
    daysAgo: 7,
  });
  const newsContext = news.length > 0
    ? `\n【最新のニュース情報】\n${formatNewsForPrompt(news)}`
    : "";

  // 市場データ
  let marketData = null;
  try {
    marketData = await getNikkei225Data();
  } catch (error) {
    console.error("市場データ取得失敗（フォールバック）:", error);
  }
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

  // 地政学リスク指標
  const todayForDB = getTodayForDB();
  const preMarketData = await prisma.preMarketData.findFirst({
    where: { date: todayForDB },
    select: {
      vixClose: true, vixChangeRate: true,
      wtiClose: true, wtiChangeRate: true,
    },
  });
  const geopoliticalRiskData: GeopoliticalRiskData = {
    vixClose: preMarketData?.vixClose ? Number(preMarketData.vixClose) : null,
    vixChangeRate: preMarketData?.vixChangeRate ? Number(preMarketData.vixChangeRate) : null,
    wtiClose: preMarketData?.wtiClose ? Number(preMarketData.wtiClose) : null,
    wtiChangeRate: preMarketData?.wtiChangeRate ? Number(preMarketData.wtiChangeRate) : null,
  };
  const execGeoRiskAssessment = assessGeopoliticalRisk({
    vixClose: geopoliticalRiskData.vixClose,
    vixChangeRate: geopoliticalRiskData.vixChangeRate,
    wtiChangeRate: geopoliticalRiskData.wtiChangeRate,
    negativeGeoNewsCount: 0,
  });

  const marketContext = buildMarketContext(marketData) +
    buildDefensiveModeContext(marketData) +
    buildGeopoliticalRiskContext(geopoliticalRiskData, execGeoRiskAssessment) +
    earningsContext + exDividendContext;

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

  const sectorComparisonContext = buildSectorComparisonContext(stock, sectorAvg, stock.sector);

  const relativeStrengthContext = buildRelativeStrengthContext(
    weekChangeRate,
    marketData?.weekChangeRate ?? null,
    sectorAvgWeekChangeRate,
  );

  // ユーザー設定コンテキスト
  const styleMap: Record<string, string> = {
    CONSERVATIVE: "安定配当型（守り）",
    BALANCED: "成長投資型（バランス）",
    AGGRESSIVE: "アクティブ型（攻め）",
  };
  const userContext = userSettings
    ? `\n【ユーザーの投資設定】\n- 投資スタイル: ${styleMap[userSettings.investmentStyle] || userSettings.investmentStyle}\n`
    : "";

  // プロンプト構築
  const prompt = buildPortfolioAnalysisPrompt({
    stockName: stock.name,
    tickerCode: stock.tickerCode,
    sector: stock.sector || "不明",
    quantity,
    averagePrice,
    currentPrice,
    profit,
    profitPercent,
    userContext,
    financialMetrics: financialMetrics + sectorComparisonContext,
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
  });

  // OpenAI API呼び出し
  const openai = getOpenAIClient();
  const response = await openai.chat.completions.create({
    model: "gpt-4o-mini",
    messages: [
      {
        role: "system",
        content: "You are a stock data analyst. Provide factual analysis only.",
      },
      { role: "user", content: prompt },
    ],
    temperature: 0.3,
    max_tokens: 1600,
    response_format: {
      type: "json_schema",
      json_schema: {
        name: "portfolio_analysis",
        strict: true,
        schema: PORTFOLIO_ANALYSIS_SCHEMA,
      },
    },
  });

  const content = response.choices[0].message.content?.trim() || "{}";
  const result = JSON.parse(content);

  // アラート生成
  const volatility = stock.volatility ? Number(stock.volatility) : null;
  const alerts = generateStockAlerts({
    isProfitable: stock.isProfitable,
    profitTrend: stock.profitTrend,
    volatility,
    weekChangeRate,
    deviationRate: stock.maDeviationRate ? Number(stock.maDeviationRate) : null,
    nextEarningsDate: stock.nextEarningsDate,
    gapUpRate: null,
    volumeSpikeRate: stock.volumeRatio ? Number(stock.volumeRatio) : null,
    isMarketCrash: marketData?.isMarketPanic === true,
    geopoliticalRiskLevel: execGeoRiskAssessment.level,
    technicalSignal: null,
  });

  // リスクレベル算出
  const healthScore = result.healthScore ?? 50;
  const riskLevel = computeRiskLevel(alerts, healthScore);

  // 支持線・抵抗線
  const pricesNewestFirst = [...prices].reverse().map((p) => ({
    close: p.close,
    high: p.high,
    low: p.low,
  }));
  const { supports, resistances } = findSupportResistance(pricesNewestFirst);
  const supportLevel = supports.length > 0 ? supports[0] : null;
  const resistanceLevel = resistances.length > 0 ? resistances[0] : null;

  // 保存
  const now = dayjs.utc().toDate();

  await prisma.$transaction([
    prisma.portfolioStock.update({
      where: { id: portfolioStock.id },
      data: {
        shortTerm: result.shortTerm,
        mediumTerm: result.mediumTerm,
        longTerm: result.longTerm,
        riskLevel,
        riskFlags: alerts.map((a) => a.type),
        lastAnalysis: now,
        updatedAt: now,
      },
    }),
    prisma.stockAnalysis.create({
      data: {
        stockId,
        shortTermTrend: result.shortTermTrend || "neutral",
        shortTermText: result.shortTermText || null,
        midTermTrend: result.midTermTrend || "neutral",
        midTermText: result.midTermText || null,
        longTermTrend: result.longTermTrend || "neutral",
        longTermText: result.longTermText || null,
        trendConvergence: result.trendConvergence ?? undefined,
        advice: result.advice || "",
        healthScore,
        riskLevel,
        riskFlags: alerts.map((a) => a.type),
        analyzedAt: now,
      },
    }),
  ]);

  return {
    healthScore,
    riskLevel,
    riskFlags: alerts.map((a) => a.type),
    shortTerm: result.shortTerm,
    shortTermText: result.shortTermText,
    mediumTerm: result.mediumTerm,
    midTermText: result.midTermText,
    longTerm: result.longTerm,
    longTermText: result.longTermText,
    shortTermTrend: result.shortTermTrend,
    midTermTrend: result.midTermTrend,
    longTermTrend: result.longTermTrend,
    marketSignal: result.marketSignal || null,
    advice: result.advice,
    caution: result.caution,
    trendConvergence: result.trendConvergence ?? null,
    supportLevel,
    resistanceLevel,
    lastAnalysis: now.toISOString(),
    isToday: true,
  };
}

/**
 * ポートフォリオ分析のシミュレーション（DB保存なし）
 */
export async function executeSimulatedPortfolioAnalysis(
  userId: string,
  stockId: string,
  simulatedQuantity: number,
  simulatedAveragePrice: number,
): Promise<PortfolioAnalysisResult & { currentPrice: number | null; averagePurchasePrice: number }> {
  const stock = await prisma.stock.findUnique({ where: { id: stockId } });
  if (!stock) {
    throw new AnalysisError("銘柄が見つかりません", "NOT_FOUND");
  }

  const userSettings = await prisma.userSettings.findUnique({
    where: { userId },
    select: { investmentStyle: true },
  });

  const { prices: realtimePrices, staleTickers: staleCheck } =
    await fetchStockPrices([stock.tickerCode]);
  if (staleCheck.includes(stock.tickerCode)) {
    throw new AnalysisError(
      "最新の株価が取得できないため分析がおこなえません",
      "STALE_DATA",
    );
  }

  const currentPrice = realtimePrices[0]?.currentPrice ?? null;
  const averagePrice = simulatedAveragePrice || currentPrice || 0;
  const quantity = simulatedQuantity;

  let profit: number | null = null;
  let profitPercent: number | null = null;
  if (currentPrice && averagePrice > 0 && quantity > 0) {
    const totalCost = averagePrice * quantity;
    const currentValue = currentPrice * quantity;
    profit = currentValue - totalCost;
    profitPercent = (profit / totalCost) * 100;
  }

  const historicalPrices = await fetchHistoricalPrices(stock.tickerCode, MA_DEVIATION.FETCH_PERIOD);
  const prices = historicalPrices.slice(-MA_DEVIATION.FETCH_SLICE);

  const patternContext = buildCandlestickContext(prices);
  const technicalContext = buildTechnicalContext(prices);
  const chartPatternContext = buildChartPatternContext(prices, userSettings?.investmentStyle);
  const { text: weekChangeContext, rate: weekChangeRate } = buildWeekChangeContext(prices);
  const deviationRateContext = buildDeviationRateContext(prices);
  const volumeAnalysisContext = buildVolumeAnalysisContext(prices);
  const gapFillContext = buildGapFillContext(prices);
  const supportResistanceContext = buildSupportResistanceContext(prices);
  const trendlineContext = buildTrendlineContext(prices);
  const financialMetrics = buildFinancialMetrics(stock, currentPrice);

  const tickerCodeSlug = stock.tickerCode.replace(".T", "");
  const news = await getRelatedNews({
    tickerCodes: [tickerCodeSlug],
    sectors: getSectorGroup(stock.sector) ? [getSectorGroup(stock.sector)!] : [],
    limit: 5,
    daysAgo: 7,
  });
  const newsContext = news.length > 0
    ? `\n【最新のニュース情報】\n${formatNewsForPrompt(news)}`
    : "";

  let marketData = null;
  try { marketData = await getNikkei225Data(); } catch {}
  const simEarningsContext = buildEarningsContext(stock.nextEarningsDate, {
    isProfitable: stock.isProfitable,
    profitTrend: stock.profitTrend,
    revenueGrowth: stock.revenueGrowth ? Number(stock.revenueGrowth) : null,
    netIncomeGrowth: stock.netIncomeGrowth ? Number(stock.netIncomeGrowth) : null,
    eps: stock.eps ? Number(stock.eps) : null,
    per: stock.per ? Number(stock.per) : null,
  });
  const simExDividendContext = buildExDividendContext(
    stock.exDividendDate,
    stock.dividendYield ? Number(stock.dividendYield) : null,
  );

  const simTodayForDB = getTodayForDB();
  const simPreMarketData = await prisma.preMarketData.findFirst({
    where: { date: simTodayForDB },
    select: {
      vixClose: true, vixChangeRate: true,
      wtiClose: true, wtiChangeRate: true,
    },
  });
  const simGeopoliticalRiskData: GeopoliticalRiskData = {
    vixClose: simPreMarketData?.vixClose ? Number(simPreMarketData.vixClose) : null,
    vixChangeRate: simPreMarketData?.vixChangeRate ? Number(simPreMarketData.vixChangeRate) : null,
    wtiClose: simPreMarketData?.wtiClose ? Number(simPreMarketData.wtiClose) : null,
    wtiChangeRate: simPreMarketData?.wtiChangeRate ? Number(simPreMarketData.wtiChangeRate) : null,
  };
  const simGeoAssessment = assessGeopoliticalRisk({
    vixClose: simGeopoliticalRiskData.vixClose,
    vixChangeRate: simGeopoliticalRiskData.vixChangeRate,
    wtiChangeRate: simGeopoliticalRiskData.wtiChangeRate,
    negativeGeoNewsCount: 0,
  });

  const marketContext = buildMarketContext(marketData) +
    buildDefensiveModeContext(marketData) +
    buildGeopoliticalRiskContext(simGeopoliticalRiskData, simGeoAssessment) +
    simEarningsContext + simExDividendContext;

  let sectorTrendContext = "";
  let sectorAvgWeekChangeRate: number | null = null;
  let simSectorAvg: { avgPER: number | null; avgPBR: number | null; avgROE: number | null } | null = null;
  const simStockSectorGroup = getSectorGroup(stock.sector);
  if (simStockSectorGroup) {
    const sectorTrend = await getSectorTrend(simStockSectorGroup);
    if (sectorTrend) {
      sectorTrendContext = `\n【セクタートレンド】\n${formatSectorTrendForPrompt(sectorTrend)}\n`;
      sectorAvgWeekChangeRate = sectorTrend.avgWeekChangeRate ?? null;
      simSectorAvg = {
        avgPER: sectorTrend.avgPER ?? null,
        avgPBR: sectorTrend.avgPBR ?? null,
        avgROE: sectorTrend.avgROE ?? null,
      };
    }
  }

  const simSectorComparisonContext = buildSectorComparisonContext(stock, simSectorAvg, stock.sector);

  const relativeStrengthContext = buildRelativeStrengthContext(
    weekChangeRate,
    marketData?.weekChangeRate ?? null,
    sectorAvgWeekChangeRate,
  );

  const styleMap: Record<string, string> = {
    CONSERVATIVE: "安定配当型（守り）",
    BALANCED: "成長投資型（バランス）",
    AGGRESSIVE: "アクティブ型（攻め）",
  };
  const userContext = userSettings
    ? `\n【ユーザーの投資設定】\n- 投資スタイル: ${styleMap[userSettings.investmentStyle] || userSettings.investmentStyle}\n`
    : "";

  const prompt = buildPortfolioAnalysisPrompt({
    stockName: stock.name,
    tickerCode: stock.tickerCode,
    sector: stock.sector || "不明",
    quantity,
    averagePrice,
    currentPrice,
    profit,
    profitPercent,
    userContext,
    financialMetrics: financialMetrics + simSectorComparisonContext,
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
    isSimulation: true,
  });

  const openai = getOpenAIClient();
  const response = await openai.chat.completions.create({
    model: "gpt-4o-mini",
    messages: [
      {
        role: "system",
        content: "You are a stock data analyst. Provide factual analysis only.",
      },
      { role: "user", content: prompt },
    ],
    temperature: 0.3,
    max_tokens: 1600,
    response_format: {
      type: "json_schema",
      json_schema: {
        name: "portfolio_analysis",
        strict: true,
        schema: PORTFOLIO_ANALYSIS_SCHEMA,
      },
    },
  });

  const content = response.choices[0].message.content?.trim() || "{}";
  const result = JSON.parse(content);

  // アラート生成
  const volatility = stock.volatility ? Number(stock.volatility) : null;
  const alerts = generateStockAlerts({
    isProfitable: stock.isProfitable,
    profitTrend: stock.profitTrend,
    volatility,
    weekChangeRate,
    deviationRate: stock.maDeviationRate ? Number(stock.maDeviationRate) : null,
    nextEarningsDate: stock.nextEarningsDate,
    gapUpRate: null,
    volumeSpikeRate: stock.volumeRatio ? Number(stock.volumeRatio) : null,
    isMarketCrash: marketData?.isMarketPanic === true,
    geopoliticalRiskLevel: simGeoAssessment.level,
    technicalSignal: null,
  });

  const healthScore = result.healthScore ?? 50;
  const riskLevel = computeRiskLevel(alerts, healthScore);

  const pricesNewestFirst = [...prices].reverse().map((p) => ({
    close: p.close,
    high: p.high,
    low: p.low,
  }));
  const { supports, resistances } = findSupportResistance(pricesNewestFirst);
  const supportLevel = supports.length > 0 ? supports[0] : null;
  const resistanceLevel = resistances.length > 0 ? resistances[0] : null;

  const now = dayjs.utc().toDate();

  return {
    healthScore,
    riskLevel,
    riskFlags: alerts.map((a) => a.type),
    shortTerm: result.shortTerm,
    shortTermText: result.shortTermText,
    mediumTerm: result.mediumTerm,
    midTermText: result.midTermText,
    longTerm: result.longTerm,
    longTermText: result.longTermText,
    shortTermTrend: result.shortTermTrend,
    midTermTrend: result.midTermTrend,
    longTermTrend: result.longTermTrend,
    marketSignal: result.marketSignal || null,
    advice: result.advice,
    caution: result.caution,
    trendConvergence: result.trendConvergence ?? null,
    supportLevel,
    resistanceLevel,
    lastAnalysis: now.toISOString(),
    isToday: true,
    currentPrice,
    averagePurchasePrice: averagePrice,
  };
}
