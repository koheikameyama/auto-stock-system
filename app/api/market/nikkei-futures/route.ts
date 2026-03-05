import { NextResponse } from "next/server"
import { fetchStockPrices } from "@/lib/stock-price-fetcher"
import { getCMEStatus } from "@/lib/market-hours"

/**
 * GET /api/market/nikkei-futures
 *
 * CME日経225先物（NKD=F）のリアルタイム価格を取得
 */
export async function GET() {
  try {
    const { prices } = await fetchStockPrices(["NKD=F"])

    if (prices.length === 0) {
      return NextResponse.json(
        { error: "CME日経先物の取得に失敗しました" },
        { status: 500 }
      )
    }

    const futures = prices[0]
    const cmeStatus = getCMEStatus()

    return NextResponse.json({
      currentPrice: futures.currentPrice,
      previousClose: futures.previousClose,
      change: futures.change,
      changePercent: futures.changePercent,
      cmeStatus,
      timestamp: new Date().toISOString(),
    })
  } catch (error) {
    console.error("Error fetching CME Nikkei futures:", error)
    return NextResponse.json(
      { error: "CME日経先物の取得に失敗しました" },
      { status: 500 }
    )
  }
}
