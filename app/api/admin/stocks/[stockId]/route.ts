import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { verifyAdmin } from "@/lib/admin-auth"

/**
 * PATCH /api/admin/stocks/[stockId]
 * 銘柄のデータ取得不可フラグ（isDelisted）を更新（管理者用）
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ stockId: string }> }
) {
  const adminCheck = await verifyAdmin()
  if (!adminCheck.authorized) {
    return NextResponse.json({ error: adminCheck.error }, { status: adminCheck.status })
  }

  const { stockId } = await params
  const body = await request.json()
  const { isDelisted } = body

  if (typeof isDelisted !== "boolean") {
    return NextResponse.json(
      { error: "isDelisted must be a boolean" },
      { status: 400 }
    )
  }

  // データ取得不可を解除する場合はfetchFailCountもリセット
  const data: Record<string, unknown> = { isDelisted }
  if (!isDelisted) {
    data.fetchFailCount = 0
    data.lastFetchFailedAt = null
  }

  const stock = await prisma.stock.update({
    where: { id: stockId },
    data,
    select: {
      id: true,
      tickerCode: true,
      name: true,
      isDelisted: true,
    },
  })

  return NextResponse.json(stock)
}
