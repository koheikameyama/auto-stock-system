"use client"

import { useEffect, useState } from "react"
import { useTranslations } from "next-intl"
import TermTooltip from "@/app/components/TermTooltip"
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  ReferenceLine,
  Bar,
  ComposedChart,
} from "recharts"

interface ChartData {
  date: string
  open: number
  high: number
  low: number
  close: number
  volume: number
  rsi: number | null
  macd: number | null
  signal: number | null
  histogram: number | null
}

interface Summary {
  rsi: number | null
  macd: number | null
  signal: number | null
  histogram: number | null
  dataPoints: number
  startDate: string
  endDate: string
}

interface PatternResult {
  pattern: string
  signal: "buy" | "sell" | "neutral"
  strength: number
  description: string
  learnMore: string
}

interface CombinedSignal {
  signal: "buy" | "sell" | "neutral"
  strength: number
  reasons: string[]
}

interface PatternsData {
  latest: PatternResult | null
  signals: Array<{
    date: string
    pattern: string
    signal: "buy" | "sell" | "neutral"
    price: number
  }>
  combined: CombinedSignal
}

interface NikkeiHistoricalData {
  date: string
  close: number
}

interface TrendlinePointData {
  index: number
  date: string
  price: number
}

interface TrendlineData {
  startPoint: TrendlinePointData
  endPoint: TrendlinePointData
  direction: "up" | "flat" | "down"
  currentProjectedPrice: number
  broken: boolean
  touches: number
}

interface TrendlineAnalysis {
  support: TrendlineData | null
  resistance: TrendlineData | null
  overallTrend: "uptrend" | "downtrend" | "sideways"
  trendLabel: string
  description: string
}

interface StockChartProps {
  stockId: string
  embedded?: boolean
}

type Period = "1m" | "3m" | "1y"

