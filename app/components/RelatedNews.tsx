"use client"

import { useEffect, useState } from "react"
import { useTranslations } from "next-intl"
import dayjs from "dayjs"

interface NewsItem {
  id: string
  title: string
  url: string | null
  source: string
  sentiment: string | null
  publishedAt: string
  matchType: "ticker" | "sector"
}

export default function RelatedNews({ stockId, embedded = false }: { stockId: string; embedded?: boolean }) {
  const t = useTranslations("stocks.relatedNews")

  const sentimentLabel = (sentiment: string | null) => {
    switch (sentiment) {
      case "positive":
        return { text: t("sentimentPositive"), className: "bg-green-100 text-green-700" }
      case "negative":
        return { text: t("sentimentNegative"), className: "bg-red-100 text-red-700" }
      default:
        return { text: t("sentimentNeutral"), className: "bg-gray-100 text-gray-600" }
    }
  }

  const [news, setNews] = useState<NewsItem[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function fetchNews() {
      try {
        const response = await fetch(`/api/stocks/${stockId}/news`)
        if (!response.ok) return
        const data = await response.json()
        setNews(data.news || [])
      } catch (err) {
        console.error("Error fetching news:", err)
      } finally {
        setLoading(false)
      }
    }

    fetchNews()
  }, [stockId])

  const wrapperClass = embedded
    ? "mt-6"
    : "bg-white rounded-xl shadow-md p-4 sm:p-6 mb-6"

  const renderContent = () => {
    if (loading) {
      return (
        <div className="space-y-3">
          {[1, 2, 3].map((i) => (
            <div key={i} className="animate-pulse">
              <div className="h-4 bg-gray-200 rounded w-3/4 mb-2" />
              <div className="h-3 bg-gray-100 rounded w-1/4" />
            </div>
          ))}
        </div>
      )
    }

    if (news.length === 0) {
      return <p className="text-sm text-gray-500">{t("noNews")}</p>
    }

    return (
      <div className="space-y-3">
        {news.map((item) => {
          const sentiment = sentimentLabel(item.sentiment)
          return (
            <div
              key={item.id}
              className="border-b border-gray-100 last:border-0 pb-3 last:pb-0"
            >
              <div className="flex items-start gap-2">
                <div className="flex-1 min-w-0">
                  {item.url ? (
                    <a
                      href={item.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-sm font-medium text-gray-900 hover:text-blue-600 transition-colors line-clamp-2"
                    >
                      {item.title}
                    </a>
                  ) : (
                    <p className="text-sm font-medium text-gray-900 line-clamp-2">
                      {item.title}
                    </p>
                  )}
                  <div className="flex items-center gap-2 mt-1">
                    <span className="text-xs text-gray-500">
                      {dayjs(item.publishedAt).format("MM/DD")}
                    </span>
                    <span className="text-xs text-gray-400">
                      {item.source}
                    </span>
                    <span
                      className={`px-1.5 py-0.5 text-xs rounded ${sentiment.className}`}
                    >
                      {sentiment.text}
                    </span>
                    {item.matchType === "sector" && (
                      <span className="px-1.5 py-0.5 text-xs rounded bg-blue-50 text-blue-600">
                        {t("sameSector")}
                      </span>
                    )}
                  </div>
                </div>
                {item.url && (
                  <a
                    href={item.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex-shrink-0 p-1 text-gray-400 hover:text-blue-500"
                  >
                    <svg
                      className="w-4 h-4"
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14"
                      />
                    </svg>
                  </a>
                )}
              </div>
            </div>
          )
        })}
      </div>
    )
  }

  return (
    <section className={wrapperClass}>
      <h2 className="text-lg sm:text-xl font-bold text-gray-900 mb-4">
        {t("title")}
      </h2>
      {renderContent()}
    </section>
  )
}
