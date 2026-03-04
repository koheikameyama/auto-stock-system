import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { getAuthUser } from "@/lib/auth-utils"
import { Prisma } from "@prisma/client"
import { checkBuySignal } from "@/lib/recommendation-buy-filter"
import { calculatePortfolioFromTransactions } from "@/lib/portfolio-calculator"
import { getTseIndustries } from "@/lib/constants"

const VALID_SORT_OPTIONS = [
  "dailyChangeRate_desc",
  "dailyChangeRate_asc",
  "latestPrice_desc",
  "latestPrice_asc",
  "marketCap_desc",
  "name_asc",
] as const

type SortOption = (typeof VALID_SORT_OPTIONS)[number]

function buildOrderBy(
  sortBy: SortOption
): Prisma.StockOrderByWithRelationInput[] {
  switch (sortBy) {
    case "dailyChangeRate_desc":
      return [{ dailyChangeRate: { sort: "desc", nulls: "last" } }]
    case "dailyChangeRate_asc":
      return [{ dailyChangeRate: { sort: "asc", nulls: "last" } }]
    case "latestPrice_desc":
      return [{ latestPrice: { sort: "desc", nulls: "last" } }]
    case "latestPrice_asc":
      return [{ latestPrice: { sort: "asc", nulls: "last" } }]
    case "marketCap_desc":
      return [{ marketCap: { sort: "desc", nulls: "last" } }]
    case "name_asc":
      return [{ name: "asc" }]
    default:
      return [{ dailyChangeRate: { sort: "desc", nulls: "last" } }]
  }
}

/**
 * GET /api/stocks/list
 * 全銘柄一覧取得（フィルタ・ソート・ページネーション対応）
 */