export default function StockChart({ stockId, embedded = false }: StockChartProps) {
  const tTooltip = useTranslations('stocks.tooltips')
  const tChart = useTranslations('stocks.chartView')
  const tChartPeriod = useTranslations('stocks.chart')
  const [data, setData] = useState<ChartData[]>([])
  const [summary, setSummary] = useState<Summary | null>(null)
  const [patterns, setPatterns] = useState<PatternsData | null>(null)
  const [trendlines, setTrendlines] = useState<TrendlineAnalysis | null>(null)
  const [period, setPeriod] = useState<Period>("1m")
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [activeTab, setActiveTab] = useState<"price" | "rsi" | "macd">("price")
  const [showLearning, setShowLearning] = useState(false)
  const [showTrendlines, setShowTrendlines] = useState(true)
  const [showNikkeiComparison, setShowNikkeiComparison] = useState(false)
  const [nikkeiData, setNikkeiData] = useState<NikkeiHistoricalData[]>([])
  const [nikkeiLoading, setNikkeiLoading] = useState(false)

  useEffect(() => {
    async function fetchData() {
      setLoading(true)
      setError(null)
      try {
        const response = await fetch(`/api/stocks/${stockId}/historical-prices?period=${period}`)
        if (!response.ok) {
          const errData = await response.json()
          throw new Error(errData.error || tChart("fetchError"))
        }
        const result = await response.json()
        setData(result.data)
        setSummary(result.summary)
        setPatterns(result.patterns || null)
        setTrendlines(result.technicalAnalysis?.trendlines || null)
      } catch (err) {
        console.error("Error fetching chart data:", err)
        setError(err instanceof Error ? err.message : tChart("fetchError"))
      } finally {
        setLoading(false)
      }
    }

    fetchData()
  }, [stockId, period])

  // 日経平均データの取得
  useEffect(() => {
    if (!showNikkeiComparison) return

    async function fetchNikkeiData() {
      setNikkeiLoading(true)
      try {
        const response = await fetch(`/api/market/nikkei/historical?period=${period}`)
        if (response.ok) {
          const result = await response.json()
          setNikkeiData(result.prices)
        }
      } catch (err) {
        console.error("Error fetching Nikkei data:", err)
      } finally {
        setNikkeiLoading(false)
      }
    }

    fetchNikkeiData()
  }, [showNikkeiComparison, period])

  // 騰落率ベースの比較データを計算
  const comparisonData = showNikkeiComparison && data.length > 0 && nikkeiData.length > 0
    ? data.map((d) => {
        const stockBasePrice = data[0].close
        const stockChangePercent = ((d.close - stockBasePrice) / stockBasePrice) * 100

        const nikkeiPoint = nikkeiData.find((n) => n.date === d.date)
        const nikkeiBasePrice = nikkeiData[0]?.close || 1
        const nikkeiChangePercent = nikkeiPoint
          ? ((nikkeiPoint.close - nikkeiBasePrice) / nikkeiBasePrice) * 100
          : null

        return {
          ...d,
          stockChangePercent,
          nikkeiChangePercent,
        }
      })
    : null

  // トレンドラインデータを各データポイントに付加
  const chartDataWithTrendlines = showTrendlines && trendlines && !showNikkeiComparison
    ? data.map((d, idx) => {
        let supportTrendline: number | null = null
        let resistanceTrendline: number | null = null

        if (trendlines.support) {
          const { startPoint, endPoint } = trendlines.support
          // startPoint.indexからendPoint.index（+最新まで延長）の範囲でラインを描画
          const lastIdx = Math.min(data.length - 1, endPoint.index + Math.floor((endPoint.index - startPoint.index) * 0.3))
          if (idx >= startPoint.index && idx <= lastIdx) {
            const slope = (endPoint.price - startPoint.price) / (endPoint.index - startPoint.index)
            supportTrendline = Math.round((startPoint.price + slope * (idx - startPoint.index)) * 100) / 100
          }
        }

        if (trendlines.resistance) {
          const { startPoint, endPoint } = trendlines.resistance
          const lastIdx = Math.min(data.length - 1, endPoint.index + Math.floor((endPoint.index - startPoint.index) * 0.3))
          if (idx >= startPoint.index && idx <= lastIdx) {
            const slope = (endPoint.price - startPoint.price) / (endPoint.index - startPoint.index)
            resistanceTrendline = Math.round((startPoint.price + slope * (idx - startPoint.index)) * 100) / 100
          }
        }

        return { ...d, supportTrendline, resistanceTrendline }
      })
    : data.map(d => ({ ...d, supportTrendline: null as number | null, resistanceTrendline: null as number | null }))

  const periodLabels: Record<Period, string> = {
    "1m": tChartPeriod("period1m") as string,
    "3m": tChartPeriod("period3m") as string,
    "1y": tChartPeriod("period1y") as string,
  }

  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr)
    return `${date.getMonth() + 1}/${date.getDate()}`
  }

  const formatPrice = (value: number) => `¥${value.toLocaleString()}`

  // RSIの解釈
  const getRSIInterpretation = (rsi: number | null) => {
    if (rsi === null) return { text: tChart("calculating"), color: "text-gray-500" }
    if (rsi >= 70) return { text: tChart("overbought"), color: "text-red-600" }
    if (rsi <= 30) return { text: tChart("oversold"), color: "text-green-600" }
    return { text: tChart("neutral"), color: "text-gray-600" }
  }

  // MACDの解釈
  const getMACDInterpretation = (histogram: number | null) => {
    if (histogram === null) return { text: tChart("calculating"), color: "text-gray-500" }
    if (histogram > 0) return { text: tChart("uptrendLabel"), color: "text-green-600" }
    return { text: tChart("downtrendLabel"), color: "text-red-600" }
  }

  const wrapperClass = embedded
    ? ""
    : "bg-white rounded-xl shadow-md p-4 sm:p-6 mb-6"

  if (loading) {
    return (
      <div className={wrapperClass || "p-4"}>
        <div className="flex items-center justify-center h-64">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
        </div>
      </div>
    )
  }

  if (error || data.length === 0) {
    return (
      <div className={wrapperClass || "p-4"}>
        <div className="text-center text-gray-500 py-8">
          <p>{tChart("noData")}</p>
        </div>
      </div>
    )
  }

  const rsiInterpretation = getRSIInterpretation(summary?.rsi ?? null)
  const macdInterpretation = getMACDInterpretation(summary?.histogram ?? null)

  return (
    <div className={wrapperClass}>
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-4">
        <h2 className="text-lg sm:text-xl font-bold text-gray-900">{tChart("chartTitle")}</h2>

        {/* Period Selector */}
        <div className="flex gap-1 bg-gray-100 rounded-lg p-1">
          {(["1m", "3m", "1y"] as Period[]).map((p) => (
            <button
              key={p}
              onClick={() => setPeriod(p)}
              className={`px-3 py-1 text-sm font-medium rounded-md transition-colors ${
                period === p
                  ? "bg-white text-blue-600 shadow-sm"
                  : "text-gray-600 hover:text-gray-900"
              }`}
            >
              {periodLabels[p]}
            </button>
          ))}
        </div>
      </div>

      {/* Tab Navigation */}
      <div className="flex border-b border-gray-200 mb-4">
        <button
          onClick={() => setActiveTab("price")}
          className={`px-4 py-2 text-sm font-medium transition-colors ${
            activeTab === "price"
              ? "border-b-2 border-blue-600 text-blue-600"
              : "text-gray-500 hover:text-gray-700"
          }`}
        >
          {tChart("priceTab")}
        </button>
        <span
          className={`px-4 py-2 text-sm font-medium transition-colors flex items-center ${
            activeTab === "rsi"
              ? "border-b-2 border-blue-600 text-blue-600"
              : "text-gray-500 hover:text-gray-700"
          }`}
        >
          <button onClick={() => setActiveTab("rsi")}>RSI</button>
          <TermTooltip id="chart-tab-rsi" text={tTooltip('rsi')} />
        </span>
        <span
          className={`px-4 py-2 text-sm font-medium transition-colors flex items-center ${
            activeTab === "macd"
              ? "border-b-2 border-blue-600 text-blue-600"
              : "text-gray-500 hover:text-gray-700"
          }`}
        >
          <button onClick={() => setActiveTab("macd")}>MACD</button>
          <TermTooltip id="chart-tab-macd" text={tTooltip('macd')} />
        </span>
      </div>

      {/* Price Chart - Candlestick */}
      {activeTab === "price" && (
        <>
          {/* トグルボタン群 */}
          <div className="flex items-center justify-end gap-2 mb-3 flex-wrap">
            {/* トレンドライン表示トグル */}
            {trendlines && (
              <button
                onClick={() => setShowTrendlines(!showTrendlines)}
                className={`flex items-center gap-2 px-3 py-1.5 text-xs font-medium rounded-full transition-colors ${
                  showTrendlines
                    ? "bg-purple-100 text-purple-700"
                    : "bg-gray-100 text-gray-600 hover:bg-gray-200"
                }`}
              >
                <span className="w-3 h-3 rounded-full border-2 flex items-center justify-center" style={{
                  borderColor: showTrendlines ? "#7c3aed" : "#9ca3af",
                }}>
                  {showTrendlines && (
                    <span className="w-1.5 h-1.5 rounded-full bg-purple-500"></span>
                  )}
                </span>
                {tChart("trendlineToggle")}
              </button>
            )}
            {/* 日経平均比較トグル */}
            <button
              onClick={() => setShowNikkeiComparison(!showNikkeiComparison)}
              className={`flex items-center gap-2 px-3 py-1.5 text-xs font-medium rounded-full transition-colors ${
                showNikkeiComparison
                  ? "bg-orange-100 text-orange-700"
                  : "bg-gray-100 text-gray-600 hover:bg-gray-200"
              }`}
            >
              <span className="w-3 h-3 rounded-full border-2 flex items-center justify-center" style={{
                borderColor: showNikkeiComparison ? "#f97316" : "#9ca3af",
              }}>
                {showNikkeiComparison && (
                  <span className="w-1.5 h-1.5 rounded-full bg-orange-500"></span>
                )}
              </span>
              {tChart("nikkeiCompare")}
              {nikkeiLoading && <span className="ml-1 animate-spin">⏳</span>}
            </button>
          </div>

          {/* 比較チャート（騰落率ベース） */}
          {showNikkeiComparison && comparisonData ? (
            <div className="h-64 sm:h-80">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={comparisonData} margin={{ top: 5, right: 5, left: 0, bottom: 5 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                  <XAxis
                    dataKey="date"
                    tickFormatter={formatDate}
                    tick={{ fontSize: 11 }}
                    stroke="#9ca3af"
                  />
                  <YAxis
                    tickFormatter={(v) => `${v > 0 ? "+" : ""}${v.toFixed(0)}%`}
                    tick={{ fontSize: 11 }}
                    stroke="#9ca3af"
                  />
                  <Tooltip
                    content={({ active, payload, label }) => {
                      if (active && payload && payload.length) {
                        const stockChange = payload.find((p) => p.dataKey === "stockChangePercent")?.value as number
                        const nikkeiChange = payload.find((p) => p.dataKey === "nikkeiChangePercent")?.value as number | null
                        return (
                          <div className="bg-white border border-gray-200 rounded-lg shadow-lg p-3 text-xs">
                            <p className="font-medium text-gray-900 mb-2">{label}</p>
                            <p className="text-blue-600">
                              {tChart("thisStock")}: {stockChange >= 0 ? "+" : ""}{stockChange?.toFixed(2)}%
                            </p>
                            {nikkeiChange !== null && (
                              <p className="text-orange-600">
                                {tChart("nikkei")}: {nikkeiChange >= 0 ? "+" : ""}{nikkeiChange?.toFixed(2)}%
                              </p>
                            )}
                            {nikkeiChange !== null && (
                              <p className={`mt-1 pt-1 border-t border-gray-100 font-medium ${
                                stockChange > nikkeiChange ? "text-green-600" : "text-red-600"
                              }`}>
                                {tChart("diff")} {stockChange - nikkeiChange >= 0 ? "+" : ""}{(stockChange - nikkeiChange).toFixed(2)}%
                              </p>
                            )}
                          </div>
                        )
                      }
                      return null
                    }}
                  />
                  <ReferenceLine y={0} stroke="#9ca3af" strokeDasharray="3 3" />
                  <Line
                    type="monotone"
                    dataKey="stockChangePercent"
                    stroke="#2563eb"
                    strokeWidth={2}
                    dot={false}
                    name={tChart("thisStock")}
                  />
                  <Line
                    type="monotone"
                    dataKey="nikkeiChangePercent"
                    stroke="#f97316"
                    strokeWidth={2}
                    dot={false}
                    name={tChart("nikkei")}
                    connectNulls
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>
          ) : (
          <div className="h-64 sm:h-80">
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart data={chartDataWithTrendlines} margin={{ top: 5, right: 5, left: 0, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                <XAxis
                  dataKey="date"
                  tickFormatter={formatDate}
                  tick={{ fontSize: 11 }}
                  stroke="#9ca3af"
                />
                <YAxis
                  tickFormatter={(v) => {
                    if (v >= 1_000_000) return `${(v / 1_000_000).toFixed(1)}M`
                    if (v >= 10_000) return `${(v / 1_000).toFixed(0)}k`
                    return v.toLocaleString()
                  }}
                  tick={{ fontSize: 11 }}
                  stroke="#9ca3af"
                  domain={["auto", "auto"]}
                  yAxisId="price"
                />
                <Tooltip
                  content={({ active, payload, label }) => {
                    if (active && payload && payload.length) {
                      const d = payload[0].payload
                      const isUp = d.close >= d.open
                      // このデータポイントのシグナルを探す
                      const signal = patterns?.signals.find((s) => s.date === d.date)
                      return (
                        <div className="bg-white border border-gray-200 rounded-lg shadow-lg p-3 text-xs">
                          <p className="font-medium text-gray-900 mb-1">{label}</p>
                          <p className="text-gray-600">{tChart("tooltipOpen")}: {formatPrice(d.open)}</p>
                          <p className="text-gray-600">{tChart("tooltipHigh")}: {formatPrice(d.high)}</p>
                          <p className="text-gray-600">{tChart("tooltipLow")}: {formatPrice(d.low)}</p>
                          <p className={`font-medium ${isUp ? "text-green-600" : "text-red-600"}`}>
                            {tChart("tooltipClose")}: {formatPrice(d.close)}
                          </p>
                          {d.supportTrendline && (
                            <p className="text-green-500 mt-1">
                              {tChart("support")}: {formatPrice(d.supportTrendline)}
                            </p>
                          )}
                          {d.resistanceTrendline && (
                            <p className="text-red-500">
                              {tChart("resistance")}: {formatPrice(d.resistanceTrendline)}
                            </p>
                          )}
                          {signal && (
                            <p
                              className={`mt-1 pt-1 border-t border-gray-100 font-medium ${
                                signal.signal === "buy" ? "text-green-600" : "text-red-600"
                              }`}
                            >
                              {signal.signal === "buy" ? tChart("buySignal") : tChart("sellSignal")}
                            </p>
                          )}
                        </div>
                      )
                    }
                    return null
                  }}
                />
                {/* 高値-安値のヒゲ線 */}
                <Bar
                  dataKey="high"
                  yAxisId="price"
                  shape={(props) => {
                    const { x, width, payload } = props as { x: number; width: number; payload: ChartData }
                    const yScale = props.background?.height
                      ? (v: number) => {
                          const domain = [
                            Math.min(...data.map(d => d.low)),
                            Math.max(...data.map(d => d.high))
                          ]
                          const range = props.background?.height || 200
                          const padding = 20
                          return padding + (range - 2 * padding) * (1 - (v - domain[0]) / (domain[1] - domain[0]))
                        }
                      : null

                    if (!yScale) return null

                    const isUp = payload.close >= payload.open
                    const color = isUp ? "#22c55e" : "#ef4444"
                    const centerX = x + width / 2

                    // ヒゲ
                    const highY = yScale(payload.high)
                    const lowY = yScale(payload.low)

                    // 実体
                    const bodyTop = yScale(Math.max(payload.open, payload.close))
                    const bodyBottom = yScale(Math.min(payload.open, payload.close))
                    const bodyHeight = Math.max(bodyBottom - bodyTop, 1)

                    return (
                      <g>
                        <line
                          x1={centerX}
                          y1={highY}
                          x2={centerX}
                          y2={lowY}
                          stroke={color}
                          strokeWidth={1}
                        />
                        <rect
                          x={x + 1}
                          y={bodyTop}
                          width={Math.max(width - 2, 3)}
                          height={bodyHeight}
                          fill={color}
                          stroke={color}
                        />
                      </g>
                    )
                  }}
                />
                {/* トレンドライン: サポート（緑） */}
                {showTrendlines && trendlines?.support && (
                  <Line
                    type="linear"
                    dataKey="supportTrendline"
                    stroke="#22c55e"
                    strokeWidth={2}
                    strokeDasharray="6 3"
                    dot={false}
                    connectNulls
                    yAxisId="price"
                    isAnimationActive={false}
                  />
                )}
                {/* トレンドライン: レジスタンス（赤） */}
                {showTrendlines && trendlines?.resistance && (
                  <Line
                    type="linear"
                    dataKey="resistanceTrendline"
                    stroke="#ef4444"
                    strokeWidth={2}
                    strokeDasharray="6 3"
                    dot={false}
                    connectNulls
                    yAxisId="price"
                    isAnimationActive={false}
                  />
                )}
              </ComposedChart>
            </ResponsiveContainer>
          </div>
          )}

          {/* 比較チャートの凡例 */}
          {showNikkeiComparison && comparisonData && (
            <div className="flex items-center justify-center gap-4 mt-2 text-xs">
              <div className="flex items-center gap-1">
                <div className="w-3 h-0.5 bg-blue-600"></div>
                <span className="text-gray-600">{tChart("thisStock")}</span>
              </div>
              <div className="flex items-center gap-1">
                <div className="w-3 h-0.5 bg-orange-500"></div>
                <span className="text-gray-600">{tChart("nikkei")}</span>
              </div>
            </div>
          )}

          {/* トレンドラインの凡例・情報 */}
          {showTrendlines && trendlines && !showNikkeiComparison && (
            <div className="mt-3 p-3 bg-gray-50 rounded-lg">
              <div className="flex items-center gap-2 mb-2">
                <span className="text-sm font-semibold text-gray-900">{tChart("trendlineAnalysis")}</span>
                <span className={`px-2 py-0.5 text-xs font-semibold rounded-full ${
                  trendlines.overallTrend === "uptrend"
                    ? "bg-green-100 text-green-700"
                    : trendlines.overallTrend === "downtrend"
                    ? "bg-red-100 text-red-700"
                    : "bg-gray-100 text-gray-700"
                }`}>
                  {trendlines.trendLabel}
                </span>
              </div>
              <div className="flex items-center gap-4 text-xs mb-2">
                {trendlines.support && (
                  <div className="flex items-center gap-1">
                    <div className="w-4 h-0 border-t-2 border-dashed border-green-500"></div>
                    <span className="text-gray-600">
                      {tChart("support")} {formatPrice(trendlines.support.currentProjectedPrice)}
                      {trendlines.support.broken && (
                        <span className="text-red-500 ml-1">{tChart("broken")}</span>
                      )}
                    </span>
                  </div>
                )}
                {trendlines.resistance && (
                  <div className="flex items-center gap-1">
                    <div className="w-4 h-0 border-t-2 border-dashed border-red-500"></div>
                    <span className="text-gray-600">
                      {tChart("resistance")} {formatPrice(trendlines.resistance.currentProjectedPrice)}
                      {trendlines.resistance.broken && (
                        <span className="text-green-500 ml-1">{tChart("breakout")}</span>
                      )}
                    </span>
                  </div>
                )}
              </div>
              <p className="text-xs text-gray-500">
                {trendlines.overallTrend === "uptrend"
                  ? tChart("trendDescUptrend")
                  : trendlines.overallTrend === "downtrend"
                  ? tChart("trendDescDowntrend")
                  : tChart("trendDescSideways")}
              </p>
            </div>
          )}

          {/* Pattern Summary */}
          {patterns?.latest && (
            <div className="mt-4 p-3 bg-gray-50 rounded-lg">
              <div className="flex items-center justify-between">
                <div>
                  <span className="text-sm text-gray-600">{tChart("candlestickPattern")}</span>
                  <p
                    className={`text-lg font-bold ${
                      patterns.latest.signal === "buy"
                        ? "text-green-600"
                        : patterns.latest.signal === "sell"
                          ? "text-red-600"
                          : "text-gray-900"
                    }`}
                  >
                    {patterns.latest.description}
                  </p>
                </div>
                <div className="text-right">
                  <span className="text-xs text-gray-500 block">{tChart("strength")}</span>
                  <span className="text-lg font-medium text-gray-900">
                    {patterns.latest.strength}%
                  </span>
                </div>
              </div>
              <p className="text-xs text-gray-500 mt-2">{patterns.latest.learnMore}</p>
              <div className="mt-3 pt-3 border-t border-gray-200">
                <div className="flex items-center gap-2">
                  <span className="text-xs text-gray-500">{tChart("overallJudgment")}</span>
                  <span
                    className={`px-2 py-0.5 rounded text-xs font-medium ${
                      patterns.combined.signal === "buy"
                        ? "bg-green-100 text-green-700"
                        : patterns.combined.signal === "sell"
                          ? "bg-red-100 text-red-700"
                          : "bg-gray-100 text-gray-700"
                    }`}
                  >
                    {patterns.combined.signal === "buy" && tChart("buyTrend")}
                    {patterns.combined.signal === "sell" && tChart("sellTrend")}
                    {patterns.combined.signal === "neutral" && tChart("waitAndSee")}
                  </span>
                </div>
                {patterns.combined.reasons.length > 0 && (
                  <p className="text-xs text-gray-600 mt-1">
                    {patterns.combined.reasons.join("、")}
                  </p>
                )}
              </div>
            </div>
          )}

          <p className="text-xs text-gray-400 mt-2">
            {tChart("signalDisclaimer")}
          </p>

          {/* Learning Section Toggle */}
          <button
            onClick={() => setShowLearning(!showLearning)}
            className="mt-3 w-full flex items-center justify-center gap-2 py-2 text-sm text-blue-600 hover:text-blue-700 transition-colors"
          >
            <span>{showLearning ? tChart("closeLearning") : tChart("openLearning")}</span>
            <svg
              className={`w-4 h-4 transition-transform ${showLearning ? "rotate-180" : ""}`}
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
            </svg>
          </button>

          {/* Learning Content */}
          {showLearning && (
            <div className="mt-4 p-4 bg-blue-50 rounded-lg">
              <p className="text-sm text-gray-700 mb-3">
                {tChart("learningIntro")}
                <span className="text-green-600 font-medium">{tChart("learningGreen")}</span>{tChart("learningGreenMeaning")}
                <span className="text-red-600 font-medium">{tChart("learningRed")}</span>{tChart("learningRedMeaning")}
              </p>
              <div className="grid grid-cols-2 gap-2">
                <div className="space-y-2">
                  <p className="text-xs font-semibold text-green-700">{tChart("buySignalLabel")}</p>
                  <div className="text-xs text-gray-600 space-y-1">
                    <p>📈 {tChart("buySignalStrong")}</p>
                    <p>⬆️ {tChart("buySignalBottom")}</p>
                    <p>↗️ {tChart("buySignalDip")}</p>
                    <p>〰️ {tChart("buySignalGradual")}</p>
                  </div>
                </div>
                <div className="space-y-2">
                  <p className="text-xs font-semibold text-red-700">{tChart("sellSignalLabel")}</p>
                  <div className="text-xs text-gray-600 space-y-1">
                    <p>📉 {tChart("sellSignalStrong")}</p>
                    <p>⬇️ {tChart("sellSignalReturn")}</p>
                    <p>↘️ {tChart("sellSignalHigh")}</p>
                    <p>〰️ {tChart("sellSignalStart")}</p>
                  </div>
                </div>
              </div>
            </div>
          )}
        </>
      )}

      {/* RSI Chart */}
      {activeTab === "rsi" && (
        <>
          <div className="mb-3 p-3 bg-gray-50 rounded-lg">
            <div className="flex items-center justify-between">
              <div>
                <span className="text-sm text-gray-600">
                  {tChart("rsi14day")}
                </span>
                <p className="text-xl font-bold text-gray-900">
                  {summary?.rsi?.toFixed(1) ?? "-"}
                </p>
              </div>
              <span className={`text-sm font-medium ${rsiInterpretation.color}`}>
                {rsiInterpretation.text}
              </span>
            </div>
          </div>
          <div className="h-48 sm:h-64">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={data} margin={{ top: 5, right: 5, left: 0, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                <XAxis
                  dataKey="date"
                  tickFormatter={formatDate}
                  tick={{ fontSize: 11 }}
                  stroke="#9ca3af"
                />
                <YAxis
                  domain={[0, 100]}
                  tick={{ fontSize: 11 }}
                  stroke="#9ca3af"
                  ticks={[0, 30, 50, 70, 100]}
                />
                <Tooltip
                  formatter={(value) => [Number(value)?.toFixed(1), "RSI"]}
                  labelFormatter={(label) => tChart("dateLabel", { label })}
                  contentStyle={{ fontSize: 12 }}
                />
                <ReferenceLine y={70} stroke="#ef4444" strokeDasharray="3 3" />
                <ReferenceLine y={30} stroke="#22c55e" strokeDasharray="3 3" />
                <Line
                  type="monotone"
                  dataKey="rsi"
                  stroke="#8b5cf6"
                  strokeWidth={2}
                  dot={false}
                  connectNulls
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
          <p className="text-xs text-gray-500 mt-2">
            {tChart("rsiDescription")}
          </p>
        </>
      )}

      {/* MACD Chart */}
      {activeTab === "macd" && (
        <>
          <div className="mb-3 p-3 bg-gray-50 rounded-lg">
            <div className="flex items-center justify-between">
              <div>
                <span className="text-sm text-gray-600">
                  MACD
                </span>
                <p className="text-xl font-bold text-gray-900">
                  {summary?.macd?.toFixed(2) ?? "-"}
                </p>
              </div>
              <div className="text-right">
                <span className="text-xs text-gray-500 block">{tChart("signalLabel")}: {summary?.signal?.toFixed(2) ?? "-"}</span>
                <span className={`text-sm font-medium ${macdInterpretation.color}`}>
                  {macdInterpretation.text}
                </span>
              </div>
            </div>
          </div>
          <div className="h-48 sm:h-64">
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart data={data} margin={{ top: 5, right: 5, left: 0, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                <XAxis
                  dataKey="date"
                  tickFormatter={formatDate}
                  tick={{ fontSize: 11 }}
                  stroke="#9ca3af"
                />
                <YAxis
                  tick={{ fontSize: 11 }}
                  stroke="#9ca3af"
                />
                <Tooltip
                  formatter={(value, name) => {
                    const labels: Record<string, string> = {
                      macd: "MACD",
                      signal: tChart("signalLabel") as string,
                      histogram: tChart("histogramLabel") as string,
                    }
                    return [Number(value)?.toFixed(2), labels[String(name)] || name]
                  }}
                  labelFormatter={(label) => tChart("dateLabel", { label })}
                  contentStyle={{ fontSize: 12 }}
                />
                <ReferenceLine y={0} stroke="#9ca3af" />
                <Bar
                  dataKey="histogram"
                  fill="#94a3b8"
                  opacity={0.5}
                />
                <Line
                  type="monotone"
                  dataKey="macd"
                  stroke="#2563eb"
                  strokeWidth={2}
                  dot={false}
                  connectNulls
                />
                <Line
                  type="monotone"
                  dataKey="signal"
                  stroke="#f97316"
                  strokeWidth={2}
                  dot={false}
                  connectNulls
                />
              </ComposedChart>
            </ResponsiveContainer>
          </div>
          <p className="text-xs text-gray-500 mt-2">
            {tChart("macdDescription")}
          </p>
        </>
      )}
    </div>
  )
}
