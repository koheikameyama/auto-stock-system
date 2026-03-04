import {
  streamText,
  convertToModelMessages,
  stepCountIs,
  type UIMessage,
} from "ai";
import { openai } from "@ai-sdk/openai";
import { getAuthUser } from "@/lib/auth-utils";
import { prisma } from "@/lib/prisma";
import { createChatTools } from "@/lib/chat-tools";
import {
  buildChatSystemPrompt,
  type StockPreloadedData,
} from "@/lib/prompts/chat-system-prompt";
import { CHAT_CONFIG, getSectorGroup } from "@/lib/constants";
import { getRelatedNews, type RelatedNews } from "@/lib/news-rag";
import { getDaysAgoForDB } from "@/lib/date-utils";

interface StockContext {
  stockId: string;
  tickerCode: string;
  name: string;
  sector: string | null;
  currentPrice: number | null;
  type: "portfolio" | "watchlist" | "view";
  quantity?: number;
  averagePurchasePrice?: number;
  profit?: number;
  profitPercent?: number;
}

export async function POST(request: Request) {
  const { user, error } = await getAuthUser();
  if (error) return error;

  const { messages, stockContext } = (await request.json()) as {
    messages: UIMessage[];
    stockContext?: StockContext;
  };

  console.log("Chat API Request received:", {
    messageCount: messages.length,
    hasContext: !!stockContext,
    stockContext: stockContext
      ? {
          id: stockContext.stockId,
          ticker: stockContext.tickerCode,
          name: stockContext.name,
          type: stockContext.type,
          qty: stockContext.quantity,
          avg: stockContext.averagePurchasePrice,
          profit: stockContext.profit,
        }
      : null,
  });

  // 軽量な静的コンテキスト取得
  const userSettings = await prisma.userSettings.findUnique({
    where: { userId: user.id },
  });

  // 個別銘柄ページではすべての銘柄情報を事前取得
  let preloadedData: StockPreloadedData | undefined;
  if (stockContext) {
    try {
      const tickerCode = stockContext.tickerCode.replace(".T", "");

      const [stockData, analysisData, newsData, portfolioData, purchaseData] =
        await Promise.all([
          // 財務データ
          prisma.stock.findUnique({
            where: { id: stockContext.stockId },
            select: {
              pbr: true,
              per: true,
              roe: true,
              operatingCF: true,
              freeCF: true,
              fiftyTwoWeekHigh: true,
              fiftyTwoWeekLow: true,
              marketCap: true,
              dividendYield: true,
              isProfitable: true,
              profitTrend: true,
              revenueGrowth: true,
              netIncomeGrowth: true,
              eps: true,
              isDelisted: true,
            },
          }),
          // AI分析
          prisma.stockAnalysis.findFirst({
            where: { stockId: stockContext.stockId },
            orderBy: { analyzedAt: "desc" },
          }),
          // 関連ニュース
          getRelatedNews({
            tickerCodes: [tickerCode],
            sectors: getSectorGroup(stockContext.sector) ? [getSectorGroup(stockContext.sector)!] : [],
            limit: 5,
            daysAgo: 14,
          }),
          // 保有銘柄分析（ポートフォリオの場合）
          stockContext.type === "portfolio"
            ? prisma.portfolioStock.findFirst({
                where: {
                  userId: user.id,
                  stockId: stockContext.stockId,
                },
                select: {
                  shortTerm: true,
                  mediumTerm: true,
                  longTerm: true,
                  suggestedSellPrice: true,
                  suggestedSellPercent: true,
                  sellCondition: true,
                  sellReason: true,
                  lastAnalysis: true,
                },
              })
            : Promise.resolve(null),
          // 購入推奨（ウォッチリスト/閲覧中の場合）
          stockContext.type !== "portfolio"
            ? prisma.purchaseRecommendation.findFirst({
                where: {
                  stockId: stockContext.stockId,
                  date: { gte: getDaysAgoForDB(7) },
                },
                orderBy: { date: "desc" },
              })
            : Promise.resolve(null),
        ]);

      console.log("Preload finished:", {
        foundStock: !!stockData,
        foundAnalysis: !!analysisData,
        foundPortfolio: !!portfolioData,
        foundPurchase: !!purchaseData,
        newsCount: newsData.length,
      });

      preloadedData = {
        financials: stockData
          ? {
              pbr: stockData.pbr ? Number(stockData.pbr) : null,
              per: stockData.per ? Number(stockData.per) : null,
              roe: stockData.roe ? Number(stockData.roe) : null,
              operatingCF: stockData.operatingCF
                ? Number(stockData.operatingCF)
                : null,
              freeCF: stockData.freeCF ? Number(stockData.freeCF) : null,
              fiftyTwoWeekHigh: stockData.fiftyTwoWeekHigh
                ? Number(stockData.fiftyTwoWeekHigh)
                : null,
              fiftyTwoWeekLow: stockData.fiftyTwoWeekLow
                ? Number(stockData.fiftyTwoWeekLow)
                : null,
              marketCap: stockData.marketCap
                ? Number(stockData.marketCap)
                : null,
              dividendYield: stockData.dividendYield
                ? Number(stockData.dividendYield)
                : null,
              isProfitable: stockData.isProfitable,
              profitTrend: stockData.profitTrend,
              revenueGrowth: stockData.revenueGrowth
                ? Number(stockData.revenueGrowth)
                : null,
              netIncomeGrowth: stockData.netIncomeGrowth
                ? Number(stockData.netIncomeGrowth)
                : null,
              eps: stockData.eps ? Number(stockData.eps) : null,
              isDelisted: stockData.isDelisted,
            }
          : null,
        analysis: analysisData
          ? {
              shortTermTrend: analysisData.shortTermTrend,
              shortTermText: analysisData.shortTermText,
              shortTermPriceLow: Number(analysisData.shortTermPriceLow),
              shortTermPriceHigh: Number(analysisData.shortTermPriceHigh),
              midTermTrend: analysisData.midTermTrend,
              midTermText: analysisData.midTermText,
              midTermPriceLow: Number(analysisData.midTermPriceLow),
              midTermPriceHigh: Number(analysisData.midTermPriceHigh),
              longTermTrend: analysisData.longTermTrend,
              longTermText: analysisData.longTermText,
              longTermPriceLow: Number(analysisData.longTermPriceLow),
              longTermPriceHigh: Number(analysisData.longTermPriceHigh),
              recommendation: analysisData.recommendation,
              advice: analysisData.advice,
              confidence: analysisData.confidence,
              analyzedAt: analysisData.analyzedAt,
              daysAgo: Math.floor(
                (Date.now() - analysisData.analyzedAt.getTime()) /
                  (1000 * 60 * 60 * 24),
              ),
            }
          : null,
        news: newsData.map((n: RelatedNews) => ({
          title: n.title,
          content: n.content.substring(0, 300),
          url: n.url || "",
          sentiment: n.sentiment,
          publishedAt: n.publishedAt,
        })),
        portfolioAnalysis: portfolioData
          ? {
              shortTerm: portfolioData.shortTerm,
              mediumTerm: portfolioData.mediumTerm,
              longTerm: portfolioData.longTerm,
              suggestedSellPrice: portfolioData.suggestedSellPrice
                ? Number(portfolioData.suggestedSellPrice)
                : null,
              suggestedSellPercent: portfolioData.suggestedSellPercent,
              sellCondition: portfolioData.sellCondition,
              sellReason: portfolioData.sellReason,
              lastAnalysis: portfolioData.lastAnalysis,
            }
          : null,
        purchaseRecommendation: purchaseData
          ? {
              recommendation: purchaseData.recommendation,
              confidence: purchaseData.confidence,
              reason: purchaseData.reason,
              positives: purchaseData.positives
                ? purchaseData.positives
                    .split("\n")
                    .map((p) => p.replace(/^[・\-\*]\s*/, "").trim())
                    .filter(Boolean)
                : null,
              concerns: purchaseData.concerns
                ? purchaseData.concerns
                    .split("\n")
                    .map((c) => c.replace(/^[・\-\*]\s*/, "").trim())
                    .filter(Boolean)
                : null,
              buyCondition: purchaseData.buyCondition,
              personalizedReason: purchaseData.personalizedReason,
              marketSignal: purchaseData.marketSignal,
              date: purchaseData.date,
            }
          : null,
      };
    } catch (error) {
      console.error("Preload error occurred:", error);
      // 事前取得失敗してもチャットは続行（ツールで補完）
    }
  }

  const systemPrompt = await buildChatSystemPrompt(
    userSettings,
    stockContext,
    preloadedData,
  );

  console.log("System Prompt generated. Length:", systemPrompt.length);
  if (stockContext) {
    console.log(
      "Context being used:",
      stockContext.tickerCode,
      stockContext.type,
    );
  }

  const tools = createChatTools(user.id, stockContext);

  const modelMessages = await convertToModelMessages(messages);

  const result = streamText({
    model: openai(CHAT_CONFIG.MODEL),
    system: systemPrompt,
    messages: modelMessages,
    tools,
    stopWhen: stepCountIs(CHAT_CONFIG.MAX_STEPS),
    temperature: CHAT_CONFIG.TEMPERATURE,
    maxOutputTokens: CHAT_CONFIG.MAX_TOKENS,
  });

  return result.toUIMessageStreamResponse();
}
