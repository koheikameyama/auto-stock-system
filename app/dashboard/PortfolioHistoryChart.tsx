"use client"

import { useState, useEffect } from "react"
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  ReferenceLine,
} from "recharts"
import { useTranslations } from "next-intl"

type Period = "1m" | "3m" | "6m" | "1y"
type ViewMode = "asset" | "pnl"

interface HistoryItem {
  date: string
  totalValue: number
  unrealizedGain: number
  unrealizedGainPercent: number
  realizedGain: number
  totalGain: number
}

interface HistoryData {
  history: HistoryItem[]
  period: string
}

const PERIOD_KEYS: Record<Period, string> = {
  "1m": "period1m",
  "3m": "period3m",
  "6m": "period6m",
  "1y": "period1y",
}

const VIEW_KEYS: Record<ViewMode, string> = {
  asset: "viewAsset",
  pnl: "viewPnl",
}

export default function PortfolioHistoryChart() {
  const t = useTranslations("dashboard.portfolioHistory")
  const [data, setData] = useState<HistoryData | null>(null)
  const [loading, setLoading] = useState(true)
  const [period, setPeriod] = useState<Period>("1m")
  const [viewMode, setViewMode] = useState<ViewMode>("asset")

  useEffect(() => {
    const fetchData = async () => {
      setLoading(true)
      try {
        const res = await fetch(`/api/portfolio/history?period=${period}`)
        if (res.ok) {
          const json = await res.json()
          setData(json)
        }
      } catch (error) {
        console.error("Failed to fetch history:", error)
      } finally {
        setLoading(false)
      }
    }
    fetchData()
  }, [period])

  if (loading) {
    return (
      <div className="bg-white rounded-lg border p-4">
        <div className="flex items-center gap-2 mb-4">
          <span className="text-lg">📈</span>
          <h3 className="font-semibold">{t("title")}</h3>
        </div>
        <div className="h-64 bg-gray-100 rounded-lg animate-pulse" />
      </div>
    )
  }

  if (!data || data.history.length === 0) {
    return (
      <div className="bg-white rounded-lg border p-4">
        <div className="flex items-center gap-2 mb-4">
          <span className="text-lg">📈</span>
          <h3 className="font-semibold">{t("title")}</h3>
        </div>
        <div className="h-64 flex items-center justify-center text-gray-500">
          <div className="text-center">
            <p className="text-sm">{t("noData")}</p>
            <p className="text-xs text-gray-400 mt-1">
              {t("autoRecordNote")}
            </p>
          </div>
        </div>
      </div>
    )
  }

  const formatValue = (value: number) => {
    if (value >= 10000) {
      return `${(value / 10000).toFixed(1)}${t("unitMan")}`
    }
    return `${Math.round(value).toLocaleString()}`
  }

  const formatGain = (value: number) => {
    const abs = Math.abs(value)
    const prefix = value >= 0 ? "+" : ""
    if (abs >= 10000) {
      return `${prefix}${(value / 10000).toFixed(1)}${t("unitMan")}`
    }
    return `${prefix}${Math.round(value).toLocaleString()}`
  }

  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr)
    return `${date.getMonth() + 1}/${date.getDate()}`
  }

  const formatFullDate = (dateStr: string) => {
    const date = new Date(dateStr)
    return `${date.getFullYear()}/${date.getMonth() + 1}/${date.getDate()}`
  }

  // 資産推移用
  const firstValue = data.history[0]?.totalValue || 0
  const lastValue = data.history[data.history.length - 1]?.totalValue || 0
  const change = lastValue - firstValue
  const changePercent = firstValue > 0 ? (change / firstValue) * 100 : 0

  // 損益推移用
  const lastTotalGain = data.history[data.history.length - 1]?.totalGain || 0
  const pnlColor = lastTotalGain >= 0 ? "#22c55e" : "#ef4444"

  return (
    <div className="bg-white rounded-lg border p-4">
      <div className="mb-4">
        <div className="flex items-center gap-2">
          <span className="text-lg">📈</span>
          {viewMode === "asset" ? (
            <>
              <h3 className="font-semibold">{t("title")}</h3>
              {data.history.length > 1 && (
                <span
                  className={`text-sm font-medium ${
                    change >= 0 ? "text-green-600" : "text-red-600"
                  }`}
                >
                  {change >= 0 ? "+" : ""}
                  {changePercent.toFixed(1)}%
                </span>
              )}
            </>
          ) : (
            <>
              <h3 className="font-semibold">{t("titlePnl")}</h3>
              {data.history.length > 0 && (
                <span
                  className={`text-sm font-medium ${
                    lastTotalGain >= 0 ? "text-green-600" : "text-red-600"
                  }`}
                >
                  {lastTotalGain >= 0 ? "+" : ""}
                  {lastTotalGain.toLocaleString()}{t("yen")}
                </span>
              )}
            </>
          )}
        </div>
        <div className="flex items-center gap-2 mt-2">
          <div className="flex bg-gray-100 rounded-lg p-0.5 w-fit">
            {(Object.keys(VIEW_KEYS) as ViewMode[]).map((v) => (
              <button
                key={v}
                onClick={() => setViewMode(v)}
                className={`px-2 py-0.5 text-[10px] rounded transition-colors ${
                  viewMode === v
                    ? "bg-white shadow text-gray-900"
                    : "text-gray-500"
                }`}
              >
                {t(VIEW_KEYS[v])}
              </button>
            ))}
          </div>
          <div className="flex bg-gray-100 rounded-lg p-0.5 w-fit">
            {(Object.keys(PERIOD_KEYS) as Period[]).map((p) => (
              <button
                key={p}
                onClick={() => setPeriod(p)}
                className={`px-2 py-0.5 text-[10px] rounded transition-colors ${
                  period === p
                    ? "bg-white shadow text-gray-900"
                    : "text-gray-500"
                }`}
              >
                {t(PERIOD_KEYS[p])}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="h-64">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart
            data={data.history}
            margin={{ top: 5, right: 10, left: 0, bottom: 5 }}
          >
            <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
            <XAxis
              dataKey="date"
              tickFormatter={formatDate}
              fontSize={11}
              tickLine={false}
              axisLine={false}
            />
            <YAxis
              tickFormatter={viewMode === "asset" ? formatValue : formatGain}
              fontSize={11}
              tickLine={false}
              axisLine={false}
              width={60}
            />
            <Tooltip
              content={({ active, payload }) => {
                if (active && payload && payload.length > 0) {
                  const item = payload[0].payload as HistoryItem
                  return (
                    <div className="bg-white border rounded-lg shadow-lg p-3 text-sm">
                      <p className="text-gray-500 text-xs mb-1">
                        {formatFullDate(item.date)}
                      </p>
                      {viewMode === "asset" ? (
                        <>
                          <p className="font-semibold">
                            {item.totalValue.toLocaleString()}{t("yen")}
                          </p>
                          <p
                            className={`text-xs ${
                              item.unrealizedGain >= 0
                                ? "text-green-600"
                                : "text-red-600"
                            }`}
                          >
                            {t("unrealizedGain", { value: `${item.unrealizedGain >= 0 ? "+" : ""}${item.unrealizedGain.toLocaleString()}${t("yen")} (${item.unrealizedGainPercent >= 0 ? "+" : ""}${item.unrealizedGainPercent.toFixed(1)}%)` })}
                          </p>
                        </>
                      ) : (
                        <>
                          <p
                            className={`font-semibold ${
                              item.totalGain >= 0
                                ? "text-green-600"
                                : "text-red-600"
                            }`}
                          >
                            {item.totalGain >= 0 ? "+" : ""}
                            {item.totalGain.toLocaleString()}{t("yen")}
                          </p>
                          {item.realizedGain !== 0 && (
                            <p className="text-xs text-gray-500">
                              {t("unrealizedLabel")} {item.unrealizedGain >= 0 ? "+" : ""}
                              {item.unrealizedGain.toLocaleString()}{t("yen")} / {t("realizedLabel")}{" "}
                              {item.realizedGain >= 0 ? "+" : ""}
                              {item.realizedGain.toLocaleString()}{t("yen")}
                            </p>
                          )}
                        </>
                      )}
                    </div>
                  )
                }
                return null
              }}
            />
            {viewMode === "asset" ? (
              <ReferenceLine
                y={firstValue}
                stroke="#94a3b8"
                strokeDasharray="3 3"
              />
            ) : (
              <ReferenceLine y={0} stroke="#94a3b8" strokeDasharray="3 3" />
            )}
            <Line
              type="monotone"
              dataKey={viewMode === "asset" ? "totalValue" : "totalGain"}
              stroke={viewMode === "asset" ? "#3b82f6" : pnlColor}
              strokeWidth={2}
              dot={false}
              activeDot={{
                r: 4,
                fill: viewMode === "asset" ? "#3b82f6" : pnlColor,
              }}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>

      <div className="mt-3 pt-3 border-t text-xs text-gray-500 flex justify-between">
        <span>
          {formatFullDate(data.history[0]?.date || "")} 〜{" "}
          {formatFullDate(data.history[data.history.length - 1]?.date || "")}
        </span>
        <span>{t("dayCount", { count: data.history.length })}</span>
      </div>
    </div>
  )
}
