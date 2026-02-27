import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { verifyAdmin } from "@/lib/admin-auth"
import { FETCH_FAIL_WARNING_THRESHOLD } from "@/lib/constants"

/**
 * GET /api/admin/stocks
 * 銘柄マスタ一覧取得（管理者用）
 *
 * Query params:
 * - filter: "all" | "failed" | "delisted"(データ取得不可) (default: "all")
 * - search: 銘柄コードまたは名前で検索
 * - page: ページ番号 (default: 1)
 * - limit: 1ページあたりの件数 (default: 50)
 */
export async function GET(request: NextRequest) {
  const adminCheck = await verifyAdmin()
  if (!adminCheck.authorized) {
    return NextResponse.json({ error: adminCheck.error }, { status: adminCheck.status })
  }

  const { searchParams } = new URL(request.url)
  const filter = searchParams.get("filter") || "all"
  const search = searchParams.get("search") || ""
  const page = Math.max(1, Number(searchParams.get("page") || "1"))
  const limit = Math.min(100, Math.max(1, Number(searchParams.get("limit") || "50")))
  const skip = (page - 1) * limit

  // WHERE条件を構築
  const where: Record<string, unknown> = {}

  if (filter === "failed") {
    where.fetchFailCount = { gte: FETCH_FAIL_WARNING_THRESHOLD }
  } else if (filter === "delisted") {
    where.isDelisted = true
  }

  if (search) {
    where.OR = [
      { tickerCode: { contains: search, mode: "insensitive" } },
      { name: { contains: search, mode: "insensitive" } },
    ]
  }

  const [stocks, total] = await Promise.all([
    prisma.stock.findMany({
      where,
      select: {
        id: true,
        tickerCode: true,
        name: true,
        market: true,
        latestPrice: true,
        fetchFailCount: true,
        lastFetchFailedAt: true,
        isDelisted: true,
        priceUpdatedAt: true,
        _count: {
          select: {
            portfolioStocks: true,
            watchlistStocks: true,
            trackedStocks: true,
          },
        },
      },
      orderBy: [
        { fetchFailCount: "desc" },
        { tickerCode: "asc" },
      ],
      skip,
      take: limit,
    }),
    prisma.stock.count({ where }),
  ])

  const response = stocks.map((s) => ({
    id: s.id,
    tickerCode: s.tickerCode,
    name: s.name,
    market: s.market,
    latestPrice: s.latestPrice ? Number(s.latestPrice) : null,
    fetchFailCount: s.fetchFailCount,
    lastFetchFailedAt: s.lastFetchFailedAt?.toISOString() ?? null,
    isDelisted: s.isDelisted,
    priceUpdatedAt: s.priceUpdatedAt?.toISOString() ?? null,
    userCount: s._count.portfolioStocks + s._count.watchlistStocks + s._count.trackedStocks,
  }))

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
