"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import CopyableTicker from "@/app/components/CopyableTicker"
import { useTranslations } from "next-intl"

interface MoverStock {
  position: number
  changeRate: number
  analysis: string
  stock: {
    id: string
    tickerCode: string
    name: string
    sector: string | null
    latestPrice: number | null
  }
}

interface MoversData {
  gainers: MoverStock[]
  losers: MoverStock[]
  date: string | null
  isToday: boolean
}

export default function MarketMovers() {
  const t = useTranslations("dashboard.marketMoversWidget")
  const [data, setData] = useState<MoversData | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function fetchMovers() {
      try {
        const response = await fetch("/api/market-analysis/gainers-losers")
        const result = await response.json()
        if (response.ok) {
          setData(result)
        }
      } catch (error) {
        console.error("Error fetching market movers:", error)
      } finally {
        setLoading(false)
      }
    }

    fetchMovers()
  }, [])

  if (loading) {
    return <MarketMoversSkeleton />
  }

  if (!data || (data.gainers.length === 0 && data.losers.length === 0)) {
    return null
  }

  return (
    <div className="mb-4 sm:mb-6 bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
      <div className="p-3 sm:p-4 border-b border-gray-100">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="text-lg">📊</span>
            <h2 className="text-sm sm:text-base font-bold text-gray-900">
              {t("title")}
            </h2>
            {!data.isToday && (
              <span className="text-xs text-gray-400">{t("latestData")}</span>
            )}
          </div>
          <Link
            href="/market-movers"
            className="text-xs text-blue-600 hover:text-blue-800 font-medium"
          >
            {t("viewMore")}
          </Link>
        </div>
      </div>

      <div className="grid grid-cols-2 divide-x divide-gray-100">
        {/* 値上がり */}
        <div className="p-3 sm:p-4">
          <div className="flex items-center gap-1 mb-2 sm:mb-3">
            <span className="text-sm">🔺</span>
            <span className="text-xs sm:text-sm font-semibold text-red-600">
              {t("gainers")}
            </span>
          </div>
          <div className="space-y-2">
            {data.gainers.slice(0, 3).map((stock) => (
              <Link
                key={stock.stock.id}
                href="/market-movers"
                className="block hover:bg-red-50/50 rounded-md px-1 py-0.5 -mx-1 transition-colors"
              >
                <div className="flex items-center justify-between gap-1">
                  <div className="flex-1 min-w-0">
                    <div className="text-xs sm:text-sm font-medium text-gray-900 truncate">
                      {stock.stock.name}
                    </div>
                    <div className="text-[10px] sm:text-xs text-gray-500">
                      <CopyableTicker tickerCode={stock.stock.tickerCode} />
                    </div>
                  </div>
                  <div className="text-xs sm:text-sm font-bold text-red-600 shrink-0">
                    +{stock.changeRate.toFixed(1)}%
                  </div>
                </div>
              </Link>
            ))}
          </div>
        </div>

        {/* 値下がり */}
        <div className="p-3 sm:p-4">
          <div className="flex items-center gap-1 mb-2 sm:mb-3">
            <span className="text-sm">🔻</span>
            <span className="text-xs sm:text-sm font-semibold text-blue-600">
              {t("losers")}
            </span>
          </div>
          <div className="space-y-2">
            {data.losers.slice(0, 3).map((stock) => (
              <Link
                key={stock.stock.id}
                href="/market-movers"
                className="block hover:bg-blue-50/50 rounded-md px-1 py-0.5 -mx-1 transition-colors"
              >
                <div className="flex items-center justify-between gap-1">
                  <div className="flex-1 min-w-0">
                    <div className="text-xs sm:text-sm font-medium text-gray-900 truncate">
                      {stock.stock.name}
                    </div>
                    <div className="text-[10px] sm:text-xs text-gray-500">
                      <CopyableTicker tickerCode={stock.stock.tickerCode} />
                    </div>
                  </div>
                  <div className="text-xs sm:text-sm font-bold text-blue-600 shrink-0">
                    {stock.changeRate.toFixed(1)}%
                  </div>
                </div>
              </Link>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}

function MarketMoversSkeleton() {
  return (
    <div className="mb-4 sm:mb-6 bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
      <div className="p-3 sm:p-4 border-b border-gray-100">
        <div className="flex items-center gap-2">
          <div className="w-6 h-6 bg-gray-200 rounded animate-pulse" />
          <div className="w-28 h-5 bg-gray-200 rounded animate-pulse" />
        </div>
      </div>
      <div className="grid grid-cols-2 divide-x divide-gray-100">
        {[0, 1].map((col) => (
          <div key={col} className="p-3 sm:p-4">
            <div className="w-16 h-4 bg-gray-200 rounded animate-pulse mb-3" />
            {[...Array(3)].map((_, i) => (
              <div key={i} className="flex items-center justify-between mb-2">
                <div className="flex-1 min-w-0 mr-2">
                  <div className="w-full h-4 bg-gray-200 rounded animate-pulse mb-1" />
                  <div className="w-12 h-3 bg-gray-200 rounded animate-pulse" />
                </div>
                <div className="w-12 h-4 bg-gray-200 rounded animate-pulse" />
              </div>
            ))}
          </div>
        ))}
      </div>
    </div>
  )
}
