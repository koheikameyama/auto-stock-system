import { NextRequest, NextResponse } from "next/server";
import pLimit from "p-limit";
import { prisma } from "@/lib/prisma";
import { verifyCronAuth } from "@/lib/cron-auth";
import { getOpenAIClient } from "@/lib/openai";
import { getTodayForDB, getDaysAgoForDB } from "@/lib/date-utils";
import {
  fetchHistoricalPrices,
  fetchStockPrices,
} from "@/lib/stock-price-fetcher";
import { getNikkei225Data } from "@/lib/market-index";

const USER_CONCURRENCY_LIMIT = 3;
import {
  buildFinancialMetrics,
  buildTechnicalContext,
  buildCandlestickContext,
  buildChartPatternContext,
  buildWeekChangeContext,
  buildMarketContext,
  buildDefensiveModeContext,
  buildDeviationRateContext,
  buildTrendlineContext,
  buildEarningsContext,
} from "@/lib/stock-analysis-context";
import { buildDailyHighlightsPrompt } from "@/lib/prompts/daily-highlights-prompt";
import { getRelatedNews, formatNewsForPrompt } from "@/lib/news-rag";
import {
  getAllSectorTrends,
  formatAllSectorTrendsForPrompt,
  type SectorTrendData,
} from "@/lib/sector-trend";
import { calculateDeviationRate } from "@/lib/technical-indicators";
import {
  MA_DEVIATION,
  STALE_DATA_DAYS,
  USER_ACTIVITY,
  getStyleLabel,
  getSectorGroup,
} from "@/lib/constants";
import {
  checkRecommendationSafety,
} from "@/lib/stock-safety-rules";
import {
  calculateStockScores,
  filterByTotalBudget,
  applySectorCap,
  HIGHLIGHT_SCORING_CONFIG,
  type StockForScoring,
  type ScoredStock,
} from "@/lib/highlight-scoring";
import { calculatePortfolioFromTransactions } from "@/lib/portfolio-calculator";

const HIGHLIGHT_TYPES = [
  "volume_spike",
  "technical_change",
  "price_movement",
  "ma_divergence",
  "earnings_upcoming",
  "sector_trend",
] as const;

interface GenerateRequest {
  session?: "morning" | "afternoon" | "close" | "evening";
  userId?: string;
}

interface UserResult {
  userId: string;
  success: boolean;
  highlights?: Array<{
    tickerCode: string;
    highlightType: string;
    highlightReason: string;
  }>;
  error?: string;
}

interface StockContext {
  stock: ScoredStock;
  currentPrice: number;
  financialMetrics: string;
  technicalContext: string;
  candlestickContext: string;
  chartPatternContext: string;
  trendlineContext: string;
  weekChangeContext: string;
  weekChangeRate: number | null;
  deviationRateContext: string;
  deviationRate: number | null;
  predictionContext: string;
  earningsContext: string;
}

/**
 * POST /api/highlights/generate-daily
 * 日次注目銘柄を生成（全ユーザーまたは指定ユーザー）
 */