export async function GET(request: NextRequest) {
  const { user, error } = await getAuthUser()
  if (error) return error

  const { searchParams } = new URL(request.url)
  const page = Math.max(1, Number(searchParams.get("page") || "1"))
  const limit = Math.min(100, Math.max(1, Number(searchParams.get("limit") || "30")))
  const skip = (page - 1) * limit

  const search = searchParams.get("search") || ""
  const sector = searchParams.get("sector") || ""
  const direction = searchParams.get("direction") || "all"
  const minPrice = searchParams.get("minPrice")
  const maxPrice = searchParams.get("maxPrice")
  const sortByParam = searchParams.get("sortBy") || "dailyChangeRate_desc"
  const sortBy = VALID_SORT_OPTIONS.includes(sortByParam as SortOption)
    ? (sortByParam as SortOption)
    : "dailyChangeRate_desc"
  const buySignalOnly = searchParams.get("buySignalOnly") === "true"

  // WHERE条件を構築
  const where: Prisma.StockWhereInput = {
    isDelisted: false,
    latestPrice: { not: null },
  }

  if (search) {
    where.OR = [
      { tickerCode: { contains: search, mode: "insensitive" } },
      { name: { contains: search, mode: "insensitive" } },
    ]
  }

  if (sector) {
    const tseIndustries = getTseIndustries(sector)
    if (tseIndustries.length > 0) {
      where.sector = { in: tseIndustries }
    } else {
      where.sector = sector
    }
  }

  if (direction === "up") {
    where.dailyChangeRate = { ...(where.dailyChangeRate as object), gt: 0 }
  } else if (direction === "down") {
    where.dailyChangeRate = { ...(where.dailyChangeRate as object), lt: 0 }
  }

  // 株価レンジフィルタ
  const priceFilter: Prisma.DecimalNullableFilter = { not: null }
  if (minPrice) {
    priceFilter.gte = new Prisma.Decimal(minPrice)
  }
  if (maxPrice) {
    priceFilter.lte = new Prisma.Decimal(maxPrice)
  }
  if (minPrice || maxPrice) {
    where.latestPrice = priceFilter
  }

  const stockSelect = {
    id: true,
    tickerCode: true,
    name: true,
    sector: true,
    market: true,
    latestPrice: true,
    dailyChangeRate: true,
    weekChangeRate: true,
    isProfitable: true,
    maDeviationRate: true,
    volumeRatio: true,
    profitTrend: true,
    revenueGrowth: true,
    volatility: true,
    purchaseRecommendations: {
      orderBy: { date: "desc" } as const,
      take: 1,
      select: {
        recommendation: true,
        confidence: true,
        userFitScore: true,
        date: true,
      },
    },
    portfolioStocks: {
      where: { userId: user.id },
      select: {
        id: true,
        transactions: {
          select: { type: true, quantity: true, price: true },
        },
      },
      take: 1,
    },
    watchlistStocks: {
      where: { userId: user.id },
      select: { id: true },
      take: 1,
    },
    trackedStocks: {
      where: { userId: user.id },
      select: { id: true },
      take: 1,
    },
  }

  // buySignalOnly の場合は全件取得してインメモリでフィルタ＆ページネーション
  const [stocks, total, userSettings] = await Promise.all([
    prisma.stock.findMany({
      where,
      select: stockSelect,
      orderBy: buildOrderBy(sortBy),
      ...(buySignalOnly ? {} : { skip, take: limit }),
    }),
    buySignalOnly ? Promise.resolve(0) : prisma.stock.count({ where }),
    prisma.userSettings.findUnique({
      where: { userId: user.id },
      select: { investmentStyle: true },
    }),
  ])

  const investmentStyle = userSettings?.investmentStyle ?? null

  const mapStock = (s: (typeof stocks)[number]) => {
    const signal = checkBuySignal(
      {
        weekChangeRate: s.weekChangeRate ? Number(s.weekChangeRate) : null,
        maDeviationRate: s.maDeviationRate ? Number(s.maDeviationRate) : null,
        volumeRatio: s.volumeRatio ? Number(s.volumeRatio) : null,
        isProfitable: s.isProfitable,
        profitTrend: s.profitTrend,
        revenueGrowth: s.revenueGrowth ? Number(s.revenueGrowth) : null,
        volatility: s.volatility ? Number(s.volatility) : null,
      },
      investmentStyle,
    )

    return {
      id: s.id,
      tickerCode: s.tickerCode,
      name: s.name,
      sector: s.sector,
      market: s.market,
      latestPrice: s.latestPrice ? Number(s.latestPrice) : null,
      dailyChangeRate: s.dailyChangeRate ? Number(s.dailyChangeRate) : null,
      weekChangeRate: s.weekChangeRate ? Number(s.weekChangeRate) : null,
      isProfitable: s.isProfitable,
      buySignal: {
        isBuyCandidate: signal.isBuyCandidate,
        chartSignals: [
          ...signal.chart.positiveSignals,
          ...signal.chart.negativeSignals,
        ],
        fundamentalSignals: [
          ...signal.fundamental.positiveSignals,
          ...signal.fundamental.negativeSignals,
        ],
      },
      latestRecommendation: s.purchaseRecommendations[0]
        ? {
            recommendation: s.purchaseRecommendations[0].recommendation,
            confidence: s.purchaseRecommendations[0].confidence,
            userFitScore: s.purchaseRecommendations[0].userFitScore,
            date: s.purchaseRecommendations[0].date.toISOString(),
          }
        : null,
      userStatus: (() => {
        if (s.portfolioStocks.length > 0) {
          const { quantity } = calculatePortfolioFromTransactions(
            s.portfolioStocks[0].transactions
          )
          if (quantity > 0) return "portfolio" as const
        }
        if (s.watchlistStocks.length > 0) return "watchlist" as const
        if (s.trackedStocks.length > 0) return "tracked" as const
        return null
      })(),
    }
  }

  if (buySignalOnly) {
    const allMapped = stocks.map(mapStock)
    const filtered = allMapped.filter((s) => s.buySignal.isBuyCandidate)
    const filteredTotal = filtered.length
    const paginatedStocks = filtered.slice(skip, skip + limit)

    return NextResponse.json({
      stocks: paginatedStocks,
      pagination: {
        page,
        limit,
        total: filteredTotal,
        totalPages: Math.ceil(filteredTotal / limit),
      },
    })
  }

  const response = stocks.map(mapStock)

  return NextResponse.json({
    stocks: response,
    pagination: {
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit),
    },
  })
}
