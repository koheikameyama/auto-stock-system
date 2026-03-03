"use client"

import { useEffect, useState } from "react"
import { useTranslations } from "next-intl"

interface PriceData {
  date: string
  open: number
  high: number
  low: number
  close: number
  volume: number
  rsi: number | null
  macd: number | null
}

interface PriceHistoryProps {
  stockId: string
  embedded?: boolean
}

export default function PriceHistory({ stockId, embedded = false }: PriceHistoryProps) {
  const t = useTranslations("stocks.priceHistory")
  const [data, setData] = useState<PriceData[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [showAll, setShowAll] = useState(false)

  useEffect(() => {
    async function fetchData() {
      setLoading(true)
      setError(null)
      try {
        const response = await fetch(`/api/stocks/${stockId}/historical-prices?period=1m`)
        if (!response.ok) {
          const errData = await response.json()
          throw new Error(errData.error || t("fetchFailed"))
        }
        const result = await response.json()
        // 新しい順に並べ替え
        setData(result.data.reverse())
      } catch (err) {
        console.error("Error fetching price history:", err)
        setError(err instanceof Error ? err.message : t("fetchFailed"))
      } finally {
        setLoading(false)
      }
    }

    fetchData()
  }, [stockId])

  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr)
    return `${date.getMonth() + 1}/${date.getDate()}`
  }

  const formatPrice = (value: number) => `¥${value.toLocaleString()}`

  const formatVolume = (volume: number) => {
    if (volume >= 1000000) {
      return `${(volume / 1000000).toFixed(1)}M`
    }
    if (volume >= 1000) {
      return `${(volume / 1000).toFixed(0)}K`
    }
    return volume.toString()
  }

  const wrapperClass = embedded
    ? "mt-6"
    : "bg-white rounded-xl shadow-md p-4 sm:p-6 mb-6"

  if (loading) {
    return (
      <div className={wrapperClass || "p-4"}>
        <div className="flex items-center justify-center h-32">
          <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-blue-600"></div>
        </div>
      </div>
    )
  }

  if (error || data.length === 0) {
    return (
      <div className={wrapperClass || "p-4"}>
        <div className="text-center text-gray-500 py-4">
          <p>{t("noData")}</p>
        </div>
      </div>
    )
  }

  const displayData = showAll ? data : data.slice(0, 5)

  return (
    <div className={wrapperClass}>
      <h2 className="text-lg sm:text-xl font-bold text-gray-900 mb-4">{t("title")}</h2>

      {/* Table */}
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-200">
              <th className="text-left py-2 px-2 text-gray-600 font-medium">{t("date")}</th>
              <th className="text-right py-2 px-2 text-gray-600 font-medium">{t("closePrice")}</th>
              <th className="text-right py-2 px-2 text-gray-600 font-medium hidden sm:table-cell">{t("highPrice")}</th>
              <th className="text-right py-2 px-2 text-gray-600 font-medium hidden sm:table-cell">{t("lowPrice")}</th>
              <th className="text-right py-2 px-2 text-gray-600 font-medium">{t("volume")}</th>
              <th className="text-right py-2 px-2 text-gray-600 font-medium hidden sm:table-cell">RSI</th>
            </tr>
          </thead>
          <tbody>
            {displayData.map((item, index) => {
              const prevClose = index < data.length - 1 ? data[index + 1].close : item.close
              const change = item.close - prevClose
              const changePercent = prevClose > 0 ? (change / prevClose) * 100 : 0
              const isUp = change >= 0

              return (
                <tr key={item.date} className="border-b border-gray-100 hover:bg-gray-50">
                  <td className="py-2 px-2 text-gray-900">{formatDate(item.date)}</td>
                  <td className="py-2 px-2 text-right">
                    <div className="font-medium text-gray-900">{formatPrice(item.close)}</div>
                    <div className={`text-xs ${isUp ? "text-green-600" : "text-red-600"}`}>
                      {isUp ? "+" : ""}{changePercent.toFixed(2)}%
                    </div>
                  </td>
                  <td className="py-2 px-2 text-right text-gray-600 hidden sm:table-cell">
                    {formatPrice(item.high)}
                  </td>
                  <td className="py-2 px-2 text-right text-gray-600 hidden sm:table-cell">
                    {formatPrice(item.low)}
                  </td>
                  <td className="py-2 px-2 text-right text-gray-600">{formatVolume(item.volume)}</td>
                  <td className="py-2 px-2 text-right hidden sm:table-cell">
                    {item.rsi !== null ? (
                      <span
                        className={`${
                          item.rsi >= 70
                            ? "text-red-600"
                            : item.rsi <= 30
                            ? "text-green-600"
                            : "text-gray-600"
                        }`}
                      >
                        {item.rsi.toFixed(1)}
                      </span>
                    ) : (
                      <span className="text-gray-400">-</span>
                    )}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      {/* Show More Button */}
      {data.length > 10 && (
        <div className="mt-4 text-center">
          <button
            onClick={() => setShowAll(!showAll)}
            className="text-sm text-blue-600 hover:text-blue-700 font-medium"
          >
            {showAll ? t("collapse") : t("showAll", { count: data.length })}
          </button>
        </div>
      )}
    </div>
  )
}
