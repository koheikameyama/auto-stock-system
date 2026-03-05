import { tool } from "ai"
import { z } from "zod"
import { prisma } from "@/lib/prisma"
import { fetchStockPrices } from "@/lib/stock-price-fetcher"
import { calculatePortfolioFromTransactions } from "@/lib/portfolio-calculator"
import { getRelatedNews } from "@/lib/news-rag"
import { getTodayForDB, getDaysAgoForDB } from "@/lib/date-utils"

interface StockContext {
  stockId: string
  tickerCode: string
  name: string
  sector: string | null
  currentPrice: number | null
  type: "portfolio" | "watchlist" | "view"
  quantity?: number
  averagePurchasePrice?: number
  profit?: number
  profitPercent?: number
}

export function createChatTools(userId: string, stockContext?: StockContext) {
  return {
    getPortfolioSummary: tool({
      description:
        "ユーザーの保有銘柄一覧を取得します。銘柄名、保有株数、平均取得単価、現在価格、損益を含みます。ポートフォリオ全体について質問された時に使ってください。",
      inputSchema: z.object({}),
      execute: async () => {
        const allPortfolioStocks = await prisma.portfolioStock.findMany({
          where: { userId },
          include: {
            stock: true,
            transactions: { orderBy: { transactionDate: "asc" } },
          },
        })

        // 保有中（quantity > 0）のみに絞る
        const portfolioStocks = allPortfolioStocks.filter((ps) => {
          const { quantity } = calculatePortfolioFromTransactions(ps.transactions)
          return quantity > 0
        })

        if (portfolioStocks.length === 0) {
          return { stocks: [], message: "保有銘柄はありません" }
        }

        const tickerCodes = portfolioStocks.map((ps) =>
          ps.stock.tickerCode.replace(".T", "")
        )
        const { prices } = await fetchStockPrices(tickerCodes)
        const priceMap = new Map(
          prices.map((p) => [p.tickerCode.replace(".T", ""), p.currentPrice])
        )

        const stocks = portfolioStocks.map((ps) => {
          const tickerKey = ps.stock.tickerCode.replace(".T", "")
          const currentPrice = priceMap.get(tickerKey) ?? 0
          const { quantity, averagePurchasePrice } =
            calculatePortfolioFromTransactions(ps.transactions)
          const avgPrice = Number(averagePurchasePrice)
          const totalCost = avgPrice * quantity
          const currentValue = currentPrice * quantity
          const profit = currentValue - totalCost
          const profitPercent =
            totalCost > 0 ? (profit / totalCost) * 100 : 0

          return {
            name: ps.stock.name,
            tickerCode: ps.stock.tickerCode,
            sector: ps.stock.sector,
            quantity,
            averagePrice: avgPrice,
            currentPrice,
            profit: Math.round(profit),
            profitPercent: Number(profitPercent.toFixed(2)),
          }
        })

        return { stocks }
      },
    }),

    getWatchlistSummary: tool({
      description:
        "ユーザーのウォッチリスト銘柄一覧を取得します。ウォッチリストについて質問された時に使ってください。",
      inputSchema: z.object({}),
      execute: async () => {
        const watchlistStocks = await prisma.watchlistStock.findMany({
          where: { userId },
          include: { stock: true },
        })

        if (watchlistStocks.length === 0) {
          return { stocks: [], message: "ウォッチリストは空です" }
        }

        const tickerCodes = watchlistStocks.map((ws) =>
          ws.stock.tickerCode.replace(".T", "")
        )
        const { prices } = await fetchStockPrices(tickerCodes)
        const priceMap = new Map(
          prices.map((p) => [p.tickerCode.replace(".T", ""), p.currentPrice])
        )

        const stocks = watchlistStocks.map((ws) => {
          const tickerKey = ws.stock.tickerCode.replace(".T", "")
          return {
            stockId: ws.stockId,
            name: ws.stock.name,
            tickerCode: ws.stock.tickerCode,
            sector: ws.stock.sector,
            currentPrice: priceMap.get(tickerKey) ?? 0,
          }
        })

        return { stocks }
      },
    }),

    getStockFinancials: tool({
      description:
        "指定された銘柄の財務指標を取得します。PBR、PER、ROE、キャッシュフロー、52週高値/安値、業績データを含みます。銘柄の財務状況や割安/割高の判断に使ってください。",
      inputSchema: z.object({
        stockId: z.string().describe("銘柄ID"),
      }),
      execute: async ({ stockId }) => {
        const stock = await prisma.stock.findUnique({
          where: { id: stockId },
          select: {
            name: true,
            tickerCode: true,
            sector: true,
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
            latestRevenue: true,
            latestNetIncome: true,
            revenueGrowth: true,
            netIncomeGrowth: true,
            eps: true,
            isDelisted: true,
            fetchFailCount: true,
          },
        })

        if (!stock) return { error: "銘柄が見つかりません" }

        return {
          name: stock.name,
          tickerCode: stock.tickerCode,
          sector: stock.sector,
          pbr: stock.pbr ? Number(stock.pbr) : null,
          per: stock.per ? Number(stock.per) : null,
          roe: stock.roe ? Number(stock.roe) : null,
          operatingCF: stock.operatingCF ? Number(stock.operatingCF) : null,
          freeCF: stock.freeCF ? Number(stock.freeCF) : null,
          fiftyTwoWeekHigh: stock.fiftyTwoWeekHigh
            ? Number(stock.fiftyTwoWeekHigh)
            : null,
          fiftyTwoWeekLow: stock.fiftyTwoWeekLow
            ? Number(stock.fiftyTwoWeekLow)
            : null,
          marketCap: stock.marketCap ? Number(stock.marketCap) : null,
          dividendYield: stock.dividendYield
            ? Number(stock.dividendYield)
            : null,
          isProfitable: stock.isProfitable,
          profitTrend: stock.profitTrend,
          revenueGrowth: stock.revenueGrowth
            ? Number(stock.revenueGrowth)
            : null,
          netIncomeGrowth: stock.netIncomeGrowth
            ? Number(stock.netIncomeGrowth)
            : null,
          eps: stock.eps ? Number(stock.eps) : null,
          isDelisted: stock.isDelisted,
        }
      },
    }),

    getStockAnalysis: tool({
      description:
        "指定された銘柄の最新AIトレンド分析を取得します。短期・中期・長期の見通しと健全性スコアを含みます。今後の見通しの質問に使ってください。",
      inputSchema: z.object({
        stockId: z.string().describe("銘柄ID"),
      }),
      execute: async ({ stockId }) => {
        const analysis = await prisma.stockAnalysis.findFirst({
          where: { stockId },
          orderBy: { analyzedAt: "desc" },
        })

        if (!analysis) return { error: "AI分析データがありません" }

        const daysAgo = Math.floor(
          (Date.now() - analysis.analyzedAt.getTime()) / (1000 * 60 * 60 * 24)
        )

        return {
          shortTermTrend: analysis.shortTermTrend,
          shortTermText: analysis.shortTermText,
          midTermTrend: analysis.midTermTrend,
          midTermText: analysis.midTermText,
          longTermTrend: analysis.longTermTrend,
          longTermText: analysis.longTermText,
          healthScore: analysis.healthScore,
          riskLevel: analysis.riskLevel,
          riskFlags: analysis.riskFlags,
          advice: analysis.advice,
          analyzedAt: analysis.analyzedAt.toISOString(),
          daysAgo,
          freshness:
            daysAgo <= 1
              ? "最新"
              : daysAgo <= 3
                ? "新しい"
                : daysAgo <= 7
                  ? "やや古い"
                  : "古い（再分析推奨）",
        }
      },
    }),

    getStockReport: tool({
      description:
        "銘柄レポートを取得します。stockIdsを指定すると特定銘柄のレポートを返します。省略するとウォッチリスト全体のレポートを比較できます。「どの銘柄がいい？」「銘柄の比較」などの質問に使ってください。",
      inputSchema: z.object({
        stockIds: z
          .array(z.string())
          .optional()
          .describe(
            "比較したい銘柄IDの配列。省略するとウォッチリスト全体のレポートを取得"
          ),
      }),
      execute: async ({ stockIds }) => {
        let targetStockIds = stockIds

        // stockIds未指定の場合はウォッチリスト全体
        if (!targetStockIds || targetStockIds.length === 0) {
          const watchlist = await prisma.watchlistStock.findMany({
            where: { userId },
            select: { stockId: true },
          })
          targetStockIds = watchlist.map((ws) => ws.stockId)
        }

        if (targetStockIds.length === 0) {
          return { reports: [], message: "対象銘柄がありません" }
        }

        const reports = await prisma.stockReport.findMany({
          where: {
            stockId: { in: targetStockIds },
            date: { gte: getDaysAgoForDB(7) },
          },
          include: { stock: { select: { name: true, tickerCode: true, sector: true } } },
          orderBy: { date: "desc" },
          distinct: ["stockId"],
        })

        return {
          reports: reports.map((rep) => ({
            stockId: rep.stockId,
            stockName: rep.stock.name,
            tickerCode: rep.stock.tickerCode,
            sector: rep.stock.sector,
            technicalScore: rep.technicalScore,
            fundamentalScore: rep.fundamentalScore,
            healthRank: rep.healthRank,
            alerts: rep.alerts,
            reason: rep.reason,
            positives: rep.positives,
            concerns: rep.concerns,
            caution: rep.caution,
            keyCondition: rep.keyCondition,
            marketSignal: rep.marketSignal,
            date: rep.date.toISOString(),
          })),
        }
      },
    }),

    getPortfolioAnalysis: tool({
      description:
        "指定された保有銘柄のポートフォリオ分析を取得します。短期・中期・長期の展望、リスク評価を含みます。保有銘柄の状況把握に使ってください。",
      inputSchema: z.object({
        stockId: z.string().describe("銘柄ID"),
      }),
      execute: async ({ stockId }) => {
        const portfolioStock = await prisma.portfolioStock.findFirst({
          where: { userId, stockId },
          include: {
            stock: { select: { name: true, tickerCode: true } },
          },
        })

        if (!portfolioStock) return { error: "保有銘柄が見つかりません" }

        return {
          stockName: portfolioStock.stock.name,
          tickerCode: portfolioStock.stock.tickerCode,
          shortTerm: portfolioStock.shortTerm,
          mediumTerm: portfolioStock.mediumTerm,
          longTerm: portfolioStock.longTerm,
          riskLevel: portfolioStock.riskLevel,
          riskFlags: portfolioStock.riskFlags,
          lastAnalysis: portfolioStock.lastAnalysis?.toISOString() ?? null,
        }
      },
    }),

    getRelatedNews: tool({
      description:
        "指定された銘柄コードまたはセクターに関連する最新ニュースを取得します。直近のニュースは重要な判断材料です。ニュースを参照した場合は、回答の最後に必ず以下の形式で追加してください:\n\n---\n📰 参考にした情報:\n• ニュースタイトル\n  URL",
      inputSchema: z.object({
        tickerCodes: z
          .array(z.string())
          .optional()
          .describe("銘柄コード配列（例: ['7203', '6758']）"),
        sectors: z
          .array(z.string())
          .optional()
          .describe("セクター配列（例: ['自動車', 'IT・サービス']）"),
      }),
      execute: async ({ tickerCodes, sectors }) => {
        const news = await getRelatedNews({
          tickerCodes: tickerCodes ?? [],
          sectors: sectors ?? [],
          limit: 5,
          daysAgo: 14,
        })

        return {
          news: news.map((n) => ({
            title: n.title,
            content: n.content.substring(0, 300),
            url: n.url,
            sentiment: n.sentiment,
            publishedAt: n.publishedAt.toISOString(),
            matchType: n.matchType,
          })),
        }
      },
    }),

    getStockPrice: tool({
      description:
        "指定された銘柄のリアルタイム株価を取得します。現在価格、前日終値、前日比、出来高を含みます。",
      inputSchema: z.object({
        tickerCode: z
          .string()
          .describe("銘柄コード（例: '7203'）。.Tサフィックスは不要"),
      }),
      execute: async ({ tickerCode }) => {
        const code = tickerCode.replace(".T", "")
        const { prices } = await fetchStockPrices([code])

        if (prices.length === 0) return { error: "株価を取得できませんでした" }

        const p = prices[0]
        return {
          tickerCode: p.tickerCode,
          currentPrice: p.currentPrice,
          previousClose: p.previousClose,
          change: p.change,
          changePercent: p.changePercent,
          high: p.high,
          low: p.low,
          volume: p.volume,
        }
      },
    }),

    getDailyHighlights: tool({
      description:
        "ユーザー向けの本日の注目銘柄を取得します。客観的な条件に基づいて選ばれた銘柄と注目理由を含みます。「今日の注目銘柄は？」「気になる銘柄は？」という質問に使ってください。",
      inputSchema: z.object({}),
      execute: async () => {
        const today = getTodayForDB()

        const highlights =
          await prisma.dailyHighlight.findMany({
            where: { userId, date: today },
            include: {
              stock: {
                select: {
                  name: true,
                  tickerCode: true,
                  sector: true,
                  latestPrice: true,
                },
              },
            },
            orderBy: { position: "asc" },
          })

        if (highlights.length === 0) {
          return { highlights: [], message: "本日の注目銘柄はまだ生成されていません" }
        }

        return {
          highlights: highlights.map((h) => ({
            position: h.position,
            stockName: h.stock.name,
            tickerCode: h.stock.tickerCode,
            sector: h.stock.sector,
            currentPrice: h.stock.latestPrice
              ? Number(h.stock.latestPrice)
              : null,
            highlightType: h.highlightType,
            highlightReason: h.highlightReason,
          })),
        }
      },
    }),
  }
}
