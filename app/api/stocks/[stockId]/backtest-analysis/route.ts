import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { auth } from "@/auth"
import {
  fetchHistoricalPrices,
  fetchHistoricalPricesByDateRange,
} from "@/lib/stock-price-fetcher"
import {
  buildFinancialMetrics,
  buildCandlestickContext,
  buildTechnicalContext,
  buildChartPatternContext,
  buildWeekChangeContext,
  buildDeviationRateContext,
  buildVolumeAnalysisContext,
  buildRelativeStrengthContext,
  buildTrendlineContext,
  buildTimingIndicatorsContext,
} from "@/lib/stock-analysis-context"
import { buildPurchaseRecommendationPrompt } from "@/lib/prompts/purchase-recommendation-prompt"
import { getOpenAIClient } from "@/lib/openai"
import { AnalysisError } from "@/lib/portfolio-analysis-core"

/** バックテスト分析の成否判定 */
function isSuccess(
  prediction: string,
  returnValue: number
): boolean | null {
  switch (prediction) {
    case "buy":   return returnValue > 0
    case "stay":  return returnValue <= 2
    case "avoid": return returnValue < 0
    default:      return null
  }
}

/**
 * POST /api/stocks/[stockId]/backtest-analysis
 * 指定した過去日付の終値を使ってAI分析を実行し、実際のリターンと比較する
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ stockId: string }> }
) {
  const { stockId } = await params

  try {
    const session = await auth()
    if (!session?.user?.id) {
      return NextResponse.json({ error: "認証が必要です" }, { status: 401 })
    }

    const body = await request.json()
    const { asOfDate } = body as { asOfDate?: string }

    if (!asOfDate || !/^\d{4}-\d{2}-\d{2}$/.test(asOfDate)) {
      return NextResponse.json(
        { error: "asOfDate は YYYY-MM-DD 形式で指定してください" },
        { status: 400 }
      )
    }

    const asOf = new Date(`${asOfDate}T00:00:00Z`)
    const today = new Date()
    today.setHours(0, 0, 0, 0)

    if (asOf >= today) {
      return NextResponse.json(
        { error: "過去の日付を指定してください" },
        { status: 400 }
      )
    }

    // 最大1年前まで
    const oneYearAgo = new Date(today)
    oneYearAgo.setFullYear(oneYearAgo.getFullYear() - 1)
    if (asOf < oneYearAgo) {
      return NextResponse.json(
        { error: "1年以内の日付を指定してください" },
        { status: 400 }
      )
    }

    // 銘柄情報を取得
    const stock = await prisma.stock.findUnique({
      where: { id: stockId },
      select: {
        id: true,
        tickerCode: true,
        name: true,
        sector: true,
        marketCap: true,
        dividendYield: true,
        pbr: true,
        per: true,
        roe: true,
        isProfitable: true,
        profitTrend: true,
        revenueGrowth: true,
        eps: true,
        fiftyTwoWeekHigh: true,
        fiftyTwoWeekLow: true,
        volatility: true,
        gapUpRate: true,
        volumeSpikeRate: true,
        turnoverValue: true,
        isDelisted: true,
        fetchFailCount: true,
      },
    })

    if (!stock) {
      return NextResponse.json({ error: "銘柄が見つかりません" }, { status: 404 })
    }

    // ユーザー設定を取得
    const userSettings = await prisma.userSettings.findUnique({
      where: { userId: session.user.id },
      select: { investmentStyle: true },
    })

    // asOfDate 以前の 30 営業日分の OHLCV を取得
    const historicalPrices = await fetchHistoricalPrices(
      stock.tickerCode,
      "1m",
      asOf
    )
    const prices = historicalPrices.slice(-30)

    if (prices.length === 0) {
      return NextResponse.json(
        { error: "指定日付周辺の株価データが見つかりません" },
        { status: 400 }
      )
    }

    // asOfDate の終値を「分析時点の現在価格」として使用
    const priceAtAsOf =
      prices[prices.length - 1]?.close ?? prices[prices.length - 1]?.close ?? 0

    // 技術的分析コンテキストを構築（OHLCV データのみ使用）
    const patternContext       = buildCandlestickContext(prices)
    const technicalContext     = buildTechnicalContext(prices)
    const chartPatternContext  = buildChartPatternContext(prices, userSettings?.investmentStyle)
    const deviationRateContext = buildDeviationRateContext(prices)
    const volumeAnalysisContext = buildVolumeAnalysisContext(prices)
    const trendlineContext     = buildTrendlineContext(prices)
    const { text: weekChangeContext, rate: weekChangeRate } = buildWeekChangeContext(prices)

    // 相対強度（市場・セクターデータ不要のため銘柄単体のみ）
    const relativeStrengthContext = buildRelativeStrengthContext(weekChangeRate, null, null)

    // タイミング補助指標（現在の Stock テーブルの値を使用）
    const timingIndicatorsContext = buildTimingIndicatorsContext(
      stock.gapUpRate   ? Number(stock.gapUpRate)   : null,
      stock.volumeSpikeRate ? Number(stock.volumeSpikeRate) : null,
      stock.turnoverValue   ? Number(stock.turnoverValue)   : null,
    )

    // 財務指標（現在の値を使用）
    const financialMetrics = buildFinancialMetrics(stock, priceAtAsOf)

    const prompt = buildPurchaseRecommendationPrompt({
      stockName:    stock.name,
      tickerCode:   stock.tickerCode,
      sector:       stock.sector,
      currentPrice: priceAtAsOf,
      financialMetrics,
      userContext:           "",
      predictionContext:     "",
      pricesCount:           prices.length,
      delistingContext:      "",
      weekChangeContext,
      marketContext:         "",   // バックテスト時は不使用
      sectorTrendContext:    "",   // バックテスト時は不使用
      patternContext,
      technicalContext,
      chartPatternContext,
      deviationRateContext,
      volumeAnalysisContext,
      relativeStrengthContext,
      trendlineContext,
      timingIndicatorsContext,
      newsContext:           "",   // バックテスト時は不使用
      hasPrediction:         false,
      session:               "backtest",
    })

    // OpenAI API 呼び出し
    const openai = getOpenAIClient()
    const response = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        { role: "system", content: "You are a helpful investment coach for beginners." },
        { role: "user", content: prompt },
      ],
      temperature: 0.4,
      max_tokens: 2000,
      response_format: {
        type: "json_schema",
        json_schema: {
          name: "purchase_recommendation",
          strict: true,
          schema: {
            type: "object",
            properties: {
              marketSignal: { type: "string", enum: ["bullish", "neutral", "bearish"] },
              shortTermTrend: { type: "string", enum: ["up", "neutral", "down"] },
              shortTermPriceLow: { type: "number" },
              shortTermPriceHigh: { type: "number" },
              shortTermText: { type: "string" },
              midTermTrend: { type: "string", enum: ["up", "neutral", "down"] },
              midTermPriceLow: { type: "number" },
              midTermPriceHigh: { type: "number" },
              midTermText: { type: "string" },
              longTermTrend: { type: "string", enum: ["up", "neutral", "down"] },
              longTermPriceLow: { type: "number" },
              longTermPriceHigh: { type: "number" },
              longTermText: { type: "string" },
              positives: { type: ["string", "null"] },
              concerns: { type: ["string", "null"] },
              suitableFor: { type: ["string", "null"] },
              styleAnalyses: {
                type: "object",
                properties: {
                  CONSERVATIVE: {
                    type: "object",
                    properties: {
                      recommendation: { type: "string", enum: ["buy", "stay", "avoid"] },
                      confidence: { type: "number" },
                      advice: { type: "string" },
                      reason: { type: "string" },
                      caution: { type: "string" },
                      buyCondition: { type: ["string", "null"] },
                      suggestedDipPrice: { type: ["number", "null"] },
                      suggestedExitRate: { type: "number" },
                      suggestedSellTargetRate: { type: "number" },
                    },
                    required: ["recommendation", "confidence", "advice", "reason", "caution", "buyCondition", "suggestedDipPrice", "suggestedExitRate", "suggestedSellTargetRate"],
                    additionalProperties: false,
                  },
                  BALANCED: {
                    type: "object",
                    properties: {
                      recommendation: { type: "string", enum: ["buy", "stay", "avoid"] },
                      confidence: { type: "number" },
                      advice: { type: "string" },
                      reason: { type: "string" },
                      caution: { type: "string" },
                      buyCondition: { type: ["string", "null"] },
                      suggestedDipPrice: { type: ["number", "null"] },
                      suggestedExitRate: { type: "number" },
                      suggestedSellTargetRate: { type: "number" },
                    },
                    required: ["recommendation", "confidence", "advice", "reason", "caution", "buyCondition", "suggestedDipPrice", "suggestedExitRate", "suggestedSellTargetRate"],
                    additionalProperties: false,
                  },
                  AGGRESSIVE: {
                    type: "object",
                    properties: {
                      recommendation: { type: "string", enum: ["buy", "stay", "avoid"] },
                      confidence: { type: "number" },
                      advice: { type: "string" },
                      reason: { type: "string" },
                      caution: { type: "string" },
                      buyCondition: { type: ["string", "null"] },
                      suggestedDipPrice: { type: ["number", "null"] },
                      suggestedExitRate: { type: "number" },
                      suggestedSellTargetRate: { type: "number" },
                    },
                    required: ["recommendation", "confidence", "advice", "reason", "caution", "buyCondition", "suggestedDipPrice", "suggestedExitRate", "suggestedSellTargetRate"],
                    additionalProperties: false,
                  },
                },
                required: ["CONSERVATIVE", "BALANCED", "AGGRESSIVE"],
                additionalProperties: false,
              },
              userFitScore: { type: ["number", "null"] },
              budgetFit: { type: ["boolean", "null"] },
              periodFit: { type: ["boolean", "null"] },
              riskFit: { type: ["boolean", "null"] },
              personalizedReason: { type: ["string", "null"] },
            },
            required: [
              "marketSignal",
              "shortTermTrend", "shortTermPriceLow", "shortTermPriceHigh", "shortTermText",
              "midTermTrend", "midTermPriceLow", "midTermPriceHigh", "midTermText",
              "longTermTrend", "longTermPriceLow", "longTermPriceHigh", "longTermText",
              "positives", "concerns", "suitableFor",
              "styleAnalyses",
              "userFitScore", "budgetFit", "periodFit", "riskFit", "personalizedReason",
            ],
            additionalProperties: false,
          },
        },
      },
    })

    const aiResult = JSON.parse(response.choices[0].message.content?.trim() || "{}")

    // ユーザーの投資スタイルに対応する推奨を代表値として取得
    const userStyle = userSettings?.investmentStyle ?? "BALANCED"
    const styleResult = aiResult.styleAnalyses?.[userStyle] ?? aiResult.styleAnalyses?.BALANCED

    // asOfDate 翌日〜21 日後の実際の価格を取得してリターンを計算
    const returnStartDate = new Date(asOf)
    returnStartDate.setDate(returnStartDate.getDate() + 1)
    const returnEndDate = new Date(asOf)
    returnEndDate.setDate(returnEndDate.getDate() + 22)

    const actualReturns: {
      after1Day: number | null
      after7Days: number | null
      after14Days: number | null
    } = { after1Day: null, after7Days: null, after14Days: null }

    try {
      const subsequentPrices = await fetchHistoricalPricesByDateRange(
        stock.tickerCode,
        returnStartDate,
        returnEndDate
      )
      if (subsequentPrices.length > 0 && priceAtAsOf > 0) {
        const calcReturn = (laterPrice: number) =>
          Math.round(((laterPrice - priceAtAsOf) / priceAtAsOf) * 10000) / 100

        actualReturns.after1Day =
          subsequentPrices[0] ? calcReturn(subsequentPrices[0].close) : null

        const price7 = subsequentPrices.slice(0, 7).at(-1)
        actualReturns.after7Days = price7 ? calcReturn(price7.close) : null

        const price14 = subsequentPrices.slice(0, 14).at(-1)
        actualReturns.after14Days = price14 ? calcReturn(price14.close) : null
      }
    } catch {
      // リターン取得失敗はサイレントに無視（分析結果は返す）
    }

    // 代表推奨の成否判定（7日後リターンで判定）
    const successJudgment =
      actualReturns.after7Days !== null && styleResult?.recommendation
        ? isSuccess(styleResult.recommendation, actualReturns.after7Days)
        : null

    return NextResponse.json({
      asOfDate,
      stockId: stock.id,
      stockName: stock.name,
      tickerCode: stock.tickerCode,
      priceAtRec: priceAtAsOf,
      marketSignal: aiResult.marketSignal,
      shortTermTrend: aiResult.shortTermTrend,
      shortTermPriceLow: aiResult.shortTermPriceLow,
      shortTermPriceHigh: aiResult.shortTermPriceHigh,
      shortTermText: aiResult.shortTermText,
      midTermTrend: aiResult.midTermTrend,
      midTermText: aiResult.midTermText,
      longTermTrend: aiResult.longTermTrend,
      longTermText: aiResult.longTermText,
      positives: aiResult.positives,
      concerns: aiResult.concerns,
      styleAnalyses: aiResult.styleAnalyses,
      recommendation: styleResult?.recommendation ?? null,
      confidence: styleResult?.confidence ?? null,
      reason: styleResult?.reason ?? null,
      caution: styleResult?.caution ?? null,
      actualReturns,
      successJudgment,
      note: "財務指標（PER/PBR/ROEなど）は現在の値を使用しています。ニュース・市場コンテキストはバックテスト時はスキップされます。",
    })
  } catch (error) {
    if (error instanceof AnalysisError) {
      return NextResponse.json({ error: error.message }, { status: 400 })
    }
    console.error("Backtest analysis error:", error)
    return NextResponse.json({ error: "分析中にエラーが発生しました" }, { status: 500 })
  }
}