export async function POST(request: NextRequest) {
  const authError = verifyCronAuth(request);
  if (authError) return authError;

  let body: GenerateRequest = {};
  try {
    body = await request.json();
  } catch {
    // bodyがない場合はデフォルト値を使用
  }

  const session = body.session || "evening";
  const targetUserId = body.userId;

  console.log("=".repeat(60));
  console.log("Daily Highlights Generation");
  console.log("=".repeat(60));
  console.log(`Time: ${new Date().toISOString()}`);
  console.log(`Session: ${session}`);
  console.log(`Target User: ${targetUserId || "all"}`);

  try {
    const activeThreshold = getDaysAgoForDB(USER_ACTIVITY.INACTIVE_THRESHOLD_DAYS);
    const users = await prisma.userSettings.findMany({
      where: targetUserId
        ? { userId: targetUserId }
        : {
            user: {
              OR: [
                { lastActivityAt: { gte: activeThreshold } },
                {
                  lastActivityAt: null,
                  createdAt: { gte: activeThreshold },
                },
              ],
            },
          },
      select: {
        userId: true,
        investmentStyle: true,
        investmentBudget: true,
      },
    });

    if (users.length === 0) {
      return NextResponse.json({
        success: true,
        message: "No users with settings",
        processed: 0,
      });
    }

    console.log(`Found ${users.length} users with settings`);

    const staleThreshold = getDaysAgoForDB(STALE_DATA_DAYS);
    const allStocks = await prisma.stock.findMany({
      where: {
        isDelisted: false,
        hasChartData: true,
        latestPriceDate: { not: null, gte: staleThreshold },
        latestPrice: { not: null },
        fetchFailCount: 0,
        volatility: { gt: 0 },
      },
      select: {
        id: true,
        tickerCode: true,
        name: true,
        sector: true,
        latestPrice: true,
        weekChangeRate: true,
        volatility: true,
        volumeRatio: true,
        marketCap: true,
        isProfitable: true,
        maDeviationRate: true,
        dividendYield: true,
        pbr: true,
        per: true,
        roe: true,
        profitTrend: true,
        revenueGrowth: true,
        eps: true,
        netIncomeGrowth: true,
        fiftyTwoWeekHigh: true,
        fiftyTwoWeekLow: true,
        debtEquityRatio: true,
        currentRatio: true,
        dividendGrowthRate: true,
        payoutRatio: true,
        isDelisted: true,
        fetchFailCount: true,
        nextEarningsDate: true,
      },
    });

    console.log(`Found ${allStocks.length} stocks with price data`);

    const [portfolioStocks, watchlistStocks] = await Promise.all([
      prisma.portfolioStock.findMany({
        select: {
          userId: true,
          stockId: true,
          transactions: {
            select: {
              type: true,
              quantity: true,
              price: true,
              transactionDate: true,
            },
            orderBy: { transactionDate: "asc" },
          },
        },
      }),
      prisma.watchlistStock.findMany({
        select: { userId: true, stockId: true },
      }),
    ]);

    const holdingsCostByUser = new Map<string, number>();
    for (const ps of portfolioStocks) {
      const { quantity, averagePurchasePrice } =
        calculatePortfolioFromTransactions(ps.transactions);
      if (quantity > 0) {
        const current = holdingsCostByUser.get(ps.userId) ?? 0;
        holdingsCostByUser.set(
          ps.userId,
          current + quantity * averagePurchasePrice.toNumber(),
        );
      }
    }

    const watchlistByUser = new Map<string, Set<string>>();
    for (const ws of watchlistStocks) {
      if (!watchlistByUser.has(ws.userId)) {
        watchlistByUser.set(ws.userId, new Set());
      }
      watchlistByUser.get(ws.userId)!.add(ws.stockId);
    }

    const ownedByUser = new Map<string, Set<string>>();
    for (const ps of portfolioStocks) {
      const { quantity } = calculatePortfolioFromTransactions(ps.transactions);
      if (quantity > 0) {
        if (!ownedByUser.has(ps.userId)) {
          ownedByUser.set(ps.userId, new Set());
        }
        ownedByUser.get(ps.userId)!.add(ps.stockId);
      }
    }

    let marketData = null;
    try {
      marketData = await getNikkei225Data();
    } catch (error) {
      console.error("市場データ取得失敗:", error);
    }
    const marketContext = buildMarketContext(marketData) + buildDefensiveModeContext(marketData);

    const { trends: sectorTrends } = await getAllSectorTrends();
    const sectorTrendMap: Record<string, SectorTrendData> = {};
    for (const t of sectorTrends) {
      sectorTrendMap[t.sector] = t;
    }
    const sectorTrendContext = formatAllSectorTrendsForPrompt(sectorTrends);

    const limit = pLimit(USER_CONCURRENCY_LIMIT);
    console.log(
      `Processing ${users.length} users with concurrency limit: ${USER_CONCURRENCY_LIMIT}`,
    );

    const tasks = users.map((user) =>
      limit(async (): Promise<UserResult> => {
        try {
          const holdingsCost = holdingsCostByUser.get(user.userId) ?? 0;
          const remainingBudget =
            user.investmentBudget !== null
              ? Math.max(0, user.investmentBudget - holdingsCost)
              : null;

          const result = await processUser(
            user,
            allStocks,
            ownedByUser.get(user.userId) || new Set(),
            watchlistByUser.get(user.userId) || new Set(),
            session,
            marketContext,
            remainingBudget,
            sectorTrendMap,
            sectorTrendContext,
          );
          return result;
        } catch (error) {
          console.error(`Error processing user ${user.userId}:`, error);
          return {
            userId: user.userId,
            success: false,
            error: error instanceof Error ? error.message : "Unknown error",
          };
        }
      }),
    );

    const results = await Promise.all(tasks);

    const successCount = results.filter((r) => r.success).length;
    const failCount = results.filter((r) => !r.success).length;

    console.log("=".repeat(60));
    console.log(
      `Completed: ${successCount} users OK, ${failCount} users failed`,
    );
    console.log("=".repeat(60));

    return NextResponse.json({
      success: true,
      processed: successCount,
      failed: failCount,
      results,
    });
  } catch (error) {
    console.error("Error in generate-daily:", error);
    return NextResponse.json(
      { error: "Failed to generate highlights" },
      { status: 500 },
    );
  }
}

