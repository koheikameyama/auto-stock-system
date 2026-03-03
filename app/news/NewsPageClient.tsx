"use client"

import { useEffect, useState } from "react"
import { useTranslations } from "next-intl"
import { getRelativeTime, getMarketFlag } from "@/lib/news-utils"
import type { NewsItem } from "@/lib/news-utils"
import { useMarkPageSeen } from "@/app/hooks/useMarkPageSeen"

type MarketFilter = "ALL" | "JP" | "US" | "IMPACT"

export default function NewsPageClient() {
  // ページ訪問時に閲覧済みをマーク
  useMarkPageSeen("news")

  const t = useTranslations('news')
  const [news, setNews] = useState<NewsItem[]>([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState<MarketFilter>("ALL")

  useEffect(() => {
    async function fetchNews() {
      setLoading(true)
      try {
        const params = new URLSearchParams({ limit: "50", withRelated: "true" });
        if (filter === "IMPACT") {
          params.set("category", "impact");
        } else if (filter !== "ALL") {
          params.set("market", filter);
        }
        const response = await fetch(`/api/news?${params.toString()}`)
        const data = await response.json()

        if (data.success) {
          setNews(data.news)
        }
      } catch (err) {
        console.error("Failed to fetch news:", err)
      } finally {
        setLoading(false)
      }
    }

    fetchNews()
  }, [filter])

  return (
    <div>
      {/* フィルター */}
      <div className="mb-4 flex gap-2">
        <FilterButton
          active={filter === "ALL"}
          onClick={() => setFilter("ALL")}
        >
          {t('filters.all')}
        </FilterButton>
        <FilterButton
          active={filter === "JP"}
          onClick={() => setFilter("JP")}
        >
          {t('filters.japan')}
        </FilterButton>
        <FilterButton
          active={filter === "US"}
          onClick={() => setFilter("US")}
        >
          {t('filters.us')}
        </FilterButton>
        <FilterButton
          active={filter === "IMPACT"}
          onClick={() => setFilter("IMPACT")}
        >
          {t('filters.impact')}
        </FilterButton>
      </div>

      {/* ニュース一覧 */}
      {loading ? (
        <NewsListSkeleton />
      ) : news.length === 0 ? (
        <div className="bg-white rounded-xl p-8 text-center border border-gray-200">
          <p className="text-gray-500">{t('noNews')}</p>
        </div>
      ) : (
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
          <div className="divide-y divide-gray-100">
            {news.map((item) => (
              <NewsListItem key={item.id} news={item} t={t} />
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

function FilterButton({
  active,
  onClick,
  children,
}: {
  active: boolean
  onClick: () => void
  children: React.ReactNode
}) {
  return (
    <button
      onClick={onClick}
      className={`px-3 py-1.5 rounded-full text-sm font-medium transition-colors ${
        active
          ? "bg-blue-600 text-white"
          : "bg-gray-100 text-gray-700 hover:bg-gray-200"
      }`}
    >
      {children}
    </button>
  )
}

function NewsListItem({ news, t }: { news: NewsItem; t: any }) {
  const marketFlag = getMarketFlag(news.market)
  const relativeTime = getRelativeTime(news.publishedAt)

  return (
    <a
      href={news.url || "#"}
      target="_blank"
      rel="noopener noreferrer"
      className="block p-4 hover:bg-gray-50 transition-colors"
    >
      <div className="flex items-start gap-3">
        <span className="text-xl shrink-0">{marketFlag}</span>
        <div className="flex-1 min-w-0">
          <h3 className="text-sm sm:text-base font-medium text-gray-900 mb-1">
            {news.title}
          </h3>

          {/* 本文抜粋 */}
          {news.content && (
            <p className="text-xs sm:text-sm text-gray-600 line-clamp-2 mb-2">
              {news.content}
            </p>
          )}

          {/* 関連銘柄 */}
          {news.relatedStocks && news.relatedStocks.length > 0 && (
            <div className="flex flex-wrap gap-1 mb-2">
              {news.relatedStocks.slice(0, 3).map((stock) => (
                <span
                  key={stock.id}
                  className="inline-flex items-center px-2 py-0.5 rounded text-xs bg-blue-50 text-blue-700"
                >
                  {stock.name}
                </span>
              ))}
              {news.relatedStocks.length > 3 && (
                <span className="text-xs text-gray-500">
                  {t('relatedStocks.moreCount', { count: news.relatedStocks.length - 3 })}
                </span>
              )}
            </div>
          )}

          <div className="flex items-center gap-2 text-xs text-gray-500">
            <span>{relativeTime}</span>
            {news.sector && news.sector !== "null" && (
              <span className="px-1.5 py-0.5 rounded bg-gray-100 text-gray-600">
                {news.sector}
              </span>
            )}
            {news.sentiment && (
              <span
                className={`px-1.5 py-0.5 rounded ${
                  news.sentiment === "positive"
                    ? "bg-green-100 text-green-700"
                    : news.sentiment === "negative"
                    ? "bg-red-100 text-red-700"
                    : "bg-gray-100 text-gray-600"
                }`}
              >
                {news.sentiment === "positive"
                  ? t('sentiment.positive')
                  : news.sentiment === "negative"
                  ? t('sentiment.negative')
                  : t('sentiment.neutral')}
              </span>
            )}
          </div>

          {/* 市場影響情報 */}
          {(news.category === "geopolitical" || news.category === "macro") && (
            <div className="mt-2 space-y-1">
              <div className="flex flex-wrap items-center gap-1.5">
                <span className="inline-flex items-center rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-800">
                  {t("impact.badge")}
                </span>
                {news.impactDirection && (
                  <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${
                    news.impactDirection === "negative"
                      ? "bg-red-100 text-red-700"
                      : news.impactDirection === "positive"
                      ? "bg-green-100 text-green-700"
                      : "bg-gray-100 text-gray-700"
                  }`}>
                    {t(`impact.direction.${news.impactDirection}`)}
                  </span>
                )}
              </div>
              {news.impactSectors && (() => {
                try {
                  const sectors: string[] = JSON.parse(news.impactSectors);
                  return sectors.length > 0 ? (
                    <div className="flex flex-wrap gap-1">
                      {sectors.map((sector: string) => (
                        <span key={sector} className="inline-flex items-center rounded bg-blue-50 px-1.5 py-0.5 text-xs text-blue-700">
                          {sector}
                        </span>
                      ))}
                    </div>
                  ) : null;
                } catch { return null; }
              })()}
              {news.impactSummary && (
                <p className="text-xs text-muted-foreground">
                  → {news.impactSummary}
                </p>
              )}
            </div>
          )}
        </div>
      </div>
    </a>
  )
}

function NewsListSkeleton() {
  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
      <div className="divide-y divide-gray-100">
        {[...Array(5)].map((_, i) => (
          <div key={i} className="p-4">
            <div className="flex items-start gap-3">
              <div className="w-6 h-6 bg-gray-200 rounded animate-pulse shrink-0" />
              <div className="flex-1">
                <div className="w-full h-5 bg-gray-200 rounded animate-pulse mb-2" />
                <div className="w-3/4 h-4 bg-gray-200 rounded animate-pulse mb-2" />
                <div className="w-1/2 h-4 bg-gray-200 rounded animate-pulse mb-2" />
                <div className="w-24 h-3 bg-gray-200 rounded animate-pulse" />
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
