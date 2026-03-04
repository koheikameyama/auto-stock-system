import { NextRequest, NextResponse } from "next/server"
import { verifyCronAuth } from "@/lib/cron-auth"
import { prisma } from "@/lib/prisma"
import { getRelatedNews, formatNewsForPrompt } from "@/lib/news-rag"
import { getSectorGroup } from "@/lib/constants"
import { getOpenAIClient } from "@/lib/openai"
import { buildMoverAnalysisMessages } from "@/lib/prompts/mover-analysis-prompt"

interface MoverAnalysis {
  analysis: string
}

const ANALYSIS_SCHEMA = {
  type: "json_schema" as const,
  json_schema: {
    name: "mover_analysis",
    strict: true,
    schema: {
      type: "object",
      properties: {
        analysis: {
          type: "string",
          description:
            "株価変動の原因分析（2-3文。初心者にもわかりやすく専門用語には解説を添える）",
        },
      },
      required: ["analysis"],
      additionalProperties: false,
    },
  },
}

/**
 * POST /api/stocks/[stockId]/mover-analysis
 * 個別銘柄の変動原因を分析
 *
 * Body: { type: "gainer" | "loser" }
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ stockId: string }> }
) {
  const authError = verifyCronAuth(request)
  if (authError) return authError

  const { stockId } = await params

  try {
    const body = await request.json()
    const moverType: "gainer" | "loser" = body.type || "gainer"

    // 銘柄情報を取得
    const stock = await prisma.stock.findUnique({
      where: { id: stockId },
      select: {
        id: true,
        tickerCode: true,
        name: true,
        sector: true,
        dailyChangeRate: true,
        latestPrice: true,
        latestVolume: true,
        weekChangeRate: true,
        volatility: true,
        volumeRatio: true,
        marketCap: true,
      },
    })

    if (!stock) {
      return NextResponse.json({ error: "Stock not found" }, { status: 404 })
    }

    const changeRate = Number(stock.dailyChangeRate) || 0

    // 関連ニュースを取得
    const tickerCode = stock.tickerCode.replace(".T", "")
    const news = await getRelatedNews({
      tickerCodes: [tickerCode],
      sectors: getSectorGroup(stock.sector) ? [getSectorGroup(stock.sector)!] : [],
      limit: 5,
      daysAgo: 3,
    })

    const newsForPrompt = formatNewsForPrompt(news)
    const direction = moverType === "gainer" ? "上昇" : "下落"

    // OpenAIで原因分析
    const { systemMessage, userMessage } = buildMoverAnalysisMessages({
      direction,
      stockName: stock.name,
      tickerCode: stock.tickerCode,
      sector: stock.sector,
      changeRate,
      latestPrice: Number(stock.latestPrice),
      latestVolume: stock.latestVolume ? Number(stock.latestVolume) : null,
      weekChangeRate: stock.weekChangeRate ? Number(stock.weekChangeRate) : null,
      volumeRatio: stock.volumeRatio ? Number(stock.volumeRatio) : null,
      newsForPrompt,
    })
    const response = await getOpenAIClient().chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        { role: "system", content: systemMessage },
        { role: "user", content: userMessage },
      ],
      response_format: ANALYSIS_SCHEMA,
      temperature: 0.3,
    })

    const parsed: MoverAnalysis = JSON.parse(
      response.choices[0].message.content || "{}"
    )

    return NextResponse.json({
      stockId: stock.id,
      changeRate,
      analysis: parsed.analysis || `${stock.name}が${direction}しました。`,
      relatedNews: news.map((n) => ({
        title: n.title,
        url: n.url,
        sentiment: n.sentiment,
      })),
    })
  } catch (error) {
    console.error("Error analyzing mover:", error)
    return NextResponse.json(
      { error: "変動分析に失敗しました" },
      { status: 500 }
    )
  }
}