async function processUser(
  user: {
    userId: string;
    investmentStyle: string | null;
    investmentBudget: number | null;
  },
  allStocks: Array<{
    id: string;
    tickerCode: string;
    name: string;
    sector: string | null;
    latestPrice: unknown;
    weekChangeRate: unknown;
    volatility: unknown;
    volumeRatio: unknown;
    marketCap: unknown;
    isProfitable: boolean | null;
    maDeviationRate: unknown;
    dividendYield: unknown;
    pbr: unknown;
    per: unknown;
    roe: unknown;
    profitTrend: string | null;
    revenueGrowth: unknown;
    eps: unknown;
    netIncomeGrowth: unknown;
    fiftyTwoWeekHigh: unknown;
    fiftyTwoWeekLow: unknown;
    debtEquityRatio: unknown;
    currentRatio: unknown;
    dividendGrowthRate: unknown;
    payoutRatio: unknown;
    isDelisted: boolean;
    fetchFailCount: number;
    nextEarningsDate: Date | null;
  }>,
  ownedStockIds: Set<string>,
  watchlistStockIds: Set<string>,
  session: string,
  marketContext: string,
  remainingBudget: number | null,
  sectorTrendMap: Record<string, SectorTrendData>,
  sectorTrendContext: string,
): Promise<UserResult> {
  const { userId, investmentStyle, investmentBudget } = user;

  console.log(
    `\n--- User: ${userId} (totalBudget: ${investmentBudget}, remainingBudget: ${remainingBudget}, style: ${investmentStyle}) ---`,
  );

  const stocksForScoring: StockForScoring[] = allStocks.map((s) => ({
    id: s.id,
    tickerCode: s.tickerCode,
    name: s.name,
    sector: s.sector,
    latestPrice: s.latestPrice ? Number(s.latestPrice) : null,
    weekChangeRate: s.weekChangeRate ? Number(s.weekChangeRate) : null,
    volatility: s.volatility ? Number(s.volatility) : null,
    volumeRatio: s.volumeRatio ? Number(s.volumeRatio) : null,
    marketCap: s.marketCap ? Number(s.marketCap) : null,
    isProfitable: s.isProfitable,
    maDeviationRate: s.maDeviationRate ? Number(s.maDeviationRate) : null,
    nextEarningsDate: s.nextEarningsDate ?? null,
    dividendYield: s.dividendYield ? Number(s.dividendYield) : null,
    pbr: s.pbr ? Number(s.pbr) : null,
    per: s.per ? Number(s.per) : null,
    roe: s.roe ? Number(s.roe) : null,
    revenueGrowth: s.revenueGrowth ? Number(s.revenueGrowth) : null,
    debtEquityRatio: s.debtEquityRatio ? Number(s.debtEquityRatio) : null,
    currentRatio: s.currentRatio ? Number(s.currentRatio) : null,
    dividendGrowthRate: s.dividendGrowthRate ? Number(s.dividendGrowthRate) : null,
    payoutRatio: s.payoutRatio ? Number(s.payoutRatio) : null,
    profitTrend: s.profitTrend,
  }));

  // 投資予算（総額）で1単元（100株）購入可能な銘柄にフィルタ
  const budgetFiltered = filterByTotalBudget(stocksForScoring, investmentBudget);
  console.log(
    `  Stocks after budget filter: ${budgetFiltered.length}/${stocksForScoring.length}`,
  );

  if (budgetFiltered.length === 0) {
    return {
      userId,
      success: false,
      error: "No stocks available after budget filter",
    };
  }

  // スコアリング（客観的なデータ分析スコア）
  const scored = calculateStockScores(
    budgetFiltered,
    investmentStyle,
    sectorTrendMap,
  );
  console.log(
    `  Top 3 scores: ${scored
      .slice(0, 3)
      .map((s) => `${s.tickerCode}:${s.score}`)
      .join(", ")}`,
  );

  // セクターキャップ（同一セクター最大2銘柄）を適用し、上位候補を選出
  const sectorCapped = applySectorCap(scored, 2);
  console.log(`  After sector cap: ${sectorCapped.length} stocks`);

  const topCandidates = sectorCapped.slice(
    0,
    HIGHLIGHT_SCORING_CONFIG.MAX_CANDIDATES_FOR_AI,
  );

  const { contexts: stockContexts, newsContext } = await buildStockContexts(
    topCandidates,
    allStocks,
    investmentStyle,
  );

  // 候補の中で保有中・ウォッチリスト中の銘柄を特定
  const ownedTickerCodes = new Set(
    topCandidates
      .filter((s: ScoredStock) => ownedStockIds.has(s.id))
      .map((s: ScoredStock) => s.tickerCode),
  );
  const watchlistTickerCodes = new Set(
    topCandidates
      .filter((s: ScoredStock) => watchlistStockIds.has(s.id))
      .map((s: ScoredStock) => s.tickerCode),
  );

  const highlights = await selectWithAI(
    userId,
    investmentStyle,
    investmentBudget,
    remainingBudget,
    session,
    stockContexts,
    marketContext,
    newsContext,
    sectorTrendContext,
    ownedTickerCodes,
    watchlistTickerCodes,
  );

  if (!highlights || highlights.length === 0) {
    return { userId, success: false, error: "AI selection failed" };
  }

  const highlightsToSave = highlights.slice(0, MAX_DAILY_HIGHLIGHTS);

  const saved = await saveHighlights(
    userId,
    highlightsToSave,
    topCandidates,
  );
  console.log(`  Saved ${saved} highlights`);

  return {
    userId,
    success: true,
    highlights: highlightsToSave,
  };
}

