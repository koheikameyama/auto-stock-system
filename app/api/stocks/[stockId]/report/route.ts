import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { auth } from "@/auth"
import { verifyCronOrSession } from "@/lib/cron-auth"
import { fetchStockPrices } from "@/lib/stock-price-fetcher"
import { getDaysAgoForDB } from "@/lib/date-utils"
import {
  executeStockReport,
} from "@/lib/stock-report-core"
import { AnalysisError } from "@/lib/portfolio-analysis-core"

/**
 * GET /api/stocks/[stockId]/report
 * 指定された銘柄の最新レポートを取得
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ stockId: string }> }
) {
  const { stockId } = await params

  try {
    const stock = await prisma.stock.findUnique({
      where: { id: stockId },
      select: {
        id: true,
        tickerCode: true,
        name: true,
      },
    })

    if (!stock) {
      return NextResponse.json(
        { error: "銘柄が見つかりません" },
        { status: 404 }
      )
    }

    // セッションからユーザーの投資スタイルを取得
    const session = await auth()
    let userStyle = "BALANCED"
    if (session?.user?.id) {
      const userSettings = await prisma.userSettings.findUnique({
        where: { userId: session.user.id },
        select: { investmentStyle: true },
      })
      if (userSettings?.investmentStyle) {
        userStyle = userSettings.investmentStyle
      }
    }

    // 最新のレポートを取得（過去7日以内）
    const sevenDaysAgo = getDaysAgoForDB(7)

    const report = await prisma.stockReport.findFirst({
      where: {
        stockId,
        date: { gte: sevenDaysAgo },
      },
      orderBy: { date: "desc" },
    })

    if (!report) {
      return NextResponse.json(
        { error: "レポートデータがまだ生成されていません" },
        { status: 404 }
      )
    }

    // StockAnalysis: レポートと同時刻のエントリーを取得
    const analysis =
      (await prisma.stockAnalysis.findFirst({
        where: { stockId, analyzedAt: report.updatedAt },
      })) ??
      (await prisma.stockAnalysis.findFirst({
        where: { stockId },
        orderBy: { analyzedAt: "desc" },
      }))

    // リアルタイム株価を取得
    const { prices: realtimePrices } = await fetchStockPrices([stock.tickerCode])
    const currentPrice = realtimePrices[0]?.currentPrice ?? null

    // ユーザーの投資スタイルに合った結果をstyleAnalysesから取得
    const styleAnalyses = report.styleAnalyses as Record<string, Record<string, unknown>> | null
    const styleData = styleAnalyses?.[userStyle] as Record<string, unknown> | undefined

    const response = {
      stockId: stock.id,
      stockName: stock.name,
      tickerCode: stock.tickerCode,
      currentPrice,
      marketSignal: report.marketSignal,
      technicalScore: report.technicalScore,
      fundamentalScore: report.fundamentalScore,
      healthRank: report.healthRank,
      alerts: report.alerts,
      reason: (styleData?.reason as string) ?? report.reason,
      caution: (styleData?.caution as string) ?? report.caution,
      positives: report.positives,
      concerns: report.concerns,
      suitableFor: report.suitableFor,
      keyCondition: (styleData?.keyCondition as string | null) ?? report.keyCondition,
      supportLevel: report.supportLevel ? Number(report.supportLevel) : null,
      resistanceLevel: report.resistanceLevel ? Number(report.resistanceLevel) : null,
      analyzedAt: report.updatedAt.toISOString(),
      // StockAnalysis
      healthScore: analysis?.healthScore ?? null,
      riskLevel: analysis?.riskLevel ?? null,
      riskFlags: analysis?.riskFlags ?? null,
      shortTermTrend: analysis?.shortTermTrend ?? null,
      shortTermText: analysis?.shortTermText ?? null,
      midTermTrend: analysis?.midTermTrend ?? null,
      midTermText: analysis?.midTermText ?? null,
      longTermTrend: analysis?.longTermTrend ?? null,
      longTermText: analysis?.longTermText ?? null,
      advice: (styleData?.advice as string | null) ?? analysis?.advice ?? null,
      // 投資スタイル別分析
      styleAnalyses: styleAnalyses ?? null,
    }

    return NextResponse.json(response, { status: 200 })
  } catch (error) {
    console.error("Error fetching stock report:", error)
    return NextResponse.json(
      { error: "レポートの取得に失敗しました" },
      { status: 500 }
    )
  }
}

/**
 * POST /api/stocks/[stockId]/report
 * 銘柄レポートをオンデマンドで生成
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ stockId: string }> }
) {
  const session = await auth()
  const authResult = verifyCronOrSession(request, session)

  if (authResult instanceof NextResponse) {
    return authResult
  }

  const { userId } = authResult
  const { stockId } = await params

  try {
    const result = await executeStockReport(userId, stockId)
    return NextResponse.json(result)
  } catch (error) {
    if (error instanceof AnalysisError) {
      const statusMap: Record<string, number> = {
        NOT_FOUND: 404,
        STALE_DATA: 400,
        NO_PRICE_DATA: 400,
        INTERNAL: 500,
      }
      return NextResponse.json(
        { error: error.message },
        { status: statusMap[error.code] || 500 }
      )
    }
    console.error("Error generating stock report:", error)
    return NextResponse.json(
      { error: "レポートの生成に失敗しました" },
      { status: 500 }
    )
  }
}
