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

      const [stockData, analysisData, newsData, portfolioData, reportData] =
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
                  riskLevel: true,
                  riskFlags: true,
                  lastAnalysis: true,
                },
              })
            : Promise.resolve(null),
          // 銘柄レポート（ウォッチリスト/閲覧中の場合）
          stockContext.type !== "portfolio"
            ? prisma.stockReport.findFirst({
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
        foundReport: !!reportData,
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
              midTermTrend: analysisData.midTermTrend,
              midTermText: analysisData.midTermText,
              longTermTrend: analysisData.longTermTrend,
              longTermText: analysisData.longTermText,
              healthScore: analysisData.healthScore,
              riskLevel: analysisData.riskLevel,
              advice: analysisData.advice,
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
              riskLevel: portfolioData.riskLevel,
              riskFlags: portfolioData.riskFlags,
              lastAnalysis: portfolioData.lastAnalysis,
            }
          : null,
        stockReport: reportData
          ? {
              technicalScore: reportData.technicalScore,
              fundamentalScore: reportData.fundamentalScore,
              healthRank: reportData.healthRank,
              alerts: reportData.alerts,
              reason: reportData.reason,
              positives: reportData.positives
                ? reportData.positives
                    .split("\n")
                    .map((p: string) => p.replace(/^[・\-\*]\s*/, "").trim())
                    .filter(Boolean)
                : null,
              concerns: reportData.concerns
                ? reportData.concerns
                    .split("\n")
                    .map((c: string) => c.replace(/^[・\-\*]\s*/, "").trim())
                    .filter(Boolean)
                : null,
              keyCondition: reportData.keyCondition,
              marketSignal: reportData.marketSignal,
              date: reportData.date,
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