const MAX_DAILY_HIGHLIGHTS = 5;

async function buildStockContexts(
  candidates: ScoredStock[],
  allStocksData: Array<{
    id: string;
    tickerCode: string;
    dividendYield: unknown;
    pbr: unknown;
    per: unknown;
    roe: unknown;
    isProfitable: boolean | null;
    profitTrend: string | null;
    revenueGrowth: unknown;
    eps: unknown;
    netIncomeGrowth: unknown;
    fiftyTwoWeekHigh: unknown;
    fiftyTwoWeekLow: unknown;
    debtEquityRatio: unknown;
    currentRatio: unknown;
    dividendGrowthRate: unknown;
    payoutRatio: unknown;
    marketCap: unknown;
    isDelisted: boolean;
    fetchFailCount: number;
  }>,
  investmentStyle?: string | null,
): Promise<{ contexts: StockContext[]; newsContext: string }> {
  console.log(
    `  Fetching detailed data for ${candidates.length} candidates...`,
  );

  const stockDataMap = new Map(allStocksData.map((s) => [s.id, s]));

  const pricesPromises = candidates.map(async (candidate) => {
    try {
      const prices = await fetchHistoricalPrices(candidate.tickerCode, "1m");
      return { stockId: candidate.id, prices };
    } catch (error) {
      console.error(
        `  Failed to fetch prices for ${candidate.tickerCode}:`,
        error,
      );
      return { stockId: candidate.id, prices: [] };
    }
  });

  const stockIds = candidates.map((c) => c.id);
  const tickerCodesForNews = candidates.map((c) =>
    c.tickerCode.replace(".T", ""),
  );
  const sectors = Array.from(
    new Set(
      candidates.map((c) => getSectorGroup(c.sector)).filter((s): s is string => s !== null),
    ),
  );

  const [pricesResults, realtimePricesResult, relatedNews, analyses] =
    await Promise.all([
      Promise.all(pricesPromises),
      fetchStockPrices(candidates.map((c) => c.tickerCode))
        .then((r) => r.prices)
        .catch((error) => {
          console.error("  Failed to fetch realtime prices:", error);
          return [] as { tickerCode: string; currentPrice: number }[];
        }),
      getRelatedNews({
        tickerCodes: tickerCodesForNews,
        sectors,
        limit: 10,
        daysAgo: 7,
      }).catch((error) => {
        console.error("  Failed to fetch news:", error);
        return [];
      }),
      prisma.stockAnalysis.findMany({
        where: { stockId: { in: stockIds } },
        orderBy: { analyzedAt: "desc" },
        distinct: ["stockId"],
        select: {
          stockId: true,
          shortTermTrend: true,
          midTermTrend: true,
          longTermTrend: true,
          healthScore: true,
          riskLevel: true,
          advice: true,
        },
      }),
    ]);

  const pricesMap = new Map(pricesResults.map((r) => [r.stockId, r.prices]));
  const currentPrices = new Map(
    realtimePricesResult.map((p) => [p.tickerCode, p.currentPrice]),
  );
  const analysisMap = new Map(analyses.map((a) => [a.stockId, a]));

  const newsContext =
    relatedNews.length > 0
      ? `\n【最新のニュース情報】\n${formatNewsForPrompt(relatedNews)}`
      : "";

  console.log(
    `  News: ${relatedNews.length} articles, Analyses: ${analyses.length} stocks`,
  );

  const trendLabel = (trend: string) =>
    trend === "up" ? "上昇" : trend === "down" ? "下落" : "横ばい";

  const contexts: StockContext[] = [];

  for (const candidate of candidates) {
    const stockData = stockDataMap.get(candidate.id);
    const prices = pricesMap.get(candidate.id) || [];
    const currentPrice =
      currentPrices.get(candidate.tickerCode) || candidate.latestPrice || 0;

    const financialMetrics = stockData
      ? buildFinancialMetrics(
          {
            marketCap: stockData.marketCap
              ? Number(stockData.marketCap)
              : undefined,
            dividendYield: stockData.dividendYield
              ? Number(stockData.dividendYield)
              : undefined,
            pbr: stockData.pbr ? Number(stockData.pbr) : undefined,
            per: stockData.per ? Number(stockData.per) : undefined,
            roe: stockData.roe ? Number(stockData.roe) : undefined,
            isProfitable: stockData.isProfitable,
            profitTrend: stockData.profitTrend,
            revenueGrowth: stockData.revenueGrowth
              ? Number(stockData.revenueGrowth)
              : undefined,
            eps: stockData.eps ? Number(stockData.eps) : undefined,
            fiftyTwoWeekHigh: stockData.fiftyTwoWeekHigh
              ? Number(stockData.fiftyTwoWeekHigh)
              : undefined,
            fiftyTwoWeekLow: stockData.fiftyTwoWeekLow
              ? Number(stockData.fiftyTwoWeekLow)
              : undefined,
            debtEquityRatio: stockData.debtEquityRatio
              ? Number(stockData.debtEquityRatio)
              : undefined,
            currentRatio: stockData.currentRatio
              ? Number(stockData.currentRatio)
              : undefined,
            dividendGrowthRate: stockData.dividendGrowthRate
              ? Number(stockData.dividendGrowthRate)
              : undefined,
            payoutRatio: stockData.payoutRatio
              ? Number(stockData.payoutRatio)
              : undefined,
          },
          currentPrice,
        )
      : "財務データなし";

    const ohlcvPrices = prices.map((p) => ({
      date: p.date,
      open: p.open,
      high: p.high,
      low: p.low,
      close: p.close,
    }));

    const technicalContext = buildTechnicalContext(ohlcvPrices);
    const candlestickContext = buildCandlestickContext(ohlcvPrices);
    const chartPatternContext = buildChartPatternContext(
      ohlcvPrices,
      investmentStyle,
    );
    const trendlineContext = buildTrendlineContext(ohlcvPrices);
    const { text: weekChangeContext, rate: weekChangeRate } =
      buildWeekChangeContext(ohlcvPrices);
    const deviationRateContext = buildDeviationRateContext(ohlcvPrices);

    const pricesNewestFirst = [...ohlcvPrices]
      .reverse()
      .map((p) => ({ close: p.close }));
    const deviationRate = calculateDeviationRate(
      pricesNewestFirst,
      MA_DEVIATION.PERIOD,
    );

    // StockAnalysisコンテキスト
    const analysis = analysisMap.get(candidate.id);
    const predictionContext = analysis
      ? `\n【分析データ】
- 短期トレンド: ${trendLabel(analysis.shortTermTrend)}
- 中期トレンド: ${trendLabel(analysis.midTermTrend)}
- 長期トレンド: ${trendLabel(analysis.longTermTrend)}
- 健全性スコア: ${analysis.healthScore}/100
- リスクレベル: ${analysis.riskLevel}`
      : "";

    const earningsContext = buildEarningsContext(
      candidate.nextEarningsDate,
      {
        isProfitable: candidate.isProfitable,
        profitTrend: candidate.profitTrend,
        revenueGrowth: candidate.revenueGrowth,
        netIncomeGrowth: stockData?.netIncomeGrowth
          ? Number(stockData.netIncomeGrowth)
          : null,
        eps: stockData?.eps ? Number(stockData.eps) : null,
        per: candidate.per,
      },
    );

    contexts.push({
      stock: candidate,
      currentPrice,
      financialMetrics,
      technicalContext,
      candlestickContext,
      chartPatternContext,
      trendlineContext,
      weekChangeContext,
      weekChangeRate,
      deviationRateContext,
      deviationRate,
      predictionContext,
      earningsContext,
    });
  }

  console.log(`  Built contexts for ${contexts.length} stocks`);
  return { contexts, newsContext };
}

