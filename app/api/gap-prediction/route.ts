import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/auth"
import { prisma } from "@/lib/prisma"
import { getTodayForDB } from "@/lib/date-utils"
import {
  estimateMarketGap,
  estimateStockGap,
  type PreMarketDataInput,
  type StockGapEstimate,
} from "@/lib/gap-prediction"
import { calculatePortfolioFromTransactions } from "@/lib/portfolio-calculator"

interface StockGapWithActual extends StockGapEstimate {
  previousClose: number | null
  predictedOpenPrice: number | null
  actualOpenPrice: number | null
  actualGapRate: number | null
}

/**
 * GET /api/gap-prediction
 *
 * プレマーケットデータからギャップ予測を返す。
 * - 市場全体のギャップ推定（海外市場4指標 + 加重平均推定）
 * - ポートフォリオ銘柄の個別ギャップ推定（ベータ近似 + セクター補正）
 *
 * ?scope=all: ポートフォリオ+ウォッチリスト全銘柄（severityフィルタなし）
 */
export async function GET(request: NextRequest) {
  try {
    const session = await auth()

    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const scope = request.nextUrl.searchParams.get("scope")
    const isAllScope = scope === "all"

    const today = getTodayForDB()

    // 当日のプレマーケットデータを取得
    const preMarketData = await prisma.preMarketData.findUnique({
      where: { date: today },
    })

    if (!preMarketData) {
      return NextResponse.json({ data: null })
    }

    // PreMarketDataInput に変換
    const input: PreMarketDataInput = {
      nikkeiFutures: preMarketData.nikkeiFuturesClose
        ? { close: Number(preMarketData.nikkeiFuturesClose), changeRate: Number(preMarketData.nikkeiFuturesChangeRate) }
        : null,
      usdjpy: preMarketData.usdjpyClose
        ? { close: Number(preMarketData.usdjpyClose), changeRate: Number(preMarketData.usdjpyChangeRate) }
        : null,
      sp500: preMarketData.sp500Close
        ? { close: Number(preMarketData.sp500Close), changeRate: Number(preMarketData.sp500ChangeRate) }
        : null,
      nasdaq: preMarketData.nasdaqClose
        ? { close: Number(preMarketData.nasdaqClose), changeRate: Number(preMarketData.nasdaqChangeRate) }
        : null,
      vix: preMarketData.vixClose
        ? { close: Number(preMarketData.vixClose), changeRate: Number(preMarketData.vixChangeRate) }
        : null,
      wti: preMarketData.wtiClose
        ? { close: Number(preMarketData.wtiClose), changeRate: Number(preMarketData.wtiChangeRate) }
        : null,
    }

    // 市場全体のギャップ推定
    const marketGap = estimateMarketGap(input)

    // ポートフォリオ銘柄の取得（保有中のみ）
    const allPortfolioStocks = await prisma.portfolioStock.findMany({
      where: { userId: session.user.id },
      include: {
        stock: true,
        transactions: { orderBy: { transactionDate: "asc" } },
      },
    })

    const portfolioStocks = allPortfolioStocks.filter((ps) => {
      const { quantity } = calculatePortfolioFromTransactions(ps.transactions)
      return quantity > 0
    })

    // scope=all の場合、ウォッチリスト銘柄も取得
    const watchlistStocks = isAllScope
      ? await prisma.watchlistStock.findMany({
          where: { userId: session.user.id },
          include: { stock: true },
        })
      : []

    // 全銘柄（重複除去）からボラティリティを収集
    const allStockEntries = [
      ...portfolioStocks.map((ps) => ps.stock),
      ...watchlistStocks.map((ws) => ws.stock),
    ]
    // stockIdで重複除去
    const uniqueStockMap = new Map(allStockEntries.map((s) => [s.id, s]))

    const volatilities = Array.from(uniqueStockMap.values())
      .map((s) => s.volatility)
      .filter((v): v is NonNullable<typeof v> => v !== null && v !== undefined)
      .map(Number)

    const averageVolatility = volatilities.length > 0
      ? volatilities.reduce((sum, v) => sum + v, 0) / volatilities.length
      : 30

    const nasdaqChangeRate = input.nasdaq?.changeRate ?? null
    const usdjpyChangeRate = input.usdjpy?.changeRate ?? null
    const todayStr = today.toISOString().split("T")[0]

    // 銘柄ごとのギャップ推定を計算するヘルパー
    const computeStockGap = (stock: typeof allStockEntries[0]): StockGapWithActual | StockGapEstimate => {
      const estimate = estimateStockGap(
        marketGap,
        {
          id: stock.id,
          tickerCode: stock.tickerCode,
          name: stock.name,
          sector: stock.sector,
          latestPrice: stock.latestPrice ? Number(stock.latestPrice) : null,
          volatility: stock.volatility ? Number(stock.volatility) : null,
        },
        averageVolatility,
        nasdaqChangeRate,
        usdjpyChangeRate,
      )

      if (!isAllScope) return estimate

      // scope=all: 前日終値・予測寄り付き・実績を付加
      const previousClose = stock.latestPrice ? Number(stock.latestPrice) : null
      const predictedOpenPrice = previousClose !== null
        ? Math.round(previousClose * (1 + estimate.estimatedGapRate / 100))
        : null

      // 当日の寄り付き値があるか（latestPriceDateが今日）
      const priceDateStr = stock.latestPriceDate?.toISOString().split("T")[0] ?? null
      const hasActualOpen = priceDateStr === todayStr && stock.latestOpen !== null

      const actualOpenPrice = hasActualOpen ? Number(stock.latestOpen) : null
      const actualGapRate = hasActualOpen && previousClose
        ? Math.round(((Number(stock.latestOpen) - previousClose) / previousClose) * 100 * 100) / 100
        : null

      return {
        ...estimate,
        previousClose,
        predictedOpenPrice,
        actualOpenPrice,
        actualGapRate,
      }
    }

    // ポートフォリオ銘柄のギャップ推定
    const portfolioGaps = portfolioStocks.map((ps) => computeStockGap(ps.stock))

    // ウォッチリスト銘柄のギャップ推定（scope=allのみ、ポートフォリオと重複は除外）
    const portfolioStockIds = new Set(portfolioStocks.map((ps) => ps.stock.id))
    const watchlistGaps = watchlistStocks
      .filter((ws) => !portfolioStockIds.has(ws.stock.id))
      .map((ws) => computeStockGap(ws.stock))

    let stocks: (StockGapEstimate | StockGapWithActual)[]
    if (isAllScope) {
      // 全銘柄、severityフィルタなし
      stocks = [...portfolioGaps, ...watchlistGaps]
        .sort((a, b) => Math.abs(b.estimatedGapRate) - Math.abs(a.estimatedGapRate))
    } else {
      // 既存動作: severity >= medium のみ
      stocks = portfolioGaps
        .filter((s) => s.severity !== "low")
        .sort((a, b) => Math.abs(b.estimatedGapRate) - Math.abs(a.estimatedGapRate))
    }

    return NextResponse.json({
      date: todayStr,
      market: {
        nikkeiFutures: input.nikkeiFutures,
        usdjpy: input.usdjpy,
        sp500: input.sp500,
        nasdaq: input.nasdaq,
        vix: input.vix,
        wti: input.wti,
        ...marketGap,
      },
      stocks,
    })
  } catch (error) {
    console.error("Error fetching gap prediction:", error)
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    )
  }
}
