import { NextResponse } from "next/server"
import { auth } from "@/auth"
import { prisma } from "@/lib/prisma"
import { getTodayForDB } from "@/lib/date-utils"
import { Prisma } from "@prisma/client"
import { MAX_TOP_STOCKS_DISPLAY } from "@/lib/constants"
import type { PurchaseStyleAnalysis } from "@/lib/style-analysis"
import type { InvestmentStyle } from "@/lib/constants"

/**
 * GET /api/top-stocks
 * 分析済み全銘柄の中から、ユーザーの投資スタイルに合った高評価銘柄を取得
 * - PurchaseRecommendation の styleAnalyses から、ユーザーの投資スタイルで "buy" 判定の銘柄を抽出
 * - confidence 降順でソート
 * - 最大 MAX_TOP_STOCKS_DISPLAY 件
 */
export async function GET() {
  try {
    const session = await auth()
    const userId = session?.user?.id

    if (!userId) {
      return NextResponse.json(
        { error: "認証が必要です" },
        { status: 401 }
      )
    }

    // ユーザーの投資スタイルを取得
    const settings = await prisma.userSettings.findUnique({
      where: { userId },
      select: { investmentStyle: true },
    })

    if (!settings) {
      return NextResponse.json({
        stocks: [],
        investmentStyle: null,
        date: null,
      })
    }

    const style = settings.investmentStyle as InvestmentStyle
    const todayUTC = getTodayForDB()

    // まず当日の PurchaseRecommendation を取得
    let recommendations = await prisma.purchaseRecommendation.findMany({
      where: {
        date: todayUTC,
        styleAnalyses: { not: Prisma.DbNull },
      },
      include: {
        stock: true,
      },
    })

    let date = todayUTC

    // 当日データがなければ最新日のデータを取得
    if (recommendations.length === 0) {
      const latest = await prisma.purchaseRecommendation.findFirst({
        where: { styleAnalyses: { not: Prisma.DbNull } },
        select: { date: true },
        orderBy: { date: "desc" },
      })

      if (latest) {
        date = latest.date
        recommendations = await prisma.purchaseRecommendation.findMany({
          where: {
            date: latest.date,
            styleAnalyses: { not: Prisma.DbNull },
          },
          include: {
            stock: true,
          },
        })
      }
    }

    // ユーザーの銘柄ステータスを取得
    const [watchlist, allPortfolio, tracked] = await Promise.all([
      prisma.watchlistStock.findMany({
        where: { userId },
        select: { id: true, stockId: true },
      }),
      prisma.portfolioStock.findMany({
        where: { userId },
        select: {
          id: true,
          stockId: true,
          transactions: { select: { type: true, quantity: true } },
        },
      }),
      prisma.trackedStock.findMany({
        where: { userId },
        select: { id: true, stockId: true },
      }),
    ])

    const portfolio = allPortfolio.filter((ps) => {
      const qty = ps.transactions.reduce(
        (sum, t) => sum + (t.type === "buy" ? t.quantity : -t.quantity),
        0
      )
      return qty > 0
    })
    const portfolioStockIds = portfolio.map((s) => s.stockId)
    const portfolioMap = new Map<string, string>(portfolio.map((s) => [s.stockId, s.id]))
    const watchlistStockIds = watchlist.map((s) => s.stockId)
    const watchlistMap = new Map<string, string>(watchlist.map((s) => [s.stockId, s.id]))
    const trackedStockIds = tracked.map((s) => s.stockId)

    // 投資スタイルに合った "buy" 銘柄をフィルタリング
    type TopStock = {
      id: string
      stockId: string
      confidence: number
      reason: string
      caution: string
      advice: string
      marketSignal: string | null
      isOwned: boolean
      isRegistered: boolean
      isTracked: boolean
      userStockId: string | null
      stock: {
        id: string
        tickerCode: string
        name: string
        sector: string | null
        currentPrice: number | null
        isProfitable: boolean | null
        volatility: number | null
        weekChangeRate: number | null
        fetchFailCount?: number
        isDelisted?: boolean
      }
    }

    const topStocks: TopStock[] = []

    for (const rec of recommendations) {
      const styleAnalyses = rec.styleAnalyses as Record<string, PurchaseStyleAnalysis> | null
      if (!styleAnalyses || !styleAnalyses[style]) continue

      const analysis = styleAnalyses[style]
      if (analysis.recommendation !== "buy") continue

      // 上場廃止銘柄を除外
      if (rec.stock.isDelisted) continue

      topStocks.push({
        id: rec.id,
        stockId: rec.stockId,
        confidence: analysis.confidence,
        reason: analysis.reason,
        caution: analysis.caution,
        advice: analysis.advice,
        marketSignal: analysis.marketSignal || null,
        isOwned: portfolioStockIds.includes(rec.stockId),
        isRegistered: watchlistStockIds.includes(rec.stockId),
        isTracked: trackedStockIds.includes(rec.stockId),
        userStockId:
          portfolioMap.get(rec.stockId) ??
          watchlistMap.get(rec.stockId) ??
          null,
        stock: {
          id: rec.stock.id,
          tickerCode: rec.stock.tickerCode,
          name: rec.stock.name,
          sector: rec.stock.sector,
          currentPrice: null, // フロントでリアルタイム取得
          isProfitable: rec.stock.isProfitable,
          volatility: rec.stock.volatility ? Number(rec.stock.volatility) : null,
          weekChangeRate: rec.stock.weekChangeRate
            ? Number(rec.stock.weekChangeRate)
            : null,
          fetchFailCount: rec.stock.fetchFailCount,
          isDelisted: rec.stock.isDelisted,
        },
      })
    }

    // confidence 降順でソート
    topStocks.sort((a, b) => b.confidence - a.confidence)

    // 上位N件に絞る
    const limited = topStocks.slice(0, MAX_TOP_STOCKS_DISPLAY)

    return NextResponse.json({
      stocks: limited,
      investmentStyle: style,
      date,
    })
  } catch (error) {
    console.error("Error fetching top stocks:", error)
    return NextResponse.json(
      { error: "高評価銘柄の取得に失敗しました" },
      { status: 500 }
    )
  }
}