async function selectWithAI(
  _userId: string,
  investmentStyle: string | null,
  investmentBudget: number | null,
  remainingBudget: number | null,
  session: string,
  stockContexts: StockContext[],
  marketContext: string,
  newsContext: string,
  sectorTrendContext: string,
  ownedTickerCodes: Set<string> = new Set(),
  watchlistTickerCodes: Set<string> = new Set(),
): Promise<Array<{
  tickerCode: string;
  highlightType: string;
  highlightReason: string;
}> | null> {
  const styleLabel = getStyleLabel(investmentStyle);
  const budgetLabel = investmentBudget
    ? remainingBudget !== null
      ? `${remainingBudget.toLocaleString()}円（残り）/ 合計 ${investmentBudget.toLocaleString()}円`
      : `${investmentBudget.toLocaleString()}円`
    : "未設定";

  const stockSummaries = stockContexts
    .map((ctx, idx) => {
      const s = ctx.stock;
      return `
【候補${idx + 1}: ${s.name}（${s.tickerCode}）】
- セクター: ${s.sector || "不明"}
- 現在価格: ${ctx.currentPrice.toLocaleString()}円
- スコア: ${s.score}点

${ctx.financialMetrics}
${ctx.technicalContext}${ctx.candlestickContext}${ctx.chartPatternContext}${ctx.trendlineContext}${ctx.weekChangeContext}${ctx.deviationRateContext}${ctx.predictionContext}${ctx.earningsContext}`;
    })
    .join("\n\n");

  const prompt = buildDailyHighlightsPrompt({
    session,
    styleLabel,
    budgetLabel,
    investmentStyle,
    stockSummaries,
    marketContext,
    sectorTrendContext,
    newsContext,
    ownedTickerCodes: Array.from(ownedTickerCodes),
    watchlistTickerCodes: Array.from(watchlistTickerCodes),
  });

  try {
    const openai = getOpenAIClient();
    const response = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        {
          role: "system",
          content:
            "You are a stock data analyst. Always respond in valid JSON format only. Provide objective, fact-based analysis without investment advice.",
        },
        { role: "user", content: prompt },
      ],
      temperature: 0.4,
      max_tokens: 2000,
      response_format: {
        type: "json_schema",
        json_schema: {
          name: "daily_highlights",
          strict: true,
          schema: {
            type: "object",
            properties: {
              marketSignal: {
                type: "string",
                enum: ["bullish", "neutral", "bearish"],
              },
              stocks: {
                type: "array",
                items: {
                  type: "object",
                  properties: {
                    tickerCode: { type: "string" },
                    highlightType: {
                      type: "string",
                      enum: [...HIGHLIGHT_TYPES],
                    },
                    highlightReason: { type: "string" },
                    position: { type: "number" },
                  },
                  required: [
                    "tickerCode",
                    "highlightType",
                    "highlightReason",
                    "position",
                  ],
                  additionalProperties: false,
                },
              },
            },
            required: ["marketSignal", "stocks"],
            additionalProperties: false,
          },
        },
      },
    });

    const content = response.choices[0].message.content?.trim() || "{}";
    const result = JSON.parse(content);

    if (!result.stocks || !Array.isArray(result.stocks)) {
      console.error("  Invalid AI response format");
      return null;
    }

    const validSelections = result.stocks
      .filter(
        (s: {
          tickerCode?: string;
          highlightType?: string;
          highlightReason?: string;
        }) =>
          s.tickerCode &&
          s.highlightType &&
          s.highlightReason,
      )
      .slice(0, 7);

    // セーフティルールチェック: 危険銘柄を除外
    const safeSelections = validSelections.filter((selection: { tickerCode: string; highlightType: string; highlightReason: string }) => {
      const ctx = stockContexts.find(
        (c: StockContext) => c.stock.tickerCode === selection.tickerCode,
      );
      if (!ctx) return true;

      const s = ctx.stock;
      const volatility = s.volatility !== null ? Number(s.volatility) : null;

      const safetyCheck = checkRecommendationSafety({
        isProfitable: s.isProfitable,
        volatility,
        weekChangeRate: ctx.weekChangeRate,
        deviationRate: ctx.deviationRate,
        nextEarningsDate: s.nextEarningsDate,
        investmentStyle,
      });

      if (safetyCheck.exclude) {
        console.log(
          `  ❌ Excluded ${s.tickerCode}: ${safetyCheck.reason} (rule: ${safetyCheck.rule})`,
        );
        return false;
      }

      return true;
    });

    const excludedCount = validSelections.length - safeSelections.length;
    console.log(
      `  AI selected ${validSelections.length} stocks, ${safeSelections.length} passed safety${excludedCount > 0 ? ` (${excludedCount} excluded)` : ""} (marketSignal: ${result.marketSignal})`,
    );
    return safeSelections;
  } catch (error) {
    console.error("  AI selection error:", error);
    return null;
  }
}

async function saveHighlights(
  userId: string,
  highlights: Array<{
    tickerCode: string;
    highlightType: string;
    highlightReason: string;
  }>,
  candidates: ScoredStock[],
): Promise<number> {
  const today = getTodayForDB();

  const stockMap = new Map(candidates.map((s) => [s.tickerCode, s]));

  let saved = 0;

  for (let idx = 0; idx < highlights.length; idx++) {
    const hl = highlights[idx];
    const stock = stockMap.get(hl.tickerCode);

    if (!stock) {
      console.log(`  Warning: Stock not found for ticker ${hl.tickerCode}`);
      continue;
    }

    try {
      await prisma.dailyHighlight.upsert({
        where: {
          userId_date_position: {
            userId,
            date: today,
            position: idx + 1,
          },
        },
        update: {
          stockId: stock.id,
          highlightType: hl.highlightType,
          highlightReason: hl.highlightReason,
        },
        create: {
          userId,
          date: today,
          stockId: stock.id,
          position: idx + 1,
          highlightType: hl.highlightType,
          highlightReason: hl.highlightReason,
        },
      });

      saved++;
    } catch (error) {
      console.error(
        `  Error saving highlight for ${hl.tickerCode}:`,
        error,
      );
    }
  }

  return saved;
}
