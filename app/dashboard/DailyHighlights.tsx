"use client"

import { useEffect, useState } from "react"
import { useTranslations } from "next-intl"
import { useRouter } from "next/navigation"
import { HIGHLIGHT_TYPE_CONFIG } from "@/lib/constants"
import StockActionButtons from "@/app/components/StockActionButtons"

interface HighlightStock {
  id: string
  tickerCode: string
  name: string
  sector: string | null
  currentPrice: number | null
  isProfitable: boolean | null
  volatility: number | null
  weekChangeRate: number | null
}

interface Highlight {
  id: string
  stockId: string
  highlightType: string
  highlightReason: string
  isOwned: boolean
  isRegistered: boolean
  isTracked: boolean
  userStockId: string | null
  stock: HighlightStock
}

interface HighlightsResponse {
  highlights: Highlight[]
  date: string | null
  isToday: boolean
}

function Skeleton() {
  return (
    <div className="mt-4 sm:mt-6 bg-white rounded-xl p-4 shadow-sm border border-gray-200">
      <div className="flex items-center gap-2 mb-4">
        <div className="w-6 h-6 rounded bg-gray-200 animate-pulse" />
        <div className="h-5 w-40 bg-gray-200 rounded animate-pulse" />
      </div>
      <div className="flex gap-3 overflow-hidden">
        {[...Array(3)].map((_, i) => (
          <div
            key={i}
            className="min-w-[160px] sm:min-w-[220px] h-32 bg-gray-200 rounded-lg animate-pulse"
          />
        ))}
      </div>
    </div>
  )
}

export default function DailyHighlights() {
  const t = useTranslations("dashboard.dailyHighlights")
  const router = useRouter()
  const [data, setData] = useState<HighlightsResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [regenerating, setRegenerating] = useState(false)

  useEffect(() => {
    async function fetchHighlights() {
      try {
        const res = await fetch("/api/highlights")
        if (!res.ok) return
        const json: HighlightsResponse = await res.json()
        setData(json)
      } catch {
        // エラー時は空表示
      } finally {
        setLoading(false)
      }
    }
    fetchHighlights()
  }, [])

  async function handleRegenerate() {
    setRegenerating(true)
    try {
      const res = await fetch("/api/highlights/regenerate", { method: "POST" })
      if (res.ok) {
        const refreshRes = await fetch("/api/highlights")
        if (refreshRes.ok) {
          const json: HighlightsResponse = await refreshRes.json()
          setData(json)
        }
      }
    } catch {
      // エラー時は何もしない
    } finally {
      setRegenerating(false)
    }
  }

  if (loading) return <Skeleton />
  if (!data || data.highlights.length === 0) return null

  const formatDate = (dateStr: string) => {
    const d = new Date(dateStr)
    return `${d.getMonth() + 1}/${d.getDate()}`
  }

  return (
    <div className="mt-4 sm:mt-6 bg-white rounded-xl p-4 shadow-sm border border-gray-200">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm sm:text-base font-bold text-gray-900 flex items-center gap-2">
          <span>✨</span> {t("title")}
        </h3>
        <button
          onClick={handleRegenerate}
          disabled={regenerating}
          className="text-xs text-blue-600 hover:text-blue-800 disabled:text-gray-400 disabled:cursor-not-allowed"
        >
          {regenerating ? t("regenerating") : t("regenerate")}
        </button>
      </div>

      {!data.isToday && data.date && (
        <div className="mb-3 px-3 py-2 bg-amber-50 rounded-lg text-xs text-amber-700">
          {t("staleWarning", { date: formatDate(data.date) })}
        </div>
      )}

      <div className="flex gap-3 overflow-x-auto pb-2 -mx-1 px-1 snap-x snap-mandatory scrollbar-hide">
        {data.highlights.map((h) => {
          const typeConfig = HIGHLIGHT_TYPE_CONFIG[h.highlightType]
          const showActions = !h.isOwned && !h.isRegistered && !h.isTracked
          return (
            <div
              key={h.id}
              className="min-w-[160px] sm:min-w-[220px] max-w-[200px] sm:max-w-[260px] flex-shrink-0 snap-start bg-gray-50 rounded-lg p-3 border border-gray-100 flex flex-col"
            >
              <div className="flex-1">
                <div className="flex items-center justify-between mb-2">
                  <div className="min-w-0 flex-1">
                    <div className="text-sm font-bold text-gray-900 truncate">
                      {h.stock.name}
                    </div>
                    <div className="text-xs text-gray-500">
                      {h.stock.tickerCode}
                    </div>
                  </div>
                  {(h.isOwned || h.isRegistered || h.isTracked) && (
                    <span className="ml-2 shrink-0 text-[10px] px-1.5 py-0.5 rounded-full bg-blue-100 text-blue-700 font-medium">
                      {h.isOwned
                        ? t("badge.owned")
                        : h.isTracked
                          ? t("badge.tracked")
                          : t("badge.watched")}
                    </span>
                  )}
                </div>

                {typeConfig && (
                  <span
                    className={`inline-flex items-center gap-1 text-[10px] font-medium px-1.5 py-0.5 rounded-full ${typeConfig.bg} ${typeConfig.color} mb-2`}
                  >
                    <span>{typeConfig.icon}</span>
                    {t(`highlightType.${h.highlightType}`)}
                  </span>
                )}

                <p className="text-xs text-gray-600 line-clamp-2 leading-relaxed">
                  {h.highlightReason}
                </p>
              </div>

              <button
                onClick={() => router.push(`/stocks/${h.stockId}`)}
                className="mt-2 text-xs text-blue-600 hover:text-blue-800 text-left"
              >
                {t("viewDetail")}
              </button>

              {showActions && (
                <div className="flex gap-1.5 mt-2 pt-2 border-t border-gray-100">
                  <StockActionButtons
                    tickerCode={h.stock.tickerCode}
                    showWatchlist={true}
                    showTracked={true}
                    showPurchase={false}
                    onWatchlistSuccess={() => {
                      setData((prev) =>
                        prev
                          ? {
                              ...prev,
                              highlights: prev.highlights.map((item) =>
                                item.id === h.id
                                  ? { ...item, isRegistered: true }
                                  : item
                              ),
                            }
                          : prev
                      )
                    }}
                    onTrackedSuccess={() => {
                      setData((prev) =>
                        prev
                          ? {
                              ...prev,
                              highlights: prev.highlights.map((item) =>
                                item.id === h.id
                                  ? { ...item, isTracked: true }
                                  : item
                              ),
                            }
                          : prev
                      )
                    }}
                  />
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
